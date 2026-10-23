"use client";

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import type { BoardData } from "@/lib/kanban";
import { sendChatMessage, type ChatMessageItem } from "@/lib/api";
import { CloseIcon, SendIcon } from "@/components/Icons";

type AIChatSidebarProps = {
  boardId: number;
  isOpen: boolean;
  onClose: () => void;
  onBoardUpdate: (updatedBoard: BoardData, version: number) => void;
  onBusyChange?: (isBusy: boolean) => void;
};

const INITIAL_MESSAGES: ChatMessageItem[] = [
  {
    role: "assistant",
    content:
      "Hello. I am your project assistant. You can ask me to add cards, move tasks between stages, or summarize your board progress.",
  },
];

const SUGGESTED_PROMPTS = [
  "What cards are in Backlog?",
  "Add a high priority card 'Docker deployment' due next Friday",
  "What is overdue?",
  "What is assigned to me?",
];

export const AIChatSidebar = ({
  boardId,
  isOpen,
  onClose,
  onBoardUpdate,
  onBusyChange,
}: AIChatSidebarProps) => {
  const [messages, setMessages] = useState<ChatMessageItem[]>(INITIAL_MESSAGES);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView?.({ behavior: "smooth" });
  }, [messages, isLoading]);

  if (!isOpen) {
    return null;
  }

  const handleSend = async (messageText: string) => {
    const trimmed = messageText.trim();
    if (!trimmed || isLoading) {
      return;
    }

    const userMessage: ChatMessageItem = { role: "user", content: trimmed };
    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    setInput("");
    setIsLoading(true);
    onBusyChange?.(true);

    try {
      const historyPayload = messages.map((msg) => ({
        role: msg.role === "user" ? "user" : "model",
        content: msg.content,
      }));

      const res = await sendChatMessage(boardId, trimmed, historyPayload);

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: res.message,
          boardChanged: res.board_changed,
        },
      ]);

      if (res.board_update && res.board_changed) {
        onBoardUpdate(res.board_update, res.version);
      }
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `Sorry, the AI request failed: ${(error as Error).message}`,
        },
      ]);
    } finally {
      setIsLoading(false);
      onBusyChange?.(false);
    }
  };

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    handleSend(input);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend(input);
    }
  };

  return (
    <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-[var(--stroke)] bg-white/95 shadow-2xl backdrop-blur-xl sm:w-[420px]">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[var(--stroke)] px-6 py-5">
        <div className="flex items-center gap-3">
          <div className="h-2 w-2 rounded-full bg-[var(--accent-yellow)] animate-pulse" />
          <div>
            <h2 className="font-display text-base font-semibold text-[var(--navy-dark)]">
              AI Project Assistant
            </h2>
            <p className="text-xs text-[var(--gray-text)]">
              Powered by Claude
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full p-2 text-[var(--gray-text)] transition hover:bg-[var(--surface)] hover:text-[var(--navy-dark)]"
          aria-label="Close assistant sidebar"
          title="Close"
        >
          <CloseIcon />
        </button>
      </div>

      {/* Messages Feed */}
      <div className="flex-1 space-y-4 overflow-y-auto px-6 py-6">
        {messages.map((msg, index) => {
          const isUser = msg.role === "user";
          return (
            <div
              key={index}
              className={`flex flex-col ${isUser ? "items-end" : "items-start"}`}
            >
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-sm ${
                  isUser
                    ? "rounded-tr-sm bg-[var(--secondary-purple)] text-white"
                    : "rounded-tl-sm border border-[var(--stroke)] bg-[var(--surface)] text-[var(--navy-dark)]"
                }`}
              >
                <p className="whitespace-pre-wrap">{msg.content}</p>
                {msg.boardChanged && (
                  <div className="mt-2.5 inline-flex items-center gap-1.5 rounded-full border border-[var(--accent-yellow)]/30 bg-[var(--accent-yellow)]/10 px-2.5 py-1 text-[11px] font-semibold text-[var(--navy-dark)]">
                    <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent-yellow)]" />
                    Board updated
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {isLoading && (
          <div className="flex items-start">
            <div className="inline-flex items-center gap-2 rounded-2xl rounded-tl-sm border border-[var(--stroke)] bg-[var(--surface)] px-4 py-3 text-xs font-medium text-[var(--gray-text)] shadow-sm">
              <span className="h-2 w-2 rounded-full bg-[var(--primary-blue)] animate-ping" />
              Assistant is thinking...
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Suggested Prompts */}
      <div className="border-t border-[var(--stroke)] px-6 py-3">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--gray-text)]">
          Suggestions
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {SUGGESTED_PROMPTS.map((prompt, i) => (
            <button
              key={i}
              type="button"
              onClick={() => handleSend(prompt)}
              className="rounded-full border border-[var(--stroke)] bg-[var(--surface)] px-3 py-1 text-xs text-[var(--navy-dark)] transition hover:border-[var(--primary-blue)] hover:text-[var(--primary-blue)]"
            >
              {prompt}
            </button>
          ))}
        </div>
      </div>

      {/* Input Box */}
      <form onSubmit={handleSubmit} className="border-t border-[var(--stroke)] p-4">
        <div className="relative">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={2}
            placeholder="Ask AI to add, move, or edit cards..."
            className="w-full resize-none rounded-2xl border border-[var(--stroke)] bg-[var(--surface)] p-3 pr-14 text-sm text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)] focus:bg-white"
          />
          <button
            type="submit"
            disabled={!input.trim() || isLoading}
            className="absolute bottom-3 right-3 rounded-xl bg-[var(--secondary-purple)] p-2 text-white shadow transition hover:brightness-110 disabled:opacity-40"
            aria-label="Send"
            title="Send"
          >
            <SendIcon />
          </button>
        </div>
      </form>
    </div>
  );
};

import type { BoardData } from "@/lib/kanban";

export type ChatMessageItem = {
  role: "user" | "assistant";
  content: string;
  boardChanged?: boolean;
};

export type ChatApiResponse = {
  message: string;
  board_update: BoardData | null;
  board_changed: boolean;
};

export const fetchBoard = async (): Promise<BoardData> => {
  const response = await fetch("/api/board");
  if (!response.ok) {
    throw new Error(`Failed to fetch board: ${response.statusText}`);
  }
  return response.json();
};

export const saveBoard = async (data: BoardData): Promise<BoardData> => {
  const response = await fetch("/api/board", {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    throw new Error(`Failed to save board: ${response.statusText}`);
  }
  return response.json();
};

export const sendChatMessage = async (
  message: string,
  history: { role: string; content: string }[] = []
): Promise<ChatApiResponse> => {
  const response = await fetch("/api/ai/chat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ message, history }),
  });
  if (!response.ok) {
    throw new Error(`AI chat error: ${response.statusText}`);
  }
  return response.json();
};

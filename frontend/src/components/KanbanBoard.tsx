"use client";

import { useEffect, useRef, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { KanbanColumn } from "@/components/KanbanColumn";
import { KanbanCardPreview } from "@/components/KanbanCardPreview";
import { AIChatSidebar } from "@/components/AIChatSidebar";
import { createId, moveCard, type BoardData } from "@/lib/kanban";
import { fetchBoard, saveBoard } from "@/lib/api";

type KanbanBoardProps = {
  onLogout?: () => void;
  username?: string;
};

export const KanbanBoard = ({ onLogout, username = "user" }: KanbanBoardProps = {}) => {
  const [board, setBoard] = useState<BoardData | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [activeCardId, setActiveCardId] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<"synced" | "saving" | "error">("synced");
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isAiBusy, setIsAiBusy] = useState(false);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const loadBoard = () =>
    fetchBoard()
      .then(setBoard)
      .catch(() => setLoadError(true));

  useEffect(() => {
    loadBoard();
  }, []);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    })
  );

  const queueSave = (newBoard: BoardData) => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    setSyncStatus("saving");
    saveTimeoutRef.current = setTimeout(async () => {
      try {
        await saveBoard(newBoard);
        setSyncStatus("synced");
      } catch {
        setSyncStatus("error");
      }
    }, 150);
  };

  if (!board) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 text-sm text-[var(--gray-text)]">
        {loadError ? (
          <>
            <p>Could not load the board.</p>
            <button
              type="button"
              onClick={() => {
                setLoadError(false);
                loadBoard();
              }}
              className="rounded-full bg-[var(--secondary-purple)] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white"
            >
              Retry
            </button>
          </>
        ) : (
          <p>Loading board...</p>
        )}
      </main>
    );
  }

  const updateBoard = (updated: BoardData) => {
    setBoard(updated);
    queueSave(updated);
  };

  const handleDragStart = (event: DragStartEvent) => {
    setActiveCardId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveCardId(null);

    if (!over || active.id === over.id) {
      return;
    }

    updateBoard({
      ...board,
      columns: moveCard(board.columns, active.id as string, over.id as string),
    });
  };

  const handleRenameColumn = (columnId: string, title: string) => {
    updateBoard({
      ...board,
      columns: board.columns.map((column) =>
        column.id === columnId ? { ...column, title } : column
      ),
    });
  };

  const handleAddCard = (columnId: string, title: string, details: string) => {
    const id = createId("card");
    updateBoard({
      ...board,
      cards: {
        ...board.cards,
        [id]: { id, title, details: details || "No details yet." },
      },
      columns: board.columns.map((column) =>
        column.id === columnId
          ? { ...column, cardIds: [...column.cardIds, id] }
          : column
      ),
    });
  };

  const handleUpdateCard = (cardId: string, title: string, details: string) => {
    updateBoard({
      ...board,
      cards: { ...board.cards, [cardId]: { id: cardId, title, details } },
    });
  };

  const handleDeleteCard = (columnId: string, cardId: string) => {
    updateBoard({
      ...board,
      cards: Object.fromEntries(
        Object.entries(board.cards).filter(([id]) => id !== cardId)
      ),
      columns: board.columns.map((column) =>
        column.id === columnId
          ? { ...column, cardIds: column.cardIds.filter((id) => id !== cardId) }
          : column
      ),
    });
  };

  const activeCard = activeCardId ? board.cards[activeCardId] : null;

  return (
    <div className="relative overflow-hidden">
      <div className="pointer-events-none absolute left-0 top-0 h-[420px] w-[420px] -translate-x-1/3 -translate-y-1/3 rounded-full bg-[radial-gradient(circle,_rgba(32,157,215,0.25)_0%,_rgba(32,157,215,0.05)_55%,_transparent_70%)]" />
      <div className="pointer-events-none absolute bottom-0 right-0 h-[520px] w-[520px] translate-x-1/4 translate-y-1/4 rounded-full bg-[radial-gradient(circle,_rgba(117,57,145,0.18)_0%,_rgba(117,57,145,0.05)_55%,_transparent_75%)]" />

      <main className="relative mx-auto flex min-h-screen max-w-[1500px] flex-col gap-10 px-6 pb-16 pt-12">
        <header className="flex flex-col gap-6 rounded-[32px] border border-[var(--stroke)] bg-white/80 p-8 shadow-[var(--shadow)] backdrop-blur">
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--gray-text)]">
                Single Board Kanban
              </p>
              <h1 className="mt-3 font-display text-4xl font-semibold text-[var(--navy-dark)]">
                Kanban Studio
              </h1>
              <p className="mt-3 max-w-xl text-sm leading-6 text-[var(--gray-text)]">
                Keep momentum visible. Rename columns, drag cards between stages,
                and capture quick notes without getting buried in settings.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <div className="rounded-2xl border border-[var(--stroke)] bg-[var(--surface)] px-5 py-4">
                <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[var(--gray-text)]">
                  Focus
                </p>
                <p className="mt-2 text-lg font-semibold text-[var(--primary-blue)]">
                  One board. Five columns. Zero clutter.
                </p>
              </div>

              {/* AI Assistant Toggle Button */}
              <button
                type="button"
                onClick={() => setIsChatOpen(true)}
                className="flex items-center gap-2.5 rounded-2xl border border-[var(--stroke)] bg-[var(--surface)] px-4 py-4 text-xs font-semibold uppercase tracking-wider text-[var(--navy-dark)] transition hover:border-[var(--primary-blue)] hover:bg-white"
                aria-label="Open AI Assistant"
              >
                <span className="h-2 w-2 rounded-full bg-[var(--accent-yellow)] animate-pulse" />
                AI Assistant
              </button>

              {isAiBusy && (
                <div className="flex items-center gap-2 rounded-2xl border border-[var(--stroke)] bg-[var(--surface)] px-3 py-4 text-xs font-medium text-[var(--primary-blue)]">
                  <span className="h-2 w-2 rounded-full bg-[var(--primary-blue)] animate-pulse" />
                  AI is updating the board...
                </div>
              )}
              {syncStatus === "saving" && (
                <div className="flex items-center gap-2 rounded-2xl border border-[var(--stroke)] bg-[var(--surface)] px-3 py-4 text-xs font-medium text-[var(--accent-yellow)]">
                  <span className="h-2 w-2 rounded-full bg-[var(--accent-yellow)] animate-pulse" />
                  Saving...
                </div>
              )}
              {syncStatus === "error" && (
                <div className="flex items-center gap-2 rounded-2xl border border-red-200 bg-red-50 px-3 py-4 text-xs font-medium text-red-700">
                  Sync error
                </div>
              )}
              {onLogout && (
                <div className="flex items-center gap-3 rounded-2xl border border-[var(--stroke)] bg-[var(--surface)] px-4 py-4">
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-emerald-500" />
                    <span className="text-xs font-semibold uppercase tracking-wider text-[var(--navy-dark)]">
                      {username}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={onLogout}
                    className="rounded-full border border-[var(--stroke)] bg-white px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-[var(--gray-text)] transition hover:border-[var(--navy-dark)] hover:text-[var(--navy-dark)]"
                  >
                    Sign Out
                  </button>
                </div>
              )}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            {board.columns.map((column) => (
              <div
                key={column.id}
                className="flex items-center gap-2 rounded-full border border-[var(--stroke)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--navy-dark)]"
              >
                <span className="h-2 w-2 rounded-full bg-[var(--accent-yellow)]" />
                {column.title}
              </div>
            ))}
          </div>
        </header>

        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <section
            inert={isAiBusy}
            className={`grid gap-6 lg:grid-cols-5 ${isAiBusy ? "opacity-60" : ""}`}
          >
            {board.columns.map((column) => (
              <KanbanColumn
                key={column.id}
                column={column}
                cards={column.cardIds.map((cardId) => board.cards[cardId])}
                onRename={handleRenameColumn}
                onAddCard={handleAddCard}
                onUpdateCard={handleUpdateCard}
                onDeleteCard={handleDeleteCard}
              />
            ))}
          </section>
          <DragOverlay>
            {activeCard ? (
              <div className="w-[260px]">
                <KanbanCardPreview card={activeCard} />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      </main>

      {/* AI Assistant Chat Sidebar */}
      <AIChatSidebar
        isOpen={isChatOpen}
        onClose={() => setIsChatOpen(false)}
        onBusyChange={setIsAiBusy}
        onBoardUpdate={(updatedBoard) => {
          setBoard(updatedBoard);
          setSyncStatus("synced");
        }}
      />
    </div>
  );
};

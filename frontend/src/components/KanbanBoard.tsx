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
import { LogoutIcon, SparkleIcon } from "@/components/Icons";
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

      <main className="relative mx-auto flex min-h-screen max-w-[1920px] flex-col gap-6 px-4 pb-8 pt-5 sm:px-6 lg:px-8">
        <header className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[var(--stroke)] bg-white/80 px-5 py-4 shadow-[0_4px_16px_rgba(3,33,71,0.06)] backdrop-blur">
          <div className="flex items-center gap-4">
            <div className="h-9 w-1.5 rounded-full bg-[var(--accent-yellow)]" />
            <div>
              <h1 className="font-display text-2xl font-semibold leading-tight text-[var(--navy-dark)]">
                Kanban Studio
              </h1>
              <p className="text-xs text-[var(--gray-text)]">
                {Object.keys(board.cards).length} cards across {board.columns.length} stages.
                Drag to move, click a title to rename.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {isAiBusy && (
              <div className="flex items-center gap-2 rounded-full bg-[var(--primary-blue)]/10 px-3 py-1.5 text-xs font-medium text-[var(--primary-blue)]">
                <span className="h-2 w-2 rounded-full bg-[var(--primary-blue)] animate-pulse" />
                AI is updating the board...
              </div>
            )}
            {syncStatus === "saving" && (
              <div className="flex items-center gap-2 rounded-full bg-[var(--accent-yellow)]/10 px-3 py-1.5 text-xs font-medium text-[var(--navy-dark)]">
                <span className="h-2 w-2 rounded-full bg-[var(--accent-yellow)] animate-pulse" />
                Saving...
              </div>
            )}
            {syncStatus === "error" && (
              <div className="flex items-center gap-2 rounded-full bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700">
                <span className="h-2 w-2 rounded-full bg-red-500" />
                Sync error
              </div>
            )}

            <button
              type="button"
              onClick={() => setIsChatOpen(true)}
              className="flex items-center gap-2 rounded-full bg-[var(--secondary-purple)] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:brightness-110"
              aria-label="Open AI Assistant"
            >
              <SparkleIcon />
              AI Assistant
            </button>

            {onLogout && (
              <div className="flex items-center gap-1 rounded-full border border-[var(--stroke)] bg-white py-1 pl-1 pr-1">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--navy-dark)] text-xs font-semibold uppercase text-white">
                  {username.charAt(0)}
                </span>
                <span className="px-1.5 text-sm font-medium text-[var(--navy-dark)]">{username}</span>
                <button
                  type="button"
                  onClick={onLogout}
                  className="rounded-full p-1.5 text-[var(--gray-text)] transition hover:bg-[var(--surface)] hover:text-[var(--navy-dark)]"
                  aria-label="Sign out"
                  title="Sign out"
                >
                  <LogoutIcon />
                </button>
              </div>
            )}
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
            className={`grid flex-1 grid-cols-[repeat(5,minmax(14rem,1fr))] gap-4 overflow-x-auto pb-2 ${isAiBusy ? "opacity-60" : ""}`}
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
            {activeCard ? <KanbanCardPreview card={activeCard} /> : null}
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

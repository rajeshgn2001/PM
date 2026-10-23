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
import { CardDialog } from "@/components/CardDialog";
import { ShareDialog } from "@/components/ShareDialog";
import { PlusIcon, SearchIcon, SparkleIcon } from "@/components/Icons";
import {
  NO_FILTER,
  PRIORITIES,
  boardStats,
  createId,
  matchesFilter,
  moveCard,
  type BoardData,
  type Card,
  type CardFilter,
} from "@/lib/kanban";
import {
  fetchBoard,
  listMembers,
  saveBoard,
  type ApiError,
  type Board,
  type Member,
  type Role,
} from "@/lib/api";

type KanbanBoardProps = {
  boardId: number;
  title: string;
  username: string;
  onLeave?: () => void;
};

// How often a shared board checks for teammates' changes while idle.
export const POLL_INTERVAL_MS = 10_000;

const CONFLICT_NOTICE =
  "Someone else changed this board, so your last change was not saved. Showing the latest version.";

export const KanbanBoard = ({ boardId, title, username, onLeave }: KanbanBoardProps) => {
  const [board, setBoard] = useState<BoardData | null>(null);
  const [role, setRole] = useState<Role>("owner");
  const [members, setMembers] = useState<Member[]>([]);
  const [loadError, setLoadError] = useState(false);
  const [activeCardId, setActiveCardId] = useState<string | null>(null);
  const [editingCardId, setEditingCardId] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<"synced" | "saving" | "error">("synced");
  const [notice, setNotice] = useState<string | null>(null);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isShareOpen, setIsShareOpen] = useState(false);
  const [isAiBusy, setIsAiBusy] = useState(false);
  const [filter, setFilter] = useState<CardFilter>(NO_FILTER);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  // The version of the board the last load or save returned; every save is checked against it.
  const versionRef = useRef(0);
  // Saves run one after another so each uses the version returned by the previous one.
  const saveChainRef = useRef<Promise<void>>(Promise.resolve());
  const isIdleRef = useRef(true);

  const applyLoaded = (loaded: Board) => {
    setBoard(loaded.data);
    setRole(loaded.role);
    versionRef.current = loaded.version;
  };

  const loadBoard = () =>
    Promise.all([fetchBoard(boardId), listMembers(boardId)])
      .then(([loaded, loadedMembers]) => {
        applyLoaded(loaded);
        setMembers(loadedMembers);
      })
      .catch(() => setLoadError(true));

  useEffect(() => {
    loadBoard();
    // The parent remounts this component (key={boardId}) when the board changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    isIdleRef.current = !editingCardId && !isAiBusy && syncStatus === "synced";
  }, [editingCardId, isAiBusy, syncStatus]);

  useEffect(() => {
    if (members.length < 2) {
      return;
    }
    const timer = setInterval(async () => {
      if (!isIdleRef.current || document.hidden) {
        return;
      }
      const latest = await fetchBoard(boardId).catch(() => null);
      if (latest && latest.version !== versionRef.current && isIdleRef.current) {
        setBoard(latest.data);
        setRole(latest.role);
        versionRef.current = latest.version;
      }
    }, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [members.length, boardId]);

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
    saveTimeoutRef.current = setTimeout(() => {
      saveChainRef.current = saveChainRef.current.then(async () => {
        try {
          versionRef.current = (await saveBoard(boardId, newBoard, versionRef.current)).version;
          setSyncStatus("synced");
        } catch (error) {
          if ((error as ApiError).status !== 409) {
            setSyncStatus("error");
            return;
          }
          try {
            applyLoaded(await fetchBoard(boardId));
            setNotice(CONFLICT_NOTICE);
            setSyncStatus("synced");
          } catch {
            setSyncStatus("error");
          }
        }
      });
    }, 150);
  };

  if (!board) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 text-sm text-[var(--gray-text)]">
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
      </div>
    );
  }

  const updateBoard = (updated: BoardData) => {
    setBoard(updated);
    setNotice(null);
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

  const handleAddColumn = () => {
    updateBoard({
      ...board,
      columns: [...board.columns, { id: createId("col"), title: "New column", cardIds: [] }],
    });
  };

  const handleDeleteColumn = (columnId: string) => {
    const column = board.columns.find((item) => item.id === columnId)!;
    if (
      column.cardIds.length > 0 &&
      !window.confirm(`Delete "${column.title}" and its ${column.cardIds.length} card(s)?`)
    ) {
      return;
    }
    updateBoard({
      columns: board.columns.filter((item) => item.id !== columnId),
      cards: Object.fromEntries(
        Object.entries(board.cards).filter(([id]) => !column.cardIds.includes(id))
      ),
    });
  };

  const handleAddCard = (columnId: string, title: string, details: string) => {
    const id = createId("card");
    updateBoard({
      ...board,
      cards: {
        ...board.cards,
        [id]: { id, title, details },
      },
      columns: board.columns.map((column) =>
        column.id === columnId
          ? { ...column, cardIds: [...column.cardIds, id] }
          : column
      ),
    });
  };

  const handleUpdateCard = (card: Card) => {
    updateBoard({ ...board, cards: { ...board.cards, [card.id]: card } });
    setEditingCardId(null);
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
  const editingCard = editingCardId ? board.cards[editingCardId] : null;
  const memberNames = members.map((member) => member.username);
  const stats = boardStats(board);
  const isFiltering = filter.query.trim() !== "" || filter.priority !== "all" || filter.assignee !== "all";
  const visibleCount = Object.values(board.cards).filter((card) => matchesFilter(card, filter)).length;
  const selectClass =
    "rounded-full border border-[var(--stroke)] bg-white px-4 py-2 text-sm text-[var(--navy-dark)] outline-none focus:border-[var(--primary-blue)]";

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-5">
      <header className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[var(--stroke)] bg-white/80 px-5 py-4 shadow-[0_4px_16px_rgba(3,33,71,0.06)] backdrop-blur">
        <div className="flex items-center gap-4">
          <div className="h-9 w-1.5 rounded-full bg-[var(--accent-yellow)]" />
          <div>
            <h1 className="font-display text-2xl font-semibold leading-tight text-[var(--navy-dark)]">
              {title}
            </h1>
            <p className="text-xs text-[var(--gray-text)]" data-testid="board-stats">
              {stats.total} cards across {board.columns.length} stages, {stats.done} done
              {stats.overdue > 0 && <span className="font-semibold text-red-600">, {stats.overdue} overdue</span>}
              {stats.highPriority > 0 && <span>, {stats.highPriority} high priority open</span>}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {isAiBusy && (
            <div className="flex items-center gap-2 rounded-full bg-[var(--primary-blue)]/10 px-3 py-1.5 text-xs font-medium text-[var(--primary-blue)]">
              <span className="h-2 w-2 animate-pulse rounded-full bg-[var(--primary-blue)]" />
              AI is updating the board...
            </div>
          )}
          {syncStatus === "saving" && (
            <div className="flex items-center gap-2 rounded-full bg-[var(--accent-yellow)]/10 px-3 py-1.5 text-xs font-medium text-[var(--navy-dark)]">
              <span className="h-2 w-2 animate-pulse rounded-full bg-[var(--accent-yellow)]" />
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
            onClick={() => setIsShareOpen(true)}
            className="flex items-center gap-2 rounded-full border border-[var(--stroke)] bg-white py-1 pl-1 pr-3 text-sm font-semibold text-[var(--navy-dark)] transition hover:border-[var(--primary-blue)]"
            aria-label={role === "owner" ? "Share board" : "Board members"}
          >
            <span className="flex -space-x-2">
              {memberNames.slice(0, 4).map((name) => (
                <span
                  key={name}
                  className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--navy-dark)] text-xs uppercase text-white ring-2 ring-white"
                >
                  {name.charAt(0)}
                </span>
              ))}
            </span>
            {role === "owner" ? "Share" : "Members"}
          </button>

          <button
            type="button"
            onClick={() => setIsChatOpen(true)}
            className="flex items-center gap-2 rounded-full bg-[var(--secondary-purple)] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:brightness-110"
            aria-label="Open AI Assistant"
          >
            <SparkleIcon />
            AI Assistant
          </button>
        </div>
      </header>

      {notice && (
        <div role="status" className="flex items-center justify-between gap-3 rounded-2xl border border-[var(--accent-yellow)]/40 bg-[var(--accent-yellow)]/10 px-4 py-3 text-sm text-[var(--navy-dark)]">
          {notice}
          <button type="button" onClick={() => setNotice(null)} className="text-xs font-semibold text-[var(--primary-blue)] hover:underline">
            Dismiss
          </button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <label className="flex min-w-[16rem] flex-1 items-center gap-2 rounded-full border border-[var(--stroke)] bg-white px-4 py-2 text-[var(--gray-text)] focus-within:border-[var(--primary-blue)] sm:max-w-sm">
          <SearchIcon />
          <input
            value={filter.query}
            onChange={(event) => setFilter((prev) => ({ ...prev, query: event.target.value }))}
            placeholder="Search cards and labels"
            aria-label="Search cards"
            className="w-full bg-transparent text-sm text-[var(--navy-dark)] outline-none"
          />
        </label>
        <select
          value={filter.priority}
          onChange={(event) =>
            setFilter((prev) => ({ ...prev, priority: event.target.value as CardFilter["priority"] }))
          }
          aria-label="Filter by priority"
          className={selectClass}
        >
          <option value="all">All priorities</option>
          {PRIORITIES.map((priority) => (
            <option key={priority} value={priority}>
              {priority.charAt(0).toUpperCase() + priority.slice(1)} priority
            </option>
          ))}
        </select>
        <select
          value={filter.assignee}
          onChange={(event) => setFilter((prev) => ({ ...prev, assignee: event.target.value }))}
          aria-label="Filter by assignee"
          className={selectClass}
        >
          <option value="all">Anyone</option>
          <option value={username}>Assigned to me</option>
          <option value="none">Unassigned</option>
          {memberNames
            .filter((name) => name !== username)
            .map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
        </select>
        {isFiltering && (
          <>
            <span className="text-xs text-[var(--gray-text)]">
              Showing {visibleCount} of {stats.total} cards
            </span>
            <button
              type="button"
              onClick={() => setFilter(NO_FILTER)}
              className="text-xs font-semibold text-[var(--primary-blue)] hover:underline"
            >
              Clear filters
            </button>
          </>
        )}
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <section
          inert={isAiBusy}
          className={`flex flex-1 gap-4 overflow-x-auto pb-2 ${isAiBusy ? "opacity-60" : ""}`}
        >
          {board.columns.map((column, index) => (
            <KanbanColumn
              key={column.id}
              column={column}
              cards={column.cardIds
                .map((cardId) => board.cards[cardId])
                .filter((card) => matchesFilter(card, filter))}
              isDone={index === board.columns.length - 1}
              onRename={handleRenameColumn}
              onDelete={board.columns.length > 1 ? handleDeleteColumn : undefined}
              onAddCard={handleAddCard}
              onEditCard={setEditingCardId}
              onDeleteCard={handleDeleteCard}
            />
          ))}
          <button
            type="button"
            onClick={handleAddColumn}
            className="flex h-12 w-56 shrink-0 items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-[var(--navy-dark)]/15 text-sm font-semibold text-[var(--gray-text)] transition hover:border-[var(--primary-blue)] hover:text-[var(--primary-blue)]"
          >
            <PlusIcon />
            Add column
          </button>
        </section>
        <DragOverlay>
          {activeCard ? <KanbanCardPreview card={activeCard} /> : null}
        </DragOverlay>
      </DndContext>

      {editingCard && (
        <CardDialog
          card={editingCard}
          members={memberNames}
          onSave={handleUpdateCard}
          onClose={() => setEditingCardId(null)}
        />
      )}

      {isShareOpen && (
        <ShareDialog
          boardId={boardId}
          role={role}
          username={username}
          members={members}
          onMembersChange={(updated) => {
            setMembers(updated);
            // Removing a member unassigns their cards on the server, which changes the board.
            fetchBoard(boardId).then(applyLoaded).catch(() => setSyncStatus("error"));
          }}
          onLeave={() => onLeave?.()}
          onClose={() => setIsShareOpen(false)}
        />
      )}

      <AIChatSidebar
        boardId={boardId}
        isOpen={isChatOpen}
        onClose={() => setIsChatOpen(false)}
        onBusyChange={setIsAiBusy}
        onBoardUpdate={(updatedBoard, version) => {
          setBoard(updatedBoard);
          versionRef.current = version;
          setSyncStatus("synced");
        }}
      />
    </div>
  );
};

"use client";

import { useEffect, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  pointerWithin,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import clsx from "clsx";
import { KanbanBoard } from "@/components/KanbanBoard";
import { AccountDialog } from "@/components/AccountDialog";
import { BoardGroupSection, DraggableBoard } from "@/components/BoardGroupSection";
import { BoardIcon, LogoutIcon, PencilIcon, PlusIcon, SettingsIcon, TrashIcon } from "@/components/Icons";
import {
  createBoard,
  createGroup,
  deleteBoard,
  listBoards,
  listGroups,
  moveBoardToGroup,
  renameBoard,
  renameGroup,
  type BoardGroup,
  type BoardSummary,
} from "@/lib/api";

type WorkspaceProps = {
  username: string;
  onLogout: () => void;
};

type BoardEntry = Pick<BoardSummary, "id" | "title" | "role" | "owner" | "open_card_count" | "group_id">;

const SELECTED_KEY = "kanban_selected_board";
const COLLAPSED_KEY = "kanban_collapsed_groups";

const inputClass =
  "w-full rounded-xl border border-[var(--stroke)] bg-white px-3 py-2 text-sm text-[var(--navy-dark)] outline-none focus:border-[var(--primary-blue)]";

export const Workspace = ({ username, onLogout }: WorkspaceProps) => {
  const [boards, setBoards] = useState<BoardEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [newTitle, setNewTitle] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<{ id: number; title: string } | null>(null);
  const [isAccountOpen, setIsAccountOpen] = useState(false);
  const [groups, setGroups] = useState<BoardGroup[]>([]);
  const [newGroupName, setNewGroupName] = useState<string | null>(null);
  const [renamingGroup, setRenamingGroup] = useState<BoardGroup | null>(null);
  const [collapsedIds, setCollapsedIds] = useState<number[]>([]);
  const [draggingId, setDraggingId] = useState<number | null>(null);

  const sensors = useSensors(
    useSensor(MouseSensor, {
      activationConstraint: { distance: 6 },
    }),
    // A long press, so that swiping can still scroll a group's boards on a touch screen.
    useSensor(TouchSensor, {
      activationConstraint: { delay: 250, tolerance: 8 },
    })
  );

  const loadBoards = () =>
    Promise.all([listBoards(), listGroups()])
      .then(([loaded, loadedGroups]) => {
        setBoards(loaded);
        setGroups(loadedGroups);
        setCollapsedIds(JSON.parse(sessionStorage.getItem(COLLAPSED_KEY) ?? "[]"));
        const stored = Number(sessionStorage.getItem(SELECTED_KEY));
        setSelectedId(loaded.some((b) => b.id === stored) ? stored : (loaded[0]?.id ?? null));
      })
      .catch(() => setError("Could not load boards."));

  useEffect(() => {
    loadBoards();
  }, []);

  const selectBoard = (id: number | null) => {
    setSelectedId(id);
    if (id === null) {
      sessionStorage.removeItem(SELECTED_KEY);
    } else {
      sessionStorage.setItem(SELECTED_KEY, String(id));
    }
  };

  const saveCollapsed = (ids: number[]) => {
    setCollapsedIds(ids);
    sessionStorage.setItem(COLLAPSED_KEY, JSON.stringify(ids));
  };

  const toggleGroup = (id: number) =>
    saveCollapsed(collapsedIds.includes(id) ? collapsedIds.filter((c) => c !== id) : [...collapsedIds, id]);

  // Runs a board action, showing its error in the sidebar instead of failing silently.
  const run = async (action: () => Promise<void>) => {
    setError(null);
    try {
      await action();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleCreate = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const title = newTitle?.trim();
    if (!title) {
      return;
    }
    return run(async () => {
      const board = await createBoard(title);
      // New boards start in the default group, the user's oldest, which the API lists first.
      const groupId = groups[0].id;
      setBoards((prev) => [
        ...(prev ?? []),
        { id: board.id, title: board.title, role: board.role, owner: board.owner, open_card_count: 0, group_id: groupId },
      ]);
      saveCollapsed(collapsedIds.filter((id) => id !== groupId));
      setNewTitle(null);
      selectBoard(board.id);
    });
  };

  const handleRename = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const title = renaming?.title.trim();
    if (!renaming || !title) {
      return;
    }
    return run(async () => {
      await renameBoard(renaming.id, title);
      setBoards((prev) => prev!.map((b) => (b.id === renaming.id ? { ...b, title } : b)));
      setRenaming(null);
    });
  };

  const handleCreateGroup = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = newGroupName?.trim();
    if (!name) {
      return;
    }
    return run(async () => {
      const group = await createGroup(name);
      setGroups((prev) => [...prev, group]);
      setNewGroupName(null);
    });
  };

  const handleRenameGroup = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = renamingGroup?.name.trim();
    if (!renamingGroup || !name) {
      return;
    }
    return run(async () => {
      await renameGroup(renamingGroup.id, name);
      setGroups((prev) => prev.map((g) => (g.id === renamingGroup.id ? { ...g, name } : g)));
      setRenamingGroup(null);
    });
  };

  const setBoardGroup = (boardId: number, groupId: number) =>
    setBoards((prev) => prev!.map((b) => (b.id === boardId ? { ...b, group_id: groupId } : b)));

  const handleDragStart = ({ active }: DragStartEvent) => setDraggingId(Number(active.id));

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    setDraggingId(null);
    const boardId = Number(active.id);
    const fromGroup = boards!.find((b) => b.id === boardId)!.group_id;
    const toGroup = Number(over?.id);
    if (!over || toGroup === fromGroup) {
      return;
    }
    setBoardGroup(boardId, toGroup);
    return run(async () => {
      try {
        await moveBoardToGroup(boardId, toGroup);
      } catch (err) {
        setBoardGroup(boardId, fromGroup);
        throw err;
      }
    });
  };

  const dropBoard = (boardId: number) => {
    const remaining = boards!.filter((b) => b.id !== boardId);
    setBoards(remaining);
    if (selectedId === boardId) {
      selectBoard(remaining[0]?.id ?? null);
    }
  };

  const handleDelete = (board: BoardEntry) => {
    if (!window.confirm(`Delete the board "${board.title}" and all its cards?`)) {
      return;
    }
    return run(async () => {
      await deleteBoard(board.id);
      dropBoard(board.id);
    });
  };

  const setOpenCount = (boardId: number, count: number) =>
    setBoards((prev) => prev!.map((b) => (b.id === boardId ? { ...b, open_card_count: count } : b)));

  const selected = boards?.find((b) => b.id === selectedId);
  const dragging = boards?.find((b) => b.id === draggingId);

  const renderBoard = (board: BoardEntry) =>
    renaming?.id === board.id ? (
      <form key={board.id} onSubmit={handleRename} className="space-y-2">
        <input
          autoFocus
          value={renaming.title}
          onChange={(event) => setRenaming({ id: board.id, title: event.target.value })}
          onKeyDown={(event) => event.key === "Escape" && setRenaming(null)}
          aria-label="Board name"
          maxLength={100}
          className={inputClass}
        />
      </form>
    ) : (
      <DraggableBoard key={board.id} boardId={board.id}>
        <div
          className={clsx(
            "group flex items-center gap-1 rounded-xl pr-1 transition",
            board.id === selectedId ? "bg-[var(--primary-blue)]/10" : "hover:bg-[var(--surface)]",
            // Boards with no open cards are greyed out; the rest stand out in navy.
            board.open_card_count > 0 ? "text-[var(--navy-dark)]" : "text-[var(--gray-text)]/60"
          )}
        >
          <button
            type="button"
            onClick={() => selectBoard(board.id)}
            aria-current={board.id === selectedId ? "page" : undefined}
            className="flex min-w-0 flex-1 items-center gap-2 px-2 py-2 text-left text-sm font-semibold"
          >
            <BoardIcon />
            <span className="min-w-0">
              <span className="block truncate">{board.title}</span>
              {board.role === "member" && (
                <span className="block truncate text-[11px] font-medium text-[var(--gray-text)]">
                  Shared by {board.owner}
                </span>
              )}
            </span>
          </button>
          {board.role === "owner" && (
            <>
              <button
                type="button"
                onClick={() => setRenaming({ id: board.id, title: board.title })}
                className="rounded-lg p-1 opacity-0 transition hover:text-[var(--primary-blue)] group-hover:opacity-100 group-focus-within:opacity-100"
                aria-label={`Rename board ${board.title}`}
                title="Rename"
              >
                <PencilIcon />
              </button>
              <button
                type="button"
                onClick={() => handleDelete(board)}
                className="rounded-lg p-1 opacity-0 transition hover:text-red-600 group-hover:opacity-100 group-focus-within:opacity-100"
                aria-label={`Delete board ${board.title}`}
                title="Delete"
              >
                <TrashIcon />
              </button>
            </>
          )}
        </div>
      </DraggableBoard>
    );

  return (
    <div className="relative overflow-hidden">
      <div className="pointer-events-none absolute left-0 top-0 h-[420px] w-[420px] -translate-x-1/3 -translate-y-1/3 rounded-full bg-[radial-gradient(circle,_rgba(32,157,215,0.25)_0%,_rgba(32,157,215,0.05)_55%,_transparent_70%)]" />
      <div className="pointer-events-none absolute bottom-0 right-0 h-[520px] w-[520px] translate-x-1/4 translate-y-1/4 rounded-full bg-[radial-gradient(circle,_rgba(117,57,145,0.18)_0%,_rgba(117,57,145,0.05)_55%,_transparent_75%)]" />

      <div className="relative mx-auto flex min-h-screen max-w-[1920px] flex-col gap-5 px-4 pb-8 pt-5 sm:px-6 lg:flex-row lg:px-8">
        <aside className="flex shrink-0 flex-col gap-4 rounded-2xl border border-[var(--stroke)] bg-white/80 p-4 shadow-[0_4px_16px_rgba(3,33,71,0.06)] backdrop-blur lg:w-64">
          <div className="flex items-center gap-2 px-1">
            <div className="h-6 w-1.5 rounded-full bg-[var(--accent-yellow)]" />
            <span className="font-display text-lg font-semibold text-[var(--navy-dark)]">Kanban Studio</span>
          </div>

          <nav aria-label="Boards" className="flex flex-col gap-1">
            <p className="px-1 text-[11px] font-semibold uppercase tracking-wider text-[var(--gray-text)]">
              Boards
            </p>
            {error && (
              <p role="alert" className="px-1 text-sm text-red-700">
                {error}
              </p>
            )}
            <div className="-mr-2 flex max-h-[50vh] flex-col gap-1 overflow-y-auto pr-2 lg:max-h-[calc(100vh-19rem)]">
              <DndContext
                sensors={sensors}
                collisionDetection={pointerWithin}
                // Only the sidebar may scroll: scrolling the page would slide the groups out from under the pointer.
                autoScroll={{ canScroll: (element) => element.closest("nav") !== null }}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
                onDragCancel={() => setDraggingId(null)}
              >
                {boards &&
                  groups.map((group) => {
                    const groupBoards = boards.filter((b) => b.group_id === group.id);
                    return (
                      <BoardGroupSection
                        key={group.id}
                        group={group}
                        boardCount={groupBoards.length}
                        isCollapsed={collapsedIds.includes(group.id)}
                        onToggle={() => toggleGroup(group.id)}
                        renamingName={renamingGroup?.id === group.id ? renamingGroup.name : null}
                        onRenameStart={() => setRenamingGroup(group)}
                        onRenameChange={(name) => setRenamingGroup({ id: group.id, name })}
                        onRenameCancel={() => setRenamingGroup(null)}
                        onRenameSubmit={handleRenameGroup}
                      >
                        {groupBoards.map(renderBoard)}
                      </BoardGroupSection>
                    );
                  })}
                {/* Portalled because the sidebar's backdrop blur would otherwise offset the overlay. */}
                {dragging &&
                  createPortal(
                    <DragOverlay>
                      <div className="flex items-center gap-2 rounded-xl bg-white px-2 py-2 text-sm font-semibold text-[var(--navy-dark)] shadow-[0_4px_16px_rgba(3,33,71,0.2)]">
                        <BoardIcon />
                        <span className="truncate">{dragging.title}</span>
                      </div>
                    </DragOverlay>,
                    document.body
                  )}
              </DndContext>
            </div>

            {newTitle === null ? (
              <button
                type="button"
                onClick={() => setNewTitle("")}
                className="flex items-center gap-2 rounded-xl px-2 py-2 text-sm font-semibold text-[var(--gray-text)] transition hover:bg-[var(--surface)] hover:text-[var(--primary-blue)]"
              >
                <PlusIcon />
                New board
              </button>
            ) : (
              <form onSubmit={handleCreate} className="space-y-2 pt-1">
                <input
                  autoFocus
                  value={newTitle}
                  onChange={(event) => setNewTitle(event.target.value)}
                  onKeyDown={(event) => event.key === "Escape" && setNewTitle(null)}
                  placeholder="Board name"
                  aria-label="New board name"
                  maxLength={100}
                  className={inputClass}
                />
                <div className="flex gap-2">
                  <button
                    type="submit"
                    className="rounded-full bg-[var(--secondary-purple)] px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-white hover:brightness-110"
                  >
                    Create
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewTitle(null)}
                    className="rounded-full border border-[var(--stroke)] px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--gray-text)] hover:text-[var(--navy-dark)]"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}

            {newGroupName === null ? (
              <button
                type="button"
                onClick={() => setNewGroupName("")}
                className="flex items-center gap-2 rounded-xl px-2 py-2 text-sm font-semibold text-[var(--gray-text)] transition hover:bg-[var(--surface)] hover:text-[var(--primary-blue)]"
              >
                <PlusIcon />
                New group
              </button>
            ) : (
              <form onSubmit={handleCreateGroup} className="space-y-2 pt-1">
                <input
                  autoFocus
                  value={newGroupName}
                  onChange={(event) => setNewGroupName(event.target.value)}
                  onKeyDown={(event) => event.key === "Escape" && setNewGroupName(null)}
                  placeholder="Group name"
                  aria-label="New group name"
                  maxLength={100}
                  className={inputClass}
                />
                <div className="flex gap-2">
                  <button
                    type="submit"
                    className="rounded-full bg-[var(--secondary-purple)] px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-white hover:brightness-110"
                  >
                    Create
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewGroupName(null)}
                    className="rounded-full border border-[var(--stroke)] px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--gray-text)] hover:text-[var(--navy-dark)]"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}
          </nav>

          <div className="mt-auto flex items-center gap-1 rounded-full border border-[var(--stroke)] bg-white p-1">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--navy-dark)] text-xs font-semibold uppercase text-white">
              {username.charAt(0)}
            </span>
            <span className="min-w-0 flex-1 truncate px-1.5 text-sm font-medium text-[var(--navy-dark)]">
              {username}
            </span>
            <button
              type="button"
              onClick={() => setIsAccountOpen(true)}
              className="rounded-full p-1.5 text-[var(--gray-text)] transition hover:bg-[var(--surface)] hover:text-[var(--navy-dark)]"
              aria-label="Account settings"
              title="Account settings"
            >
              <SettingsIcon />
            </button>
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
        </aside>

        <main className="flex min-w-0 flex-1 flex-col">
          {selected ? (
            <KanbanBoard
              key={selected.id}
              boardId={selected.id}
              title={selected.title}
              username={username}
              onLeave={() => dropBoard(selected.id)}
              onOpenCountChange={(count) => setOpenCount(selected.id, count)}
            />
          ) : (
            boards && (
              <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
                <p className="font-display text-xl font-semibold text-[var(--navy-dark)]">No boards yet</p>
                <p className="text-sm text-[var(--gray-text)]">Create a board to start planning your project.</p>
                <button
                  type="button"
                  onClick={() => setNewTitle("")}
                  className="rounded-full bg-[var(--secondary-purple)] px-5 py-2 text-xs font-semibold uppercase tracking-wide text-white hover:brightness-110"
                >
                  Create a board
                </button>
              </div>
            )
          )}
        </main>
      </div>

      {isAccountOpen && (
        <AccountDialog onClose={() => setIsAccountOpen(false)} onAccountDeleted={onLogout} />
      )}
    </div>
  );
};

import type { FormEvent, ReactNode } from "react";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import clsx from "clsx";
import { ChevronIcon, PencilIcon } from "@/components/Icons";
import type { BoardGroup } from "@/lib/api";

type BoardGroupSectionProps = {
  group: BoardGroup;
  boardCount: number;
  isCollapsed: boolean;
  onToggle: () => void;
  // The name being edited, or null when the group is not being renamed.
  renamingName: string | null;
  onRenameStart: () => void;
  onRenameChange: (name: string) => void;
  onRenameCancel: () => void;
  onRenameSubmit: (event: FormEvent<HTMLFormElement>) => void;
  children: ReactNode;
};

// A collapsible group of boards. The whole section is a drop target, even when collapsed.
export const BoardGroupSection = ({
  group,
  boardCount,
  isCollapsed,
  onToggle,
  renamingName,
  onRenameStart,
  onRenameChange,
  onRenameCancel,
  onRenameSubmit,
  children,
}: BoardGroupSectionProps) => {
  const { setNodeRef, isOver } = useDroppable({ id: group.id });

  return (
    <section
      ref={setNodeRef}
      aria-label={`Group ${group.name}`}
      className={clsx(
        "flex flex-col rounded-xl transition",
        // Groups share the sidebar's height and scroll on their own; each keeps room for its header and a board.
        isCollapsed || boardCount === 0 ? "shrink-0" : "min-h-[4.75rem]",
        isOver && "bg-[var(--accent-yellow)]/15 ring-1 ring-[var(--accent-yellow)]"
      )}
    >
      {renamingName !== null ? (
        <form onSubmit={onRenameSubmit} className="shrink-0 p-1">
          <input
            autoFocus
            value={renamingName}
            onChange={(event) => onRenameChange(event.target.value)}
            onKeyDown={(event) => event.key === "Escape" && onRenameCancel()}
            aria-label="Group name"
            maxLength={100}
            className="w-full rounded-xl border border-[var(--stroke)] bg-white px-3 py-1.5 text-sm text-[var(--navy-dark)] outline-none focus:border-[var(--primary-blue)]"
          />
        </form>
      ) : (
        <div className="group flex shrink-0 items-center gap-1 pr-1 text-[var(--gray-text)]">
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={!isCollapsed}
            aria-label={group.name}
            className="flex min-w-0 flex-1 items-center gap-1 px-1 py-1.5 text-left text-[11px] font-semibold uppercase tracking-wider hover:text-[var(--navy-dark)]"
          >
            <span className={clsx("shrink-0 transition-transform", isCollapsed && "-rotate-90")}>
              <ChevronIcon />
            </span>
            <span className="min-w-0 truncate">{group.name}</span>
            <span className="shrink-0 font-medium">({boardCount})</span>
          </button>
          <button
            type="button"
            onClick={onRenameStart}
            className="rounded-lg p-1 opacity-0 transition hover:text-[var(--primary-blue)] group-hover:opacity-100 group-focus-within:opacity-100"
            aria-label={`Rename group ${group.name}`}
            title="Rename group"
          >
            <PencilIcon />
          </button>
        </div>
      )}
      {!isCollapsed && (
        <div data-testid={`group-boards-${group.id}`} className="flex min-h-0 flex-col gap-1 overflow-y-auto pb-1 pr-1">
          {children}
        </div>
      )}
    </section>
  );
};

// Makes a board row draggable. Short clicks still reach the buttons inside it.
export const DraggableBoard = ({ boardId, children }: { boardId: number; children: ReactNode }) => {
  const { setNodeRef, listeners, isDragging } = useDraggable({ id: boardId });

  return (
    <div ref={setNodeRef} {...listeners} className={clsx(isDragging && "opacity-40")}>
      {children}
    </div>
  );
};

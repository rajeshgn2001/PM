import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import clsx from "clsx";
import { formatDueDate, isOverdue, type Card, type Priority } from "@/lib/kanban";
import { CalendarIcon, PencilIcon, TrashIcon } from "@/components/Icons";

type KanbanCardProps = {
  card: Card;
  isDone?: boolean;
  onEdit: (cardId: string) => void;
  onDelete: (cardId: string) => void;
};

const PRIORITY_STYLES: Record<Priority, string> = {
  high: "bg-red-50 text-red-700 ring-red-200",
  medium: "bg-[var(--accent-yellow)]/10 text-[#8a6400] ring-[var(--accent-yellow)]/30",
  low: "bg-[var(--primary-blue)]/10 text-[#13668e] ring-[var(--primary-blue)]/25",
};

export const KanbanCard = ({ card, isDone = false, onEdit, onDelete }: KanbanCardProps) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: card.id });
  const overdue = !isDone && isOverdue(card);
  const checklist = card.checklist ?? [];
  const checked = checklist.filter((item) => item.done).length;

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <article
      ref={setNodeRef}
      style={style}
      className={clsx(
        "group relative cursor-grab rounded-xl border border-[var(--stroke)] bg-white px-3.5 py-3 shadow-[0_2px_6px_rgba(3,33,71,0.06)] active:cursor-grabbing",
        "transition-all duration-150 hover:border-[var(--primary-blue)]/40 hover:shadow-[0_6px_16px_rgba(3,33,71,0.10)]",
        isDragging && "opacity-40"
      )}
      {...attributes}
      {...listeners}
      data-testid={`card-${card.id}`}
    >
      <h4 className="break-words font-display text-[15px] font-semibold leading-snug text-[var(--navy-dark)] pointer-coarse:pr-16">
        {card.title}
      </h4>
      <div className="absolute right-1.5 top-1.5 flex rounded-lg bg-white/95 opacity-0 shadow-sm ring-1 ring-[var(--stroke)] transition group-hover:opacity-100 group-focus-within:opacity-100 pointer-coarse:opacity-100">
        <button
          type="button"
          onClick={() => onEdit(card.id)}
          className="rounded-lg p-1.5 text-[var(--gray-text)] transition hover:bg-[var(--surface)] hover:text-[var(--primary-blue)]"
          aria-label={`Edit ${card.title}`}
          title="Edit"
        >
          <PencilIcon />
        </button>
        <button
          type="button"
          onClick={() => onDelete(card.id)}
          className="rounded-lg p-1.5 text-[var(--gray-text)] transition hover:bg-red-50 hover:text-red-600"
          aria-label={`Delete ${card.title}`}
          title="Delete"
        >
          <TrashIcon />
        </button>
      </div>
      {card.details && (
        <p className="mt-1.5 break-words text-sm leading-relaxed text-[var(--gray-text)]">
          {card.details}
        </p>
      )}
      {card.labels && card.labels.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {card.labels.map((label) => (
            <span
              key={label}
              className="rounded-md bg-[var(--secondary-purple)]/10 px-1.5 py-0.5 text-[11px] font-semibold text-[var(--secondary-purple)]"
            >
              {label}
            </span>
          ))}
        </div>
      )}
      {(card.priority || card.dueDate || checklist.length > 0 || card.assignee) && (
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5 text-[11px] font-semibold">
          {card.priority && (
            <span className={clsx("rounded-full px-2 py-0.5 capitalize ring-1", PRIORITY_STYLES[card.priority])}>
              {card.priority}
            </span>
          )}
          {card.dueDate && (
            <span
              className={clsx(
                "inline-flex items-center gap-1 rounded-full px-2 py-0.5 ring-1",
                overdue
                  ? "bg-red-600 text-white ring-red-600"
                  : "bg-[var(--surface)] text-[var(--gray-text)] ring-[var(--stroke)]"
              )}
              title={overdue ? "Overdue" : "Due date"}
            >
              <CalendarIcon />
              {formatDueDate(card.dueDate)}
            </span>
          )}
          {checklist.length > 0 && (
            <span
              className={clsx(
                "rounded-full px-2 py-0.5 ring-1",
                checked === checklist.length
                  ? "bg-green-50 text-green-700 ring-green-200"
                  : "bg-[var(--surface)] text-[var(--gray-text)] ring-[var(--stroke)]"
              )}
              title="Checklist"
            >
              {checked}/{checklist.length}
            </span>
          )}
          {card.assignee && (
            <span
              className="ml-auto flex h-6 w-6 items-center justify-center rounded-full bg-[var(--navy-dark)] text-[11px] uppercase text-white"
              title={`Assigned to ${card.assignee}`}
            >
              {card.assignee.charAt(0)}
            </span>
          )}
        </div>
      )}
    </article>
  );
};

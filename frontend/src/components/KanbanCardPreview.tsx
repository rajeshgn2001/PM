import type { Card } from "@/lib/kanban";

type KanbanCardPreviewProps = {
  card: Card;
};

export const KanbanCardPreview = ({ card }: KanbanCardPreviewProps) => (
  <article className="cursor-grabbing rotate-1 rounded-xl border border-[var(--primary-blue)]/40 bg-white px-3.5 py-3 shadow-[0_18px_32px_rgba(3,33,71,0.18)]">
    <h4 className="break-words font-display text-[15px] font-semibold leading-snug text-[var(--navy-dark)]">
      {card.title}
    </h4>
    <p className="mt-1.5 break-words text-sm leading-relaxed text-[var(--gray-text)]">
      {card.details}
    </p>
  </article>
);

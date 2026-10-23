"use client";

import { useState, type FormEvent } from "react";
import { CloseIcon, PlusIcon, TrashIcon } from "@/components/Icons";
import { PRIORITIES, createId, parseLabels, type Card, type ChecklistItem, type Priority } from "@/lib/kanban";

type CardDialogProps = {
  card: Card;
  members: string[];
  onSave: (card: Card) => void;
  onClose: () => void;
};

const fieldClass =
  "mt-1 w-full rounded-xl border border-[var(--stroke)] bg-white px-3 py-2 text-sm text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)]";
const labelClass = "block text-xs font-semibold uppercase tracking-wider text-[var(--navy-dark)]";

export const CardDialog = ({ card, members, onSave, onClose }: CardDialogProps) => {
  const [draft, setDraft] = useState({
    title: card.title,
    details: card.details,
    priority: card.priority ?? "",
    dueDate: card.dueDate ?? "",
    assignee: card.assignee ?? "",
    labels: (card.labels ?? []).join(", "),
  });
  const [checklist, setChecklist] = useState<ChecklistItem[]>(card.checklist ?? []);
  const [newItem, setNewItem] = useState("");

  const set = (field: keyof typeof draft) => (event: { target: { value: string } }) =>
    setDraft((prev) => ({ ...prev, [field]: event.target.value }));

  const addItem = () => {
    if (newItem.trim()) {
      setChecklist((prev) => [...prev, { id: createId("item"), text: newItem.trim(), done: false }]);
      setNewItem("");
    }
  };

  const handleSave = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!draft.title.trim()) {
      return;
    }
    onSave({
      id: card.id,
      title: draft.title.trim(),
      details: draft.details.trim(),
      priority: (draft.priority || null) as Priority | null,
      dueDate: draft.dueDate || null,
      assignee: draft.assignee || null,
      labels: parseLabels(draft.labels),
      checklist,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--navy-dark)]/30 px-4 backdrop-blur-sm">
      <form
        role="dialog"
        aria-modal="true"
        aria-label="Edit card"
        onSubmit={handleSave}
        onKeyDown={(event) => event.key === "Escape" && onClose()}
        className="max-h-[90vh] w-full max-w-lg space-y-4 overflow-y-auto rounded-3xl border border-[var(--stroke)] bg-white p-6 shadow-[var(--shadow)]"
      >
        <div className="flex items-start justify-between gap-3">
          <input
            autoFocus
            required
            value={draft.title}
            onChange={set("title")}
            aria-label="Edit card title"
            className="w-full rounded-xl px-2 py-1 font-display text-xl font-semibold text-[var(--navy-dark)] outline-none focus:ring-1 focus:ring-[var(--primary-blue)]"
          />
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-[var(--gray-text)] transition hover:bg-[var(--surface)] hover:text-[var(--navy-dark)]"
            aria-label="Close card"
          >
            <CloseIcon />
          </button>
        </div>

        <label className={labelClass}>
          Details
          <textarea
            value={draft.details}
            onChange={set("details")}
            aria-label="Edit card details"
            rows={3}
            className={`${fieldClass} resize-none`}
          />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className={labelClass}>
            Priority
            <select value={draft.priority} onChange={set("priority")} aria-label="Edit card priority" className={fieldClass}>
              <option value="">No priority</option>
              {PRIORITIES.map((priority) => (
                <option key={priority} value={priority}>
                  {priority.charAt(0).toUpperCase() + priority.slice(1)}
                </option>
              ))}
            </select>
          </label>
          <label className={labelClass}>
            Due date
            <input type="date" value={draft.dueDate} onChange={set("dueDate")} aria-label="Edit card due date" className={fieldClass} />
          </label>
          <label className={labelClass}>
            Assignee
            <select value={draft.assignee} onChange={set("assignee")} aria-label="Edit card assignee" className={fieldClass}>
              <option value="">Unassigned</option>
              {members.map((member) => (
                <option key={member} value={member}>
                  {member}
                </option>
              ))}
            </select>
          </label>
          <label className={labelClass}>
            Labels
            <input
              value={draft.labels}
              onChange={set("labels")}
              placeholder="design, backend"
              aria-label="Edit card labels"
              className={fieldClass}
            />
          </label>
        </div>

        <fieldset className="space-y-2">
          <legend className={labelClass}>
            Checklist {checklist.length > 0 && `(${checklist.filter((item) => item.done).length}/${checklist.length})`}
          </legend>
          {checklist.map((item) => (
            <div key={item.id} className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={item.done}
                onChange={() =>
                  setChecklist((prev) => prev.map((i) => (i.id === item.id ? { ...i, done: !i.done } : i)))
                }
                aria-label={item.text}
                className="h-4 w-4 accent-[var(--secondary-purple)]"
              />
              <span className={`flex-1 text-sm ${item.done ? "text-[var(--gray-text)] line-through" : "text-[var(--navy-dark)]"}`}>
                {item.text}
              </span>
              <button
                type="button"
                onClick={() => setChecklist((prev) => prev.filter((i) => i.id !== item.id))}
                className="rounded-lg p-1 text-[var(--gray-text)] hover:text-red-600"
                aria-label={`Remove ${item.text}`}
              >
                <TrashIcon />
              </button>
            </div>
          ))}
          <div className="flex gap-2">
            <input
              value={newItem}
              onChange={(event) => setNewItem(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  addItem();
                }
              }}
              placeholder="Add a checklist item"
              aria-label="New checklist item"
              maxLength={200}
              className={`${fieldClass} mt-0`}
            />
            <button
              type="button"
              onClick={addItem}
              className="rounded-xl border border-[var(--stroke)] px-3 text-[var(--gray-text)] hover:text-[var(--primary-blue)]"
              aria-label="Add checklist item"
            >
              <PlusIcon />
            </button>
          </div>
        </fieldset>

        <div className="flex items-center gap-2 pt-2">
          <button
            type="submit"
            className="rounded-full bg-[var(--secondary-purple)] px-5 py-2 text-xs font-semibold uppercase tracking-wide text-white transition hover:brightness-110"
          >
            Save
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-[var(--stroke)] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--gray-text)] transition hover:text-[var(--navy-dark)]"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
};

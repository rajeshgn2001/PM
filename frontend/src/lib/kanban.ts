export type Priority = "low" | "medium" | "high";

export type ChecklistItem = {
  id: string;
  text: string;
  done: boolean;
};

export type Card = {
  id: string;
  title: string;
  details: string;
  priority?: Priority | null;
  dueDate?: string | null;
  assignee?: string | null;
  labels?: string[];
  checklist?: ChecklistItem[];
};

export type Column = {
  id: string;
  title: string;
  cardIds: string[];
};

export type BoardData = {
  columns: Column[];
  cards: Record<string, Card>;
};

const isColumnId = (columns: Column[], id: string) =>
  columns.some((column) => column.id === id);

const findColumnId = (columns: Column[], id: string) => {
  if (isColumnId(columns, id)) {
    return id;
  }
  return columns.find((column) => column.cardIds.includes(id))?.id;
};

export const moveCard = (
  columns: Column[],
  activeId: string,
  overId: string
): Column[] => {
  const activeColumnId = findColumnId(columns, activeId);
  const overColumnId = findColumnId(columns, overId);

  if (!activeColumnId || !overColumnId) {
    return columns;
  }

  const activeColumn = columns.find((column) => column.id === activeColumnId);
  const overColumn = columns.find((column) => column.id === overColumnId);

  if (!activeColumn || !overColumn) {
    return columns;
  }

  const isOverColumn = isColumnId(columns, overId);

  if (activeColumnId === overColumnId) {
    if (isOverColumn) {
      const nextCardIds = activeColumn.cardIds.filter(
        (cardId) => cardId !== activeId
      );
      nextCardIds.push(activeId);
      return columns.map((column) =>
        column.id === activeColumnId
          ? { ...column, cardIds: nextCardIds }
          : column
      );
    }

    const oldIndex = activeColumn.cardIds.indexOf(activeId);
    const newIndex = activeColumn.cardIds.indexOf(overId);

    if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) {
      return columns;
    }

    const nextCardIds = [...activeColumn.cardIds];
    nextCardIds.splice(oldIndex, 1);
    nextCardIds.splice(newIndex, 0, activeId);

    return columns.map((column) =>
      column.id === activeColumnId
        ? { ...column, cardIds: nextCardIds }
        : column
    );
  }

  const activeIndex = activeColumn.cardIds.indexOf(activeId);
  if (activeIndex === -1) {
    return columns;
  }

  const nextActiveCardIds = [...activeColumn.cardIds];
  nextActiveCardIds.splice(activeIndex, 1);

  const nextOverCardIds = [...overColumn.cardIds];
  if (isOverColumn) {
    nextOverCardIds.push(activeId);
  } else {
    const overIndex = overColumn.cardIds.indexOf(overId);
    const insertIndex = overIndex === -1 ? nextOverCardIds.length : overIndex;
    nextOverCardIds.splice(insertIndex, 0, activeId);
  }

  return columns.map((column) => {
    if (column.id === activeColumnId) {
      return { ...column, cardIds: nextActiveCardIds };
    }
    if (column.id === overColumnId) {
      return { ...column, cardIds: nextOverCardIds };
    }
    return column;
  });
};

export const createId = (prefix: string) => {
  const randomPart = Math.random().toString(36).slice(2, 8);
  const timePart = Date.now().toString(36);
  return `${prefix}-${randomPart}${timePart}`;
};

export const PRIORITIES: Priority[] = ["high", "medium", "low"];

export type CardFilter = {
  query: string;
  priority: Priority | "all";
  // "all", "none" (unassigned) or a username.
  assignee: string;
};

export const NO_FILTER: CardFilter = { query: "", priority: "all", assignee: "all" };

export const matchesFilter = (card: Card, filter: CardFilter) => {
  const query = filter.query.trim().toLowerCase();
  const text = `${card.title} ${card.details} ${(card.labels ?? []).join(" ")}`.toLowerCase();
  if (query && !text.includes(query)) {
    return false;
  }
  if (filter.assignee === "none" && card.assignee) {
    return false;
  }
  if (!["all", "none"].includes(filter.assignee) && card.assignee !== filter.assignee) {
    return false;
  }
  return filter.priority === "all" || card.priority === filter.priority;
};

// Splits "a, b,, c" into unique trimmed labels, within the server limits (10 labels of 30 characters).
export const parseLabels = (input: string) =>
  [...new Set(input.split(",").map((label) => label.trim().slice(0, 30)).filter(Boolean))].slice(0, 10);

// Today's date as YYYY-MM-DD in local time, comparable with Card.dueDate.
export const todayIso = (now = new Date()) =>
  new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);

export const isOverdue = (card: Card, today = todayIso()) =>
  Boolean(card.dueDate && card.dueDate < today);

// Cards in the last column count as done, so they are never overdue or open high priority.
export const boardStats = (board: BoardData, today = todayIso()) => {
  const doneIds = new Set(board.columns.at(-1)?.cardIds ?? []);
  const open = Object.values(board.cards).filter((card) => !doneIds.has(card.id));
  return {
    total: Object.keys(board.cards).length,
    done: doneIds.size,
    overdue: open.filter((card) => isOverdue(card, today)).length,
    highPriority: open.filter((card) => card.priority === "high").length,
  };
};

export const formatDueDate = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });

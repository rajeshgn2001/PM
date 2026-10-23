import { describe, expect, it } from "vitest";
import {
  boardStats,
  formatDueDate,
  isOverdue,
  matchesFilter,
  moveCard,
  NO_FILTER,
  parseLabels,
  todayIso,
  type BoardData,
  type Card,
  type Column,
} from "@/lib/kanban";

describe("moveCard", () => {
  const baseColumns: Column[] = [
    { id: "col-a", title: "A", cardIds: ["card-1", "card-2"] },
    { id: "col-b", title: "B", cardIds: ["card-3"] },
  ];

  it("reorders cards in the same column", () => {
    const result = moveCard(baseColumns, "card-2", "card-1");
    expect(result[0].cardIds).toEqual(["card-2", "card-1"]);
  });

  it("moves cards to another column", () => {
    const result = moveCard(baseColumns, "card-2", "card-3");
    expect(result[0].cardIds).toEqual(["card-1"]);
    expect(result[1].cardIds).toEqual(["card-2", "card-3"]);
  });

  it("drops cards to the end of a column", () => {
    const result = moveCard(baseColumns, "card-1", "col-b");
    expect(result[0].cardIds).toEqual(["card-2"]);
    expect(result[1].cardIds).toEqual(["card-3", "card-1"]);
  });

  it("moves a card to the end of its own column", () => {
    expect(moveCard(baseColumns, "card-1", "col-a")[0].cardIds).toEqual(["card-2", "card-1"]);
  });

  it("ignores unknown ids", () => {
    expect(moveCard(baseColumns, "card-x", "col-a")).toBe(baseColumns);
  });
});

describe("matchesFilter", () => {
  const card: Card = {
    id: "c",
    title: "Fix Login",
    details: "OAuth flow",
    priority: "high",
    labels: ["Security"],
    assignee: "bob",
  };
  const by = (filter: Partial<typeof NO_FILTER>) => ({ ...NO_FILTER, ...filter });

  it("matches title, details and labels case-insensitively", () => {
    expect(matchesFilter(card, by({ query: "login" }))).toBe(true);
    expect(matchesFilter(card, by({ query: " oauth " }))).toBe(true);
    expect(matchesFilter(card, by({ query: "security" }))).toBe(true);
    expect(matchesFilter(card, by({ query: "billing" }))).toBe(false);
  });

  it("filters by priority", () => {
    expect(matchesFilter(card, by({ priority: "high" }))).toBe(true);
    expect(matchesFilter(card, by({ priority: "low" }))).toBe(false);
    expect(matchesFilter({ ...card, priority: null }, by({ priority: "high" }))).toBe(false);
  });

  it("filters by assignee, including unassigned", () => {
    expect(matchesFilter(card, by({ assignee: "bob" }))).toBe(true);
    expect(matchesFilter(card, by({ assignee: "alice" }))).toBe(false);
    expect(matchesFilter(card, by({ assignee: "none" }))).toBe(false);
    expect(matchesFilter({ ...card, assignee: null }, by({ assignee: "none" }))).toBe(true);
  });
});

describe("parseLabels", () => {
  it("trims, drops empties and duplicates", () => {
    expect(parseLabels(" a, b,, a ,c ")).toEqual(["a", "b", "c"]);
    expect(parseLabels("")).toEqual([]);
  });

  it("keeps labels within the server limits", () => {
    expect(parseLabels("x".repeat(40))).toEqual(["x".repeat(30)]);
    expect(parseLabels(Array.from({ length: 12 }, (_, i) => `l${i}`).join(","))).toHaveLength(10);
  });
});

describe("due dates", () => {
  it("formats today in local time", () => {
    expect(todayIso(new Date(2026, 0, 5, 23, 30))).toBe("2026-01-05");
  });

  it("flags cards due before today", () => {
    const card: Card = { id: "c", title: "t", details: "" };
    expect(isOverdue({ ...card, dueDate: "2026-01-04" }, "2026-01-05")).toBe(true);
    expect(isOverdue({ ...card, dueDate: "2026-01-05" }, "2026-01-05")).toBe(false);
    expect(isOverdue(card, "2026-01-05")).toBe(false);
  });

  it("formats due dates for display", () => {
    expect(formatDueDate("2026-03-09")).toBe("Mar 9");
  });
});

describe("boardStats", () => {
  it("counts done, overdue and open high priority cards", () => {
    const board: BoardData = {
      columns: [
        { id: "todo", title: "To Do", cardIds: ["a", "b"] },
        { id: "done", title: "Done", cardIds: ["c"] },
      ],
      cards: {
        a: { id: "a", title: "A", details: "", priority: "high", dueDate: "2026-01-01" },
        b: { id: "b", title: "B", details: "", priority: "low", dueDate: "2026-12-01" },
        c: { id: "c", title: "C", details: "", priority: "high", dueDate: "2026-01-01" },
      },
    };
    expect(boardStats(board, "2026-06-01")).toEqual({ total: 3, done: 1, overdue: 1, highPriority: 1 });
  });
});

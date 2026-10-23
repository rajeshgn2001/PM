import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { KanbanBoard, POLL_INTERVAL_MS } from "@/components/KanbanBoard";
import type { BoardData } from "@/lib/kanban";
import { ApiError, fetchBoard, listMembers, saveBoard, sendChatMessage, type Member } from "@/lib/api";

const testBoard: BoardData = {
  columns: [
    { id: "col-backlog", title: "Backlog", cardIds: ["card-1", "card-2"] },
    { id: "col-progress", title: "In Progress", cardIds: [] },
    { id: "col-done", title: "Done", cardIds: ["card-3"] },
  ],
  cards: {
    "card-1": { id: "card-1", title: "Align roadmap themes", details: "Draft themes.", labels: ["strategy"] },
    "card-2": {
      id: "card-2",
      title: "Fix billing bug",
      details: "Customers double charged.",
      priority: "high",
      dueDate: "2020-01-15",
      assignee: "alice",
      checklist: [
        { id: "i1", text: "Reproduce", done: true },
        { id: "i2", text: "Patch", done: false },
      ],
    },
    "card-3": { id: "card-3", title: "Ship docs", details: "", dueDate: "2020-01-10", assignee: "bob" },
  },
};

const MEMBERS: Member[] = [
  { username: "alice", role: "owner" },
  { username: "bob", role: "member" },
];

vi.mock("@/lib/api", async (importOriginal) => ({
  ApiError: (await importOriginal<typeof import("@/lib/api")>()).ApiError,
  fetchBoard: vi.fn(),
  listMembers: vi.fn(),
  saveBoard: vi.fn(),
  sendChatMessage: vi.fn(),
  addMember: vi.fn(),
  removeMember: vi.fn(),
}));

const loaded = (data = testBoard, version = 5, role: "owner" | "member" = "owner") => ({
  id: 42,
  title: "Roadmap",
  role,
  owner: "alice",
  version,
  data: structuredClone(data),
});

const renderBoard = (onLeave = vi.fn()) =>
  render(<KanbanBoard boardId={42} title="Roadmap" username="alice" onLeave={onLeave} />);
const columns = () => screen.getAllByTestId(/^column-/);
const lastSaved = () => vi.mocked(saveBoard).mock.lastCall![1];
const openCard = async (title: string) =>
  userEvent.click(await screen.findByRole("button", { name: `Edit ${title}` }));

describe("KanbanBoard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fetchBoard).mockResolvedValue(loaded());
    vi.mocked(listMembers).mockResolvedValue(MEMBERS);
    vi.mocked(saveBoard).mockImplementation(async (_id, _data, version) => ({ version: version + 1 }));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("loads the requested board and shows its title, stats and members", async () => {
    renderBoard();
    expect(await screen.findByRole("heading", { name: "Roadmap" })).toBeInTheDocument();
    expect(fetchBoard).toHaveBeenCalledWith(42);
    expect(listMembers).toHaveBeenCalledWith(42);
    expect(columns()).toHaveLength(3);
    expect(screen.getByTestId("board-stats")).toHaveTextContent(
      "3 cards across 3 stages, 1 done, 1 overdue, 1 high priority open"
    );
    expect(screen.getByRole("button", { name: "Share board" })).toHaveTextContent("Share");
  });

  it("shows an error with retry when loading fails", async () => {
    vi.mocked(fetchBoard).mockRejectedValueOnce(new Error("offline"));
    renderBoard();
    await userEvent.click(await screen.findByRole("button", { name: /retry/i }));
    expect(await screen.findAllByTestId(/^column-/)).toHaveLength(3);
    expect(saveBoard).not.toHaveBeenCalled();
  });

  it("shows card badges: overdue, priority, labels, checklist progress and assignee", async () => {
    renderBoard();
    const billing = await screen.findByTestId("card-card-2");
    expect(within(billing).getByTitle("Overdue")).toHaveTextContent("Jan 15");
    expect(within(billing).getByText("high")).toBeInTheDocument();
    expect(within(billing).getByTitle("Checklist")).toHaveTextContent("1/2");
    expect(within(billing).getByTitle("Assigned to alice")).toHaveTextContent("a");
    expect(within(screen.getByTestId("card-card-1")).getByText("strategy")).toBeInTheDocument();
    // Cards in the last column are done, so they are not shown as overdue.
    expect(within(screen.getByTestId("card-card-3")).getByTitle("Due date")).toBeInTheDocument();
  });

  it("edits every card field in the card dialog and saves with the loaded version", async () => {
    renderBoard();
    await openCard("Align roadmap themes");
    const dialog = screen.getByRole("dialog", { name: "Edit card" });

    const title = within(dialog).getByLabelText("Edit card title");
    await userEvent.clear(title);
    await userEvent.type(title, "Updated title");
    await userEvent.clear(within(dialog).getByLabelText("Edit card details"));
    await userEvent.type(within(dialog).getByLabelText("Edit card details"), "Updated details");
    await userEvent.selectOptions(within(dialog).getByLabelText("Edit card priority"), "medium");
    await userEvent.type(within(dialog).getByLabelText("Edit card due date"), "2030-05-01");
    await userEvent.selectOptions(within(dialog).getByLabelText("Edit card assignee"), "bob");
    const labels = within(dialog).getByLabelText("Edit card labels");
    await userEvent.clear(labels);
    await userEvent.type(labels, "q4, design, q4");
    await userEvent.type(within(dialog).getByLabelText("New checklist item"), "Write brief{enter}");
    await userEvent.click(within(dialog).getByRole("button", { name: /^save$/i }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByText("Updated title")).toBeInTheDocument();
    await waitFor(() => expect(saveBoard).toHaveBeenCalledTimes(1));
    expect(vi.mocked(saveBoard).mock.lastCall![2]).toBe(5);
    expect(lastSaved().cards["card-1"]).toEqual({
      id: "card-1",
      title: "Updated title",
      details: "Updated details",
      priority: "medium",
      dueDate: "2030-05-01",
      assignee: "bob",
      labels: ["q4", "design"],
      checklist: [{ id: expect.stringMatching(/^item-/), text: "Write brief", done: false }],
    });
  });

  it("clears optional fields when edited back to none", async () => {
    renderBoard();
    await openCard("Fix billing bug");
    await userEvent.selectOptions(screen.getByLabelText("Edit card priority"), "");
    await userEvent.clear(screen.getByLabelText("Edit card due date"));
    await userEvent.selectOptions(screen.getByLabelText("Edit card assignee"), "");
    await userEvent.click(screen.getByRole("button", { name: /^save$/i }));
    await waitFor(() => expect(saveBoard).toHaveBeenCalled());
    expect(lastSaved().cards["card-2"]).toMatchObject({ priority: null, dueDate: null, assignee: null });
  });

  it("closes the card dialog without saving on cancel", async () => {
    renderBoard();
    await openCard("Align roadmap themes");
    await userEvent.type(screen.getByLabelText("Edit card title"), " changed");
    await userEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(screen.getByText("Align roadmap themes")).toBeInTheDocument();
    expect(saveBoard).not.toHaveBeenCalled();
  });

  it("chains saves so each uses the version returned by the previous save", async () => {
    vi.mocked(saveBoard).mockImplementation(
      (_id, _data, version) => new Promise((resolve) => setTimeout(() => resolve({ version: version + 1 }), 300))
    );
    renderBoard();
    await userEvent.click(await screen.findByRole("button", { name: /add column/i }));
    await new Promise((resolve) => setTimeout(resolve, 200));
    await userEvent.click(screen.getByRole("button", { name: /add column/i }));
    await waitFor(() => expect(saveBoard).toHaveBeenCalledTimes(2), { timeout: 2000 });
    expect(vi.mocked(saveBoard).mock.calls.map((call) => call[2])).toEqual([5, 6]);
  });

  it("reloads the latest board and explains when a save conflicts", async () => {
    const teammateBoard = structuredClone(testBoard);
    teammateBoard.columns[0].title = "Teammate title";
    vi.mocked(saveBoard).mockRejectedValueOnce(new ApiError("changed by someone else", 409));
    vi.mocked(fetchBoard).mockResolvedValueOnce(loaded()).mockResolvedValueOnce(loaded(teammateBoard, 9));
    renderBoard();

    await userEvent.click(await screen.findByRole("button", { name: /add column/i }));
    expect(await screen.findByText(/your last change was not saved/)).toBeInTheDocument();
    expect(columns()).toHaveLength(3);
    expect(within(columns()[0]).getByLabelText("Column title")).toHaveValue("Teammate title");
    expect(screen.queryByText("Sync error")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /add column/i }));
    expect(screen.queryByText(/your last change was not saved/)).not.toBeInTheDocument();
    await waitFor(() => expect(saveBoard).toHaveBeenCalledTimes(2));
    expect(vi.mocked(saveBoard).mock.lastCall![2]).toBe(9);
  });

  it("shows a sync error when the conflict reload also fails", async () => {
    vi.mocked(saveBoard).mockRejectedValueOnce(new ApiError("conflict", 409));
    vi.mocked(fetchBoard).mockResolvedValueOnce(loaded()).mockRejectedValueOnce(new Error("offline"));
    renderBoard();
    await userEvent.click(await screen.findByRole("button", { name: /add column/i }));
    expect(await screen.findByText("Sync error")).toBeInTheDocument();
  });

  it("shows a sync error when saving fails", async () => {
    vi.mocked(saveBoard).mockRejectedValueOnce(new ApiError("offline", 500));
    renderBoard();
    await userEvent.click(await screen.findByRole("button", { name: /add column/i }));
    expect(await screen.findByText("Sync error")).toBeInTheDocument();
  });

  it("picks up teammates' changes on shared boards while idle", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const teammateBoard = structuredClone(testBoard);
    teammateBoard.cards["card-1"].title = "Renamed by bob";
    renderBoard();
    await screen.findByText("Align roadmap themes");

    vi.mocked(fetchBoard).mockResolvedValue(loaded(teammateBoard, 6));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);
    });
    expect(await screen.findByText("Renamed by bob")).toBeInTheDocument();
  });

  it("does not poll boards that are not shared", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.mocked(listMembers).mockResolvedValue([MEMBERS[0]]);
    renderBoard();
    await screen.findByText("Align roadmap themes");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS * 2);
    });
    expect(fetchBoard).toHaveBeenCalledTimes(1);
  });

  it("does not replace the board while a card is being edited", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderBoard();
    await openCard("Align roadmap themes");
    vi.mocked(fetchBoard).mockResolvedValue(loaded(testBoard, 6));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);
    });
    expect(fetchBoard).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("dialog", { name: "Edit card" })).toBeInTheDocument();
  });

  it("renames a column and triggers persistence", async () => {
    renderBoard();
    const input = within((await screen.findAllByTestId(/^column-/))[0]).getByLabelText("Column title");
    await userEvent.clear(input);
    await userEvent.type(input, "New Name");
    await waitFor(() => expect(lastSaved().columns[0].title).toBe("New Name"));
  });

  it("adds and removes a card with persistence", async () => {
    renderBoard();
    await screen.findByText("Align roadmap themes");
    const column = columns()[0];

    await userEvent.click(within(column).getByRole("button", { name: /add a card/i }));
    await userEvent.type(within(column).getByPlaceholderText(/card title/i), "New card");
    await userEvent.type(within(column).getByPlaceholderText(/details/i), "Notes");
    await userEvent.click(within(column).getByRole("button", { name: /add card/i }));
    expect(within(column).getByText("New card")).toBeInTheDocument();
    await waitFor(() => expect(Object.keys(lastSaved().cards)).toHaveLength(4));

    await userEvent.click(within(column).getByRole("button", { name: /delete new card/i }));
    expect(within(column).queryByText("New card")).not.toBeInTheDocument();
    await waitFor(() => expect(Object.keys(lastSaved().cards)).toHaveLength(3));
  });

  it("adds a column and deletes an empty column without confirmation", async () => {
    const confirm = vi.spyOn(window, "confirm");
    renderBoard();
    await userEvent.click(await screen.findByRole("button", { name: /add column/i }));
    expect(columns()).toHaveLength(4);
    expect(within(columns()[3]).getByLabelText("Column title")).toHaveValue("New column");

    await userEvent.click(screen.getByRole("button", { name: "Delete column In Progress" }));
    expect(confirm).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(lastSaved().columns.map((c) => c.title)).toEqual(["Backlog", "Done", "New column"])
    );
  });

  it("asks before deleting a column with cards, and removes its cards", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValueOnce(true);
    renderBoard();
    const deleteBacklog = await screen.findByRole("button", { name: "Delete column Backlog" });

    await userEvent.click(deleteBacklog);
    expect(columns()).toHaveLength(3);

    await userEvent.click(deleteBacklog);
    expect(confirm).toHaveBeenCalledWith('Delete "Backlog" and its 2 card(s)?');
    expect(columns()).toHaveLength(2);
    await waitFor(() => expect(Object.keys(lastSaved().cards)).toEqual(["card-3"]));
  });

  it("does not allow deleting the last column", async () => {
    vi.mocked(fetchBoard).mockResolvedValue(
      loaded({ columns: [{ id: "only", title: "Only", cardIds: [] }], cards: {} })
    );
    renderBoard();
    await screen.findByDisplayValue("Only");
    expect(screen.queryByRole("button", { name: /delete column/i })).not.toBeInTheDocument();
  });

  it("filters cards by search text, labels, priority and assignee", async () => {
    renderBoard();
    await screen.findByText("Align roadmap themes");

    await userEvent.type(screen.getByLabelText("Search cards"), "BILLING");
    expect(screen.queryByText("Align roadmap themes")).not.toBeInTheDocument();
    expect(screen.getByText("Showing 1 of 3 cards")).toBeInTheDocument();
    await userEvent.clear(screen.getByLabelText("Search cards"));
    await userEvent.type(screen.getByLabelText("Search cards"), "strategy");
    expect(screen.getByText("Align roadmap themes")).toBeInTheDocument();
    expect(screen.queryByText("Fix billing bug")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /clear filters/i }));

    await userEvent.selectOptions(screen.getByLabelText("Filter by priority"), "high");
    expect(screen.queryByText("Ship docs")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /clear filters/i }));

    const assignee = screen.getByLabelText("Filter by assignee");
    await userEvent.selectOptions(assignee, "Assigned to me");
    expect(screen.getByText("Fix billing bug")).toBeInTheDocument();
    expect(screen.queryByText("Ship docs")).not.toBeInTheDocument();
    await userEvent.selectOptions(assignee, "bob");
    expect(screen.getByText("Ship docs")).toBeInTheDocument();
    expect(screen.queryByText("Fix billing bug")).not.toBeInTheDocument();
    await userEvent.selectOptions(assignee, "Unassigned");
    expect(screen.getByText("Showing 1 of 3 cards")).toBeInTheDocument();
    expect(screen.getByText("Align roadmap themes")).toBeInTheDocument();
    expect(saveBoard).not.toHaveBeenCalled();
  });

  it("opens the members dialog and reloads the board after membership changes", async () => {
    const { addMember } = await import("@/lib/api");
    vi.mocked(addMember).mockResolvedValue([...MEMBERS, { username: "carol", role: "member" }]);
    renderBoard();
    await userEvent.click(await screen.findByRole("button", { name: "Share board" }));
    await userEvent.type(screen.getByLabelText("Username to invite"), "carol");
    await userEvent.click(screen.getByRole("button", { name: /invite/i }));
    const memberList = await screen.findByRole("list", { name: "Members" });
    expect(await within(memberList).findByText("carol")).toBeInTheDocument();
    await waitFor(() => expect(fetchBoard).toHaveBeenCalledTimes(2));
  });

  it("shows Members instead of Share for board members and lets them leave", async () => {
    const { removeMember } = await import("@/lib/api");
    vi.mocked(removeMember).mockResolvedValue(undefined);
    vi.spyOn(window, "confirm").mockReturnValue(true);
    vi.mocked(fetchBoard).mockResolvedValue(loaded(testBoard, 5, "member"));
    const onLeave = vi.fn();
    renderBoard(onLeave);

    await userEvent.click(await screen.findByRole("button", { name: "Board members" }));
    await userEvent.click(screen.getByRole("button", { name: /leave board/i }));
    expect(removeMember).toHaveBeenCalledWith(42, "alice");
    expect(onLeave).toHaveBeenCalled();
  });

  it("adopts the board and version returned by the AI", async () => {
    const aiBoard = structuredClone(testBoard);
    aiBoard.cards["card-1"].title = "AI title";
    vi.mocked(sendChatMessage).mockResolvedValue({
      message: "Done.",
      board_update: aiBoard,
      board_changed: true,
      version: 12,
    });
    renderBoard();
    await userEvent.click(await screen.findByRole("button", { name: /open ai assistant/i }));
    await userEvent.type(screen.getByPlaceholderText(/ask ai/i), "Rename it{enter}");
    expect(await screen.findByText("AI title")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /close assistant sidebar/i }));
    await userEvent.click(screen.getByRole("button", { name: /add column/i }));
    await waitFor(() => expect(saveBoard).toHaveBeenCalled());
    expect(vi.mocked(saveBoard).mock.lastCall![2]).toBe(12);
  });
});

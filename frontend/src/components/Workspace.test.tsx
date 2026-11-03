import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Workspace } from "@/components/Workspace";
import * as api from "@/lib/api";

vi.mock("@/lib/api", () => ({
  listBoards: vi.fn(),
  createBoard: vi.fn(),
  renameBoard: vi.fn(),
  deleteBoard: vi.fn(),
  listGroups: vi.fn(),
  createGroup: vi.fn(),
  renameGroup: vi.fn(),
  moveBoardToGroup: vi.fn(),
  fetchBoard: vi.fn(),
  saveBoard: vi.fn(),
  listMembers: vi.fn(),
  addMember: vi.fn(),
  removeMember: vi.fn(),
  sendChatMessage: vi.fn(),
  fetchProfile: vi.fn(),
  changePassword: vi.fn(),
  deleteAccount: vi.fn(),
}));

const summary = (id: number, title: string, role: "owner" | "member" = "owner", owner = "alice") => ({
  id,
  title,
  role,
  owner,
  created_at: "2026-10-01 10:00:00",
  updated_at: "2026-10-01 10:00:00",
  card_count: 0,
  open_card_count: 0,
  group_id: 1,
});

const emptyData = { columns: [{ id: "col-todo", title: "To Do", cardIds: [] }], cards: {} };
const board = (id: number, title: string) => ({ id, title, role: "owner" as const, owner: "alice", version: 1, data: emptyData });

const renderWorkspace = (onLogout = vi.fn()) =>
  render(<Workspace username="alice" onLogout={onLogout} />);

const boardNav = () => screen.getByRole("navigation", { name: "Boards" });

describe("Workspace", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    vi.mocked(api.listBoards).mockResolvedValue([summary(1, "Roadmap"), summary(2, "Sprint")]);
    vi.mocked(api.listGroups).mockResolvedValue([{ id: 1, name: "DEFAULT" }]);
    vi.mocked(api.fetchBoard).mockImplementation(async (id) => board(id, id === 1 ? "Roadmap" : "Sprint"));
    vi.mocked(api.listMembers).mockResolvedValue([{ username: "alice", role: "owner" }]);
  });

  it("lists boards and opens the first one", async () => {
    renderWorkspace();
    expect(await screen.findByRole("heading", { name: "Roadmap" })).toBeInTheDocument();
    expect(within(boardNav()).getByRole("button", { name: "Roadmap" })).toHaveAttribute("aria-current", "page");
    expect(api.fetchBoard).toHaveBeenCalledWith(1);
  });

  it("switches boards and remembers the selection", async () => {
    renderWorkspace();
    await screen.findByRole("heading", { name: "Roadmap" });
    await userEvent.click(within(boardNav()).getByRole("button", { name: "Sprint" }));
    expect(await screen.findByRole("heading", { name: "Sprint" })).toBeInTheDocument();
    expect(api.fetchBoard).toHaveBeenLastCalledWith(2);
    expect(sessionStorage.getItem("kanban_selected_board")).toBe("2");
  });

  it("restores the previously selected board", async () => {
    sessionStorage.setItem("kanban_selected_board", "2");
    renderWorkspace();
    expect(await screen.findByRole("heading", { name: "Sprint" })).toBeInTheDocument();
  });

  it("creates a board and selects it", async () => {
    vi.mocked(api.createBoard).mockResolvedValue(board(3, "Launch"));
    vi.mocked(api.fetchBoard).mockResolvedValue(board(3, "Launch"));
    renderWorkspace();
    await screen.findByRole("heading", { name: "Roadmap" });

    await userEvent.click(screen.getByRole("button", { name: /new board/i }));
    await userEvent.type(screen.getByLabelText("New board name"), "  Launch {enter}");
    expect(api.createBoard).toHaveBeenCalledWith("Launch");
    expect(await screen.findByRole("heading", { name: "Launch" })).toBeInTheDocument();
    expect(within(boardNav()).getByRole("button", { name: "Launch" })).toHaveAttribute("aria-current", "page");
  });

  it("renames a board", async () => {
    vi.mocked(api.renameBoard).mockResolvedValue(board(1, "Q4 Roadmap"));
    renderWorkspace();
    await screen.findByRole("heading", { name: "Roadmap" });

    await userEvent.click(screen.getByRole("button", { name: "Rename board Roadmap" }));
    const input = screen.getByLabelText("Board name");
    await userEvent.clear(input);
    await userEvent.type(input, "Q4 Roadmap{enter}");
    expect(api.renameBoard).toHaveBeenCalledWith(1, "Q4 Roadmap");
    expect(await screen.findByRole("heading", { name: "Q4 Roadmap" })).toBeInTheDocument();
  });

  it("deletes a board after confirmation and selects the next one", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    vi.mocked(api.deleteBoard).mockResolvedValue(undefined);
    renderWorkspace();
    await screen.findByRole("heading", { name: "Roadmap" });

    await userEvent.click(screen.getByRole("button", { name: "Delete board Roadmap" }));
    expect(api.deleteBoard).toHaveBeenCalledWith(1);
    expect(await screen.findByRole("heading", { name: "Sprint" })).toBeInTheDocument();
    expect(within(boardNav()).queryByRole("button", { name: "Roadmap" })).not.toBeInTheDocument();
  });

  it("keeps the board when deletion is cancelled", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    renderWorkspace();
    await screen.findByRole("heading", { name: "Roadmap" });
    await userEvent.click(screen.getByRole("button", { name: "Delete board Roadmap" }));
    expect(api.deleteBoard).not.toHaveBeenCalled();
  });

  it("labels shared boards with their owner and hides owner-only actions", async () => {
    vi.mocked(api.listBoards).mockResolvedValue([summary(1, "Roadmap"), summary(5, "Team plan", "member", "bob")]);
    renderWorkspace();
    await screen.findByRole("heading", { name: "Roadmap" });
    expect(within(boardNav()).getByText("Shared by bob")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Rename board Roadmap" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Rename board Team plan" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Delete board Team plan" })).not.toBeInTheDocument();
  });

  it("removes a board from the list after leaving it", async () => {
    vi.mocked(api.listBoards).mockResolvedValue([summary(5, "Team plan", "member", "bob"), summary(1, "Roadmap")]);
    vi.mocked(api.fetchBoard).mockImplementation(async (id) =>
      id === 5 ? { ...board(5, "Team plan"), role: "member" as const, owner: "bob" } : board(1, "Roadmap")
    );
    vi.mocked(api.removeMember).mockResolvedValue(undefined);
    vi.spyOn(window, "confirm").mockReturnValue(true);
    renderWorkspace();

    await userEvent.click(await screen.findByRole("button", { name: "Board members" }));
    await userEvent.click(screen.getByRole("button", { name: /leave board/i }));
    expect(api.removeMember).toHaveBeenCalledWith(5, "alice");
    expect(await screen.findByRole("heading", { name: "Roadmap" })).toBeInTheDocument();
    expect(within(boardNav()).queryByText("Team plan")).not.toBeInTheDocument();
  });

  it("greys out boards with no open cards and updates as the board changes", async () => {
    vi.mocked(api.listBoards).mockResolvedValue([summary(1, "Roadmap"), { ...summary(2, "Sprint"), open_card_count: 3 }]);
    renderWorkspace();
    await screen.findByRole("heading", { name: "Roadmap" });
    const row = (name: string) => within(boardNav()).getByRole("button", { name }).parentElement;
    expect(row("Roadmap")).toHaveClass("text-[var(--gray-text)]/60");
    expect(row("Sprint")).toHaveClass("text-[var(--navy-dark)]");

    // Sprint now has its only card in the last (done) column, so it turns grey once loaded.
    vi.mocked(api.fetchBoard).mockResolvedValue({
      ...board(2, "Sprint"),
      data: {
        columns: [
          { id: "col-todo", title: "To Do", cardIds: [] },
          { id: "col-done", title: "Done", cardIds: ["card-1"] },
        ],
        cards: { "card-1": { id: "card-1", title: "Ship", details: "" } },
      },
    });
    await userEvent.click(within(boardNav()).getByRole("button", { name: "Sprint" }));
    await screen.findByRole("heading", { name: "Sprint" });
    await waitFor(() => expect(row("Sprint")).toHaveClass("text-[var(--gray-text)]/60"));
  });

  it("lists boards under their groups", async () => {
    vi.mocked(api.listBoards).mockResolvedValue([summary(1, "Roadmap"), { ...summary(2, "Sprint"), group_id: 2 }]);
    vi.mocked(api.listGroups).mockResolvedValue([
      { id: 1, name: "DEFAULT" },
      { id: 2, name: "Work" },
    ]);
    renderWorkspace();
    await screen.findByRole("heading", { name: "Roadmap" });
    const defaultGroup = screen.getByRole("region", { name: "Group DEFAULT" });
    const workGroup = screen.getByRole("region", { name: "Group Work" });
    expect(within(defaultGroup).getByRole("button", { name: "Roadmap" })).toBeInTheDocument();
    expect(within(workGroup).getByRole("button", { name: "Sprint" })).toBeInTheDocument();
    expect(within(defaultGroup).queryByRole("button", { name: "Sprint" })).not.toBeInTheDocument();
  });

  it("creates a group", async () => {
    vi.mocked(api.createGroup).mockResolvedValue({ id: 2, name: "Work" });
    renderWorkspace();
    await screen.findByRole("heading", { name: "Roadmap" });
    await userEvent.click(screen.getByRole("button", { name: /new group/i }));
    await userEvent.type(screen.getByLabelText("New group name"), "  Work {enter}");
    expect(api.createGroup).toHaveBeenCalledWith("Work");
    expect(await screen.findByRole("region", { name: "Group Work" })).toBeInTheDocument();
    expect(screen.queryByLabelText("New group name")).not.toBeInTheDocument();
  });

  it("renames a group", async () => {
    vi.mocked(api.renameGroup).mockResolvedValue({ id: 1, name: "Personal" });
    renderWorkspace();
    await screen.findByRole("heading", { name: "Roadmap" });
    await userEvent.click(screen.getByRole("button", { name: "Rename group DEFAULT" }));
    const input = screen.getByLabelText("Group name");
    await userEvent.clear(input);
    await userEvent.type(input, "Personal{enter}");
    expect(api.renameGroup).toHaveBeenCalledWith(1, "Personal");
    expect(await screen.findByRole("region", { name: "Group Personal" })).toBeInTheDocument();
  });

  it("shows why a group could not be created", async () => {
    vi.mocked(api.createGroup).mockRejectedValue(new Error("You already have a group named DEFAULT"));
    renderWorkspace();
    await screen.findByRole("heading", { name: "Roadmap" });
    await userEvent.click(screen.getByRole("button", { name: /new group/i }));
    await userEvent.type(screen.getByLabelText("New group name"), "DEFAULT{enter}");
    expect(await screen.findByRole("alert")).toHaveTextContent("You already have a group named DEFAULT");
  });

  it("collapses and expands a group, remembering it for the session", async () => {
    const { unmount } = renderWorkspace();
    await screen.findByRole("heading", { name: "Roadmap" });
    const header = screen.getByRole("button", { name: "DEFAULT" });
    expect(header).toHaveAttribute("aria-expanded", "true");

    await userEvent.click(header);
    expect(header).toHaveAttribute("aria-expanded", "false");
    expect(within(boardNav()).queryByRole("button", { name: "Roadmap" })).not.toBeInTheDocument();
    // The open board stays open while its group is collapsed.
    expect(screen.getByRole("heading", { name: "Roadmap" })).toBeInTheDocument();

    unmount();
    renderWorkspace();
    await screen.findByRole("heading", { name: "Roadmap" });
    expect(screen.getByRole("button", { name: "DEFAULT" })).toHaveAttribute("aria-expanded", "false");

    await userEvent.click(screen.getByRole("button", { name: "DEFAULT" }));
    expect(within(boardNav()).getByRole("button", { name: "Roadmap" })).toBeInTheDocument();
  });

  it("shows an empty state when there are no boards", async () => {
    vi.mocked(api.listBoards).mockResolvedValue([]);
    renderWorkspace();
    await userEvent.click(await screen.findByRole("button", { name: /create a board/i }));
    expect(screen.getByLabelText("New board name")).toBeInTheDocument();
  });

  it("shows errors from board actions", async () => {
    vi.mocked(api.createBoard).mockRejectedValue(new Error("Server unavailable"));
    renderWorkspace();
    await screen.findByRole("heading", { name: "Roadmap" });
    await userEvent.click(screen.getByRole("button", { name: /new board/i }));
    await userEvent.type(screen.getByLabelText("New board name"), "Launch{enter}");
    expect(await screen.findByRole("alert")).toHaveTextContent("Server unavailable");
  });

  it("shows an error when boards cannot be loaded", async () => {
    vi.mocked(api.listBoards).mockRejectedValue(new Error("offline"));
    renderWorkspace();
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not load boards.");
  });

  it("opens account settings and signs out", async () => {
    vi.mocked(api.fetchProfile).mockResolvedValue({
      username: "alice",
      created_at: "2026-10-01 10:00:00",
      board_count: 2,
    });
    const onLogout = vi.fn();
    renderWorkspace(onLogout);
    await screen.findByRole("heading", { name: "Roadmap" });

    await userEvent.click(screen.getByRole("button", { name: "Account settings" }));
    expect(await screen.findByText(/member since 2026-10-01, 2 boards/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Close account settings" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    await userEvent.click(screen.getByRole("button", { name: "Sign out" }));
    expect(onLogout).toHaveBeenCalled();
  });
});

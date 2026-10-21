import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { KanbanBoard } from "@/components/KanbanBoard";
import type { BoardData } from "@/lib/kanban";
import { fetchBoard, saveBoard } from "@/lib/api";

const testBoard: BoardData = {
  columns: [
    { id: "col-backlog", title: "Backlog", cardIds: ["card-1"] },
    { id: "col-discovery", title: "Discovery", cardIds: [] },
    { id: "col-progress", title: "In Progress", cardIds: [] },
    { id: "col-review", title: "Review", cardIds: [] },
    { id: "col-done", title: "Done", cardIds: [] },
  ],
  cards: {
    "card-1": { id: "card-1", title: "Align roadmap themes", details: "Draft themes." },
  },
};

vi.mock("@/lib/api", () => ({
  fetchBoard: vi.fn(),
  saveBoard: vi.fn((data) => Promise.resolve(data)),
}));

const getFirstColumn = () => screen.getAllByTestId(/column-/i)[0];

describe("KanbanBoard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fetchBoard).mockResolvedValue(structuredClone(testBoard));
  });

  it("shows an error with retry instead of demo data when loading fails", async () => {
    vi.mocked(fetchBoard).mockRejectedValueOnce(new Error("offline"));
    render(<KanbanBoard />);
    await userEvent.click(await screen.findByRole("button", { name: /retry/i }));
    expect(await screen.findAllByTestId(/column-/i)).toHaveLength(5);
    expect(saveBoard).not.toHaveBeenCalled();
  });

  it("edits a card title and details", async () => {
    render(<KanbanBoard />);
    await userEvent.click(await screen.findByRole("button", { name: /edit align roadmap themes/i }));

    const title = screen.getByLabelText("Edit card title");
    await userEvent.clear(title);
    await userEvent.type(title, "Updated title");
    const details = screen.getByLabelText("Edit card details");
    await userEvent.clear(details);
    await userEvent.type(details, "Updated details");
    await userEvent.click(screen.getByRole("button", { name: /^save$/i }));

    expect(screen.getByText("Updated title")).toBeInTheDocument();
    expect(screen.getByText("Updated details")).toBeInTheDocument();
    await waitFor(() =>
      expect(saveBoard).toHaveBeenLastCalledWith(
        expect.objectContaining({
          cards: { "card-1": { id: "card-1", title: "Updated title", details: "Updated details" } },
        })
      )
    );
  });

  it("renders five columns", async () => {
    render(<KanbanBoard />);
    await waitFor(() => {
      expect(screen.getAllByTestId(/column-/i)).toHaveLength(5);
    });
  });

  it("renames a column and triggers persistence", async () => {
    render(<KanbanBoard />);
    const column = (await screen.findAllByTestId(/column-/i))[0];
    const input = within(column).getByLabelText("Column title");
    expect(input).toHaveValue("Backlog");

    await userEvent.clear(input);
    await userEvent.type(input, "New Name");
    expect(input).toHaveValue("New Name");

    await waitFor(() => {
      expect(saveBoard).toHaveBeenCalled();
    });
  });

  it("adds and removes a card with persistence", async () => {
    render(<KanbanBoard />);
    await screen.findByText("Align roadmap themes");
    const column = getFirstColumn();

    const addButton = within(column).getByRole("button", {
      name: /add a card/i,
    });
    await userEvent.click(addButton);

    const titleInput = within(column).getByPlaceholderText(/card title/i);
    await userEvent.type(titleInput, "New card");
    const detailsInput = within(column).getByPlaceholderText(/details/i);
    await userEvent.type(detailsInput, "Notes");

    await userEvent.click(within(column).getByRole("button", { name: /add card/i }));

    expect(within(column).getByText("New card")).toBeInTheDocument();

    await waitFor(() => {
      expect(saveBoard).toHaveBeenCalled();
    });

    const deleteButton = within(column).getByRole("button", {
      name: /delete new card/i,
    });
    await userEvent.click(deleteButton);

    expect(within(column).queryByText("New card")).not.toBeInTheDocument();
  });
});

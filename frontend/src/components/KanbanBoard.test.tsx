import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { KanbanBoard } from "@/components/KanbanBoard";
import { initialData } from "@/lib/kanban";

vi.mock("@/lib/api", () => ({
  fetchBoard: vi.fn(() => Promise.resolve(initialData)),
  saveBoard: vi.fn((data) => Promise.resolve(data)),
}));

const getFirstColumn = () => screen.getAllByTestId(/column-/i)[0];

describe("KanbanBoard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders five columns", async () => {
    render(<KanbanBoard />);
    await waitFor(() => {
      expect(screen.getAllByTestId(/column-/i)).toHaveLength(5);
    });
  });

  it("renames a column and triggers persistence", async () => {
    const { saveBoard } = await import("@/lib/api");
    render(<KanbanBoard />);
    const column = getFirstColumn();
    const input = within(column).getByLabelText("Column title");

    // Wait for initial fetchBoard resolution
    await waitFor(() => expect(input).toHaveValue("Backlog"));

    await userEvent.clear(input);
    await userEvent.type(input, "New Name");
    expect(input).toHaveValue("New Name");

    await waitFor(() => {
      expect(saveBoard).toHaveBeenCalled();
    });
  });

  it("adds and removes a card with persistence", async () => {
    const { saveBoard } = await import("@/lib/api");
    render(<KanbanBoard />);
    const column = getFirstColumn();

    // Wait for initial fetchBoard resolution
    await waitFor(() => expect(screen.getByText("Align roadmap themes")).toBeInTheDocument());

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

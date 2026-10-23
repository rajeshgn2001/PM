import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CardDialog } from "@/components/CardDialog";
import type { Card } from "@/lib/kanban";

const card: Card = {
  id: "card-1",
  title: "Launch",
  details: "Plan the launch",
  labels: ["marketing"],
  checklist: [
    { id: "i1", text: "Book venue", done: false },
    { id: "i2", text: "Send invites", done: true },
  ],
};

const renderDialog = (onSave = vi.fn(), onClose = vi.fn()) => {
  render(<CardDialog card={card} members={["alice", "bob"]} onSave={onSave} onClose={onClose} />);
  return { onSave, onClose };
};

describe("CardDialog", () => {
  it("pre-fills the card and lists members as assignees", () => {
    renderDialog();
    expect(screen.getByLabelText("Edit card title")).toHaveValue("Launch");
    expect(screen.getByLabelText("Edit card labels")).toHaveValue("marketing");
    const assignee = screen.getByLabelText("Edit card assignee");
    expect(within(assignee).getAllByRole("option").map((o) => o.textContent)).toEqual(["Unassigned", "alice", "bob"]);
    expect(screen.getByText("Checklist (1/2)")).toBeInTheDocument();
  });

  it("toggles, removes and adds checklist items", async () => {
    const { onSave } = renderDialog();
    await userEvent.click(screen.getByLabelText("Book venue"));
    await userEvent.click(screen.getByRole("button", { name: "Remove Send invites" }));
    await userEvent.type(screen.getByLabelText("New checklist item"), "  Order food ");
    await userEvent.click(screen.getByRole("button", { name: "Add checklist item" }));
    await userEvent.click(screen.getByRole("button", { name: "Add checklist item" }));
    expect(screen.getByText("Checklist (1/2)")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /^save$/i }));
    expect(onSave.mock.lastCall![0].checklist).toEqual([
      { id: "i1", text: "Book venue", done: true },
      { id: expect.stringMatching(/^item-/), text: "Order food", done: false },
    ]);
  });

  it("does not save without a title", async () => {
    const { onSave } = renderDialog();
    await userEvent.clear(screen.getByLabelText("Edit card title"));
    await userEvent.type(screen.getByLabelText("Edit card title"), "   ");
    await userEvent.click(screen.getByRole("button", { name: /^save$/i }));
    expect(onSave).not.toHaveBeenCalled();
  });

  it("closes with Escape or the close button", async () => {
    const { onClose } = renderDialog();
    await userEvent.keyboard("{Escape}");
    await userEvent.click(screen.getByRole("button", { name: "Close card" }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});

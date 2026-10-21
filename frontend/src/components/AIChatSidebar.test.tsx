import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AIChatSidebar } from "./AIChatSidebar";
import * as api from "@/lib/api";

describe("AIChatSidebar", () => {
  it("renders nothing when isOpen is false", () => {
    const { container } = render(
      <AIChatSidebar isOpen={false} onClose={vi.fn()} onBoardUpdate={vi.fn()} />
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders assistant header and greeting when open", () => {
    render(
      <AIChatSidebar isOpen={true} onClose={vi.fn()} onBoardUpdate={vi.fn()} />
    );
    expect(screen.getByText("AI Project Assistant")).toBeInTheDocument();
    expect(screen.getByText(/I am your project assistant/i)).toBeInTheDocument();
  });

  it("calls onClose when close button is clicked", async () => {
    const handleClose = vi.fn();
    render(
      <AIChatSidebar isOpen={true} onClose={handleClose} onBoardUpdate={vi.fn()} />
    );
    await userEvent.click(screen.getByLabelText(/close assistant sidebar/i));
    expect(handleClose).toHaveBeenCalled();
  });

  it("sends prompt and updates board when AI returns board_update", async () => {
    const handleBoardUpdate = vi.fn();
    const fakeBoard = { columns: [], cards: {} };
    vi.spyOn(api, "sendChatMessage").mockResolvedValueOnce({
      message: "I created the card.",
      board_update: fakeBoard,
      board_changed: true,
    });

    render(
      <AIChatSidebar
        isOpen={true}
        onClose={vi.fn()}
        onBoardUpdate={handleBoardUpdate}
      />
    );

    const input = screen.getByPlaceholderText(/ask ai to add/i);
    await userEvent.type(input, "Create card");
    await userEvent.click(screen.getByRole("button", { name: /send/i }));

    await waitFor(() => {
      expect(screen.getByText("I created the card.")).toBeInTheDocument();
    });

    expect(handleBoardUpdate).toHaveBeenCalledWith(fakeBoard);
    expect(screen.getByText("Board updated")).toBeInTheDocument();
  });
});

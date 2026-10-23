import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AccountDialog } from "@/components/AccountDialog";
import * as api from "@/lib/api";

vi.mock("@/lib/api", () => ({
  fetchProfile: vi.fn(),
  changePassword: vi.fn(),
  deleteAccount: vi.fn(),
}));

const renderDialog = (onAccountDeleted = vi.fn()) =>
  render(<AccountDialog onClose={vi.fn()} onAccountDeleted={onAccountDeleted} />);

describe("AccountDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.fetchProfile).mockResolvedValue({
      username: "alice",
      created_at: "2026-10-01 10:00:00",
      board_count: 1,
    });
  });

  it("shows the profile", async () => {
    renderDialog();
    expect(await screen.findByText(/member since 2026-10-01, 1 board$/)).toBeInTheDocument();
  });

  it("changes the password", async () => {
    vi.mocked(api.changePassword).mockResolvedValue(undefined);
    renderDialog();
    await userEvent.type(screen.getByLabelText("Current password"), "old-pass");
    await userEvent.type(screen.getByLabelText("New password"), "new-pass");
    await userEvent.click(screen.getByRole("button", { name: /update password/i }));

    expect(api.changePassword).toHaveBeenCalledWith("old-pass", "new-pass");
    expect(await screen.findByRole("status")).toHaveTextContent("Password updated");
    expect(screen.getByLabelText("New password")).toHaveValue("");
  });

  it("validates the new password length before calling the server", async () => {
    renderDialog();
    await userEvent.type(screen.getByLabelText("Current password"), "old-pass");
    await userEvent.type(screen.getByLabelText("New password"), "abc");
    await userEvent.click(screen.getByRole("button", { name: /update password/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent("at least 6 characters");
    expect(api.changePassword).not.toHaveBeenCalled();
  });

  it("shows the server error when the current password is wrong", async () => {
    vi.mocked(api.changePassword).mockRejectedValue(new Error("Current password is incorrect"));
    renderDialog();
    await userEvent.type(screen.getByLabelText("Current password"), "wrong");
    await userEvent.type(screen.getByLabelText("New password"), "new-pass");
    await userEvent.click(screen.getByRole("button", { name: /update password/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Current password is incorrect");
  });

  it("deletes the account after confirmation", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    vi.mocked(api.deleteAccount).mockResolvedValue(undefined);
    const onDeleted = vi.fn();
    renderDialog(onDeleted);
    await userEvent.type(screen.getByLabelText("Confirm with your password"), "pw123456");
    await userEvent.click(screen.getByRole("button", { name: /delete account/i }));
    expect(api.deleteAccount).toHaveBeenCalledWith("pw123456");
    expect(onDeleted).toHaveBeenCalled();
  });

  it("does not delete the account when the password is wrong or confirmation is cancelled", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValueOnce(true);
    vi.mocked(api.deleteAccount).mockRejectedValue(new Error("Password is incorrect"));
    const onDeleted = vi.fn();
    renderDialog(onDeleted);
    await userEvent.type(screen.getByLabelText("Confirm with your password"), "wrong");

    await userEvent.click(screen.getByRole("button", { name: /delete account/i }));
    expect(api.deleteAccount).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: /delete account/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Password is incorrect");
    expect(confirm).toHaveBeenCalledTimes(2);
    expect(onDeleted).not.toHaveBeenCalled();
  });
});

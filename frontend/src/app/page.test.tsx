import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Home from "@/app/page";
import { AUTH_EXPIRED_EVENT } from "@/lib/auth";
import { mockLoginFetch } from "@/test/fetchMock";

vi.mock("@/components/Workspace", () => ({
  Workspace: ({ username, onLogout }: { username: string; onLogout: () => void }) => (
    <div>
      <p>Workspace for {username}</p>
      <button onClick={onLogout}>Sign out</button>
    </div>
  ),
}));

describe("Home", () => {
  beforeEach(() => {
    sessionStorage.clear();
    mockLoginFetch();
  });

  it("shows the sign in form when signed out", () => {
    render(<Home />);
    expect(screen.getByRole("button", { name: /^sign in$/i })).toBeInTheDocument();
  });

  it("opens the workspace for a stored session", () => {
    sessionStorage.setItem("kanban_auth_token", "token-user");
    sessionStorage.setItem("kanban_auth_user", "user");
    render(<Home />);
    expect(screen.getByText("Workspace for user")).toBeInTheDocument();
  });

  it("signs in, signs out, and returns to sign in when the session expires", async () => {
    render(<Home />);
    await userEvent.type(screen.getByLabelText(/username/i), "user");
    await userEvent.type(screen.getByLabelText(/password/i), "password");
    await userEvent.click(screen.getByRole("button", { name: /^sign in$/i }));
    expect(await screen.findByText("Workspace for user")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Sign out" }));
    expect(await screen.findByRole("button", { name: /^sign in$/i })).toBeInTheDocument();

    sessionStorage.setItem("kanban_auth_token", "token-user");
    sessionStorage.setItem("kanban_auth_user", "user");
    render(<Home />);
    expect(screen.getByText("Workspace for user")).toBeInTheDocument();
    act(() => {
      window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT));
    });
    expect(screen.queryByText("Workspace for user")).not.toBeInTheDocument();
  });
});

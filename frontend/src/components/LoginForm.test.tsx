import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LoginForm } from "./LoginForm";
import { mockLoginFetch } from "@/test/fetchMock";

describe("LoginForm", () => {
  beforeEach(() => {
    sessionStorage.clear();
    mockLoginFetch();
  });

  it("renders username and password input fields", () => {
    render(<LoginForm onLoginSuccess={vi.fn()} />);
    expect(screen.getByLabelText(/username/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /sign in/i })).toBeInTheDocument();
  });

  it("shows error alert on invalid credentials", async () => {
    render(<LoginForm onLoginSuccess={vi.fn()} />);
    await userEvent.type(screen.getByLabelText(/username/i), "wrong");
    await userEvent.type(screen.getByLabelText(/password/i), "wrong");
    await userEvent.click(screen.getByRole("button", { name: /sign in/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Invalid username or password");
  });

  it("invokes onLoginSuccess on valid credentials", async () => {
    const handleSuccess = vi.fn();
    render(<LoginForm onLoginSuccess={handleSuccess} />);
    await userEvent.type(screen.getByLabelText(/username/i), "user");
    await userEvent.type(screen.getByLabelText(/password/i), "password");
    await userEvent.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => expect(handleSuccess).toHaveBeenCalledWith("user"));
  });
});

describe("LoginForm registration", () => {
  beforeEach(() => {
    sessionStorage.clear();
    mockLoginFetch();
  });

  it("creates an account and signs in", async () => {
    const handleSuccess = vi.fn();
    render(<LoginForm onLoginSuccess={handleSuccess} />);
    await userEvent.click(screen.getByRole("button", { name: /create an account/i }));
    expect(screen.queryByText(/demo credentials/i)).not.toBeInTheDocument();

    await userEvent.type(screen.getByLabelText(/username/i), "newbie");
    await userEvent.type(screen.getByLabelText(/password/i), "secret123");
    await userEvent.click(screen.getByRole("button", { name: /^create account$/i }));

    await waitFor(() => expect(handleSuccess).toHaveBeenCalledWith("newbie"));
  });

  it("shows why registration failed and can switch back to sign in", async () => {
    render(<LoginForm onLoginSuccess={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: /create an account/i }));
    await userEvent.type(screen.getByLabelText(/username/i), "user");
    await userEvent.type(screen.getByLabelText(/password/i), "secret123");
    await userEvent.click(screen.getByRole("button", { name: /^create account$/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Username is already taken");

    await userEvent.click(screen.getByRole("button", { name: /^sign in$/i }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByText(/demo credentials/i)).toBeInTheDocument();
  });
});

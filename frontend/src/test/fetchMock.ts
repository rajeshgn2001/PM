import { vi } from "vitest";

// Fakes the backend login endpoint: only user/password succeeds.
export const mockLoginFetch = () =>
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url === "/api/auth/login") {
        const { username, password } = JSON.parse(String(init?.body));
        if (username === "user" && password === "password") {
          return Response.json({ authenticated: true, username: "user", token: "kanban-session-user" });
        }
        return Response.json({ detail: "Invalid username or password" }, { status: 401 });
      }
      return Response.json({});
    })
  );

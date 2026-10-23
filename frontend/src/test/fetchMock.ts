import { vi } from "vitest";

// Fakes the backend auth endpoints: only user/password signs in, and "user" is already taken.
export const mockLoginFetch = () =>
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url === "/api/auth/login") {
        const { username, password } = JSON.parse(String(init?.body));
        if (username === "user" && password === "password") {
          return Response.json({ username: "user", token: "token-user" });
        }
        return Response.json({ detail: "Invalid username or password" }, { status: 401 });
      }
      if (url === "/api/auth/register") {
        const { username, password } = JSON.parse(String(init?.body));
        if (username === "user") {
          return Response.json({ detail: "Username is already taken" }, { status: 409 });
        }
        if (password.length < 6) {
          return Response.json({ detail: [{ msg: "too short" }] }, { status: 422 });
        }
        return Response.json({ username, token: `token-${username}` }, { status: 201 });
      }
      return new Response(null, { status: 204 });
    })
  );

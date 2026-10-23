import { beforeEach, describe, expect, it, vi } from "vitest";
import { getStoredAuth, loginUser, logoutUser, registerUser } from "./auth";
import { mockLoginFetch } from "@/test/fetchMock";

describe("auth module", () => {
  beforeEach(() => {
    sessionStorage.clear();
    mockLoginFetch();
  });

  it("returns unauthenticated when sessionStorage is empty", () => {
    expect(getStoredAuth()).toEqual({ isAuthenticated: false, username: null, token: null });
  });

  it("fails login with incorrect credentials", async () => {
    const result = await loginUser("user", "wrongpassword");
    expect(result).toEqual({ success: false, error: "Invalid username or password" });
    expect(getStoredAuth().isAuthenticated).toBe(false);
  });

  it("stores the session token after a successful login", async () => {
    expect(await loginUser(" user ", "password")).toEqual({ success: true });
    expect(getStoredAuth()).toEqual({ isAuthenticated: true, username: "user", token: "token-user" });
  });

  it("registers a new account and signs in", async () => {
    expect(await registerUser("newbie", "secret123")).toEqual({ success: true });
    expect(getStoredAuth().token).toBe("token-newbie");
  });

  it("shows the server reason when a username is taken", async () => {
    expect(await registerUser("user", "secret123")).toEqual({
      success: false,
      error: "Username is already taken",
    });
  });

  it("explains the rules when registration input is invalid", async () => {
    const result = await registerUser("newbie", "abc");
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/at least 6 characters/);
  });

  it("reports when the server is unreachable", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("offline"))));
    const result = await loginUser("user", "password");
    expect(result).toEqual({ success: false, error: "Unable to reach the server" });
    expect(getStoredAuth().isAuthenticated).toBe(false);
  });

  it("revokes the session on the server and clears it locally on logout", async () => {
    await loginUser("user", "password");
    await logoutUser();
    expect(getStoredAuth().isAuthenticated).toBe(false);
    expect(fetch).toHaveBeenLastCalledWith("/api/auth/logout", {
      method: "POST",
      headers: { Authorization: "Bearer token-user" },
    });
  });

  it("still signs out locally when the server is unreachable", async () => {
    await loginUser("user", "password");
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("offline"))));
    await logoutUser();
    expect(getStoredAuth().isAuthenticated).toBe(false);
  });
});

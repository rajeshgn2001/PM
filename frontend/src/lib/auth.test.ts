import { beforeEach, describe, expect, it, vi } from "vitest";
import { getStoredAuth, loginUser, logoutUser } from "./auth";
import { mockLoginFetch } from "@/test/fetchMock";

describe("auth module", () => {
  beforeEach(() => {
    sessionStorage.clear();
    mockLoginFetch();
  });

  it("returns unauthenticated when sessionStorage is empty", () => {
    const auth = getStoredAuth();
    expect(auth.isAuthenticated).toBe(false);
    expect(auth.username).toBeNull();
  });

  it("fails login with incorrect credentials", async () => {
    const result = await loginUser("user", "wrongpassword");
    expect(result.success).toBe(false);
    expect(result.error).toBe("Invalid username or password");
    expect(getStoredAuth().isAuthenticated).toBe(false);
  });

  it("succeeds login with correct credentials and persists to storage", async () => {
    const result = await loginUser("user", "password");
    expect(result.success).toBe(true);
    const auth = getStoredAuth();
    expect(auth.isAuthenticated).toBe(true);
    expect(auth.username).toBe("user");
  });

  it("reports when the server is unreachable", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("offline"))));
    const result = await loginUser("user", "password");
    expect(result).toEqual({ success: false, error: "Unable to reach the server" });
    expect(getStoredAuth().isAuthenticated).toBe(false);
  });

  it("clears credentials on logout", async () => {
    await loginUser("user", "password");
    expect(getStoredAuth().isAuthenticated).toBe(true);

    await logoutUser();
    expect(getStoredAuth().isAuthenticated).toBe(false);
  });
});

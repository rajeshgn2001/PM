import { beforeEach, describe, expect, it } from "vitest";
import { getStoredAuth, loginUser, logoutUser } from "./auth";

describe("auth module", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("returns unauthenticated when localStorage is empty", () => {
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

  it("clears credentials on logout", async () => {
    await loginUser("user", "password");
    expect(getStoredAuth().isAuthenticated).toBe(true);

    await logoutUser();
    expect(getStoredAuth().isAuthenticated).toBe(false);
  });
});

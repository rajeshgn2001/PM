export type AuthState = {
  isAuthenticated: boolean;
  username: string | null;
  token: string | null;
};

const TOKEN_KEY = "kanban_auth_token";
const USER_KEY = "kanban_auth_user";

export const getStoredAuth = (): AuthState => {
  if (typeof window === "undefined") {
    return { isAuthenticated: false, username: null, token: null };
  }
  const token = localStorage.getItem(TOKEN_KEY);
  const username = localStorage.getItem(USER_KEY);
  if (token && username) {
    return { isAuthenticated: true, username, token };
  }
  return { isAuthenticated: false, username: null, token: null };
};

export const loginUser = async (
  username: string,
  password: string
): Promise<{ success: boolean; error?: string }> => {
  // Hardcoded MVP check
  if (username.trim() === "user" && password === "password") {
    const token = "kanban-session-user";
    if (typeof window !== "undefined") {
      localStorage.setItem(TOKEN_KEY, token);
      localStorage.setItem(USER_KEY, "user");
    }
    // Try notifying backend if available
    try {
      await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
    } catch {
      // Allow offline or static client login
    }
    return { success: true };
  }

  return { success: false, error: "Invalid username or password" };
};

export const logoutUser = async (): Promise<void> => {
  if (typeof window !== "undefined") {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  }
  try {
    await fetch("/api/auth/logout", { method: "POST" });
  } catch {
    // Graceful fallback
  }
};

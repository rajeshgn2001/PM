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
  const token = sessionStorage.getItem(TOKEN_KEY);
  const username = sessionStorage.getItem(USER_KEY);
  if (token && username) {
    return { isAuthenticated: true, username, token };
  }
  return { isAuthenticated: false, username: null, token: null };
};

export const loginUser = async (
  username: string,
  password: string
): Promise<{ success: boolean; error?: string }> => {
  let response: Response;
  try {
    response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: username.trim(), password }),
    });
  } catch {
    return { success: false, error: "Unable to reach the server" };
  }
  if (!response.ok) {
    return { success: false, error: "Invalid username or password" };
  }
  const data: { username: string; token: string } = await response.json();
  sessionStorage.setItem(TOKEN_KEY, data.token);
  sessionStorage.setItem(USER_KEY, data.username);
  return { success: true };
};

export const logoutUser = async (): Promise<void> => {
  if (typeof window !== "undefined") {
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(USER_KEY);
  }
  try {
    await fetch("/api/auth/logout", { method: "POST" });
  } catch {
    // Graceful fallback
  }
};

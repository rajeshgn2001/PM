export type AuthState = {
  isAuthenticated: boolean;
  username: string | null;
  token: string | null;
};

const TOKEN_KEY = "kanban_auth_token";
const USER_KEY = "kanban_auth_user";

// Fired when the server rejects the stored token, so the app can return to sign in.
export const AUTH_EXPIRED_EVENT = "kanban:auth-expired";

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

export const clearStoredAuth = () => {
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(USER_KEY);
};

type AuthResult = { success: boolean; error?: string };

const authenticate = async (
  path: string,
  username: string,
  password: string,
  fallbackError: string
): Promise<AuthResult> => {
  let response: Response;
  try {
    response = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: username.trim(), password }),
    });
  } catch {
    return { success: false, error: "Unable to reach the server" };
  }
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const detail = typeof body?.detail === "string" ? body.detail : fallbackError;
    return { success: false, error: detail };
  }
  const data: { username: string; token: string } = await response.json();
  sessionStorage.setItem(TOKEN_KEY, data.token);
  sessionStorage.setItem(USER_KEY, data.username);
  return { success: true };
};

export const loginUser = (username: string, password: string) =>
  authenticate("/api/auth/login", username, password, "Invalid username or password");

// Validation errors (422) have a list detail, so they fall back to the rules below.
export const registerUser = (username: string, password: string) =>
  authenticate(
    "/api/auth/register",
    username,
    password,
    "Use 3-32 letters, numbers, dots, dashes or underscores, and a password of at least 6 characters"
  );

export const logoutUser = async (): Promise<void> => {
  const { token } = getStoredAuth();
  clearStoredAuth();
  try {
    await fetch("/api/auth/logout", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {
    // Already signed out locally.
  }
};

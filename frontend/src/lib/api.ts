import type { BoardData } from "@/lib/kanban";
import { AUTH_EXPIRED_EVENT, clearStoredAuth, getStoredAuth } from "@/lib/auth";

export type ChatMessageItem = {
  role: "user" | "assistant";
  content: string;
  boardChanged?: boolean;
};

export type ChatApiResponse = {
  message: string;
  board_update: BoardData | null;
  board_changed: boolean;
  version: number;
};

export type Role = "owner" | "member";

export type BoardSummary = {
  id: number;
  title: string;
  role: Role;
  owner: string;
  created_at: string;
  updated_at: string;
  card_count: number;
  open_card_count: number;
};

export type Board = {
  id: number;
  title: string;
  role: Role;
  owner: string;
  version: number;
  data: BoardData;
};

export type Member = {
  username: string;
  role: Role;
};

// Carries the HTTP status so callers can react to specific failures, such as a 409 save conflict.
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
  }
}

export type UserProfile = {
  username: string;
  created_at: string;
  board_count: number;
};

const request = async <T>(path: string, method = "GET", body?: unknown): Promise<T> => {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${getStoredAuth().token}`,
  };
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  const response = await fetch(path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (response.status === 401) {
    clearStoredAuth();
    window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT));
  }
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new ApiError(typeof data?.detail === "string" ? data.detail : response.statusText, response.status);
  }
  return response.status === 204 ? (undefined as T) : response.json();
};

export const listBoards = () => request<BoardSummary[]>("/api/boards");

export const createBoard = (title: string) => request<Board>("/api/boards", "POST", { title });

export const fetchBoard = (boardId: number) => request<Board>(`/api/boards/${boardId}`);

export const saveBoard = (boardId: number, data: BoardData, version: number) =>
  request<{ version: number }>(`/api/boards/${boardId}`, "PUT", { version, data });

export const renameBoard = (boardId: number, title: string) =>
  request<Board>(`/api/boards/${boardId}`, "PATCH", { title });

export const deleteBoard = (boardId: number) =>
  request<void>(`/api/boards/${boardId}`, "DELETE");

export const listMembers = (boardId: number) => request<Member[]>(`/api/boards/${boardId}/members`);

export const addMember = (boardId: number, username: string) =>
  request<Member[]>(`/api/boards/${boardId}/members`, "POST", { username });

export const removeMember = (boardId: number, username: string) =>
  request<void>(`/api/boards/${boardId}/members/${encodeURIComponent(username)}`, "DELETE");

export const fetchProfile = () => request<UserProfile>("/api/auth/me");

export const changePassword = (currentPassword: string, newPassword: string) =>
  request<void>("/api/auth/password", "PUT", {
    current_password: currentPassword,
    new_password: newPassword,
  });

export const deleteAccount = (password: string) =>
  request<void>("/api/auth/me", "DELETE", { password });

export const sendChatMessage = (
  boardId: number,
  message: string,
  history: { role: string; content: string }[] = []
) => request<ChatApiResponse>(`/api/boards/${boardId}/ai/chat`, "POST", { message, history });

import { beforeEach, describe, expect, it, vi } from "vitest";
import { AUTH_EXPIRED_EVENT, getStoredAuth } from "@/lib/auth";
import {
  ApiError,
  addMember,
  changePassword,
  createBoard,
  deleteAccount,
  deleteBoard,
  fetchBoard,
  fetchProfile,
  listBoards,
  listMembers,
  removeMember,
  renameBoard,
  saveBoard,
  sendChatMessage,
} from "@/lib/api";

const respond = (body: unknown, status = 200) =>
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      status === 204 ? new Response(null, { status }) : Response.json(body, { status })
    )
  );

const lastCall = () => {
  const [url, init] = vi.mocked(fetch).mock.lastCall!;
  return { url, ...init, body: init?.body ? JSON.parse(String(init.body)) : undefined };
};

const board = { columns: [{ id: "col-a", title: "A", cardIds: [] }], cards: {} };

describe("api client", () => {
  beforeEach(() => {
    sessionStorage.clear();
    sessionStorage.setItem("kanban_auth_token", "abc");
    sessionStorage.setItem("kanban_auth_user", "user");
  });

  it("sends the session token with every request", async () => {
    respond([]);
    expect(await listBoards()).toEqual([]);
    expect(lastCall()).toMatchObject({
      url: "/api/boards",
      method: "GET",
      headers: { Authorization: "Bearer abc" },
    });
  });

  it.each([
    ["createBoard", () => createBoard("Plan"), "/api/boards", "POST", { title: "Plan" }],
    ["fetchBoard", () => fetchBoard(3), "/api/boards/3", "GET", undefined],
    ["saveBoard", () => saveBoard(3, board, 7), "/api/boards/3", "PUT", { version: 7, data: board }],
    ["listMembers", () => listMembers(3), "/api/boards/3/members", "GET", undefined],
    ["addMember", () => addMember(3, "bob"), "/api/boards/3/members", "POST", { username: "bob" }],
    ["renameBoard", () => renameBoard(3, "New"), "/api/boards/3", "PATCH", { title: "New" }],
    ["fetchProfile", () => fetchProfile(), "/api/auth/me", "GET", undefined],
    [
      "changePassword",
      () => changePassword("old", "newpass"),
      "/api/auth/password",
      "PUT",
      { current_password: "old", new_password: "newpass" },
    ],
    [
      "sendChatMessage",
      () => sendChatMessage(3, "Hi", [{ role: "user", content: "Earlier" }]),
      "/api/boards/3/ai/chat",
      "POST",
      { message: "Hi", history: [{ role: "user", content: "Earlier" }] },
    ],
  ])("%s calls the right endpoint", async (_name, call, url, method, body) => {
    respond({});
    await call();
    expect(lastCall()).toMatchObject({ url, method, body });
  });

  it("handles empty 204 responses", async () => {
    respond(null, 204);
    await expect(deleteBoard(3)).resolves.toBeUndefined();
    expect(lastCall()).toMatchObject({ url: "/api/boards/3", method: "DELETE" });
    await expect(removeMember(3, "a b")).resolves.toBeUndefined();
    expect(lastCall()).toMatchObject({ url: "/api/boards/3/members/a%20b", method: "DELETE" });
    await expect(deleteAccount("pw")).resolves.toBeUndefined();
    expect(lastCall()).toMatchObject({ url: "/api/auth/me", method: "DELETE", body: { password: "pw" } });
  });

  it("throws the server detail on errors", async () => {
    respond({ detail: "Board not found" }, 404);
    const error = await fetchBoard(9).catch((e) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ message: "Board not found", status: 404 });
  });

  it("clears the session and announces expiry on 401", async () => {
    const onExpired = vi.fn();
    window.addEventListener(AUTH_EXPIRED_EVENT, onExpired);
    respond({ detail: "Session expired, please sign in again" }, 401);

    await expect(listBoards()).rejects.toThrow("Session expired");
    expect(onExpired).toHaveBeenCalledTimes(1);
    expect(getStoredAuth().isAuthenticated).toBe(false);
    window.removeEventListener(AUTH_EXPIRED_EVENT, onExpired);
  });
});

# Backend Overview

Python 3.12 FastAPI app in `backend/`, packaged by the root `Dockerfile` and run with Uvicorn on port 8000.

## Files

- `main.py`: routes, auth and access dependencies (`current_user`, `accessible_board` for owner or member, `owned_board` for owner-only), `check_assignees`, `save_or_conflict` (409 on a stale version), AI system prompt, and the static mount of the Next.js export at `/` (mounted last, after `/api/*`).
- `models.py`: Pydantic models. `BoardData` validates integrity (at least one column, unique column IDs, every card in exactly one column, keys match card IDs). `Card` has optional `priority`, `dueDate`, `assignee`, `labels` (max 10, 30 chars each) and `checklist`. `BoardSave` is the versioned PUT body. `Credentials` validates registration input.
- `database.py`: raw `sqlite3` via the `connect()` context manager (foreign keys on, commit on success). Users (scrypt password hashes), sessions (random tokens), boards (with a `version` for conflict detection), and board members. `save_board_data` only writes if the version matches. `remove_member` / `delete_user` unassign that user's cards. `init_db()` creates missing tables, rehashes legacy plaintext passwords, and seeds the `user` account and default board. Access (owner or member) is checked by `get_board` / `list_boards`. DB path from `DB_PATH` (Docker: `/data/kanban.db` on the `kanban-data` volume), else `backend/kanban.db`.
- `ai.py`: calls Claude via the Claude Code CLI (`claude -p`, no tools, JSON schema output) with the user's subscription token `CLAUDE_CODE_OAUTH_TOKEN`. 120s timeout; the subprocess is killed on timeout or cancellation.
- `tests/`: pytest. `conftest.py` gives each test its own temp DB and provides `client`, `auth` (demo user headers), `demo_board_id`, and `register()` / `sign_in()` helpers. `test_main.py` covers auth and accounts, `test_board.py` boards, validation, versioning and isolation, `test_sharing.py` members, permissions, unassignment and concurrent edits, `test_ai*.py` the AI (subprocess tests run a Python stand-in for the CLI), `test_integration.py` a multi-user end-to-end workflow. `test_live_claude_completion` calls the real CLI when installed.

## Endpoints

All except health, login and register need `Authorization: Bearer <token>` (401 otherwise). Board routes return 404 for boards the caller cannot access, and 403 when a member tries an owner-only action.

- `GET /api/health`
- `POST /api/auth/register` (201, 409 if taken, 422 if invalid), `POST /api/auth/login`, `POST /api/auth/logout` (204)
- `GET /api/auth/me`, `PUT /api/auth/password` (revokes other sessions), `DELETE /api/auth/me` (password required; cascades)
- `GET /api/boards` (owned and shared, with `role` and `owner`), `POST /api/boards`, `GET /api/boards/{id}` (includes `version`), `PUT /api/boards/{id}` (`{version, data}`; returns the new version; 409 if stale, 422 if invalid or an assignee is not a member), `PATCH /api/boards/{id}` (title, owner), `DELETE /api/boards/{id}` (owner)
- `GET /api/boards/{id}/members`, `POST /api/boards/{id}/members` (owner; 404 unknown user, 409 already has access), `DELETE /api/boards/{id}/members/{username}` (owner removes anyone, a member removes themselves)
- `POST /api/boards/{id}/ai/chat` (message + history; any member; saves and returns `board_update` and `version` when the AI changes the board; 409 if the board changed during the request; 500 with a readable `detail` on AI failure or invalid board)
- `POST /api/ai/test` (2+2 connectivity check)

## Dependencies

Managed with uv: `pyproject.toml` + `uv.lock`. Runtime deps only in the image (`uv sync --frozen --no-dev`); test tools (pytest, pytest-asyncio, pytest-cov, httpx) are in the `dev` dependency group.

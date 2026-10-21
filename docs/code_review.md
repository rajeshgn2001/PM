# Code Review

Date: 2026-10-21
Scope: whole repository (backend, frontend, Docker, scripts, tests, docs) at the current working tree, including the uncommitted switch to the Claude Code CLI.

## Status (2026-10-21)

All High and Medium findings (H1-H4, M1-M7) have been addressed; Low findings are open. Verification after the fixes: backend 18/18 (including 5 new integrity tests and the live Claude test), frontend unit 21/21, Playwright 8/8 against a throwaway container, lint clean. Also checked live: an inconsistent `PUT /api/board` returns 422, the board survives `stop.sh` / `start.sh`, and the board is locked while a real AI request runs.

| Finding | Resolution |
|---|---|
| H1 | `BoardData` integrity validator in `backend/models.py`; AI prompt states the column rules. |
| H2 | `KanbanBoard` renders a loading state or an error with Retry until the board loads; `initialData` removed. |
| H3 | `kanban-data` named volume with `DB_PATH=/data/kanban.db` in `docker-compose.yml`. |
| H4 | Inline edit (title and details) in `KanbanCard`, `handleUpdateCard` in `KanbanBoard`; unit and E2E tests. |
| M1 | The board section is `inert` while an AI request is in flight (`onBusyChange` from the sidebar). |
| M2 | 120s timeout in `ai.run_claude`; the subprocess is killed on timeout or cancellation. |
| M3 | Single error path: AI failures and invalid boards return 500 with a readable detail, shown in the sidebar; dead fallback branch removed; tests stub `ai.run_claude`. |
| M4 | `backend/tests/conftest.py` gives every test its own temp DB. |
| M5 | Login is checked only by the backend; client-side check and unused `/api/auth/me` removed. API token enforcement remains out of scope for the MVP. |
| M6 | `uv.lock` committed, `uv sync --frozen --no-dev`, test tools in the `dev` group, uv image and Claude Code version pinned; `.dockerignore` excludes `.env`, `.venv`, `*.db`. |
| M7 | `backend/AGENTS.md`, `frontend/AGENTS.md`, `docs/PLAN.md`, `docs/DATABASE.md`, `CLAUDE.md` updated. |

## Summary

The MVP works end to end: all automated suites pass (backend 13, frontend unit 17, Playwright 7) and the AI chat was verified live through the UI. The code is small and readable. The main risks are data integrity and data loss: the board accepts structurally invalid data that crashes the UI, the client can overwrite the stored board with demo data, the board is wiped on every restart, and one business requirement (editing cards) is not implemented.

| Severity | Count |
|---|---|
| High | 4 |
| Medium | 7 |
| Low | 9 |

Findings marked "Verified" were reproduced during this review; the rest are from reading the code.

## High

### H1. Board data is not validated for integrity (Verified)
- Where: `backend/models.py` (`BoardData`), `backend/main.py:71` (`PUT /api/board`), `backend/main.py:132` (AI updates), `frontend/src/components/KanbanBoard.tsx:244`
- Problem: `BoardData` checks only the shape. A column can reference a card ID that does not exist, a card can appear in two columns, and columns can be added, removed or re-IDed even though the requirements say columns are fixed. `PUT /api/board` with a dangling card ID returned 200. The frontend then maps that ID to `undefined` and `KanbanCard` crashes on `card.id`, taking the whole board down. Because the AI returns the complete board, a single model mistake can persist a broken board.
- Action: Add a Pydantic `model_validator` on `BoardData` that rejects: card IDs not in `cards`, cards in more than one column (or in none), and a column ID set that differs from the fixed five. Bad PUTs then return 422, and AI replies are rejected before saving.

### H2. Demo data can overwrite the stored board
- Where: `frontend/src/components/KanbanBoard.tsx:26` and `:32-46`
- Problem: The board state starts as the hardcoded `initialData`, which is rendered until `GET /api/board` resolves. If the fetch fails, the error is swallowed and the demo data stays on screen. Any edit made before the fetch resolves, or after it fails, saves a board derived from the demo data over the real one.
- Action: Start with `board = null`, show a loading state, and show an error with a retry if the fetch fails. Do not render or save the board until it has loaded. Then delete `initialData` from `frontend/src/lib/kanban.ts`; it duplicates the backend seed.

### H3. The board is lost on every restart (Verified)
- Where: `docker-compose.yml`, `backend/database.py:6`
- Problem: The database file lives inside the container. `scripts/stop.sh` runs `docker compose down`, which removes the container, so every stop/start returns the board to the seed data. This was observed repeatedly during this session.
- Action: Mount a named volume (for example `kanban-data:/data`) and set `DB_PATH=/data/kanban.db` in `docker-compose.yml`.

### H4. Cards cannot be edited (business requirement missing) (Verified)
- Where: `frontend/src/components/KanbanCard.tsx`, `frontend/src/components/KanbanBoard.tsx`
- Problem: AGENTS.md requires that cards "can be moved with drag and drop, and edited". The UI supports add, delete and move only. No edit control exists; only the AI can change a card's title or details.
- Action: Add an inline edit mode to `KanbanCard` (title and details, save and cancel) and a `handleUpdateCard` in `KanbanBoard` that goes through `queueSave`. Add unit and E2E tests for it.

## Medium

### M1. AI replies overwrite edits made while the AI is thinking
- Where: `backend/main.py:88` (board read at request start), `backend/main.py:133` (full board saved), `frontend/src/components/KanbanBoard.tsx:265`
- Problem: AI requests take 4-10 seconds. The backend snapshots the board when the request starts and saves the AI's complete board when it ends, and the frontend replaces its state with that board. Any drag, rename or add made in between is silently lost.
- Action: The simplest fix is to block board edits while an AI request is in flight (pass `isLoading` up from the sidebar and disable drag and the forms). The alternative, merging changes, is more complex and not needed for the MVP.

### M2. No timeout on the AI subprocess
- Where: `backend/ai.py:15-22`
- Problem: `proc.communicate()` waits forever. A hung `claude` process leaves the request open and the sidebar on "Assistant is thinking..." indefinitely. If the client disconnects, the subprocess is not killed.
- Action: Wrap it in `asyncio.wait_for(..., timeout=120)` and on timeout call `proc.kill()` and raise a clear error.

### M3. The AI error path is inconsistent, and its test is misleading (Verified)
- Where: `backend/ai.py:55` (`ChatOutput.model_validate`), `backend/main.py:130-145`, `backend/tests/test_ai_chat.py:76`, `frontend/src/components/AIChatSidebar.tsx:77-85`
- Problem: `generate_structured_chat` now validates the board itself, so an invalid board from the model raises and becomes HTTP 500 (verified). The "keep the conversation, drop the bad update" branch in `main.py:131-145` can no longer be reached in practice. `test_ai_chat_malformed_update_fallback` still passes only because it mocks `generate_structured_chat`, above the layer where validation happens. On any error the sidebar shows a generic "Sorry..." message and discards the server's detail.
- Action: Choose one behavior. Recommended: keep a clear 500 for invalid output, delete the dead branch, and rewrite the test to mock `ai.run_claude` so it exercises the real validation. Have `sendChatMessage` surface `detail` so users see "timed out" or "invalid response" instead of a generic error.

### M4. Test database isolation works only by accident (Verified)
- Where: `backend/tests/test_board.py:6-8`, `backend/tests/test_ai_chat.py`, `backend/tests/test_main.py`
- Problem: Only `test_board.py` sets `DB_PATH`, as a module-level side effect during collection. The full suite works because collection happens before any test runs. Running `pytest tests/test_ai_chat.py` on its own created and wrote the real `backend/kanban.db` (verified in a throwaway container). Inside the running container, that would wipe the live board. The temp file is also never deleted.
- Action: Add `backend/tests/conftest.py` with an autouse fixture that calls `monkeypatch.setenv("DB_PATH", str(tmp_path / "test.db"))` and then `init_db()`. Remove the module-level temp file and the duplicated setup fixtures.

### M5. Authentication is duplicated and only enforced in the client
- Where: `frontend/src/lib/auth.ts:27-43`, `backend/main.py:40-74`
- Problem: The frontend checks the credentials itself and ignores the backend login response. The token is never sent with requests, the board and AI endpoints do not check it, and `/api/auth/me` is unused. AGENTS.md accepts hardcoded credentials for the MVP, but the logic exists twice and the backend check is dead.
- Action: Keep it MVP-simple and do it once. Have `loginUser` call `POST /api/auth/login` and use its result, delete the client-side credential check, and delete `/api/auth/me` (or use it on page load). If the API should actually be protected, have `api.ts` send `Authorization: Bearer <token>` and add a FastAPI dependency on the board and AI routes that checks it.

### M6. Builds are not reproducible, and test dependencies ship in the image
- Where: `Dockerfile:13`, `Dockerfile:24`, `Dockerfile:30`, `backend/pyproject.toml`
- Problem: There is no `uv.lock`. Dependencies are lower-bound only and installed with `uv pip install --system -r pyproject.toml`. `ghcr.io/astral-sh/uv:latest` is unpinned, and the Claude Code installer always fetches the latest CLI. `pytest`, `pytest-asyncio` and `httpx` are runtime dependencies.
- Action: Commit a `uv.lock` and install with `uv sync --frozen --no-dev`. Move the test tools to `[dependency-groups] dev`. Pin the uv image tag. Pin the Claude Code version (the installer accepts a version argument).

### M7. Documentation is stale
- Where: `backend/AGENTS.md`, `frontend/AGENTS.md`, `docs/PLAN.md`, `docs/DATABASE.md`
- Problem:
  - `backend/AGENTS.md` describes only Part 2 (the health endpoint).
  - `frontend/AGENTS.md` says board state is in memory, and its file tree is missing the login, API and sidebar files.
  - `PLAN.md` refers to `backend/routers/board.py`, which does not exist. It also claims "automatic rollback on network failure" (the code only shows "Sync error", `KanbanBoard.tsx:65`) and an SPA fallback (only `StaticFiles(html=True)` is used).
  - `DATABASE.md` describes a hashed password and a "create only if the file is missing" check; neither matches the code.
- Action: Update these documents to match the code, or remove the claims.

## Low

### L1. Implicit user creation and a plaintext password
- `backend/database.py:156-165`: `save_board` silently creates a user, with password `"password"`, if the username is missing. This path is unused, because the user is always seeded. Remove it so a missing user is an error.
- `backend/database.py:115`: the column is named `password_hash` but stores plaintext, and it is never read (login is hardcoded in `main.py:42`). Either rename the column and document it as MVP-only, or hash the password and have login check it.

### L2. Obsolete instructions in the system prompt
- `backend/main.py:100-113`: rules 1 and 4 (respond with raw JSON, no backticks) are now enforced by `--json-schema`. Trim the prompt to the board context and the editing rules. Moving the prompt template into `ai.py` would keep `main.py` focused on routing.

### L3. Blocking database calls inside async endpoints
- `backend/main.py:63-74`, `:88`, `:133`: synchronous `sqlite3` calls run inside `async def` handlers and block the event loop. Declare these handlers with plain `def` so FastAPI runs them in a thread pool, or accept this at MVP scale.
- `backend/database.py`: connections are not closed if a query raises. Use `with closing(get_connection()) as conn, conn:`.

### L4. Side effects inside state updater functions
- `frontend/src/components/KanbanBoard.tsx:83-90`, `:94-103`, `:108-123`, `:127-144`: `queueSave` is called inside `setBoard(prev => ...)` updater functions. React may run these updaters twice (it does in development StrictMode), so they should have no side effects. Compute the new board from the current state, then call `setBoard(updated)` and `queueSave(updated)`.
- `frontend/src/components/KanbanColumn.tsx:44`: a column can be renamed to an empty string.

### L5. Repository hygiene
- `frontend/test-results/.last-run.json` is tracked; add `test-results/` to `frontend/.gitignore` and untrack the file.
- `backend/static/index.html` is a scaffolding placeholder that Docker overwrites. Delete it and ignore `backend/static/`.
- `backend/kanban.db` is in neither `.gitignore` nor `.dockerignore`. If it is ever created locally (for example by M4), it would be committed or baked into the image. Add it to both.

### L6. The TypeScript check fails
- `npx tsc --noEmit` reports errors in `frontend/src/lib/kanban.test.ts` (it uses `describe`, `it` and `expect` without imports or global types). Import them from `vitest`, or add `"types": ["vitest/globals"]` to `tsconfig.json`. Consider adding `tsc --noEmit` to the `lint` script.

### L7. The container runs as root
- `Dockerfile`: the app and the Claude CLI run as root. This is acceptable for local use. If needed, add a non-root user and install the CLI for that user.

### L8. Chat sidebar details
- `frontend/src/components/AIChatSidebar.tsx:58-61`: the history grows without limit and includes the client-side "Sorry..." error messages, which are then sent to the model as assistant turns. Exclude error messages and cap the history (for example, the last 20 turns).
- `:131`: messages use the array index as the React key; use an ID.

### L9. Internal error text is returned to the client
- `backend/main.py:83`, `:153`: `detail=str(e)` returns raw exception text, including CLI output. This is fine for local use; log the full error and return a short message if the app is ever exposed beyond localhost.

## What is good

- The architecture is clear and small: one container, one origin, a single JSON document per board, and a data model shared across the layers.
- AI output is constrained with a JSON schema and validated with Pydantic before saving.
- `moveCard` is a pure function with unit tests; the components are small and the styling follows the color scheme.
- Tests exist at every level (pytest, Vitest, Playwright), and the AI is mocked in unit tests.

## Recommended order of work

1. H1 (integrity validation), then H2 (loading state). Together they remove the crash and the overwrite risks.
2. H3 (persistent volume): a one-line change with large user impact.
3. M4 (test isolation): do this before more test work, because it protects the live database.
4. H4 (card editing): closes the missing requirement.
5. M1, M2, M3 (AI robustness: lock during requests, timeout, one consistent error path).
6. M5, M6, M7, then the Low items as cleanup.

## Verification performed during review

- Full suites passed before the review: backend 13/13 (in the container), frontend unit 17/17, Playwright 7/7, lint clean. A temporary, unmocked Playwright test exercised the live AI chat through the UI.
- H1: `PUT /api/board` with a dangling card ID returned 200 (TestClient in a throwaway container).
- M3: an invalid `board_update` from a stubbed `run_claude` returned 500 with a Pydantic error.
- M4: `pytest tests/test_ai_chat.py` alone created `/app/backend/kanban.db` in a throwaway container.
- H3: the board reset to seed data after each `stop.sh` / `start.sh` cycle in this session.
- H4: the frontend source contains no card edit handler or UI.

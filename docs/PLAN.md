# Project Plan: Kanban MVP with AI Chat

This document outlines the detailed step-by-step roadmap for building and delivering the Project Management MVP web application. Each part includes a substep checklist, testing strategy, and success criteria.

---

## Part 1: Plan

### Objective
Enrich the project plan with comprehensive details for all 10 stages, document the existing frontend codebase in `frontend/AGENTS.md`, and obtain user sign-off before implementation begins.

### Checklist
- [x] Create [frontend/AGENTS.md](file:///Users/rajesh/Vybe_Coding/PM/frontend/AGENTS.md) documenting the existing frontend architecture, components, data model, styling tokens, and testing setup.
- [x] Enrich [docs/PLAN.md](file:///Users/rajesh/Vybe_Coding/PM/docs/PLAN.md) with detailed substeps, checklists, testing strategies, and acceptance criteria for Parts 1 through 10.
- [x] Review plan with user and obtain formal approval to proceed to Part 2.

### Testing & Verification
- Verify [frontend/AGENTS.md](file:///Users/rajesh/Vybe_Coding/PM/frontend/AGENTS.md) accurately reflects the frontend directory.
- Verify [docs/PLAN.md](file:///Users/rajesh/Vybe_Coding/PM/docs/PLAN.md) contains actionable checklists for all 10 parts.
- Confirm existing frontend tests pass: `npm run test` inside `frontend/`.

### Success Criteria
- User reviews and explicitly approves the plan.

---

## Part 2: Scaffolding

### Objective
Establish the project runtime infrastructure: create the FastAPI backend in `backend/`, set up dependency management with `uv`, package the application in a Docker container, and provide start/stop scripts in `scripts/` for macOS, Linux, and Windows. Serve a sample "hello world" HTML page and API endpoint to verify connectivity.

### Checklist
- [x] Initialize Python backend configuration in `backend/pyproject.toml` with `fastapi`, `uvicorn`, and `pydantic`.
- [x] Create `backend/main.py` serving a basic HTML page at `/` and a health check endpoint at `/api/health`.
- [x] Create a `Dockerfile` using Python 3.12, installing `uv`, copying the backend code, and starting Uvicorn on port 8000.
- [x] Create `docker-compose.yml` for unified local container management.
- [x] Create shell scripts for macOS/Linux: `scripts/start.sh` and `scripts/stop.sh`.
- [x] Create batch and PowerShell scripts for Windows: `scripts/start.bat`, `scripts/stop.bat`, `scripts/start.ps1`, `scripts/stop.ps1`.
- [x] Update [backend/AGENTS.md](file:///Users/rajesh/Vybe_Coding/PM/backend/AGENTS.md) and [scripts/AGENTS.md](file:///Users/rajesh/Vybe_Coding/PM/scripts/AGENTS.md) with architecture documentation.

### Testing & Verification
- Execute `scripts/start.sh` (or `scripts/start.bat` on Windows).
- Perform HTTP request to `http://localhost:8000/` and assert HTTP 200 with HTML content.
- Perform HTTP request to `http://localhost:8000/api/health` and assert HTTP 200 with JSON response `{"status": "ok"}`.
- Execute `scripts/stop.sh` and assert container shuts down cleanly.

### Success Criteria
- The backend application builds and runs in Docker via start script and shuts down cleanly via stop script.
- Static HTML and API endpoint respond successfully.

---

## Part 3: Add in Frontend

### Objective
Build the Next.js frontend as a static export and serve it from the FastAPI backend at `/`, delivering the full demo Kanban board in the Docker environment.

### Checklist
- [x] Configure `output: "export"` and `images: { unoptimized: true }` in `frontend/next.config.ts`.
- [x] Update frontend build scripts to export static assets to `frontend/out`.
- [x] Update `Dockerfile` to use a multi-stage build: Stage 1 builds the Next.js static export using Node 20; Stage 2 packages Python, FastAPI, and copies static files into FastAPI mount directory.
- [x] Configure FastAPI in `backend/main.py` to mount and serve the static export at `/` (`StaticFiles(html=True)`; single page, no SPA fallback needed).
- [x] Add backend automated test ensuring static files (HTML, JS bundles, CSS) are served with HTTP 200.

### Testing & Verification
- Run `npm run build` in `frontend/` to confirm static export succeeds without errors.
- Run `npm run test` in `frontend/` to ensure frontend unit tests pass.
- Build and run the Docker container. Open `http://localhost:8000/` in browser and assert Kanban Studio title, 5 columns, and 8 initial cards render correctly.

### Success Criteria
- The complete Next.js Kanban UI is served directly by FastAPI at `http://localhost:8000/` inside Docker.

---

## Part 4: Add in a Fake User Sign In Experience

### Objective
Gate the Kanban board behind an authentication flow. Users must sign in with hardcoded credentials (`user` / `password`) to access the board, and can log out at any time.

### Checklist
- [x] Create `LoginForm.tsx` component adhering to project color scheme (`#032147`, `#209dd7`, `#753991`).
- [x] Add authentication state management in frontend (`frontend/src/lib/auth.ts`) handling login, logout, and credential validation against `user` / `password`.
- [x] Store session state in sessionStorage to persist login across page reloads (cleared when the tab or browser closes).
- [x] Add auth gate to `app/page.tsx`: unauthenticated users see `LoginForm`, authenticated users see `KanbanBoard`.
- [x] Add a clean user profile / logout button to the `KanbanBoard` header.
- [x] Create backend auth endpoints in FastAPI: `POST /api/auth/login`, `POST /api/auth/logout`. The frontend login calls the backend; the board and AI APIs are not token-protected (MVP).
- [x] Write unit tests for `LoginForm`, auth helper functions, and backend auth routes.

### Testing & Verification
- Unit test: submitting invalid credentials displays error message.
- Unit test: submitting `user` and `password` transitions to Kanban board.
- Unit test: clicking logout transitions back to login view.
- E2E test: visit `/` -> verify login prompt -> fill credentials -> verify board appears -> click logout -> verify login prompt returns.

### Success Criteria
- The Kanban board cannot be viewed without signing in.
- Hardcoded credentials (`user` / `password`) successfully authenticate the session.
- Logout cleanly resets state.

---

## Part 5: Database Modeling

### Objective
Design a SQLite database schema to store users and Kanban boards as JSON, document the schema and design rationale in `docs/DATABASE.md`, and obtain user sign-off.

### Checklist
- [x] Design the SQLite relational schema:
  - `users` table: `id` (INTEGER PRIMARY KEY), `username` (TEXT UNIQUE), `password_hash` (TEXT), `created_at` (DATETIME).
  - `boards` table: `id` (INTEGER PRIMARY KEY), `user_id` (INTEGER REFERENCES users), `title` (TEXT), `data` (TEXT JSON), `created_at` (DATETIME), `updated_at` (DATETIME).
- [x] Define the JSON structure for the `data` column matching `BoardData` (`columns` and `cards`).
- [x] Document database schema, indexes, initialization process, and future multi-user migration path in `docs/DATABASE.md`.
- [x] Present schema document to user for sign-off.

### Testing & Verification
- Review `docs/DATABASE.md` against requirements in [AGENTS.md](file:///Users/rajesh/Vybe_Coding/PM/AGENTS.md).
- Validate JSON schema compatibility with frontend types in `frontend/src/lib/kanban.ts`.

### Success Criteria
- User reviews and approves `docs/DATABASE.md`.

---

## Part 6: Backend API for Kanban

### Objective
Implement the SQLite database access layer and FastAPI endpoints to create, read, and update the Kanban board for a user. Automatically initialize the database and seed initial data if the file does not exist.

### Checklist
- [x] Implement database initialization in `backend/database.py` that creates `kanban.db` and required tables on startup if not present.
- [x] Seed default user (`user` / `password`) and initial Kanban data (5 columns, 8 cards) on first database creation.
- [x] Implement Pydantic models in `backend/models.py` for `Card`, `Column`, `BoardData`, and API payloads.
- [x] Implement API endpoints in `backend/main.py`:
  - `GET /api/board`: return the user's current board data.
  - `PUT /api/board`: validate and update the user's board data.
- [x] Implement backend unit test suite using `pytest` and `httpx.AsyncClient` covering database initialization, seed data, board retrieval, and board updates.

### Testing & Verification
- Run `pytest` backend tests.
- Test initialization edge case: delete `kanban.db`, run tests, verify database is auto-created and seeded properly.
- Verify `GET /api/board` returns HTTP 200 with 5 columns and 8 cards.
- Verify `PUT /api/board` persists modifications and returns updated data.

### Success Criteria
- Backend unit test suite passes with 100% success on board operations.
- SQLite database is created and seeded automatically on first run.

---

## Part 7: Frontend + Backend Integration

### Objective
Wire the frontend Kanban board to the backend REST API so that all board state (columns, cards, moves, edits, deletions) persists in the SQLite database across browser reloads.

### Checklist
- [x] Implement API client functions in `frontend/src/lib/api.ts` for `fetchBoard()` and `saveBoard(data)`.
- [x] Update `KanbanBoard.tsx` to load initial board data from `GET /api/board` on mount instead of using static `initialData`.
- [x] Update board mutation handlers (`handleDragEnd`, `handleRenameColumn`, `handleAddCard`, `handleDeleteCard`) to persist changes via `PUT /api/board`.
- [x] Implement optimistic UI updates; a failed save shows a "Sync error" status (no automatic rollback).
- [x] Display subtle loading and saving status indicators in the board header.
- [x] Update frontend unit tests to mock API client calls.
- [x] Update Playwright E2E tests to verify card creation and dragging persist after page reload.

### Testing & Verification
- Run `npm run test` in `frontend/`.
- Run Playwright E2E tests:
  1. Add a new card named "Persistence Test".
  2. Move it to the "Review" column.
  3. Reload the browser page (`page.reload()`).
  4. Assert "Persistence Test" remains in the "Review" column.

### Success Criteria
- Board modifications are permanently saved in SQLite and accurately restored on page reload.
- All frontend and integration tests pass.

---

## Part 8: AI Connectivity

### Objective
Integrate the AI client in the backend using the API key in `.env` and verify connectivity with a minimal "2+2" test prompt.

### Checklist
- [x] Pass `CLAUDE_CODE_OAUTH_TOKEN` from `.env` to the container (docker-compose `env_file`).
- [x] Implement AI service client in `backend/ai.py` calling the Claude Code CLI (`claude -p`) with the user's Claude subscription.
- [x] Create a diagnostic endpoint `POST /api/ai/test` that sends a simple prompt ("What is 2+2? Return only the number.") to the AI provider.
- [x] Create automated test `tests/test_ai_connectivity.py` validating client configuration and response parsing.
- [x] Verify live connectivity against the AI endpoint.

### Testing & Verification
- Run `pytest tests/test_ai_connectivity.py`.
- Call `POST /api/ai/test` and assert response contains "4" with HTTP 200.

### Success Criteria
- The backend successfully communicates with the AI API and receives a valid completion response.

---

## Part 9: AI with Kanban Context and Structured Outputs

### Objective
Extend the AI endpoint to accept user chat prompts, inject the current Kanban board JSON and conversation history into the system prompt, and return Structured Outputs containing both a conversational response and an optional board modification.

### Checklist
- [x] Define Structured Output schema using Pydantic:
  - `message`: string (conversational response to the user).
  - `board_update`: Optional `BoardData` (updated columns and cards, or null if no board change requested).
- [x] Craft system prompt instructing the model on its role as a Kanban project assistant, schema rules, column IDs, and preservation of unmodified cards.
- [x] Implement `POST /api/ai/chat` endpoint:
  1. Receive user query and conversation history.
  2. Fetch current board state from SQLite database.
  3. Invoke AI model with Structured Output schema.
  4. If `board_update` is provided, validate and commit changes to the database.
  5. Return conversational message and updated board status to client.
- [x] Add backend unit tests covering:
  - Informational queries (no board update triggered).
  - Card creation prompts ("Add a card to Backlog for Docker setup").
  - Card move prompts ("Move card-1 to Done").
  - Card edit prompts ("Update card-2 title to ...").
  - Invalid AI output handling with fallback to conversational message without board corruption.

### Testing & Verification
- Run `pytest tests/test_ai_chat.py`.
- Verify database state updates appropriately when the AI issues a `board_update`.

### Success Criteria
- The AI correctly parses intent, responds conversationally, and provides valid structured updates that mutate the database.

---

## Part 10: AI Chat Sidebar Widget in Frontend

### Objective
Add a responsive AI chat sidebar widget to the frontend that allows users to interact conversationally with the AI assistant. When the AI updates the board, the Kanban UI immediately refreshes to display the updated state.

### Checklist
- [x] Create `AIChatSidebar.tsx` matching the project design system:
  - Floating or docked toggle button in header/sidebar.
  - Chat message feed with distinct styles for user and AI messages.
  - Input field with submit button, loading spinner, and keyboard support (Enter to submit).
  - Visual badge when an AI action updates the board (e.g. "Board updated").
- [x] Wire sidebar to `POST /api/ai/chat`:
  - Send message and local conversation history.
  - On response, append AI message to feed.
  - If response includes an updated board, update frontend `board` state immediately so the columns and cards animate to the new layout.
- [x] Add unit tests for `AIChatSidebar.tsx` covering message submission, loading states, and error handling.
- [x] Add Playwright E2E test verifying:
  1. Open AI sidebar.
  2. Submit message: "Add a card to Backlog named AI Card".
  3. Assert AI response appears in chat.
  4. Assert new card "AI Card" immediately renders in the Backlog column without page reload.
- [x] Validate entire application inside Docker container using start and stop scripts.

### Testing & Verification
- Run `npm run test:all` (Vitest unit tests + Playwright E2E tests).
- Run full container check via `scripts/start.sh`, exercise UI in browser, and shut down via `scripts/stop.sh`.

### Success Criteria
- The AI chat sidebar is fully functional, visually aligned with project aesthetic standards, and dynamically updates the Kanban board in real time.
- All automated tests across frontend, backend, and E2E pass.
- Application operates cleanly inside the Docker container.
---

## Part 11: Multi-user, Multi-board Project Management

### Objective
Grow the MVP into a project management app: real accounts, any number of boards per user, flexible columns, richer cards, and search, with thorough unit, API integration and E2E tests.

### Checklist
- [x] Accounts: register, login with scrypt-hashed passwords, DB-backed session tokens, logout, profile, change password (revokes other sessions), delete account (cascades).
- [x] Every endpoint except health/login/register requires a Bearer token; boards are scoped to their owner (404 otherwise).
- [x] Migrate MVP databases: add `sessions`, rehash the plaintext seed password, keep existing boards.
- [x] Boards API: list, create, get, save, rename, delete. AI chat moved to `POST /api/boards/{id}/ai/chat`.
- [x] Columns can be added and deleted (validator: at least one column, unique IDs).
- [x] Cards gain optional priority and due date; overdue and high-priority counts in the board header.
- [x] Frontend: sign-up, workspace sidebar with board management, account dialog, search and priority filter, 401 handling.
- [x] Backend tests: auth, accounts, boards, isolation, validation, AI subprocess handling, multi-user workflow integration test; coverage via pytest-cov.
- [x] Frontend unit tests for every component and lib module; coverage via `npm run test:coverage`.
- [x] Playwright E2E for sign-up, isolation, board management, columns, priority/due date, search, password change, account deletion, session expiry, AI.

### Verification (2026-10-24)
- Backend: 49 passed (including live Claude), 99% coverage.
- Frontend unit: 74 passed, 96% statement coverage. Lint and build clean.
- Playwright: 13 passed against a throwaway container.
- Live: AI chat on a new user's board added a high-priority card with a due date and a new column; an MVP-era database signs in with `user` / `password` after migration and keeps its 8 cards.

---

## Part 12: Collaboration and Richer Cards

### Objective
Make boards collaborative and cards complete enough for real project work, without losing data when several people edit the same board.

### Checklist
- [x] `board_members` table; owner shares by username; members edit, leave; owner-only rename, delete, invite, remove (403 for members).
- [x] Optimistic concurrency: `boards.version`, versioned `PUT {version, data}`, 409 on stale writes; AI saves against the version it read.
- [x] Card assignee (validated against members), labels, checklist; removing a member or deleting an account unassigns their cards.
- [x] Card dialog for editing all fields; badges for labels, checklist progress and assignee.
- [x] Assignee filter (including "Assigned to me" and "Unassigned"); search covers labels.
- [x] Frontend chains saves, reloads with a notice on conflict, and polls shared boards every 10s while idle.
- [x] AI prompt includes members and the current user, so "assign to me" works.
- [x] Tests: `test_sharing.py`, versioning and new-field validation, AI conflict and assignee checks, extended integration workflow; `CardDialog` and `ShareDialog` unit tests; multi-browser Playwright tests for sharing, assignment, conflicts and leaving.

### Verification (2026-10-24)
- Backend: 72 passed (including live Claude), 99% coverage.
- Frontend unit: 100 passed, 97.7% statement coverage. Lint, typecheck and build clean.
- Playwright: 17 passed, twice, the second time on a fresh container.
- Live: the AI created an assigned card with labels and a checklist on a shared board, and resolved "me" to the signed-in user; an MVP-era database migrates (version column, members table) and saves.


## Part 13: Board Groups

### Objective
Organize boards into named groups, without changing or losing any existing data.

### Checklist
- [x] `board_groups` and `board_placements` tables, added by `init_db()`; existing tables unchanged.
- [x] Every user gets a `DEFAULT` group holding all boards not placed elsewhere.
- [x] Create and rename groups; drag a board between groups; collapse and expand groups.
- [x] Groups are personal, including for shared boards.
- [x] Each group shows up to 10 boards and scrolls on its own, and the page scrolls at the window edge during a pull to reach groups below it.

### Verification (2026-11-03)
- Backend: 83 passed, 99% coverage. Frontend unit: 106 passed. Playwright: 25 passed. Lint, typecheck and build clean.
- A copy of the live database migrated with every existing row unchanged, and a board was dragged between groups on it.

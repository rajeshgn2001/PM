# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Read `AGENTS.md` first: it holds the business requirements, technical decisions, color scheme, and coding standards (keep it simple, no over-engineering, no emojis, prove root cause before fixing). Planning and progress live in `docs/PLAN.md`; the DB schema is in `docs/DATABASE.md`. Subdirectories have their own `AGENTS.md` (`frontend/`, `backend/`, `scripts/`), some sections of which predate later parts of the plan.

## Commands

Full app (Docker, serves on http://localhost:8000, sign in as `user` / `password`):
- `./scripts/start.sh` / `./scripts/stop.sh` (wraps `docker compose up -d --build` / `docker compose down`; Windows equivalents are `.bat` and `.ps1`)

Backend (`backend/`, Python 3.12, uv):
- `pytest` (test deps are in the main dependency list; uv is used inside Docker and may not be installed on the host)
- Single test: `pytest tests/test_board.py::test_get_board_endpoint`
- Run locally: `uvicorn main:app --reload --port 8000`

Frontend (`frontend/`):
- `npm run test` (Vitest unit tests), single file: `npx vitest run src/components/KanbanBoard.test.tsx`, single test: add `-t "<name>"`
- `npm run test:e2e` (Playwright; expects the app already running at `http://127.0.0.1:8000`, override with `PLAYWRIGHT_BASE_URL`)
- `npm run lint`, `npm run build` (static export to `frontend/out`)

## Architecture

Single container, single origin. The Dockerfile builds the Next.js app as a static export (`output: "export"`) and copies `frontend/out` into `backend/static/`, which FastAPI mounts at `/` after all `/api/*` routes. The committed `backend/static/index.html` is only a scaffolding placeholder; the real UI exists only in the Docker image (or after manually building and copying `frontend/out`). The frontend calls relative `/api/...` URLs and there is no dev proxy, so `npm run dev` alone has no working backend.

Board data model is shared across layers and must stay in sync: `frontend/src/lib/kanban.ts` (TS types), `backend/models.py` (Pydantic `BoardData`), and the JSON stored in the `boards.data` column. Shape: `columns` is an ordered list of `{id, title, cardIds}`, `cards` is a map of id -> `{id, title, details}`. Column order and card order come from `columns[].cardIds`.

Persistence: `backend/database.py` uses raw `sqlite3`. `init_db()` runs in the FastAPI lifespan, creates tables, and seeds the `user` account plus the default 5-column/8-card board. DB path is `backend/kanban.db` unless `DB_PATH` is set (tests set it to a temp file before importing `main`). The frontend saves the whole board via `PUT /api/board` on every mutation with optimistic update and rollback; there is no per-card API.

Auth is MVP-only: credentials are hardcoded in both `main.py` and `frontend/src/lib/auth.ts`, the token is a fixed string stored in localStorage, and board endpoints do not check it (they always use username `user`).

AI: `POST /api/ai/chat` in `main.py` builds a system prompt containing the current board JSON and asks the model for `{message, board_update}`. If `board_update` is present it is validated against `BoardData` and saved; invalid updates are dropped without touching the DB. The frontend replaces its board state with the returned `board_update`. `backend/ai.py` shells out to the Claude Code CLI (`claude -p --output-format json --tools "" --json-schema ...`), which the Dockerfile installs; it authenticates with the user's Claude subscription via `CLAUDE_CODE_OAUTH_TOKEN` in `.env` (an `ANTHROPIC_API_KEY` in the environment would take precedence, so keep it out). Chat history is flattened into the prompt text, and the reply's `structured_output` is validated against `ChatOutput`. Backend AI tests monkeypatch `main.generate_structured_chat` / `main.generate_simple_completion`; the live connectivity test is skipped when the `claude` CLI is not installed.

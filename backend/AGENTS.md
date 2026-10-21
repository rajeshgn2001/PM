# Backend Overview

Python 3.12 FastAPI app in `backend/`, packaged by the root `Dockerfile` and run with Uvicorn on port 8000.

## Files

- `main.py`: routes, AI system prompt, and the static mount of the Next.js export at `/` (mounted last, after `/api/*`).
- `models.py`: Pydantic models. `BoardData` validates integrity (fixed five column IDs in order, every card in exactly one column, keys match card IDs).
- `database.py`: raw `sqlite3`. `init_db()` creates tables and seeds the `user` account and default board. DB path from `DB_PATH` (Docker: `/data/kanban.db` on the `kanban-data` volume), else `backend/kanban.db`.
- `ai.py`: calls Claude via the Claude Code CLI (`claude -p`, no tools, JSON schema output) with the user's subscription token `CLAUDE_CODE_OAUTH_TOKEN`. 120s timeout; the subprocess is killed on timeout or cancellation.
- `tests/`: pytest. `conftest.py` gives each test its own temp DB. AI tests stub `ai.run_claude`; `test_live_claude_completion` calls the real CLI when installed.

## Endpoints

- `GET /api/health`
- `POST /api/auth/login` (hardcoded `user` / `password`), `POST /api/auth/logout`
- `GET /api/board`, `PUT /api/board` (whole board; 422 if invalid)
- `POST /api/ai/chat` (message + history; saves and returns `board_update` when the AI changes the board; 500 with a readable `detail` on AI failure or invalid board)
- `POST /api/ai/test` (2+2 connectivity check)

## Dependencies

Managed with uv: `pyproject.toml` + `uv.lock`. Runtime deps only in the image (`uv sync --frozen --no-dev`); test tools are in the `dev` dependency group.

# Project Management MVP

A containerized Kanban web application with real-time AI assistance powered by Claude.

## Requirements

- Docker and Docker Compose

## Quick Start

### macOS / Linux
```bash
./scripts/start.sh
```

To stop:
```bash
./scripts/stop.sh
```

### Windows
Command Prompt:
```cmd
scripts\start.bat
scripts\stop.bat
```

PowerShell:
```powershell
.\scripts\start.ps1
.\scripts\stop.ps1
```

Once running, access the web app at: http://localhost:8000

## AI Setup

Run `claude setup-token` and add the token to `.env` in the project root:
```
CLAUDE_CODE_OAUTH_TOKEN=<token>
```

## Sign In Credentials

- Username: `user`
- Password: `password`

## Architecture

- Frontend: Next.js static export
- Backend: Python FastAPI runtime using `uv`
- Database: SQLite (`kanban.db`)
- AI: Claude via the Claude Code CLI (`claude -p`) using a Claude subscription, with JSON-schema structured output
- Container: Multi-stage Docker build exposing port 8000

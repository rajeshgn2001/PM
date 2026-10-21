# Backend Overview

This document describes the Python backend application in `backend/`.

## Architecture & Technology Stack

- **Language**: Python 3.12+
- **Framework**: FastAPI
- **ASGI Server**: Uvicorn
- **Package Manager**: `uv`
- **Configuration**: `pyproject.toml`
- **Data Validation**: Pydantic v2

## Directory Structure

```
backend/
├── main.py          # FastAPI application entrypoint, route handlers, and static files mount
├── pyproject.toml   # Project metadata and dependencies for uv
├── static/          # Static files served at /
│   └── index.html   # Initial HTML scaffolding demonstration
└── AGENTS.md        # Architecture and developer documentation
```

## Endpoints

- `GET /`: Serves the static site (`index.html`) mounted from `backend/static/`.
- `GET /api/health`: Health check endpoint returning `{"status": "ok", "message": "Backend healthy"}`.

## Containerization

The backend is packaged into a Docker container defined by the root `Dockerfile` using Python 3.12-slim and Astral `uv`. Dependencies are installed in the container using `uv pip install --system -r pyproject.toml`.
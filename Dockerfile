# Stage 1: Build Next.js static export
FROM node:20-slim AS frontend-builder
WORKDIR /app/frontend

COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

COPY frontend/ ./
RUN npm run build

# Stage 2: Backend runtime with Python and uv
FROM ghcr.io/astral-sh/uv:0.13.4 AS uv_bin
FROM python:3.12-slim

WORKDIR /app

# Copy uv from official uv image
COPY --from=uv_bin /uv /uvx /bin/

# Install Claude Code CLI (used by the backend for AI calls)
RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && curl -fsSL https://claude.ai/install.sh | bash -s 2.1.306
ENV PATH="/root/.local/bin:$PATH"

# Install locked backend dependencies (dev group excluded) into /app/backend/.venv
COPY backend/pyproject.toml backend/uv.lock /app/backend/
WORKDIR /app/backend
ENV UV_PYTHON_DOWNLOADS=never
RUN uv sync --frozen --no-dev
ENV PATH="/app/backend/.venv/bin:$PATH"

# Copy backend source code
COPY backend /app/backend

# Copy static frontend build into backend/static
COPY --from=frontend-builder /app/frontend/out /app/backend/static

ENV PYTHONPATH=/app/backend
EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]

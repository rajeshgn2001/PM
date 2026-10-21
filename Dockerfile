# Stage 1: Build Next.js static export
FROM node:20-slim AS frontend-builder
WORKDIR /app/frontend

COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

COPY frontend/ ./
RUN npm run build

# Stage 2: Backend runtime with Python and uv
FROM ghcr.io/astral-sh/uv:latest AS uv_bin
FROM python:3.12-slim

WORKDIR /app

# Copy uv from official uv image
COPY --from=uv_bin /uv /uvx /bin/

# Copy backend dependencies and install
COPY backend/pyproject.toml /app/backend/
WORKDIR /app/backend
RUN uv pip install --system -r pyproject.toml

# Copy backend source code
COPY backend /app/backend

# Copy static frontend build into backend/static
COPY --from=frontend-builder /app/frontend/out /app/backend/static

ENV PYTHONPATH=/app/backend
EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]

# Scripts Overview

This directory provides startup and shutdown scripts for macOS, Linux, and Windows to run the application in Docker.

## Available Scripts

### macOS & Linux
- `scripts/start.sh`: Builds and starts the container in the background using `docker compose up -d --build`.
- `scripts/stop.sh`: Stops and removes the running containers using `docker compose down`.

### Windows Command Prompt
- `scripts/start.bat`: Starts the container via `docker compose up -d --build`.
- `scripts/stop.bat`: Stops the container via `docker compose down`.

### Windows PowerShell
- `scripts/start.ps1`: Starts the container with PowerShell execution.
- `scripts/stop.ps1`: Stops the container with PowerShell execution.

## Verification

When started, the application is accessible locally at `http://localhost:8000`.
@echo off
setlocal

cd /d "%~dp0\.."

echo Building and starting container...
docker compose up -d --build

if %ERRORLEVEL% equ 0 (
    echo Application is running at: http://localhost:8000
) else (
    echo Failed to start container.
)

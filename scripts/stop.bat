@echo off
setlocal

cd /d "%~dp0\.."

echo Stopping container...
docker compose down

echo Container stopped.

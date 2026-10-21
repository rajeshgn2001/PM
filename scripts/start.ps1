$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $ScriptDir

Set-Location $ProjectRoot

Write-Host "Building and starting container..."
docker compose up -d --build

if ($LASTEXITCODE -eq 0) {
    Write-Host "Application is running at: http://localhost:8000"
} else {
    Write-Error "Failed to start container."
}

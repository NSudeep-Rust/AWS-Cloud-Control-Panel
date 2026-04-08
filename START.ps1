# AWS CloudShield — PowerShell Launcher
# Run with: powershell -ExecutionPolicy Bypass -File START.ps1

$Root    = Split-Path -Parent $MyInvocation.MyCommand.Path
$Python  = Join-Path $Root "venv\Scripts\python.exe"
$UiDir   = Join-Path $Root "app\ui"

Write-Host ""
Write-Host "  =================================================="  -ForegroundColor Cyan
Write-Host "    AWS CloudShield — Starting All Services"           -ForegroundColor Cyan
Write-Host "  =================================================="  -ForegroundColor Cyan
Write-Host ""

if (-not (Test-Path $Python)) {
    Write-Host "  [ERROR] venv not found. Run: python -m venv venv && pip install -r requirements.txt" -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

# Start backend
Write-Host "  [1/2] Starting Backend (FastAPI + SQLite on :8000)..." -ForegroundColor Yellow
Start-Process "cmd" -ArgumentList "/k", "cd /d `"$Root`" && `"$Python`" -m uvicorn app.api.main:app --host 127.0.0.1 --port 8000" -WindowStyle Normal

Start-Sleep -Seconds 3

# Start frontend
Write-Host "  [2/2] Starting Frontend (React/Vite on :5173)..." -ForegroundColor Yellow
Start-Process "cmd" -ArgumentList "/k", "cd /d `"$UiDir`" && npm run dev" -WindowStyle Normal

Start-Sleep -Seconds 4

Write-Host ""
Write-Host "  =================================================="  -ForegroundColor Green
Write-Host "    Services running!                              "    -ForegroundColor Green
Write-Host "    Backend  ->  http://localhost:8000             "    -ForegroundColor Green
Write-Host "    Frontend ->  http://localhost:5173             "    -ForegroundColor Green
Write-Host "  =================================================="  -ForegroundColor Green
Write-Host ""

# Open browser
Start-Process "http://localhost:5173"
Write-Host "  Browser opened. You can close this window — servers keep running." -ForegroundColor Cyan

@echo off
title AWS CloudShield — Startup
color 0A

echo.
echo  ====================================================
echo    AWS CloudShield — Starting All Services
echo  ====================================================
echo.

:: Change to project root (where this batch file lives)
cd /d "%~dp0"

:: Check virtual environment exists
if not exist "venv\Scripts\activate.bat" (
    echo  [ERROR] Virtual environment not found at .\venv\
    echo          Please run: python -m venv venv ^& pip install -r requirements.txt
    pause
    exit /b 1
)

echo  [1/2] Starting backend (FastAPI + SQLite)...
start "CloudShield Backend" cmd /k "cd /d "%~dp0" && venv\Scripts\python.exe -m uvicorn app.api.main:app --host 127.0.0.1 --port 8000"

:: Wait for backend to initialise
timeout /t 3 /nobreak >nul

echo  [2/2] Starting frontend (React + Vite)...
start "CloudShield Frontend" cmd /k "cd /d "%~dp0\app\ui" && npm run dev"

:: Wait for Vite to be ready
timeout /t 4 /nobreak >nul

echo.
echo  ====================================================
echo    Both services started!
echo    Backend  →  http://localhost:8000
echo    Frontend →  http://localhost:5173
echo  ====================================================
echo.
echo  Opening the app in your default browser...
start "" "http://localhost:5173"

echo.
echo  Press any key to exit this window (servers keep running in their own windows).
pause >nul

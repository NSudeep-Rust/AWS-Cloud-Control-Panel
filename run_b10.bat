@echo off
setlocal EnableDelayedExpansion
title CloudShield — Full Build v1.0.0

set LOG=p:\CloudSecurityPanel\build10.log
set ROOT=p:\CloudSecurityPanel
set VENV=%ROOT%\venv\Scripts
set ISCC="C:\Program Files (x86)\Inno Setup 6\ISCC.exe"

:: Clear previous log
echo. > %LOG%
echo ============================================================ >> %LOG%
echo  CloudShield Full Build  —  %date% %time%                   >> %LOG%
echo  Steps: React ^| Backend ^| Updater ^| Electron ^| Installer   >> %LOG%
echo ============================================================ >> %LOG%

echo.
echo  ╔══════════════════════════════════════════════════════╗
echo  ║       CloudShield  —  Full Build v1.0.0              ║
echo  ║  React · Backend · Updater · Electron · Installer    ║
echo  ╚══════════════════════════════════════════════════════╝
echo.

:: ──────────────────────────────────────────────────────────────────────────
:: STEP 1 — React UI
:: ──────────────────────────────────────────────────────────────────────────
echo  [1/5] Building React UI...
echo [STEP 1/5] React UI >> %LOG%
cd /d %ROOT%\app\ui
call npm run build >> %LOG% 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo  [FAIL] React build failed — check build10.log
    echo [FAIL] React build >> %LOG%
    goto :error
)
echo  [OK]   React UI built
echo [OK] React UI >> %LOG%
echo.

:: ──────────────────────────────────────────────────────────────────────────
:: STEP 2 — Python Backend (PyInstaller)
:: ──────────────────────────────────────────────────────────────────────────
echo  [2/5] Building Python backend (PyInstaller)...
echo [STEP 2/5] PyInstaller Backend >> %LOG%
cd /d %ROOT%
if exist dist\cloudshield-backend  rmdir /s /q dist\cloudshield-backend
%VENV%\pyinstaller.exe cloudshield.spec --noconfirm >> %LOG% 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo  [FAIL] PyInstaller backend failed — check build10.log
    echo [FAIL] PyInstaller backend >> %LOG%
    goto :error
)
:: Verify output
if not exist "%ROOT%\dist\cloudshield-backend\cloudshield-backend.exe" (
    echo  [FAIL] cloudshield-backend.exe not found after build
    echo [FAIL] cloudshield-backend.exe missing >> %LOG%
    goto :error
)
echo  [OK]   Backend EXE built
echo [OK] PyInstaller Backend >> %LOG%
echo.

:: ──────────────────────────────────────────────────────────────────────────
:: STEP 3 — Updater EXE (PyInstaller)
:: ──────────────────────────────────────────────────────────────────────────
echo  [3/5] Building CloudShield-Updater.exe...
echo [STEP 3/5] PyInstaller Updater >> %LOG%
cd /d %ROOT%\updater
:: Place output directly into project dist\ for Inno Setup to find it
%VENV%\pyinstaller.exe updater.spec --noconfirm --distpath "%ROOT%\dist" >> %LOG% 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo  [FAIL] PyInstaller updater failed — check build10.log
    echo [FAIL] PyInstaller updater >> %LOG%
    goto :error
)
if not exist "%ROOT%\dist\CloudShield-Updater.exe" (
    echo  [FAIL] CloudShield-Updater.exe not found after build
    echo [FAIL] CloudShield-Updater.exe missing >> %LOG%
    goto :error
)
echo  [OK]   Updater EXE built
echo [OK] PyInstaller Updater >> %LOG%
echo.

:: ──────────────────────────────────────────────────────────────────────────
:: STEP 4 — Electron App (CloudShield.exe)
:: ──────────────────────────────────────────────────────────────────────────
echo  [4/5] Building Electron app (CloudShield.exe)...
echo [STEP 4/5] Electron Build >> %LOG%
cd /d %ROOT%\electron
call npm run build >> %LOG% 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo  [FAIL] Electron build failed — check build10.log
    echo [FAIL] Electron build >> %LOG%
    goto :error
)
if not exist "%ROOT%\electron\dist\win-unpacked\CloudShield.exe" (
    echo  [FAIL] CloudShield.exe not found after electron build
    echo [FAIL] CloudShield.exe missing >> %LOG%
    goto :error
)
echo  [OK]   Electron app built (CloudShield.exe)
echo [OK] Electron Build >> %LOG%
echo.

:: ──────────────────────────────────────────────────────────────────────────
:: STEP 5 — Inno Setup Installer
:: ──────────────────────────────────────────────────────────────────────────
echo  [5/5] Building installer (Inno Setup)...
echo [STEP 5/5] Inno Setup >> %LOG%
cd /d %ROOT%
if not exist dist\installer  mkdir dist\installer
%ISCC% "%ROOT%\installer\setup.iss" >> %LOG% 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo  [FAIL] Inno Setup failed — check build10.log
    echo [FAIL] Inno Setup >> %LOG%
    goto :error
)
:: Find the output installer
for %%F in ("%ROOT%\dist\installer\*.exe") do set INSTALLER=%%F
if not defined INSTALLER (
    echo  [FAIL] Installer EXE not found in dist\installer\
    echo [FAIL] Installer missing >> %LOG%
    goto :error
)
echo  [OK]   Installer: %INSTALLER%
echo [OK] Inno Setup — %INSTALLER% >> %LOG%
echo.

:: ──────────────────────────────────────────────────────────────────────────
:: STEP 6 — Create Update ZIP (for GitHub Releases / auto-updater)
:: ──────────────────────────────────────────────────────────────────────────
echo  [6/6] Creating update ZIP for GitHub Releases...
echo [STEP 6/6] Update ZIP >> %LOG%
cd /d %ROOT%
for /f "tokens=*" %%V in (VERSION) do set APP_VER=%%V
set ZIP_NAME=cloudshield-update-v%APP_VER%.zip
set ZIP_PATH=%ROOT%\dist\%ZIP_NAME%
if exist "%ZIP_PATH%" del /f /q "%ZIP_PATH%"

powershell -NoProfile -Command ^
  "Compress-Archive -Path '%ROOT%\electron\dist\win-unpacked\*','%ROOT%\dist\cloudshield-backend' -DestinationPath '%ZIP_PATH%' -Force; ^
   $sz = [math]::Round((Get-Item '%ZIP_PATH%').Length / 1MB, 1); ^
   Write-Host ('Update zip: ' + $sz + ' MB  ->  %ZIP_PATH%')" >> %LOG% 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo  [WARN]  Update ZIP creation failed - installer still ready
    echo [WARN] Update ZIP failed >> %LOG%
) else (
    echo  [OK]   Update ZIP: dist\%ZIP_NAME%
    echo [OK] Update ZIP >> %LOG%
)
echo.

:: ──────────────────────────────────────────────────────────────────────────
:: DONE
:: ──────────────────────────────────────────────────────────────────────────
echo ============================================================ >> %LOG%
echo  BUILD COMPLETE — %date% %time% >> %LOG%
echo ============================================================ >> %LOG%

echo  ╔══════════════════════════════════════════════════════╗
echo  ║   BUILD COMPLETE  ✓                                  ║
echo  ╚══════════════════════════════════════════════════════╝
echo.
echo  Artifacts:
echo   • CloudShield.exe      -^> electron\dist\win-unpacked\
echo   • cloudshield-backend  -^> dist\cloudshield-backend\
echo   • CloudShield-Updater  -^> dist\CloudShield-Updater.exe
echo   • Installer            -^> %INSTALLER%
echo   • Update ZIP           -^> dist\%ZIP_NAME%
echo.
echo  Upload to GitHub Release v%APP_VER%:
echo     1. %INSTALLER%
echo     2. %ZIP_PATH%
echo.
echo  Full log: build10.log
echo.
goto :done

:error
echo.
echo  ╔══════════════════════════════════════════════════════╗
echo  ║   BUILD FAILED — see build10.log for details         ║
echo  ╚══════════════════════════════════════════════════════╝
echo.
echo [BUILD FAILED] >> %LOG%
exit /b 1

:done
endlocal

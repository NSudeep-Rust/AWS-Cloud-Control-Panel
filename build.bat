@echo off
setlocal EnableDelayedExpansion
title CloudShield ? Build Pipeline

echo.
echo ========================================================
echo   CloudShield Build Pipeline
echo   Builds: Backend + Updater + Electron + Installer
echo ========================================================
echo.

set "ROOT=%~dp0"
set "VENV=%ROOT%venv\Scripts"
set "ELECTRON_DIR=%ROOT%electron"
set "DIST_DIR=%ROOT%dist"

:: ?? Check prerequisites ??????????????????????????????????????????????????????
echo [1/7] Checking prerequisites...

where pyinstaller >nul 2>&1
if errorlevel 1 (
    echo Installing PyInstaller...
    "%VENV%\pip.exe" install pyinstaller --quiet
)

where node >nul 2>&1
if errorlevel 1 (
    echo ERROR: Node.js not found. Install from https://nodejs.org
    pause & exit /b 1
)

where npm >nul 2>&1
if errorlevel 1 (
    echo ERROR: npm not found.
    pause & exit /b 1
)

echo   Prerequisites: OK
echo.

:: ?? Step 2: Build React frontend ????????????????????????????????????????????
echo [2/7] Building React frontend...
cd "%ROOT%app\ui"
call npm install --silent 2>nul
call npm run build
if errorlevel 1 ( echo ERROR: React build failed & pause & exit /b 1 )
echo   React build: OK

:: ?? Step 3: Build PyInstaller backend ???????????????????????????????????????
echo [3/7] Building PyInstaller backend bundle...
cd "%ROOT%"
"%VENV%\pyinstaller.exe" cloudshield.spec --clean --noconfirm
if errorlevel 1 ( echo ERROR: PyInstaller backend failed & pause & exit /b 1 )
echo   Backend bundle: OK

:: ?? Step 4: Build Updater ????????????????????????????????????????????????????
echo [4/7] Building CloudShield-Updater.exe...
cd "%ROOT%updater"
"%VENV%\pyinstaller.exe" updater.spec --clean --noconfirm
if errorlevel 1 ( echo ERROR: Updater build failed & pause & exit /b 1 )
copy /Y "%ROOT%updater\dist\CloudShield-Updater.exe" "%ROOT%dist\CloudShield-Updater.exe"
echo   Updater: OK

:: ?? Step 5: Build Electron shell ????????????????????????????????????????????
echo [5/7] Building Electron shell...
cd "%ELECTRON_DIR%"
call npm install --silent 2>nul
call npx electron-builder --win --x64 --dir
if errorlevel 1 ( echo ERROR: Electron build failed & pause & exit /b 1 )
echo   Electron shell: OK

:: ?? Step 6: Create installer images folder check ????????????????????????????
echo [6/7] Checking installer assets...
if not exist "%ROOT%installer\images\icon.ico" (
    echo WARNING: installer\images\icon.ico missing!
    echo   Generate it from installer\images\banner.png using any ICO converter.
)
if not exist "%ROOT%installer\images\banner.bmp" (
    echo WARNING: installer\images\banner.bmp missing!
    echo   Convert installer\images\banner.png to BMP 164x314.
)
echo   Assets check done.

:: ?? Step 7: Run Inno Setup ???????????????????????????????????????????????????
echo [7/7] Building installer with Inno Setup...
cd "%ROOT%"
set "ISCC=C:\Program Files (x86)\Inno Setup 6\ISCC.exe"
if not exist "%ISCC%" set "ISCC=C:\Program Files\Inno Setup 6\ISCC.exe"
if not exist "%ISCC%" (
    echo ERROR: Inno Setup 6 not found. Download from https://jrsoftware.org/isinfo.php
    pause & exit /b 1
)
"%ISCC%" installer\setup.iss
if errorlevel 1 ( echo ERROR: Inno Setup failed & pause & exit /b 1 )

echo.
echo ========================================================
echo   BUILD COMPLETE!
echo   Installer: dist\installer\CloudShield-Setup-v1.0.0.exe
echo ========================================================
echo.
pause

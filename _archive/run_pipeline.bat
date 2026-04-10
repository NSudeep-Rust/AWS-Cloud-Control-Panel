@echo off
echo [BUILD] Step 1/4: React UI build...
cd /d p:\CloudSecurityPanel\app\ui
call npm run build >> p:\CloudSecurityPanel\build_pipeline.log 2>&1
echo [BUILD] React done >> p:\CloudSecurityPanel\build_pipeline.log

echo [BUILD] Step 2/4: PyInstaller backend...
cd /d p:\CloudSecurityPanel
del /s /q dist\cloudshield-backend 2>nul
p:\CloudSecurityPanel\venv\Scripts\pyinstaller.exe cloudshield.spec --noconfirm >> p:\CloudSecurityPanel\build_pipeline.log 2>&1
echo [BUILD] PyInstaller done >> p:\CloudSecurityPanel\build_pipeline.log

echo [BUILD] Step 3/4: Electron build...
cd /d p:\CloudSecurityPanel\electron
call npx electron-builder --win --x64 --dir >> p:\CloudSecurityPanel\build_pipeline.log 2>&1
echo [BUILD] Electron done >> p:\CloudSecurityPanel\build_pipeline.log

echo [BUILD] Step 4/4: Inno Setup installer...
cd /d p:\CloudSecurityPanel
if not exist dist\installer mkdir dist\installer
"C:\Program Files (x86)\Inno Setup 6\ISCC.exe" installer\setup.iss >> p:\CloudSecurityPanel\build_pipeline.log 2>&1
echo [BUILD] ISCC done >> p:\CloudSecurityPanel\build_pipeline.log

echo [BUILD] ALL DONE >> p:\CloudSecurityPanel\build_pipeline.log

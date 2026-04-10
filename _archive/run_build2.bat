@echo off
echo [1/3] React UI build...
cd /d p:\CloudSecurityPanel\app\ui
call npm run build >> p:\CloudSecurityPanel\build2.log 2>&1
echo [1/3] DONE >> p:\CloudSecurityPanel\build2.log

echo [2/3] PyInstaller...
cd /d p:\CloudSecurityPanel
del /s /q dist\cloudshield-backend 2>nul
p:\CloudSecurityPanel\venv\Scripts\pyinstaller.exe cloudshield.spec --noconfirm >> p:\CloudSecurityPanel\build2.log 2>&1
echo [2/3] DONE >> p:\CloudSecurityPanel\build2.log

echo [3/3] Inno Setup installer...
"C:\Program Files (x86)\Inno Setup 6\ISCC.exe" installer\setup.iss >> p:\CloudSecurityPanel\build2.log 2>&1
echo [3/3] DONE >> p:\CloudSecurityPanel\build2.log
echo ALL_COMPLETE >> p:\CloudSecurityPanel\build2.log

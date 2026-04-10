@echo off
echo [1/4] Electron >> p:\CloudSecurityPanel\build9.log
cd /d p:\CloudSecurityPanel\electron && call npm run build >> p:\CloudSecurityPanel\build9.log 2>&1
echo [1/4] DONE >> p:\CloudSecurityPanel\build9.log
echo [2/4] React >> p:\CloudSecurityPanel\build9.log
cd /d p:\CloudSecurityPanel\app\ui && call npm run build >> p:\CloudSecurityPanel\build9.log 2>&1
echo [2/4] DONE >> p:\CloudSecurityPanel\build9.log
echo [3/4] PyInstaller >> p:\CloudSecurityPanel\build9.log
cd /d p:\CloudSecurityPanel
del /s /q dist\cloudshield-backend 2>nul
p:\CloudSecurityPanel\venv\Scripts\pyinstaller.exe cloudshield.spec --noconfirm >> p:\CloudSecurityPanel\build9.log 2>&1
echo [3/4] DONE >> p:\CloudSecurityPanel\build9.log
echo [4/4] InnoSetup >> p:\CloudSecurityPanel\build9.log
"C:\Program Files (x86)\Inno Setup 6\ISCC.exe" p:\CloudSecurityPanel\installer\setup.iss >> p:\CloudSecurityPanel\build9.log 2>&1
echo [4/4] DONE >> p:\CloudSecurityPanel\build9.log
echo ALL_DONE >> p:\CloudSecurityPanel\build9.log

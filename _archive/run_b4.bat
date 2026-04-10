@echo off
echo [1/3] React >> p:\CloudSecurityPanel\build4.log
cd /d p:\CloudSecurityPanel\app\ui && call npm run build >> p:\CloudSecurityPanel\build4.log 2>&1
echo [1/3] DONE >> p:\CloudSecurityPanel\build4.log

echo [2/3] PyInstaller >> p:\CloudSecurityPanel\build4.log
cd /d p:\CloudSecurityPanel
del /s /q dist\cloudshield-backend 2>nul
p:\CloudSecurityPanel\venv\Scripts\pyinstaller.exe cloudshield.spec --noconfirm >> p:\CloudSecurityPanel\build4.log 2>&1
echo [2/3] DONE >> p:\CloudSecurityPanel\build4.log

echo [3/3] InnoSetup >> p:\CloudSecurityPanel\build4.log
"C:\Program Files (x86)\Inno Setup 6\ISCC.exe" p:\CloudSecurityPanel\installer\setup.iss >> p:\CloudSecurityPanel\build4.log 2>&1
echo [3/3] DONE >> p:\CloudSecurityPanel\build4.log
echo ALL_DONE >> p:\CloudSecurityPanel\build4.log

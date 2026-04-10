@echo off
echo [1/3] React build...
cd /d p:\CloudSecurityPanel\app\ui && call npm run build >> p:\CloudSecurityPanel\build3.log 2>&1
echo [1/3] DONE >> p:\CloudSecurityPanel\build3.log
echo [2/3] PyInstaller...
cd /d p:\CloudSecurityPanel && p:\CloudSecurityPanel\venv\Scripts\pyinstaller.exe cloudshield.spec --noconfirm >> p:\CloudSecurityPanel\build3.log 2>&1
echo [2/3] DONE >> p:\CloudSecurityPanel\build3.log
echo [3/3] InnoSetup...
"C:\Program Files (x86)\Inno Setup 6\ISCC.exe" p:\CloudSecurityPanel\installer\setup.iss >> p:\CloudSecurityPanel\build3.log 2>&1
echo [3/3] DONE >> p:\CloudSecurityPanel\build3.log
echo ALL_DONE >> p:\CloudSecurityPanel\build3.log

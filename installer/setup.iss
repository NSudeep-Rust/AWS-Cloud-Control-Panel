; CloudShield Setup Script — Inno Setup 6
; Generates: CloudShield-Setup.exe
; Author: NSudeep

#define AppName      "CloudShield"
#define AppVersion   "1.0.0"
#define AppPublisher "NSudeep"
#define AppURL       "https://github.com/NSudeep-Rust/AWS-Cloud-Control-Panel"
#define AppExeName   "CloudShield.exe"
#define AppId        "{{A1B2C3D4-E5F6-7890-ABCD-EF1234567890}"

[Setup]
AppId={#AppId}
AppName={#AppName}
AppVersion={#AppVersion}
AppVerName={#AppName} v{#AppVersion}
AppPublisher={#AppPublisher}
AppPublisherURL={#AppURL}
AppSupportURL={#AppURL}/issues
AppUpdatesURL={#AppURL}/releases
DefaultDirName={autopf}\{#AppName}
DefaultGroupName={#AppName}
AllowNoIcons=yes
OutputDir=..\dist\installer
OutputBaseFilename=CloudShield-Setup-v{#AppVersion}
SetupIconFile=images\icon.ico
WizardImageFile=images\banner.bmp
WizardSmallImageFile=images\header.bmp
WizardStyle=modern
WizardSizePercent=120
Compression=lzma2/ultra64
SolidCompression=yes
PrivilegesRequired=admin
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
UninstallDisplayIcon={app}\{#AppExeName}
UninstallDisplayName={#AppName} AWS Control Panel
LicenseFile=license.txt
DisableProgramGroupPage=auto
DisableReadyMemo=no
ShowTasksTreeLines=yes
RestartApplications=no
CloseApplications=yes

; Registry: Add/Remove Programs info
[Registry]
Root: HKLM; Subkey: "Software\{#AppPublisher}\{#AppName}"; ValueType: string; ValueName: "InstallPath"; ValueData: "{app}"; Flags: uninsdeletekey
Root: HKLM; Subkey: "Software\{#AppPublisher}\{#AppName}"; ValueType: string; ValueName: "Version"; ValueData: "{#AppVersion}"; Flags: uninsdeletekey

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon";   Description: "Create a &Desktop shortcut"; GroupDescription: "Additional icons:"
Name: "startupentry";  Description: "Launch CloudShield at &Windows startup"; GroupDescription: "Startup:"; Flags: unchecked

[Files]
; Electron shell (main app window)
Source: "..\dist\electron\win-unpacked\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

; PyInstaller backend bundle
Source: "..\dist\cloudshield-backend\*"; DestDir: "{app}\cloudshield-backend"; Flags: ignoreversion recursesubdirs createallsubdirs

; Updater executable
Source: "..\dist\CloudShield-Updater.exe"; DestDir: "{app}"; Flags: ignoreversion

; VERSION file at root of install
Source: "..\VERSION"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{group}\{#AppName}";          Filename: "{app}\{#AppExeName}";       IconFilename: "{app}\{#AppExeName}"
Name: "{group}\Check for Updates";   Filename: "{app}\CloudShield-Updater.exe"
Name: "{group}\Uninstall {#AppName}";Filename: "{uninstallexe}"
Name: "{commondesktop}\{#AppName}";  Filename: "{app}\{#AppExeName}";       Tasks: desktopicon; IconFilename: "{app}\{#AppExeName}"

[Run]
; Run CloudShield after install
Filename: "{app}\{#AppExeName}"; Description: "Launch {#AppName} now"; Flags: nowait postinstall skipifsilent

[UninstallRun]
; Kill process before uninstalling
Filename: "{cmd}"; Parameters: "/c taskkill /F /IM CloudShield.exe /IM cloudshield-backend.exe 2>nul"; Flags: runhidden

[Registry]
; Startup entry
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; ValueType: string; ValueName: "{#AppName}"; ValueData: "{app}\{#AppExeName}"; Tasks: startupentry
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; ValueName: "{#AppName}"; Flags: uninsdeletevalue

[Code]
function InitializeSetup(): Boolean;
begin
  Result := True;
  { Kill any running instances }
  Exec('cmd.exe', '/c taskkill /F /IM CloudShield.exe /IM cloudshield-backend.exe 2>nul', '',
       SW_HIDE, ewWaitUntilTerminated, ResultCode);
end;

function GetUninstallString(): String;
var
  sUnInstPath: String;
  sUnInstallString: String;
begin
  sUnInstPath := ExpandConstant('Software\Microsoft\Windows\CurrentVersion\Uninstall\{#AppId}_is1');
  sUnInstallString := '';
  if not RegQueryStringValue(HKLM, sUnInstPath, 'UninstallString', sUnInstallString) then
    RegQueryStringValue(HKCU, sUnInstPath, 'UninstallString', sUnInstallString);
  Result := sUnInstallString;
end;

function IsUpgrade(): Boolean;
begin
  Result := (GetUninstallString() <> '');
end;

function InitializeWizard: Boolean;
begin
  Result := True;
end;

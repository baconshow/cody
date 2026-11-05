; Inno Setup script for CodySetup.exe. Per-user install: no admin rights, no UAC prompt.
; Build: iscc /DAppVersion=1.2.0 packaging\cody.iss   (after PyInstaller has filled dist\Cody)

#ifndef AppVersion
  #define AppVersion "0.0.0"
#endif

[Setup]
AppId={{6C0D7A4E-2B1F-4C83-9E57-C0D7C0D7C0D7}
AppName=Cody
AppVersion={#AppVersion}
AppVerName=Cody {#AppVersion}
AppPublisher=Cody contributors
AppPublisherURL=https://github.com/baconshow/cody
AppSupportURL=https://github.com/baconshow/cody/issues
DefaultDirName={localappdata}\Programs\Cody
DefaultGroupName=Cody
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
OutputDir=..\dist
OutputBaseFilename=CodySetup
SetupIconFile=cody.ico
UninstallDisplayIcon={app}\Cody.exe
LicenseFile=..\LICENSE
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
ArchitecturesInstallIn64BitMode=x64compatible
CloseApplications=yes

[Languages]
Name: "en"; MessagesFile: "compiler:Default.isl"
Name: "ptbr"; MessagesFile: "compiler:Languages\BrazilianPortuguese.isl"

[CustomMessages]
en.AutoStart=Start Cody with Windows
ptbr.AutoStart=Iniciar o Cody com o Windows
en.Desktop=Create a desktop shortcut
ptbr.Desktop=Criar atalho na área de trabalho
en.RunNow=Open Cody now
ptbr.RunNow=Abrir o Cody agora

[Tasks]
Name: "autostart"; Description: "{cm:AutoStart}"
Name: "desktopicon"; Description: "{cm:Desktop}"; Flags: unchecked

[Files]
Source: "..\dist\Cody\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\Cody"; Filename: "{app}\Cody.exe"
Name: "{userdesktop}\Cody"; Filename: "{app}\Cody.exe"; Tasks: desktopicon

[Registry]
; The same value the tray menu's "Start with Windows" switches (cody/autostart.py).
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; ValueType: string; ValueName: "Cody"; \
  ValueData: """{app}\Cody.exe"" --background"; Tasks: autostart; Flags: uninsdeletevalue

[Run]
Filename: "{app}\Cody.exe"; Description: "{cm:RunNow}"; Flags: postinstall nowait skipifsilent

[UninstallRun]
; Take Cody's hooks out of Claude Code's settings, so nothing points at the removed program.
Filename: "{app}\cody-cli.exe"; Parameters: "--uninstall-hooks"; Flags: runhidden; RunOnceId: "RemoveHooks"

[UninstallDelete]
Type: filesandordirs; Name: "{app}"

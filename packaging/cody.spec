# PyInstaller spec for the Windows app: one folder with two programs that share the same files.
#   Cody.exe      no console: the tray icon app (starts the server, the mascot and the voice session)
#   cody-cli.exe  console: what Claude Code runs (hooks, voice channel) and the terminal commands
# Build from the repository root: pyinstaller packaging/cody.spec --noconfirm
from pathlib import Path

ROOT = Path(SPECPATH).parent
ICON = str(ROOT / "packaging" / "cody.ico")

a = Analysis(
    [str(ROOT / "packaging" / "entry.py")],
    pathex=[str(ROOT)],
    datas=[(str(ROOT / "web"), "web"), (str(ROOT / "LICENSE"), ".")],
    hiddenimports=["pystray._win32", "cody.tray", "cody.channel", "cody.server", "cody.hooks", "cody.launcher"],
    excludes=["numpy", "unittest", "pydoc", "test"],
    noarchive=False,
)
pyz = PYZ(a.pure)
app = EXE(pyz, a.scripts, [], exclude_binaries=True, name="Cody", console=False, icon=ICON, upx=False)
cli = EXE(pyz, a.scripts, [], exclude_binaries=True, name="cody-cli", console=True, icon=ICON, upx=False)
COLLECT(app, cli, a.binaries, a.datas, name="Cody", upx=False)

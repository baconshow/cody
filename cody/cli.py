"""Command-line entry, shared by `python cody.py` and the Windows app (Cody.exe and its console twin cody-cli.exe).

    (no option)                 the mascot server; see `--help` for its options (--open, --port, --setup...)
    --hook                      what the Claude Code hooks run (reads the hook's JSON on stdin, always exits 0)
    --install-hooks             adds those hooks to Claude Code's user settings (--uninstall-hooks removes them)
    --statusline                what Claude Code's status line runs when Cody is it (cody/usage.py): keeps your
                                plan's usage windows, then runs the status line you had
    --voice [folder]            the voice session: Claude Code with Cody's voice channel, in this terminal
    --voice-window [folder]     the same, in a new terminal window (what /cody:voice runs)
    --start                     starts the mascot server in the background and opens it (what /cody:setup runs)
    --channel                   the voice channel itself (Claude Code starts it)
    --tray [--background]       the tray icon app (what Cody.exe runs; needs pystray and Pillow)
    --doctor                    what is on and off, with what to do (exit code 1 when something is broken)
    --version                   prints the version
"""
from __future__ import annotations

import sys
from pathlib import Path


def windowed_app() -> bool:
    """Cody.exe, the app without a console: it always runs the tray icon."""
    return bool(getattr(sys, "frozen", False)) and Path(sys.executable).stem.casefold() == "cody"


def main(argv: list[str] | None = None) -> int:
    argv = sys.argv[1:] if argv is None else argv
    if argv == ["--hook"]:                  # fast path: a hook must not import the whole server
        from cody.hooks import run_hook
        return run_hook()
    if argv == ["--statusline"]:            # the same: Claude Code runs it on every status line refresh
        from cody.usage import run_statusline
        return run_statusline()
    if argv in (["--install-hooks"], ["--uninstall-hooks"]):
        from cody.hooks import install
        print(install(remove=argv[0] == "--uninstall-hooks"))
        return 0
    if argv == ["--version"]:
        from cody import __version__
        print(__version__)
        return 0
    if argv == ["--doctor"]:
        from cody import doctor
        from cody.config import load_config
        return doctor.main(load_config())
    if argv == ["--channel"]:
        from cody.channel import main as channel
        channel()
        return 0
    if argv[:1] == ["--voice"] and len(argv) <= 2:
        from cody.config import load_config
        from cody.launcher import run_voice, voice_folder
        return run_voice(voice_folder(argv[1] if len(argv) == 2 else None, load_config()))
    if argv[:1] == ["--voice-window"] and len(argv) <= 2:
        return _voice_window(argv[1] if len(argv) == 2 else None)
    if argv == ["--start"]:
        from cody.launcher import start_server
        print(start_server())
        return 0
    if argv[:1] == ["--tray"] or windowed_app():
        from cody.tray import main as tray
        return tray(argv)
    from cody.server import main as server
    return server(argv)


def _voice_window(folder: str | None) -> int:
    from cody.config import load_config
    from cody.launcher import open_voice_window, voice_folder, voice_session_running
    if voice_session_running():
        print("A Cody voice session is already running: use that one.")
        return 0
    problem = open_voice_window(voice_folder(folder, load_config()))
    print(problem or "The voice session is opening in a new terminal window.")
    return 1 if problem else 0

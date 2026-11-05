"""Starting the voice session: a Claude Code session that loads Cody's voice channel (cody/channel.py).

    python cody.py --voice [folder]     in this terminal (what scripts/voice.ps1 and voice.sh run)
    the tray icon's "Start voice session" opens it in a new terminal window (Windows)

Channels are a research preview: a custom channel only loads with --dangerously-load-development-channels, and Claude
Code asks for a confirmation at startup ("I am using this for local development"). Cody never answers that screen
for you. The MCP config is written with json.dumps to the data folder, readable only by you, and used by the voice
session only: no other session loads the channel. CODY_VOICE=1 tells Cody's hooks (cody/hooks.py) that this is the
voice session, where the mascot already does the talking.

The harmless tools run without asking (reply, timers, memory, pointing); screenshot and look always ask.
"""
from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

from cody.store import data_dir, write_private

ROOT = Path(__file__).resolve().parent.parent
CLI_NAME = "cody-cli.exe"                 # the console build next to Cody.exe in the Windows app
SAFE_TOOLS = ("reply", "timer", "remember", "forget", "point")
MCP_FILE = "voice.mcp.json"
CLAUDE_MISSING = "Claude Code was not found. Install it (https://code.claude.com) and try again."


def frozen() -> bool:
    """True inside the installed Windows app (PyInstaller), where there is no python.exe or cody.py."""
    return bool(getattr(sys, "frozen", False))


def cli_command() -> list[str]:
    """How to run Cody's command-line entry: the console build in the app, `python cody.py` from a checkout."""
    if frozen():
        return [str(Path(sys.executable).with_name(CLI_NAME))]
    return [sys.executable, str(ROOT / "cody.py")]


def channel_command() -> dict:
    """The MCP server entry Claude Code starts for the channel."""
    if frozen():
        return {"command": cli_command()[0], "args": ["--channel"]}
    return {"command": sys.executable, "args": [str(ROOT / "cody" / "channel.py")]}


def write_mcp_config(folder: Path | None = None) -> Path:
    path = (folder or data_dir()) / MCP_FILE
    write_private(path, json.dumps({"mcpServers": {"cody": channel_command()}}, indent=2) + "\n")
    return path


def claude_path(which=shutil.which) -> str | None:
    return which("claude")


def voice_arguments(claude: str, mcp_config: Path) -> list[str]:
    tools = [f"mcp__cody__{name}" for name in SAFE_TOOLS]
    return [claude, "--mcp-config", str(mcp_config), "--dangerously-load-development-channels", "server:cody",
            "--allowedTools", *tools]


def voice_folder(argument: str | None, config: dict | None = None, default: Path | None = None) -> Path:
    """The folder Claude works in: the one given, else the configured one, else `default` (the current folder)."""
    for candidate in (argument, (config or {}).get("voice_folder")):
        if candidate and Path(candidate).expanduser().is_dir():
            return Path(candidate).expanduser().resolve()
    return default or Path.cwd()


def run_voice(folder: Path, run=subprocess.call, which=shutil.which, env=None) -> int:
    """Runs the voice session in this terminal and returns Claude Code's exit code."""
    claude = claude_path(which)
    if not claude:
        print(CLAUDE_MISSING, file=sys.stderr)
        return 127
    command = voice_arguments(claude, write_mcp_config())
    session_env = {**(os.environ if env is None else env), "CODY_VOICE": "1"}
    try:
        return run(command, cwd=str(folder), env=session_env)
    except KeyboardInterrupt:
        return 130


def open_voice_window(folder: Path, popen=subprocess.Popen, which=shutil.which, platform=sys.platform) -> str | None:
    """Opens the voice session in a new terminal window. Returns None when it started, else what went wrong."""
    if not claude_path(which):
        return CLAUDE_MISSING
    command = [*cli_command(), "--voice", str(folder)]
    if platform == "win32":
        popen(command, cwd=str(folder), creationflags=getattr(subprocess, "CREATE_NEW_CONSOLE", 0x10))
        return None
    if platform == "darwin":
        line = f"cd {_quote(str(folder))} && " + " ".join(_quote(part) for part in command)
        script = f'tell application "Terminal" to do script {json.dumps(line, ensure_ascii=False)}'
        popen(["osascript", "-e", script])
        return None
    terminal = which("x-terminal-emulator") or which("gnome-terminal") or which("konsole") or which("xterm")
    if not terminal:
        return "No terminal program was found: run `python cody.py --voice` in a terminal."
    popen([terminal, "-e", *command], cwd=str(folder))
    return None


def _quote(part: str) -> str:
    return "'" + part.replace("'", "'\\''") + "'"


def voice_session_running(read=None, connect=None) -> bool:
    """True when a voice channel is up: channel.json names a port and something answers on it."""
    from cody.store import read_json
    data = (read or read_json)(data_dir() / "channel.json")
    port = data.get("port") if isinstance(data, dict) else None
    if not isinstance(port, int) or not 0 < port < 65536:
        return False
    return server_running(port, connect)


def server_running(port: int, connect=None) -> bool:
    import socket
    try:
        (connect or socket.create_connection)(("127.0.0.1", port), timeout=0.5).close()
    except OSError:
        return False
    return True


START_WAIT_S = 10


def start_server(popen=subprocess.Popen, config: dict | None = None, opener=None, platform=sys.platform,
                 sleep=None) -> str:
    """Starts the mascot server in the background (output to server.log in the data folder) and opens the mascot."""
    import time
    import webbrowser
    from cody.config import load_config
    sleep = sleep or time.sleep
    config = config or load_config()
    url = f"http://127.0.0.1:{config['port']}/"
    if not server_running(config["port"]):
        folder = data_dir()
        folder.mkdir(parents=True, exist_ok=True)
        log = (folder / "server.log").open("ab")
        detach = {"creationflags": 0x08000000 | 0x00000200} if platform == "win32" else {"start_new_session": True}
        popen(cli_command(), stdin=subprocess.DEVNULL, stdout=log, stderr=log, **detach)
        for _ in range(int(START_WAIT_S / 0.25)):          # the page only opens once the server answers
            if server_running(config["port"]):
                break
            sleep(0.25)
    (opener or webbrowser.open)(url)
    return f"Cody is running at {url}"

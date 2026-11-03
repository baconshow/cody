"""Heads-up from your Claude Code sessions, through Claude Code hooks: when Claude finishes a long task, Cody cheers
and says it is done; when Claude is waiting for your permission, Cody calls you to the computer.

Three hooks run `python cody.py --hook` (set them up with `python cody.py --install-hooks`):
    UserPromptSubmit   a turn starts
    Stop               the turn ended: "done", if it took at least LONG_TURN_S
    Notification       permission_prompt and the like: "needs you"
Each run appends one line to events.jsonl in the data folder (cody/store.py): the time, the kind and the first
characters of the session id. Never the prompt, the reply or the command. The server reads the file (HookFeed) for
the phone. Hooks run inside the voice session too (CODY_VOICE=1, set by scripts/voice.ps1 and voice.sh): those are
skipped, since there the mascot already does the talking.
"""
from __future__ import annotations

import json
import os
import re
import sys
import threading
import time
from collections import deque
from pathlib import Path

from cody.store import data_dir, read_json, write_atomic, write_private

MAX_FILE = 64 * 1024          # past this, the next hook starts the file over
MAX_LINE = 512
LONG_TURN_S = 20              # a turn shorter than this ends without a word: the face already showed the work
NEEDS_YOU = frozenset({"permission_prompt", "elicitation_dialog", "agent_needs_input"})
VOICE_ENV = "CODY_VOICE"
SESSION_CHARS = 12
MAX_EVENTS = 50
MARKER = "--hook"
OURS = re.compile(r'cody\.py"?\s+--hook\b')        # how our own hook commands are recognized in settings.json
EVENTS = ("UserPromptSubmit", "Stop", "Notification")
TIMEOUT_S = 10

PHRASES = {
    "en": {"done": "Done! Claude finished.", "needs_you": "Claude needs you at the computer."},
    "pt-BR": {"done": "Pronto! O Claude terminou.", "needs_you": "O Claude precisa de você no computador."},
}


def events_file() -> Path:
    return data_dir() / "events.jsonl"


def phrase(kind: str, language: str = "en") -> str:
    return PHRASES.get(language, PHRASES["en"])[kind]


def classify(payload: dict) -> str | None:
    """"start", "done", "needs_you" or None (an event Cody ignores)."""
    name = payload.get("hook_event_name")
    if name == "UserPromptSubmit":
        return "start"
    if name == "Stop":
        return "done"
    if name == "Notification" and payload.get("notification_type") in NEEDS_YOU:
        return "needs_you"
    return None


def record(payload, path: Path | None = None, env=os.environ, clock=time.time) -> bool:
    """Appends the hook's event to the file; False when skipped (the voice session, an ignored event)."""
    if env.get(VOICE_ENV) == "1" or not isinstance(payload, dict):
        return False
    kind = classify(payload)
    if kind is None:
        return False
    path = path or events_file()
    session = str(payload.get("session_id") or "")[:SESSION_CHARS]
    line = json.dumps({"t": round(clock(), 3), "e": kind, "s": session}) + "\n"
    try:
        if path.exists() and path.stat().st_size > MAX_FILE:
            write_private(path, line)
        else:
            path.parent.mkdir(parents=True, exist_ok=True)
            fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_APPEND, 0o600)
            with os.fdopen(fd, "a", encoding="utf-8") as out:
                out.write(line)
    except OSError:
        return False
    return True


def run_hook(stdin=None, path: Path | None = None) -> int:
    """`python cody.py --hook`: always exits 0 and prints nothing, so it can never block or change a session."""
    try:
        payload = json.loads((stdin or sys.stdin.buffer).read(256 * 1024) or b"{}")
    except (ValueError, OSError):
        return 0
    record(payload, path)
    return 0


class HookFeed:
    """The server's side: reads the lines added since the last read and turns them into events for the phone,
    {"seq", "kind", "seconds", "say"}. It starts at the end of the file as it was when the server started."""

    def __init__(self, path: Path | None = None, language: str = "en"):
        self._path = path or events_file()
        self._language = language
        try:                                      # from the server's start: the past is not news
            self._offset = self._path.stat().st_size
        except OSError:
            self._offset = 0
        self._starts: dict[str, float] = {}
        self._events: deque = deque(maxlen=MAX_EVENTS)
        self._seq = 0
        self._lock = threading.Lock()

    def _new_lines(self) -> list[bytes]:
        try:
            size = self._path.stat().st_size
        except OSError:
            self._offset = 0
            return []
        if size < self._offset:                       # the hook started the file over
            self._offset = 0
        if size == self._offset:
            return []
        with self._path.open("rb") as source:
            source.seek(self._offset)
            chunk = source.read(size - self._offset)
        complete = chunk.rfind(b"\n") + 1             # a line still being written waits for the next read
        self._offset += complete
        return chunk[:complete].splitlines()

    def _take(self, line: bytes) -> None:
        try:
            item = json.loads(line[:MAX_LINE])
            when, kind, session = float(item["t"]), item["e"], str(item.get("s", ""))
        except (ValueError, KeyError, TypeError):
            return
        if kind == "start":
            self._starts[session] = when
            while len(self._starts) > MAX_EVENTS:
                self._starts.pop(next(iter(self._starts)))
            return
        seconds = None
        if kind == "done":
            start = self._starts.pop(session, None)
            if start is None or when - start < LONG_TURN_S:
                return
            seconds = round(when - start)
        elif kind != "needs_you":
            return
        self._seq += 1
        self._events.append({"seq": self._seq, "kind": kind, "seconds": seconds,
                             "say": phrase(kind, self._language)})

    def read(self, after: int) -> dict:
        """GET /api/events?after=N -> {"cursor", "events"}."""
        with self._lock:
            for line in self._new_lines():
                self._take(line)
            return {"cursor": self._seq, "events": [e for e in self._events if e["seq"] > after]}


# ---- setting the hooks up in Claude Code ------------------------------------------------------------------------

def hook_command(python: str | None = None, script: Path | None = None) -> str:
    """The hook's command line. `|| exit 0` (valid in bash, cmd and PowerShell): if Python cannot even start the
    script (the folder moved), it must not exit with 2, which Claude Code reads as "block this prompt"."""
    python = Path(python or sys.executable).as_posix()
    script = (script or Path(__file__).resolve().parent.parent / "cody.py").as_posix()
    return f'"{python}" "{script}" {MARKER} || exit 0'


def settings_file() -> Path:
    base = os.environ.get("CLAUDE_CONFIG_DIR") or str(Path.home() / ".claude")
    return Path(base) / "settings.json"


def _ours(group) -> bool:
    return isinstance(group, dict) and any(
        isinstance(h, dict) and OURS.search(str(h.get("command", ""))) for h in group.get("hooks") or [])


def with_hooks(settings: dict, command: str) -> dict:
    """A copy of the settings with Cody's three hooks (replacing older copies of them, keeping everything else)."""
    hooks = dict(settings.get("hooks") or {})
    for event in EVENTS:
        groups = [g for g in hooks.get(event) or [] if not _ours(g)]
        handler = {"type": "command", "command": command, "timeout": TIMEOUT_S}
        groups.append({"hooks": [handler]})
        hooks[event] = groups
    return {**settings, "hooks": hooks}


def without_hooks(settings: dict) -> dict:
    hooks = {}
    for event, groups in (settings.get("hooks") or {}).items():
        kept = [g for g in groups if not _ours(g)] if isinstance(groups, list) else groups
        if kept:
            hooks[event] = kept
    result = {**settings, "hooks": hooks}
    if not hooks:
        del result["hooks"]
    return result


def install(remove: bool = False, path: Path | None = None, command: str | None = None) -> str:
    """Adds Cody's hooks to Claude Code's user settings (or removes them), after a backup next to the file. Returns
    what happened, for the terminal."""
    path = (path or settings_file()).resolve()             # a symlinked settings file is updated where it lives
    settings = read_json(path) if path.exists() else {}
    if not isinstance(settings, dict) or not isinstance(settings.get("hooks", {}), dict):
        return f"{path} is not valid JSON: nothing changed. Fix it, or add the hooks by hand (see the README)."
    updated = without_hooks(settings) if remove else with_hooks(settings, command or hook_command())
    if updated == settings:
        return "Nothing to change."
    backup = None
    if path.exists():                                      # settings may hold secrets in "env": the copy is private
        backup = path.with_name(f"{path.name}.cody-backup-{time.strftime('%Y%m%d-%H%M%S')}")
        write_private(backup, path.read_text(encoding="utf-8"))
    write_atomic(path, json.dumps(updated, indent=2, ensure_ascii=False) + "\n")
    saved = f" (backup: {backup.name})" if backup else ""
    if remove:
        return f"Cody's hooks removed from {path}{saved}."
    return (f"Cody's hooks added to {path}{saved}. Sessions started from now on will tell Cody when they finish or "
            "need you. If you move the cody folder, run --install-hooks again.")

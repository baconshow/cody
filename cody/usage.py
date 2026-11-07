"""Your plan's usage limits, so Cody can answer "how much usage do I have left?".

The only local, stable source: Claude Code hands its status line command a JSON with `rate_limits` (the five-hour
session window and the seven-day one, each with `used_percentage` and `resets_at`) on subscription plans. So Cody
offers to be the status line: `cody.py --statusline` reads that JSON, keeps the two windows (and nothing else of
the JSON) in usage.json in the data folder, and either runs the status line you had before, with the same input,
printing its output, or prints a short line of its own. No API call, no token read, nothing leaves the machine.
Opt-in: the Settings switch (install), which keeps your old status line in config.json to chain it and to put it
back when you turn Cody's off.

  run_statusline(stdin) → exit code      what Claude Code runs
  install(remove) → what happened         the settings.json change
  read(path, now) → the windows | None    what is known right now; phrase(data, language) says it
  is_usage_question(text)                 "how much usage do I have left?", for the voice (cody/voice.py)
"""
from __future__ import annotations

import json
import re
import subprocess
import sys
import time
from datetime import datetime
from pathlib import Path

from cody import hooks
from cody.store import data_dir, read_json, write_atomic, write_private

MARKER = "--statusline"
OURS = re.compile(r'(?:cody\.py|cody-cli(?:\.exe)?)"?\s+--statusline\b')
WINDOWS = ("five_hour", "seven_day")
STALE_S = 6 * 3600                 # older than this (Claude Code closed since), the numbers are "a while ago"
MAX_STDIN = 1024 * 1024
PREVIOUS_KEY = "statusline_previous"
USAGE_WORDS = re.compile(r"\b(usage|uso|limits?|limites?|quota|cota)\b", re.I)
MINE_WORDS = re.compile(r"\b(my|mine|i|meu|minha|me|resta|restam?|sobra|left|remaining|quanto|how much|falta)\b", re.I)
MAX_QUESTION_WORDS = 9
TEXT = {
    "en": {
        "line": "Cody · session {five}% · week {seven}%", "none": "Cody · usage unknown",
        "say": "Session: {five}% used, resets {five_at}. Week: {seven}% used, resets {seven_at}.",
        "stale": " That was {ago} ago; open Claude Code for fresh numbers.",
        "unknown": "I don't know your usage yet: turn on \"Usage limits\" in Settings, then use Claude Code once.",
        "at": "at {time}", "on": "on {day} at {time}", "hours": "{n} hours", "minutes": "{n} minutes",
        "days": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
    },
    "pt-BR": {
        "line": "Cody · sessão {five}% · semana {seven}%", "none": "Cody · uso desconhecido",
        "say": "Sessão: {five}% usados, renova {five_at}. Semana: {seven}% usados, renova {seven_at}.",
        "stale": " Isso foi há {ago}; abra o Claude Code para números novos.",
        "unknown": "Ainda não sei seu uso: ligue \"Limites de uso\" nas Configurações e use o Claude Code uma vez.",
        "at": "às {time}", "on": "{day} às {time}", "hours": "{n} horas", "minutes": "{n} minutos",
        "days": ["segunda", "terça", "quarta", "quinta", "sexta", "sábado", "domingo"],
    },
}


def usage_file() -> Path:
    return data_dir() / "usage.json"


def _epoch(value) -> float | None:
    """resets_at as Claude Code gives it: epoch seconds, or an ISO 8601 text."""
    if isinstance(value, (int, float)) and value > 0:
        return float(value) if value < 1e11 else float(value) / 1000
    if isinstance(value, str):
        try:
            return datetime.fromisoformat(value.replace("Z", "+00:00")).timestamp()
        except ValueError:
            return None
    return None


def windows_of(payload: dict) -> dict | None:
    """The two windows out of the status line JSON, or None when the JSON has none (an API account, an old version)."""
    limits = payload.get("rate_limits") if isinstance(payload, dict) else None
    if not isinstance(limits, dict):
        return None
    out = {}
    for name in WINDOWS:
        window = limits.get(name)
        if not isinstance(window, dict):
            continue
        used = window.get("used_percentage", window.get("utilization"))
        if not isinstance(used, (int, float)):
            continue
        out[name] = {"used": max(0, min(100, round(float(used)))), "resets_at": _epoch(window.get("resets_at"))}
    return out or None


def run_statusline(stdin=None, path: Path | None = None, config: dict | None = None, now=time.time, out=None) -> int:
    """What Claude Code runs on every status line refresh: keep the windows, then the status line you had (or
    Cody's own line). Always exits 0: a status line must never break the terminal."""
    if out is None:
        out = sys.stdout
        if hasattr(out, "reconfigure"):
            out.reconfigure(encoding="utf-8")       # Claude Code reads the line as UTF-8, whatever the console's code page
    try:
        raw = (stdin or sys.stdin.buffer).read(MAX_STDIN)
    except (OSError, ValueError, AttributeError):
        raw = b""
    try:
        payload = json.loads(raw.decode("utf-8", "replace") or "{}")
    except ValueError:
        payload = {}
    windows = windows_of(payload)
    if windows:
        try:
            write_private(path or usage_file(), json.dumps({"at": now(), **windows}))
        except OSError:
            pass
    if config is None:
        from cody.config import load_config
        config = load_config()
    previous = config.get(PREVIOUS_KEY)
    command = previous.get("command") if isinstance(previous, dict) else None
    if isinstance(command, str) and command.strip():
        try:
            done = subprocess.run(command, shell=True, input=raw, capture_output=True, timeout=10)
            out.write(done.stdout.decode("utf-8", "replace"))
            out.flush()
            return 0
        except (OSError, subprocess.TimeoutExpired, ValueError):
            pass
    texts = TEXT.get(config.get("language", "en"), TEXT["en"])
    if windows:
        out.write(texts["line"].format(five=windows.get("five_hour", {}).get("used", "?"),
                                       seven=windows.get("seven_day", {}).get("used", "?")) + "\n")
    else:
        out.write(texts["none"] + "\n")
    out.flush()
    return 0


def read(path: Path | None = None, now=time.time) -> dict | None:
    data = read_json(path or usage_file())
    if not isinstance(data, dict) or not isinstance(data.get("at"), (int, float)):
        return None
    windows = {k: v for k, v in data.items() if k in WINDOWS and isinstance(v, dict) and isinstance(v.get("used"), (int, float))}
    if not windows:
        return None
    return {**windows, "age_s": max(0.0, now() - float(data["at"]))}


def _when(stamp: float | None, texts: dict, now: float) -> str:
    if stamp is None:
        return "?"
    moment = datetime.fromtimestamp(stamp)
    clock = moment.strftime("%H:%M")
    if stamp - now < 20 * 3600:
        return texts["at"].format(time=clock)
    return texts["on"].format(day=texts["days"][moment.weekday()], time=clock)


def phrase(data: dict | None, language: str = "en", now=time.time) -> str:
    """What Cody says and shows for "how much usage do I have left?"."""
    texts = TEXT.get(language, TEXT["en"])
    if not data:
        return texts["unknown"]
    at = now()
    five, seven = data.get("five_hour") or {}, data.get("seven_day") or {}
    said = texts["say"].format(five=five.get("used", "?"), seven=seven.get("used", "?"),
                               five_at=_when(five.get("resets_at"), texts, at), seven_at=_when(seven.get("resets_at"), texts, at))
    age = data.get("age_s", 0)
    if age > STALE_S:
        ago = texts["hours"].format(n=int(age // 3600)) if age >= 3600 else texts["minutes"].format(n=int(age // 60))
        said += texts["stale"].format(ago=ago)
    return said


def is_usage_question(text: str) -> bool:
    return (len(text.split()) <= MAX_QUESTION_WORDS and USAGE_WORDS.search(text) is not None
            and MINE_WORDS.search(text) is not None)


# ---- the status line in Claude Code's settings --------------------------------------------------------------------

def statusline_command(python: str | None = None, script: Path | None = None) -> str:
    if getattr(sys, "frozen", False) and not python:
        return f'"{Path(sys.executable).with_name("cody-cli.exe").as_posix()}" {MARKER}'
    python = Path(python or sys.executable).as_posix()
    script = (script or Path(__file__).resolve().parent.parent / "cody.py").as_posix()
    return f'"{python}" "{script}" {MARKER}'


def is_ours(status_line) -> bool:
    return isinstance(status_line, dict) and OURS.search(str(status_line.get("command", ""))) is not None


def installed(path: Path | None = None) -> bool:
    settings = read_json(path or hooks.settings_file())
    return isinstance(settings, dict) and is_ours(settings.get("statusLine"))


def install(remove: bool = False, path: Path | None = None, config_path: Path | None = None, command: str | None = None) -> str:
    """Makes Cody the status line (keeping yours in config.json, to run it after), or puts yours back."""
    from cody.config import config_file
    path = (path or hooks.settings_file()).resolve()
    settings = read_json(path) if path.exists() else {}
    if not isinstance(settings, dict):
        return f"{path} is not valid JSON: nothing changed."
    config_path = config_path or config_file()
    config = read_json(config_path) if config_path.exists() else {}
    config = config if isinstance(config, dict) else {}
    current = settings.get("statusLine")
    if remove:
        if not is_ours(current):
            return "Cody is not the status line: nothing to change."
        previous = config.get(PREVIOUS_KEY)
        updated = {**settings}
        if isinstance(previous, dict) and previous.get("command"):
            updated["statusLine"] = previous
        else:
            updated.pop("statusLine", None)
        config.pop(PREVIOUS_KEY, None)
    else:
        if is_ours(current):
            return "Cody is the status line already."
        if isinstance(current, dict) and current.get("command"):
            config[PREVIOUS_KEY] = current              # yours runs after Cody, with the same input
        else:
            config.pop(PREVIOUS_KEY, None)
        updated = {**settings, "statusLine": {"type": "command", "command": command or statusline_command()}}
    if path.exists():
        backup = path.with_name(f"{path.name}.cody-backup-{time.strftime('%Y%m%d-%H%M%S')}")
        write_private(backup, path.read_text(encoding="utf-8"))
    write_atomic(config_path, json.dumps(config, indent=2, ensure_ascii=False) + "\n")
    write_atomic(path, json.dumps(updated, indent=2, ensure_ascii=False) + "\n")
    if remove:
        return f"Your status line is back in {path}."
    kept = " Yours still shows: Cody runs it after reading the numbers." if PREVIOUS_KEY in config else ""
    return f"Cody is now the status line in {path}.{kept} New Claude Code sessions tell Cody your usage."

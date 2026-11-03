"""The data folder shared by the mascot server, the voice channel and the Claude Code hooks: small JSON files, each
written whole and readable only by you. Nothing here ever leaves the computer.

    %LOCALAPPDATA%\\cody on Windows, $XDG_STATE_HOME/cody or ~/.local/state/cody elsewhere
"""
from __future__ import annotations

import json
import os
import secrets
import time
from pathlib import Path

NAME = "cody"
REPLACE_TRIES = 5            # on Windows a reader holding the file open makes os.replace fail for a moment
REPLACE_WAIT_S = 0.02


def data_dir() -> Path:
    base = os.environ.get("LOCALAPPDATA") or os.environ.get("XDG_STATE_HOME") or str(Path.home() / ".local" / "state")
    return Path(base) / NAME


class Unreadable(OSError):
    """The file is there but could not be read or parsed: never overwrite it as if it were empty."""


def write_private(path: Path, text: str) -> None:
    """Writes a file only the current user can read (mode 600 where the OS supports it)."""
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w", encoding="utf-8") as out:
        out.write(text)


def write_atomic(path: Path, text: str) -> None:
    """Writes the whole file at once: a reader sees the old content or the new one, never half of it."""
    temp = path.with_name(f".{path.name}.{secrets.token_hex(4)}.tmp")
    write_private(temp, text)
    try:
        for attempt in range(REPLACE_TRIES):
            try:
                os.replace(temp, path)
                return
            except PermissionError:
                if attempt == REPLACE_TRIES - 1:
                    raise
                time.sleep(REPLACE_WAIT_S)
    finally:
        if temp.exists():
            temp.unlink(missing_ok=True)


def read_json(path: Path):
    """The parsed file, or None when it is missing or not valid JSON (for readers: they just show nothing)."""
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None


def read_for_update(path: Path):
    """For a read-modify-write: the parsed file, None when it does not exist yet, and Unreadable when it exists but
    cannot be read (held open for a moment, damaged by a hand edit), so the caller refuses instead of wiping it."""
    for attempt in range(REPLACE_TRIES):
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except FileNotFoundError:
            return None
        except PermissionError as error:
            if attempt == REPLACE_TRIES - 1:
                raise Unreadable(str(path)) from error
            time.sleep(REPLACE_WAIT_S)
        except (OSError, ValueError) as error:
            raise Unreadable(str(path)) from error
    return None

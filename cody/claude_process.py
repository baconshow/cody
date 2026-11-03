"""Whether Claude is running on this computer, so the mascot can fall asleep when it is closed.

Only a yes or no leaves this module: never a process name, path or PID.

The probe asks the OS once every 15 s (fixed arguments, no shell, 3 s timeout): tasklist for claude.exe on Windows
(the desktop app and the native CLI), pgrep for a process named claude elsewhere. A CLI installed through npm runs as
node and cannot be told apart, so "not found" is not trusted: without a positive answer the fallback decides, open
while some session wrote to its transcript in the last 10 minutes.
"""
from __future__ import annotations

import csv
import os
import subprocess
import sys
import threading
import time
from pathlib import Path

IMAGE = "claude.exe"
TIMEOUT_S = 3
CACHE_S = 15
FALLBACK_WINDOW_S = 600


def _system32(program: str) -> str:
    root = os.environ.get("SystemRoot") or r"C:\Windows"
    return str(Path(root) / "System32" / program)


def parse_tasklist(code: int, output: str) -> bool:
    """True if `tasklist /FO CSV /NH` output lists claude.exe."""
    if code != 0:
        return False
    return any(fields and fields[0].strip().casefold() == IMAGE for fields in csv.reader(output.splitlines()))


def _run(args: list[str]) -> subprocess.CompletedProcess | None:
    try:
        return subprocess.run(args, capture_output=True, text=True, encoding="utf-8", errors="replace",
                              timeout=TIMEOUT_S, check=False, shell=False,
                              creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
    except (OSError, subprocess.SubprocessError, ValueError):
        return None


def probe() -> bool | None:
    """True if a Claude process is found; None when not found or when the probe fails."""
    if sys.platform == "win32":
        done = _run([_system32("tasklist.exe"), "/FI", f"IMAGENAME eq {IMAGE}", "/FO", "CSV", "/NH"])
        found = done is not None and parse_tasklist(done.returncode, done.stdout or "")
    else:
        done = _run(["pgrep", "-x", "claude"])
        found = done is not None and done.returncode == 0
    return True if found else None


class ClaudeWatcher:
    """is_open(): the cached probe, or the recent-activity fallback."""

    def __init__(self, last_signal, run=probe, monotonic=time.monotonic, now=time.time):
        self._last_signal = last_signal      # () -> epoch of the latest session activity (0 if none)
        self._run = run
        self._monotonic = monotonic
        self._now = now
        self._lock = threading.Lock()
        self._answer: bool | None = None
        self._when: float | None = None

    def _cached_probe(self) -> bool | None:
        with self._lock:
            if self._when is None or self._monotonic() - self._when >= CACHE_S:
                self._answer = self._run()
                self._when = self._monotonic()
            return self._answer

    def is_open(self) -> bool:
        if self._cached_probe():
            return True
        try:
            last = float(self._last_signal() or 0)
        except (TypeError, ValueError):
            last = 0.0
        return self._now() - last < FALLBACK_WINDOW_S

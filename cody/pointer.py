"""Cody on the computer screen: "where is the export button?" Claude looks at the screen (cody/screen.py look()),
finds the spot and calls point; a mini Cody flies there and points at it, with a speech bubble (cody/overlay.py, a
window you can click through). Meanwhile the mascot on the phone turns its eyes to the same spot (pointer.json in the
data folder, read by GET /api/cursor).

The overlay is its own process, started on the first point and fed one JSON line per point on its stdin; it closes
by itself when the voice channel closes. Windows only for now.
"""
from __future__ import annotations

import importlib.util
import json
import subprocess
import sys
import threading
import time
from pathlib import Path

from cody import screen
from cody.cursor import normalize
from cody.store import data_dir, read_json, write_atomic

OVERLAY = Path(__file__).resolve().with_name("overlay.py")
SHOW_S = 8                     # how long the mini Cody stays at the spot (the overlay uses the same value)
MAX_BUBBLE = 80


def pointer_file() -> Path:
    return data_dir() / "pointer.json"


def pointed(path: Path | None = None, clock=time.time) -> dict | None:
    """{"x", "y", "pointing": True} (-1 to 1 across all screens) while the mini Cody is pointing; otherwise None."""
    data = read_json(path or pointer_file())
    if not isinstance(data, dict) or not isinstance(data.get("until"), (int, float)) or data["until"] < clock():
        return None
    x, y = data.get("x"), data.get("y")
    if not all(isinstance(v, (int, float)) and -1 <= v <= 1 for v in (x, y)):
        return None
    return {"x": x, "y": y, "pointing": True}


def bubble_text(text) -> str:
    if not isinstance(text, str):
        return ""
    line = "".join(c for c in " ".join(text.split()) if c.isprintable())
    return line if len(line) <= MAX_BUBBLE else line[:MAX_BUBBLE - 1] + "…"


def start_overlay() -> subprocess.Popen:
    """The overlay process, with no console window and nothing on our stdout (it belongs to MCP)."""
    flags = getattr(subprocess, "CREATE_NO_WINDOW", 0)
    return subprocess.Popen([sys.executable, str(OVERLAY)], stdin=subprocess.PIPE, stdout=subprocess.DEVNULL,
                            stderr=subprocess.DEVNULL, creationflags=flags)


class Pointer:
    """The channel's side of look and point. `look` and `start` are swapped in the tests."""

    def __init__(self, look=screen.look, start=start_overlay, path: Path | None = None, clock=time.time):
        self._look = look
        self._start = start
        self._path = path or pointer_file()
        self._clock = clock
        self._view: dict | None = None
        self._overlay: subprocess.Popen | None = None
        self._lock = threading.Lock()

    def look(self) -> tuple[bytes, dict | None]:
        png, view = self._look()
        with self._lock:
            self._view = view
        return png, view

    def point(self, x, y, text) -> tuple[int, int]:
        """Sends the mini Cody to (x, y) of the latest look picture. ValueError: "unsupported" (not Windows), "look"
        (no look yet in this session) or "outside" (the point is off the picture)."""
        if sys.platform != "win32" or importlib.util.find_spec("tkinter") is None:
            raise ValueError("unsupported")
        with self._lock:
            view = self._view
        if view is None:
            raise ValueError("look")
        if isinstance(x, bool) or isinstance(y, bool) or not all(isinstance(v, (int, float)) for v in (x, y)):
            raise ValueError("outside")
        spot = screen.to_screen(view, x, y)
        if spot is None:
            raise ValueError("outside")
        self._send({"x": spot[0], "y": spot[1], "text": bubble_text(text), "seconds": SHOW_S})
        area = (view["left"], view["top"], view["width"], view["height"])
        gaze = normalize(spot[0], spot[1], area) or {"x": 0, "y": 0}
        write_atomic(self._path, json.dumps({**gaze, "until": self._clock() + SHOW_S}))
        return spot

    def _send(self, command: dict) -> None:
        line = (json.dumps(command, ensure_ascii=False) + "\n").encode("utf-8")
        with self._lock:
            for _ in range(2):                     # a closed overlay (crashed, killed) is started again once
                if self._overlay is None or self._overlay.poll() is not None:
                    self._overlay = self._start()
                try:
                    self._overlay.stdin.write(line)
                    self._overlay.stdin.flush()
                    return
                except (OSError, ValueError):
                    self._overlay = None
        raise OSError("the overlay did not start")

    def close(self) -> None:
        with self._lock:
            overlay, self._overlay = self._overlay, None
        if overlay is not None:
            try:
                overlay.stdin.close()              # the overlay exits when its stdin ends
                overlay.wait(timeout=2)
            except (OSError, ValueError, subprocess.TimeoutExpired):
                overlay.kill()

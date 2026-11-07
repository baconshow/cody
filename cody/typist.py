"""Typing along: when you type in a Claude window, Cody types on its little keyboard too. Opt-in, Windows only.

What is read, a few times a second, and never kept: the tick of the last input on the computer
(GetLastInputInfo: one number, the same for a key, a click or a move), where the pointer is, and whether the
window in front has "Claude" in its title. Input arrived and the pointer did not move: that was the keyboard. No
key is ever read, let alone recorded; there is no keyboard hook. Off unless "typing": true in config.json (the
Settings checkbox); anywhere but Windows, never typing.

  TypistWatcher(enabled).start() / .stop() / .typing() → bool
  Typist (pure): observe(tick, pointer, focused, now); typing(now)
"""
from __future__ import annotations

import ctypes
import sys
import threading
import time

POLL_S = 0.4
HOLD_S = 2.5                   # keys this recently: still typing (the pause between two words)
WINDOW_WORD = "claude"


class Typist:
    """The judgement, without Windows: input arrived while the pointer stayed put, in front of a Claude window."""

    def __init__(self):
        self._tick = None
        self._pointer = None
        self._keys_at = -1e9
        self._focused = False

    def observe(self, tick: int | None, pointer: tuple | None, focused: bool, now: float) -> None:
        if tick is not None and self._tick is not None and tick != self._tick and pointer == self._pointer:
            self._keys_at = now
        self._tick = tick
        self._pointer = pointer
        self._focused = focused

    def typing(self, now: float) -> bool:
        return self._focused and now - self._keys_at < HOLD_S


class _LastInput(ctypes.Structure):
    _fields_ = [("cbSize", ctypes.c_uint), ("dwTime", ctypes.c_uint)]


class _Point(ctypes.Structure):
    _fields_ = [("x", ctypes.c_long), ("y", ctypes.c_long)]


def probe_windows() -> tuple[int | None, tuple | None, bool]:
    """(the last input's tick, the pointer, a Claude window in front), each None or False when it cannot be read."""
    user32 = ctypes.windll.user32
    info = _LastInput()
    info.cbSize = ctypes.sizeof(info)
    tick = int(info.dwTime) if user32.GetLastInputInfo(ctypes.byref(info)) else None
    point = _Point()
    pointer = (point.x, point.y) if user32.GetCursorPos(ctypes.byref(point)) else None
    focused = False
    window = user32.GetForegroundWindow()
    if window:
        length = user32.GetWindowTextLengthW(window)
        title = ctypes.create_unicode_buffer(length + 1)
        user32.GetWindowTextW(window, title, length + 1)
        focused = WINDOW_WORD in title.value.casefold()      # checked and dropped: the title is never kept
    return tick, pointer, focused


class TypistWatcher:
    """Probes on a thread; typing() is the judgement right now."""

    def __init__(self, enabled: bool, probe=probe_windows, clock=time.monotonic, platform: str = sys.platform):
        self._possible = platform == "win32"
        self.enabled = enabled and self._possible
        self._probe = probe
        self._clock = clock
        self._typist = Typist()
        self._lock = threading.Lock()
        self._stopping = threading.Event()
        self._thread = None

    def start(self) -> None:
        if not self.enabled or (self._thread and self._thread.is_alive()):
            return
        self._stopping.clear()
        self._thread = threading.Thread(target=self._run, name="cody-typist", daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._stopping.set()
        with self._lock:
            self._typist = Typist()

    def set_enabled(self, on: bool) -> None:
        self.enabled = on and self._possible
        if self.enabled:
            self.start()
        else:
            self.stop()

    def typing(self) -> bool:
        with self._lock:
            return self.enabled and self._typist.typing(self._clock())

    def _run(self) -> None:
        while not self._stopping.wait(POLL_S):
            try:
                tick, pointer, focused = self._probe()
            except (OSError, AttributeError, ValueError):
                continue
            with self._lock:
                self._typist.observe(tick, pointer, focused, self._clock())

"""Timers and reminders you ask for by voice ("Cody, set a timer for ten minutes", "remind me at three to call Ana").

The voice channel writes them to timers.json in the data folder (cody/store.py); the server reads the same file for
the phone, which counts down and rings. The end is a moment on the clock, not a countdown kept in memory, so a timer
survives the voice session closing and the phone reloading.

    {"timers": [{"id": "1f2e3d4c", "label": "pizza", "kind": "timer", "ends_at": 1767225600.0}]}

kind: "timer" (set with minutes) or "reminder" (set for a time of day). ends_at: seconds since the epoch.
"""
from __future__ import annotations

import json
import re
import secrets
import threading
import time
from datetime import datetime, timedelta
from pathlib import Path

from cody.store import data_dir, read_for_update, read_json, write_atomic

MAX_TIMERS = 20
MAX_CREATED_PER_HOUR = 30    # with a voice configured each ring is a synthesis: a loop must not drain the credits
MAX_LABEL = 80
MIN_SECONDS = 10
MAX_MINUTES = 7 * 24 * 60
MIN_QUERY = 3                # cancel by part of a label: at least this many letters ("a" would match everything)
RING_WINDOW_S = 10 * 60      # an ended timer still reaches the phone this long: a phone that was offline still rings
KEEP_ENDED_S = 60 * 60       # then it is pruned from the file
AT = re.compile(r"^\s*([01]?\d|2[0-3])\s*[:hH.]\s*([0-5]\d)\s*$")
ID = re.compile(r"^[0-9a-f]{8}$")

PHRASES = {
    "en": {"timer": "Time's up: {label}.", "timer_bare": "Time's up!", "reminder": "Reminder: {label}.",
           "reminder_bare": "Reminder!"},
    "pt-BR": {"timer": "Acabou o tempo: {label}.", "timer_bare": "Acabou o tempo!", "reminder": "Lembrete: {label}.",
              "reminder_bare": "Lembrete!"},
}


def timers_file() -> Path:
    return data_dir() / "timers.json"


def clean_label(text) -> str:
    """One line, printable, at most MAX_LABEL characters ("" when nothing is left)."""
    if not isinstance(text, str):
        return ""
    line = " ".join(text.split())
    line = "".join(c for c in line if c.isprintable())
    return line[:MAX_LABEL].strip()


def end_time(minutes=None, at=None, now: datetime | None = None) -> tuple[float, str]:
    """(ends_at, kind) from a number of minutes or a time of day ("15:30", the next one: today or tomorrow).
    ValueError with "when" (neither or both), "minutes" or "at" (out of range or unreadable).
    Without `now`, the local wall clock: "15:30" is 15:30 on that day even across a daylight saving change."""
    now = now or datetime.now()
    if (minutes is None) == (at is None or at == ""):
        raise ValueError("when")
    if minutes is not None:
        if (isinstance(minutes, bool) or not isinstance(minutes, (int, float))
                or not MIN_SECONDS <= minutes * 60 <= MAX_MINUTES * 60):
            raise ValueError("minutes")
        return now.timestamp() + minutes * 60, "timer"
    match = AT.match(at) if isinstance(at, str) else None
    if not match:
        raise ValueError("at")
    target = now.replace(hour=int(match.group(1)), minute=int(match.group(2)), second=0, microsecond=0)
    if target <= now:
        target += timedelta(days=1)
    return target.timestamp(), "reminder"


def phrase(timer: dict, language: str = "en") -> str:
    """What the mascot says when the timer rings, in the configured language."""
    words = PHRASES.get(language, PHRASES["en"])
    kind = "reminder" if timer.get("kind") == "reminder" else "timer"
    label = clean_label(timer.get("label"))
    return words[kind].format(label=label) if label else words[f"{kind}_bare"]


def _valid(timer) -> bool:
    return (isinstance(timer, dict) and isinstance(timer.get("id"), str) and ID.fullmatch(timer["id"]) is not None
            and isinstance(timer.get("ends_at"), (int, float)) and timer.get("kind") in ("timer", "reminder"))


def _parse(data) -> list[dict]:
    found = data.get("timers") if isinstance(data, dict) else None
    timers = [{"id": t["id"], "label": clean_label(t.get("label")), "kind": t["kind"], "ends_at": float(t["ends_at"]),
               "created": float(t["created"]) if isinstance(t.get("created"), (int, float)) else 0.0}
              for t in (found if isinstance(found, list) else []) if _valid(t)]
    return sorted(timers, key=lambda t: t["ends_at"])


def read(path: Path | None = None) -> list[dict]:
    """Every well-formed timer in the file, soonest first (none when the file is missing or damaged)."""
    return _parse(read_json(path or timers_file()))


def for_phone(path: Path | None = None, language: str = "en", clock=time.time) -> dict:
    """GET /api/timers: the running timers and the ones that ended within RING_WINDOW_S, with what to say when they
    ring, and the computer's clock (the phone corrects its own by the difference)."""
    now = clock()
    timers = [{"id": t["id"], "label": t["label"], "kind": t["kind"], "ends_at": t["ends_at"], "say": phrase(t, language)}
              for t in read(path) if t["ends_at"] > now - RING_WINDOW_S]
    return {"now": now, "timers": timers}


class TimerStore:
    """The channel's side: sets, cancels and lists, rewriting the whole file on each change."""

    def __init__(self, path: Path | None = None, clock=time.time):
        self._path = path or timers_file()
        self._clock = clock
        self._lock = threading.Lock()

    def _save(self, timers: list[dict]) -> None:
        now = self._clock()
        kept = [t for t in timers if t["ends_at"] > now - KEEP_ENDED_S]
        write_atomic(self._path, json.dumps({"timers": kept}, ensure_ascii=False))

    def _current(self) -> list[dict]:
        """The timers for a change; store.Unreadable when the file is there but cannot be read."""
        return _parse(read_for_update(self._path))

    def running(self) -> list[dict]:
        now = self._clock()
        return [t for t in read(self._path) if t["ends_at"] > now]

    def add(self, label: str, ends_at: float, kind: str) -> dict:
        """The new timer. ValueError "full" with MAX_TIMERS running, "busy" past MAX_CREATED_PER_HOUR."""
        with self._lock:
            timers = self._current()
            now = self._clock()
            if len([t for t in timers if t["ends_at"] > now]) >= MAX_TIMERS:
                raise ValueError("full")
            if len([t for t in timers if t["created"] > now - 3600]) >= MAX_CREATED_PER_HOUR:
                raise ValueError("busy")
            timer = {"id": secrets.token_hex(4), "label": clean_label(label), "kind": kind, "ends_at": ends_at,
                     "created": now}
            self._save([*timers, timer])
            return timer

    def cancel(self, which: str) -> list[dict]:
        """Cancels the running timers matching `which`: "all", an id, the whole label, or at least MIN_QUERY letters
        of it. Returns the cancelled ones."""
        query = clean_label(which).casefold()
        if not query:
            return []
        with self._lock:
            timers = self._current()
            now = self._clock()

            def matches(t: dict) -> bool:
                label = t["label"].casefold()
                named = query in ("all", t["id"], label) or (len(query) >= MIN_QUERY and query in label)
                return t["ends_at"] > now - RING_WINDOW_S and named     # a ringing one too: "stop the timer"

            gone = [t for t in timers if matches(t)]
            if gone:
                self._save([t for t in timers if not matches(t)])
            return gone

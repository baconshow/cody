"""What Cody remembers about you between voice sessions: your name, how you like things, people and places you
mention. Claude saves a fact with the channel's remember tool and drops it with forget; the first thing you say in
each voice session carries the list back to Claude, as the memory attribute of its <channel> tag (data, never
instructions).

The facts live in memory.json in the data folder (cody/store.py), on your computer only: no account, no server, no
sync. Delete the file to make Cody forget everything.

    {"facts": ["The user's name is Ana.", "Ana likes short answers."]}
"""
from __future__ import annotations

import json
import threading
from pathlib import Path

from cody.store import data_dir, read_for_update, read_json, write_atomic

MAX_FACTS = 40
MAX_FACT = 200
MIN_QUERY = 3                # forget by part of a fact: at least this many letters ("a" would match everything)


def memory_file() -> Path:
    return data_dir() / "memory.json"


def clean_fact(text) -> str:
    """One line, printable, at most MAX_FACT characters ("" when nothing is left). Angle brackets become look-alikes:
    a fact can never close or open a tag in what Claude reads."""
    if not isinstance(text, str):
        return ""
    line = "".join(c for c in " ".join(text.split()) if c.isprintable())
    return line.replace("<", "‹").replace(">", "›")[:MAX_FACT].strip()


class Memory:
    def __init__(self, path: Path | None = None):
        self._path = path or memory_file()
        self._lock = threading.Lock()

    def facts(self) -> list[str]:
        return _parse(read_json(self._path))

    def _current(self) -> list[str]:
        """The facts for a change; store.Unreadable when the file is there but cannot be read."""
        return _parse(read_for_update(self._path))

    def _save(self, facts: list[str]) -> None:
        write_atomic(self._path, json.dumps({"facts": facts}, ensure_ascii=False, indent=1))

    def remember(self, text) -> str:
        """"added", "known" (already there), "empty" or "full"."""
        fact = clean_fact(text)
        if not fact:
            return "empty"
        with self._lock:
            facts = self._current()
            if any(f.casefold() == fact.casefold() for f in facts):
                return "known"
            if len(facts) >= MAX_FACTS:
                return "full"
            self._save([*facts, fact])
            return "added"

    def forget(self, text) -> list[str]:
        """Drops every fact containing `text` (ignoring case, at least MIN_QUERY letters) and returns them."""
        query = clean_fact(text).casefold()
        if len(query) < MIN_QUERY:
            return []
        with self._lock:
            facts = self._current()
            gone = [f for f in facts if query in f.casefold()]
            if gone:
                self._save([f for f in facts if f not in gone])
            return gone

    def summary(self) -> str | None:
        """The saved facts on one line, separated by " | ", for the memory attribute of the first utterance (double
        quotes become single ones: an attribute value); None when there are none."""
        facts = self.facts()
        return " | ".join(f.replace('"', "'").replace("|", "/") for f in facts) if facts else None


def _parse(data) -> list[str]:
    found = data.get("facts") if isinstance(data, dict) else None
    facts = [clean_fact(f) for f in (found if isinstance(found, list) else [])]
    return [f for f in facts if f][:MAX_FACTS]

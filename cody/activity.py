"""What Claude Code is doing right now, read from its session transcripts.

Claude Code appends one JSON line per message to its transcripts:
  <claude dir>/projects/<project>/<session>.jsonl                      main session
  <claude dir>/projects/<project>/<session>/subagents/**/agent-<id>.jsonl   subagent
Every 2 s this module reads only what was appended since the last scan and keeps:
  - tool events {seq, tool, code}: the tool name and whether it edited a source file. Never the command, the file
    path or any text of the conversation: nothing else leaves this module.
  - the last activity of each session and its subagents (the mascot hops when a subagent finishes).
A transcript seen for the first time is read from its end: the mascot reacts to what happens while it is open.
A bad line never stops the scan.
"""
from __future__ import annotations

import glob
import json
import logging
import os
import re
import threading
import time
from collections import deque
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

LOG = logging.getLogger("cody.activity")
SCAN_INTERVAL_S = 2.0
WINDOW_S = 12 * 3600            # transcripts untouched for longer than this are ignored
MAX_EVENTS = 500
MAX_EVENTS_PER_RESPONSE = 300
INITIAL_EVENTS = 60
MAX_READ = 8 * 1024 * 1024      # per file per scan
MAX_PARTIAL = 4 * 1024 * 1024   # an unfinished last line longer than this is dropped
MAX_SESSIONS = 20
MAX_AGENTS_PER_SESSION = 30
AGENT_ACTIVE_S = 90

EDIT_TOOLS = {"Edit": "file_path", "Write": "file_path", "MultiEdit": "file_path", "NotebookEdit": "notebook_path"}
CODE_EXTENSIONS = frozenset({
    "js", "mjs", "cjs", "jsx", "ts", "tsx", "py", "pyw", "css", "scss", "html", "htm", "json", "jsonc", "sql",
    "ps1", "psm1", "sh", "bash", "bat", "cmd", "c", "h", "cpp", "hpp", "cs", "java", "kt", "go", "rs", "rb", "php",
    "lua", "swift", "vue", "svelte", "yaml", "yml", "toml", "xml", "ipynb",
})
_RE_TS = re.compile(r'"timestamp"\s*:\s*"([^"]{10,40})"')


def claude_dir() -> Path:
    """Claude Code's config folder: $CLAUDE_CONFIG_DIR, or ~/.claude."""
    return Path(os.environ.get("CLAUDE_CONFIG_DIR") or Path.home() / ".claude")


def is_code_edit(tool: str, tool_input) -> bool:
    """True for Edit/Write/MultiEdit/NotebookEdit on a source file (not .md, .txt, spreadsheets...)."""
    key = EDIT_TOOLS.get(tool)
    if not key or not isinstance(tool_input, dict):
        return False
    name = re.split(r"[\\/]", str(tool_input.get(key) or ""))[-1]
    dot = name.rfind(".")
    return dot > 0 and name[dot + 1:].casefold() in CODE_EXTENSIONS


def parse_ts(text) -> float | None:
    """ISO 8601 timestamp (with Z or an offset) -> epoch seconds; None if invalid."""
    if not isinstance(text, str) or len(text) < 10:
        return None
    try:
        value = datetime.fromisoformat(text.replace("Z", "+00:00"))
    except ValueError:
        return None
    return value.timestamp() if value.tzinfo else None


def tool_events(line: str) -> list[dict]:
    """[{"tool", "code"}] for each tool_use block of an assistant line; [] for any other line."""
    if '"tool_use"' not in line or '"assistant"' not in line:
        return []
    data = json.loads(line)
    if not isinstance(data, dict) or data.get("type") != "assistant":
        return []
    content = (data.get("message") or {}).get("content")
    if not isinstance(content, list):
        return []
    events = []
    for block in content:
        if isinstance(block, dict) and block.get("type") == "tool_use":
            tool = str(block.get("name") or "?")[:80]
            events.append({"tool": tool, "code": is_code_edit(tool, block.get("input"))})
    return events


def _iso(epoch: float) -> str:
    return datetime.fromtimestamp(epoch).astimezone().isoformat(timespec="seconds")


@dataclass
class _Transcript:
    session: str
    agent: str | None
    offset: int = 0
    partial: bytes = b""


class ActivityMonitor:
    def __init__(self, projects_dir: Path | None = None, clock=time.time):
        self.projects_dir = Path(projects_dir) if projects_dir else claude_dir() / "projects"
        self._clock = clock
        self._lock = threading.Lock()
        self._files: dict[str, _Transcript] = {}
        self._events: deque = deque(maxlen=MAX_EVENTS)
        self._seq = 0
        self._sessions: dict[str, float] = {}               # session id -> last activity (epoch)
        self._agents: dict[tuple[str, str], float] = {}     # (session, agent) -> last activity
        self._stop = threading.Event()
        self._errors = 0

    # ---- loop ------------------------------------------------------------
    def start(self) -> None:
        threading.Thread(target=self._loop, name="cody-activity", daemon=True).start()

    def stop(self) -> None:
        self._stop.set()

    def _loop(self) -> None:
        while not self._stop.is_set():
            try:
                self.scan()
            except Exception:  # noqa: BLE001 - the thread must not die
                self._error("scan failed")
            self._stop.wait(SCAN_INTERVAL_S)

    def _error(self, message: str) -> None:
        self._errors += 1
        if self._errors == 1 or self._errors % 100 == 0:
            LOG.warning("%s (%d errors so far)", message, self._errors)

    # ---- reading ---------------------------------------------------------
    def _transcripts(self):
        base = str(self.projects_dir)
        for pattern in (os.path.join(base, "*", "*.jsonl"),
                        os.path.join(base, "*", "*", "subagents", "**", "agent-*.jsonl")):
            yield from glob.glob(pattern, recursive=True)

    def scan(self) -> None:
        since = self._clock() - WINDOW_S
        for found in self._transcripts():
            try:
                info = os.stat(found)
                if info.st_mtime >= since:
                    self._read(Path(found), info.st_size, info.st_mtime)
            except OSError:
                self._error("unreadable transcript")

    def _new_transcript(self, path: Path, size: int, mtime: float) -> _Transcript:
        parts = path.relative_to(self.projects_dir).parts
        if len(parts) == 2:
            transcript = _Transcript(session=path.stem, agent=None, offset=size)
        else:
            agent = path.stem[len("agent-"):] if path.stem.startswith("agent-") else path.stem
            transcript = _Transcript(session=parts[1], agent=agent, offset=size)
        self._touch(transcript, mtime)
        return transcript

    def _read(self, path: Path, size: int, mtime: float) -> None:
        key = str(path)
        with self._lock:
            transcript = self._files.get(key)
            if transcript is None:
                self._files[key] = self._new_transcript(path, size, mtime)
                return
        if size < transcript.offset:                     # rewritten from scratch
            transcript.offset, transcript.partial = 0, b""
        if size == transcript.offset:
            return
        with open(path, "rb") as file:
            file.seek(transcript.offset)
            data = file.read(min(size - transcript.offset, MAX_READ))
        transcript.offset += len(data)
        lines = (transcript.partial + data).split(b"\n")
        transcript.partial = lines.pop()
        if len(transcript.partial) > MAX_PARTIAL:
            transcript.partial = b""
        for raw in lines:
            try:
                self._line(transcript, raw)
            except Exception:  # noqa: BLE001 - a bad line is skipped
                self._error("invalid transcript line")

    def _line(self, transcript: _Transcript, raw: bytes) -> None:
        if not raw.strip():
            return
        line = raw.decode("utf-8", errors="replace")
        match = _RE_TS.search(line)
        ts = parse_ts(match.group(1)) if match else None
        if ts is None:
            return
        events = tool_events(line)
        with self._lock:
            self._touch(transcript, ts)
            for event in events:
                self._seq += 1
                self._events.append({"seq": self._seq, **event})

    def _touch(self, transcript: _Transcript, when: float) -> None:
        """Last sign of life of the transcript's session and agent (called with the lock held)."""
        self._sessions[transcript.session] = max(self._sessions.get(transcript.session, 0.0), when)
        if transcript.agent:
            key = (transcript.session, transcript.agent)
            self._agents[key] = max(self._agents.get(key, 0.0), when)

    # ---- queries ---------------------------------------------------------
    def state(self, cursor: int) -> dict:
        """GET /api/activity: the events after `cursor` and the recent sessions with their subagents."""
        now = self._clock()
        with self._lock:
            if 0 < cursor <= self._seq:
                events = [e for e in self._events if e["seq"] > cursor][-MAX_EVENTS_PER_RESPONSE:]
            else:                    # first call (or the server restarted): the latest few, the client decides
                events = list(self._events)[-INITIAL_EVENTS:]
            recent = sorted(((last, sid) for sid, last in self._sessions.items() if now - last < WINDOW_S),
                            reverse=True)[:MAX_SESSIONS]
            sessions = []
            for last, sid in recent:
                agents = sorted(((t, aid) for (s, aid), t in self._agents.items()
                                 if s == sid and now - t < WINDOW_S), reverse=True)[:MAX_AGENTS_PER_SESSION]
                sessions.append({"id": sid, "last_ts": _iso(last),
                                 "agents": [{"id": aid, "active": now - t < AGENT_ACTIVE_S} for t, aid in agents]})
            return {"cursor": self._seq, "events": events, "sessions": sessions}

    def last_signal(self) -> float:
        """Epoch of the latest sign of life of any session (0 if none)."""
        with self._lock:
            return max(self._sessions.values(), default=0.0)

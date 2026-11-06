"""Voice: the bridge between the server's /api/voice routes and the voice channel (cody/channel.py), which turns
what you said into a message in a Claude Code session and keeps the short reply the mascot speaks.

The channel writes its port and secret to channel.json while its session is open; without the file the channel is
closed and POST /api/voice answers 503. Talking to the channel happens on 127.0.0.1 only, never through a proxy.

Optional ElevenLabs voice: the API key comes from the ELEVENLABS_API_KEY environment variable or the file
~/.elevenlabs-key. It is read when a reply is spoken and never logged nor returned. Audio stays in memory only.
"""
from __future__ import annotations

import json
import os
import re
import threading
import time
import urllib.error
import urllib.request
from collections import OrderedDict, deque
from pathlib import Path

from cody import hooks, timers
from cody.channel import channel_file

MAX_TEXT = 500
MAX_IMAGE_BYTES = 40 * 1024 * 1024
TIMEOUT_S = 3
_NO_PROXY = urllib.request.build_opener(urllib.request.ProxyHandler({}))
KEY_FILE = Path.home() / ".elevenlabs-key"
ELEVEN_URL = "https://api.elevenlabs.io/v1/text-to-speech/{voice}?output_format=mp3_44100_128"
ELEVEN_TIMEOUT_S = 30
ELEVEN_LANGUAGE = {"en": "en", "pt-BR": "pt"}
MAX_AUDIOS = 50                                  # as many as the channel keeps; in memory only, never on disk
MAX_SYNTHESES_PER_MINUTE = 20                    # a leaked token can not drain your ElevenLabs credits
MAX_SYNTHESES_PER_DAY = 300                      # nor can a loop that keeps setting timers
_audios: OrderedDict = OrderedDict()
_lock = threading.Lock()
_in_flight: dict = {}                            # key -> Lock: the same reply asked twice is synthesized once
_recent: deque = deque()                         # monotonic times of the syntheses of the last minute
_today: deque = deque()                          # and of the last 24 hours


class VoiceError(Exception):
    def __init__(self, status: int, message: str):
        super().__init__(message)
        self.status = status
        self.message = message


def _channel(path: Path | None = None) -> tuple[int, str] | None:
    try:
        data = json.loads((path or channel_file()).read_text(encoding="utf-8"))
        return int(data["port"]), str(data["secret"])
    except (OSError, ValueError, KeyError, TypeError):
        return None


def _ask(channel: tuple[int, str], method: str, route: str, body: dict | None = None) -> dict:
    port, secret = channel
    request = urllib.request.Request(
        f"http://127.0.0.1:{port}{route}", method=method,
        data=None if body is None else json.dumps(body, ensure_ascii=False).encode("utf-8"),
        headers={"X-Channel-Secret": secret, "Content-Type": "application/json"},
    )
    try:
        with _NO_PROXY.open(request, timeout=TIMEOUT_S) as response:
            return json.loads(response.read() or b"{}")
    except (urllib.error.URLError, OSError, ValueError) as error:
        raise VoiceError(503, "the voice channel did not answer") from error


def validate_text(text) -> str:
    if not isinstance(text, str):
        raise VoiceError(400, "missing text")
    cleaned = "".join(c for c in text if c.isprintable() or c == " ").strip()
    if not cleaned:
        raise VoiceError(400, "empty text")
    return cleaned[:MAX_TEXT]


def say(body: dict, path: Path | None = None) -> dict:
    """POST /api/voice {"text"} -> {"request_id"}: what you said becomes a message in the channel's session."""
    text = validate_text((body or {}).get("text"))
    channel = _channel(path)
    if channel is None:
        raise VoiceError(503, "the voice channel is not open")
    return {"request_id": str(_ask(channel, "POST", "/message", {"text": text}).get("request_id", ""))}


def replies(after: str, path: Path | None = None) -> dict:
    """GET /api/voice/replies?after=N -> {"channel": bool, "session", "replies": [{"seq", "request_id", "text",
    "show", ...}]}. session changes when the voice session restarts (and its reply count starts over)."""
    try:
        n = max(0, int(after or 0))
    except ValueError:
        n = 0
    channel = _channel(path)
    if channel is None:
        return {"channel": False, "session": None, "replies": []}
    try:
        answer = _ask(channel, "GET", f"/replies?after={n}")
    except VoiceError:
        return {"channel": False, "session": None, "replies": []}
    session = answer.get("session") if isinstance(answer.get("session"), str) else None
    found = answer.get("replies") or []
    return {"channel": True, "session": session, "replies": [r for r in found if isinstance(r, dict)]}


def image(image_id: str, path: Path | None = None) -> bytes:
    """GET /api/voice/image?id=X -> the PNG of a screenshot the channel took for the phone."""
    if not isinstance(image_id, str) or not re.fullmatch(r"[A-Za-z0-9_-]{1,64}", image_id):
        raise VoiceError(400, "invalid image id")
    channel = _channel(path)
    if channel is None:
        raise VoiceError(503, "the voice channel is not open")
    port, secret = channel
    request = urllib.request.Request(f"http://127.0.0.1:{port}/image?id={image_id}",
                                     headers={"X-Channel-Secret": secret})
    try:
        with _NO_PROXY.open(request, timeout=TIMEOUT_S) as response:
            data = response.read(MAX_IMAGE_BYTES + 1)
    except urllib.error.HTTPError as error:
        raise VoiceError(404, "no such image") from error
    except (urllib.error.URLError, OSError) as error:
        raise VoiceError(503, "the voice channel did not answer") from error
    if len(data) > MAX_IMAGE_BYTES or not data.startswith(b"\x89PNG"):
        raise VoiceError(502, "unexpected image from the channel")
    return data


def saved_key_file() -> Path:
    """Where the Settings screen keeps the key: the data folder, readable only by you."""
    from cody.store import data_dir
    return data_dir() / "elevenlabs.key"


def _api_key() -> str | None:
    key = os.environ.get("ELEVENLABS_API_KEY", "").strip()
    if key:
        return key
    for path in (saved_key_file(), KEY_FILE):
        try:
            found = path.read_text(encoding="utf-8").strip()
        except OSError:
            continue
        if found:
            return found
    return None


def _eleven(text: str, voice: dict, language: str) -> bytes:
    """The mp3 of the reply in the configured ElevenLabs voice."""
    key = _api_key()
    if not key:
        raise VoiceError(503, "no ElevenLabs API key on this computer")
    body = {"text": text, "model_id": voice["model"], "language_code": ELEVEN_LANGUAGE.get(language, "en")}
    request = urllib.request.Request(ELEVEN_URL.format(voice=voice["voice_id"]), method="POST",
                                     data=json.dumps(body, ensure_ascii=False).encode("utf-8"),
                                     headers={"xi-api-key": key, "Content-Type": "application/json",
                                              "Accept": "audio/mpeg"})
    try:
        with urllib.request.urlopen(request, timeout=ELEVEN_TIMEOUT_S) as response:
            audio = response.read()
    except urllib.error.HTTPError as error:
        reason = eleven_reason(error.code, _error_body(error))
        _note(reason)
        raise VoiceError(502, f"ElevenLabs: {reason}") from error
    except (urllib.error.URLError, OSError) as error:
        raise VoiceError(502, "ElevenLabs did not answer") from error
    _note(None)
    return audio


ELEVEN_REASONS = {
    "payment_required": "payment pending", "payment_issue": "payment pending",
    "quota_exceeded": "monthly characters used up",
    "invalid_api_key": "the key is not valid", "missing_permissions": "the key lacks text-to-speech permission",
    "voice_not_found": "the voice id does not exist", "too_many_concurrent_requests": "too many requests at once",
    "system_busy": "ElevenLabs is busy",
}
ELEVEN_BY_STATUS = {401: "the key is not valid", 402: "payment pending", 404: "the voice id does not exist",
                    429: "too many requests"}


def _error_body(error) -> dict:
    try:
        data = json.loads(error.read(4096) or b"{}")
    except (OSError, ValueError):
        return {}
    return data if isinstance(data, dict) else {}


def eleven_reason(status: int, body: dict) -> str:
    """ElevenLabs' error in plain words: its detail.status when it is a known one, else by HTTP status."""
    detail = body.get("detail")
    code = (detail.get("status") or detail.get("code")) if isinstance(detail, dict) else None
    return ELEVEN_REASONS.get(str(code), ELEVEN_BY_STATUS.get(status, f"error {status}"))


def _note(reason: str | None) -> None:
    from cody import doctor
    try:
        doctor.note_voice_error(reason)
    except OSError:
        pass


def audio(seq_raw: str, voice: dict | None, language: str = "en", path: Path | None = None,
          synthesize=_eleven) -> bytes:
    """GET /api/voice/audio?seq=N -> the mp3 of reply N (404 without a configured voice: the phone uses its own).
    Each reply is synthesized once and kept in memory."""
    try:
        seq = int(seq_raw)
    except (TypeError, ValueError) as error:
        raise VoiceError(400, "invalid seq") from error
    if voice is None:
        raise VoiceError(404, "no voice configured")
    reply = next((r for r in replies(str(seq - 1), path)["replies"] if r.get("seq") == seq), None)
    if reply is None or not reply.get("text"):
        raise VoiceError(404, "reply not found")
    return _spoken(str(reply["text"]), voice, language, synthesize)


def alert_text(key: str, language: str = "en", timers_path: Path | None = None) -> str | None:
    """What the mascot says for an alert key: "done", "needs_you" (cody/hooks.py) or "timer:<id>" of a timer that is
    running or just rang (cody/timers.py). The phone only names the alert: the words are always made here."""
    if key in hooks.PHRASES["en"]:
        return hooks.phrase(key, language)
    if isinstance(key, str) and key.startswith("timer:") and timers.ID.fullmatch(key[6:]):
        found = next((t for t in timers.for_phone(timers_path, language)["timers"] if t["id"] == key[6:]), None)
        return found["say"] if found else None
    return None


def alert_audio(key: str, voice: dict | None, language: str = "en", timers_path: Path | None = None,
                synthesize=_eleven) -> bytes:
    """GET /api/voice/alert?key=K -> the mp3 of a timer ringing or a heads-up (404 without a configured voice)."""
    if voice is None:
        raise VoiceError(404, "no voice configured")
    text = alert_text(key, language, timers_path)
    if text is None:
        raise VoiceError(404, "unknown alert")
    return _spoken(text, voice, language, synthesize)


def _spoken(text: str, voice: dict, language: str, synthesize) -> bytes:
    """The mp3 of the text in the voice, synthesized once and kept in memory."""
    # keyed by text and voice, not by seq: a new channel session starts counting from 1 again
    key = (text, voice["voice_id"], voice["model"], language)
    with _lock:
        if key in _audios:
            return _audios[key]
        gate = _in_flight.setdefault(key, threading.Lock())
    with gate:
        with _lock:
            if key in _audios:                   # synthesized while this request waited
                return _audios[key]
            _take_synthesis_slot()
        try:
            data = synthesize(key[0], voice, language)
        finally:
            with _lock:
                _in_flight.pop(key, None)
        with _lock:
            _audios[key] = data
            while len(_audios) > MAX_AUDIOS:
                _audios.popitem(last=False)
    return data


def _take_synthesis_slot(clock=time.monotonic) -> None:
    """Counts one synthesis against the per-minute cap (called with _lock held); 429 when the cap is reached."""
    now = clock()
    while _recent and now - _recent[0] > 60:
        _recent.popleft()
    while _today and now - _today[0] > 24 * 3600:
        _today.popleft()
    if len(_recent) >= MAX_SYNTHESES_PER_MINUTE:
        raise VoiceError(429, "too many spoken replies this minute")
    if len(_today) >= MAX_SYNTHESES_PER_DAY:
        raise VoiceError(429, "too many spoken replies today: the phone uses its own voice until tomorrow")
    _recent.append(now)
    _today.append(now)

"""The Settings screen's side on the computer: what it shows (GET /api/settings) and what it may change (POST, from
the computer itself only). Changes go to config.json (cody/config.py), the ElevenLabs key to its own private file.

Never returned: the key itself (only whether there is one).
"""
from __future__ import annotations

import base64
import hashlib
import json
import re
import sys
import time
from pathlib import Path

from cody import autostart, hooks, voice
from cody.config import LANGUAGES, PROVIDERS, VALID_MODEL, VALID_VOICE, config_file, load_config
from cody.store import Unreadable, data_dir, read_for_update, read_json, write_atomic, write_private

VALID_KEY = re.compile(r"^[A-Za-z0-9_\-]{20,128}$")
FIRST_RUN_FILE = "first-run.json"
TAILSCALE_APP = "https://tailscale.com/download"
TEST_TEXT = {"en": "Hi! I'm Cody. Can you hear me?", "pt-BR": "Oi! Eu sou o Cody. Está me ouvindo?"}
VOICES_TTL_S = 60                                 # the screen asks for the list on every redraw: ElevenLabs is asked once
_voices = {"key": None, "at": 0.0, "answer": None}   # the last good list and (a digest of) the key it was asked with


class SettingsError(ValueError):
    pass


def phone_url(config: dict) -> str | None:
    hosts = config.get("extra_hosts") or []
    return f"https://{hosts[0]}/" if hosts else None


def first_run_done(folder: Path | None = None) -> bool:
    data = read_json((folder or data_dir()) / FIRST_RUN_FILE)
    return isinstance(data, dict) and data.get("done") is True


def public(config: dict, settings_path: Path | None = None) -> dict:
    """What the Settings screen shows. Never the key."""
    plugin = hooks.plugin_enabled(settings_path)
    from cody import setup
    return {
        "language": config["language"], "voice_provider": config["voice_provider"],
        "voice_id": (config.get("voice") or {}).get("voice_id", ""), "has_key": voice._api_key() is not None,
        "update_check": config["update_check"], "voice_folder": config.get("voice_folder") or "",
        "music": config.get("music", True) if sys.platform == "win32" else None,
        "autostart": autostart.enabled() if sys.platform == "win32" else None,
        "hooks": {"on": plugin or setup.hooks_installed(settings_path), "plugin": plugin},
        "phone_url": phone_url(config), "first_run_done": first_run_done(),
    }


def _raw(path: Path) -> dict:
    """config.json as it is; refuses (instead of starting over) when it exists but cannot be read."""
    try:
        data = read_for_update(path)
    except Unreadable as error:
        raise SettingsError("config.json could not be read (a typo in it?): fix it first, nothing was changed") from error
    if data is None:
        return {}
    if not isinstance(data, dict):
        raise SettingsError("config.json is not a JSON object: fix it first, nothing was changed")
    return data


def save(updates: dict, path: Path | None = None) -> dict:
    """Checks and writes the changed keys into config.json (other keys stay as they are). Returns the new config."""
    path = path or config_file()
    data = _raw(path)
    if "language" in updates:
        if updates["language"] not in LANGUAGES:
            raise SettingsError("unknown language")
        data["language"] = updates["language"]
    if "voice_provider" in updates:
        if updates["voice_provider"] not in PROVIDERS:
            raise SettingsError("unknown voice provider")
        data["voice_provider"] = updates["voice_provider"]
    if "voice_id" in updates:
        voice_id = str(updates["voice_id"] or "").strip()
        if voice_id and not VALID_VOICE.match(voice_id):
            raise SettingsError("that is not an ElevenLabs voice id")
        model = (data.get("voice") or {}).get("model") if isinstance(data.get("voice"), dict) else None
        data["voice"] = {"voice_id": voice_id, "model": model if model and VALID_MODEL.match(model)
                         else "eleven_flash_v2_5"} if voice_id else None
    if "update_check" in updates:
        data["update_check"] = updates["update_check"] is True
    if "music" in updates:
        data["music"] = updates["music"] is not False
    if "voice_folder" in updates:
        folder = str(updates["voice_folder"] or "").strip()
        if folder and not Path(folder).expanduser().is_dir():
            raise SettingsError("that folder does not exist")
        data["voice_folder"] = str(Path(folder).expanduser().resolve()) if folder else None
    write_atomic(path, json.dumps(data, indent=2, ensure_ascii=False) + "\n")
    return load_config(path)


def apply_switches(updates: dict) -> list[str]:
    """The settings that are not in config.json: starting with Windows and the hooks. Returns what happened."""
    notes = []
    if "autostart" in updates and sys.platform == "win32":
        autostart.set_enabled(updates["autostart"] is True)
    if "hooks" in updates:
        notes.append(hooks.install(remove=updates["hooks"] is not True))
    if updates.get("first_run_done") is True:
        write_private(data_dir() / FIRST_RUN_FILE, json.dumps({"done": True}))
    return notes


def set_key(key: str) -> bool:
    """Saves the ElevenLabs key on this computer only ("" removes it). Returns whether a key is there now."""
    key = (key or "").strip()
    forget_voices()                                   # another key, another account: its voices are asked again
    path = voice.saved_key_file()
    if not key:
        path.unlink(missing_ok=True)
    elif not VALID_KEY.match(key):
        raise SettingsError("that does not look like an ElevenLabs key")
    else:
        write_private(path, key)
    return voice._api_key() is not None


def forget_voices() -> None:
    _voices.update(key=None, answer=None)


def voices(clock=time.monotonic) -> dict:
    """The ElevenLabs voices to choose from: {"ok": True, "voices": [...]}, or {"ok": False, "reason": ...} when the
    key cannot list them (the screen then takes a voice id typed by hand). A good list is kept for a minute, for
    the key it was asked with; a failure is asked again next time."""
    key = voice._api_key()
    mark = hashlib.sha256(key.encode("utf-8")).hexdigest() if key else None
    if mark and _voices["key"] == mark and clock() - _voices["at"] < VOICES_TTL_S:
        return _voices["answer"]
    try:
        answer = {"ok": True, "voices": voice.eleven_voices()}
    except voice.VoiceError as error:
        return {"ok": False, "reason": error.message.removeprefix("ElevenLabs: "), "voices": []}
    _voices.update(key=mark, at=clock(), answer=answer)
    return answer


def test_voice(config: dict, voice_id: str = "") -> dict:
    """Speaks one short sentence with ElevenLabs, in `voice_id` (one being tried in Settings) or else the saved
    voice: {"ok": True, "audio": <the mp3, base64>} for the screen to play, or {"ok": False, "reason": ...}."""
    voice_id = str(voice_id or "").strip()
    if voice_id and not VALID_VOICE.match(voice_id):
        raise SettingsError("that is not an ElevenLabs voice id")
    saved = config.get("voice")
    if not voice_id and not saved:
        return {"ok": False, "reason": "no voice chosen yet"}
    chosen = {"voice_id": voice_id, "model": (saved or {}).get("model") or "eleven_flash_v2_5"} if voice_id else saved
    try:
        with voice._lock:                             # the same per-minute and per-day limits as spoken replies
            voice._take_synthesis_slot()
        audio = voice._eleven(TEST_TEXT.get(config["language"], TEST_TEXT["en"]), chosen, config["language"])
    except voice.VoiceError as error:
        return {"ok": False, "reason": error.message.removeprefix("ElevenLabs: ")}
    return {"ok": True, "audio": base64.b64encode(audio).decode("ascii")}

"""Settings from config.json at the repo root. Every key is optional; a missing or invalid value falls back to the default.

    {
      "port": 7420,
      "extra_hosts": ["my-pc.tailnet-name.ts.net"],
      "allowed_logins": ["you@example.com"],
      "language": "en",
      "voice": {"voice_id": "<ElevenLabs voice id>", "model": "eleven_flash_v2_5"}
    }

extra_hosts: host names allowed in the Host header besides 127.0.0.1/localhost (your Tailscale serve name, so the
phone can open the mascot). allowed_logins: optional; when set, requests through Tailscale serve must come from one
of these Tailscale logins (other people and tagged devices in your tailnet are refused). language: "en" or "pt-BR",
for the spoken replies and the wake word. voice: optional ElevenLabs voice; without it the phone speaks with its own
built-in voice.
"""
from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_PORT = 7420
DEFAULT_MODEL = "eleven_flash_v2_5"    # the fastest ElevenLabs model: a short reply comes back in under a second
LANGUAGES = ("en", "pt-BR")
VALID_HOST = re.compile(r"^[A-Za-z0-9](?:[A-Za-z0-9.-]{0,251}[A-Za-z0-9])?(?::\d{1,5})?$")
VALID_LOGIN = re.compile(r"^[^\s,;]{1,254}$")
VALID_VOICE = re.compile(r"^[A-Za-z0-9]{10,40}$")
VALID_MODEL = re.compile(r"^[a-z0-9_]{3,40}$")


def _port(value) -> int:
    return value if isinstance(value, int) and not isinstance(value, bool) and 1024 <= value <= 65535 else DEFAULT_PORT


def _hosts(value) -> list[str]:
    if not isinstance(value, list):
        return []
    return [h.strip().casefold() for h in value if isinstance(h, str) and VALID_HOST.match(h.strip())]


def _voice(value) -> dict | None:
    """{"voice_id", "model"} for ElevenLabs, or None (missing or invalid: the phone uses its own voice)."""
    if not isinstance(value, dict):
        return None
    voice_id, model = value.get("voice_id"), value.get("model") or DEFAULT_MODEL
    if not (isinstance(voice_id, str) and VALID_VOICE.match(voice_id)
            and isinstance(model, str) and VALID_MODEL.match(model)):
        return None
    return {"voice_id": voice_id, "model": model}


def load_config(path: Path = ROOT / "config.json") -> dict:
    try:
        data = json.loads(Path(path).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        data = {}
    if not isinstance(data, dict):
        data = {}
    language = data.get("language")
    logins = data.get("allowed_logins")
    return {
        "port": _port(data.get("port")),
        "extra_hosts": _hosts(data.get("extra_hosts")),
        "allowed_logins": [x.strip().casefold() for x in logins if isinstance(x, str) and VALID_LOGIN.match(x.strip())]
                          if isinstance(logins, list) else [],
        "language": language if language in LANGUAGES else "en",
        "voice": _voice(data.get("voice")),
    }

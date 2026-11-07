"""The opt-in update check (Settings > "Tell me when there is a new version", off by default): at most once a day,
the computer asks GitHub for the number of Cody's latest release and compares it with this one. Nothing about you
is sent: it is a plain request for public data (GitHub sees the computer's address, as with any page). Off, nothing
is ever asked.
"""
from __future__ import annotations

import json
import re
import time
import urllib.error
import urllib.request
from pathlib import Path

from cody import __version__
from cody.store import data_dir, read_json, write_private

LATEST_URL = "https://api.github.com/repos/baconshow/cody/releases/latest"
RELEASES_PAGE = "https://github.com/baconshow/cody/releases/latest"
CHECK_EVERY_S = 24 * 3600
TIMEOUT_S = 5
VERSION = re.compile(r"^v?(\d+)\.(\d+)\.(\d+)$")


def parse(text) -> tuple[int, int, int] | None:
    match = VERSION.match(str(text or "").strip())
    return tuple(int(n) for n in match.groups()) if match else None


def newer(latest, current: str = __version__) -> bool:
    a, b = parse(latest), parse(current)
    return bool(a and b and a > b)


def _fetch(opener=urllib.request.urlopen) -> str | None:
    request = urllib.request.Request(LATEST_URL, headers={"Accept": "application/vnd.github+json",
                                                          "User-Agent": "cody-update-check"})
    try:
        with opener(request, timeout=TIMEOUT_S) as response:
            data = json.loads(response.read(64 * 1024))
    except (urllib.error.URLError, OSError, ValueError):
        return None
    tag = data.get("tag_name") if isinstance(data, dict) else None
    return tag if parse(tag) else None


def status(enabled: bool, folder: Path | None = None, clock=time.time, fetch=_fetch) -> dict:
    """{"version", "latest", "update", "url"}; asks GitHub only when enabled and the last answer is a day old."""
    result = {"version": __version__, "latest": None, "update": False, "url": RELEASES_PAGE}
    if not enabled:
        return result
    path = (folder or data_dir()) / "update.json"
    cached = read_json(path)
    if isinstance(cached, dict) and clock() - float(cached.get("t") or 0) < CHECK_EVERY_S:
        latest = cached.get("latest")
    else:
        latest = fetch()
        try:
            write_private(path, json.dumps({"t": round(clock()), "latest": latest}))
        except OSError:
            pass
    result.update(latest=latest, update=newer(latest))
    return result

"""Pictures sent from the phone (the clip on the mascot page): kept in Cody's data folder, on this computer, so the
voice session can open them by their path. The reverse of the quick screenshot: there the computer hands the phone
a picture, here the phone hands the computer one.

Only real pictures are kept (PNG, JPEG, WebP or GIF, told by their first bytes, not by what the page says), up to
MAX_BYTES each; the folder keeps the latest KEEP of them, Cody's own files, nothing else is ever touched.

    save(data, folder=None) -> Path      the picture's file, named by the time it arrived
    kind(data) -> "png" | "jpg" | "webp" | "gif" | None
"""
from __future__ import annotations

import secrets
import time
from pathlib import Path

from cody.store import data_dir

MAX_BYTES = 12 * 1024 * 1024
KEEP = 50
FOLDER = "uploads"


class UploadError(ValueError):
    def __init__(self, status: int, message: str):
        super().__init__(message)
        self.status = status
        self.message = message


def kind(data: bytes) -> str | None:
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "png"
    if data.startswith(b"\xff\xd8\xff"):
        return "jpg"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "webp"
    if data[:6] in (b"GIF87a", b"GIF89a"):
        return "gif"
    return None


def folder() -> Path:
    return data_dir() / FOLDER


def save(data: bytes, where: Path | None = None, clock=time.time) -> Path:
    """Keeps the picture and returns where; refuses anything that is not a picture or is too big."""
    if not data:
        raise UploadError(400, "no picture")
    if len(data) > MAX_BYTES:
        raise UploadError(413, "picture too large")
    ext = kind(data)
    if ext is None:
        raise UploadError(415, "not a PNG, JPEG, WebP or GIF picture")
    place = where or folder()
    place.mkdir(parents=True, exist_ok=True)
    stamp = time.strftime("%Y%m%d-%H%M%S", time.localtime(clock()))
    path = place / f"{stamp}-{secrets.token_hex(3)}.{ext}"
    path.write_bytes(data)
    _prune(place)
    return path


def _prune(place: Path) -> None:
    """Only the latest KEEP pictures stay (the names sort by time); only files this module wrote are looked at."""
    mine = sorted(p for p in place.iterdir() if p.is_file() and p.suffix.lstrip(".") in ("png", "jpg", "webp", "gif"))
    for old in mine[:-KEEP]:
        try:
            old.unlink()
        except OSError:
            pass

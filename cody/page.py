"""The page and the static files: web/index.html with the session token, its Content-Security-Policy, and web/*.

Each function returns plain data; the server only wraps it in a response. Static files never leave web/.
"""
from __future__ import annotations

import base64
import hashlib
import re
from pathlib import Path

WEB_DIR = Path(__file__).resolve().parent.parent / "web"
TOKEN_MARKER = "{{CODY_TOKEN}}"
WEB_TYPES = {
    ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8", ".png": "image/png", ".svg": "image/svg+xml",
    ".json": "application/json; charset=utf-8",
    ".webmanifest": "application/manifest+json; charset=utf-8",
    ".woff2": "font/woff2",
}
_RE_INLINE_SCRIPT = re.compile(rb"<script(?![^>]*\bsrc=)[^>]*>(.*?)</script>", re.S | re.I)
# everything from here (three.js in web/vendor, the font in web/fonts): the page works offline and only talks to this
# server; the inline importmap is allowed by its hash, see policy()
CSP = (
    "default-src 'none'",
    "style-src 'self'",
    "font-src 'self'",
    "img-src 'self' blob:",       # the screenshot, shown from the bytes fetched with the token
    "connect-src 'self'",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
)


def index_page(token: str) -> bytes | None:
    """web/index.html with the token in place of the marker; None if the file is missing."""
    try:
        text = (WEB_DIR / "index.html").read_text(encoding="utf-8")
    except OSError:
        return None
    return text.replace(TOKEN_MARKER, token).encode("utf-8")


def script_hashes(page: bytes) -> list[str]:
    """The CSP hash of each inline script (the importmap), as the browser sees it: CRLF becomes LF."""
    hashes = []
    for block in _RE_INLINE_SCRIPT.findall(page):
        text = block.replace(b"\r\n", b"\n").replace(b"\r", b"\n")
        hashes.append("'sha256-" + base64.b64encode(hashlib.sha256(text).digest()).decode("ascii") + "'")
    return hashes


def policy(page: bytes) -> str:
    """The Content-Security-Policy header of the page: CSP plus the importmap hash."""
    script = " ".join(["'self'", *script_hashes(page)])
    return "; ".join([CSP[0], f"script-src {script}", *CSP[1:]])


def static_file(relative: str) -> tuple[bytes, str] | None:
    """(bytes, content type) of a file under web/, or None (missing, unknown type, or outside web/)."""
    parts = [p for p in relative.replace("\\", "/").split("/") if p]
    if not parts or any(p in (".", "..") or ":" in p for p in parts):
        return None
    target = WEB_DIR.joinpath(*parts)
    kind = WEB_TYPES.get(target.suffix.casefold())
    try:
        inside = target.resolve().is_relative_to(WEB_DIR.resolve())
    except (OSError, ValueError):
        inside = False
    if not kind or not inside or not target.is_file():
        return None
    try:
        return target.read_bytes(), kind
    except OSError:
        return None

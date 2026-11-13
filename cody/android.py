"""The computer's side of the Android app (android/): what the server answers it beyond the page itself.

The app opens the mascot page in Chrome as a Trusted Web Activity. For Chrome to show it full screen with no
address bar, the site has to vouch for the app: GET /.well-known/assetlinks.json names the app's package and the
SHA-256 of the certificates it may be signed with (the published app's, plus any in `android_fingerprints` in
config.json for a build of your own). Without a match Chrome still opens the page, as a Custom Tab with a thin bar.

GET /app/hello gives the app this run's token (the same one the page carries in its HTML) and the language, so
the app's watch service can read /api/events with the app closed. It is reachable like the page: from this
computer, or through Tailscale serve by an allowed login. The QR code in Settings carries `cody://pair?url=...`,
which the app's pairing screen understands.
"""
from __future__ import annotations

import re
from urllib.parse import quote

from cody import __version__

PACKAGE = "io.github.baconshow.cody"
RELEASE_FINGERPRINTS: tuple[str, ...] = ()     # the Play signing certificate, once the app is published
FINGERPRINT = re.compile(r"^(?:[0-9A-F]{2}:){31}[0-9A-F]{2}\Z")
RELATION = "delegate_permission/common.handle_all_urls"


def clean_fingerprints(value) -> list[str]:
    """The valid SHA-256 fingerprints in a config list, upper-case, in order, without repeats."""
    if not isinstance(value, list):
        return []
    out: list[str] = []
    for item in value:
        if not isinstance(item, str):
            continue
        print_ = item.strip().upper()
        if FINGERPRINT.match(print_) and print_ not in out:
            out.append(print_)
    return out


def fingerprints(config: dict) -> list[str]:
    own = clean_fingerprints(config.get("android_fingerprints"))
    return list(RELEASE_FINGERPRINTS) + [f for f in own if f not in RELEASE_FINGERPRINTS]


def asset_links(config: dict) -> list[dict]:
    """GET /.well-known/assetlinks.json: empty until a certificate is known (then Chrome falls back to a Custom Tab)."""
    prints = fingerprints(config)
    if not prints:
        return []
    return [{"relation": [RELATION],
             "target": {"namespace": "android_app", "package_name": PACKAGE, "sha256_cert_fingerprints": prints}}]


def hello(token: str, config: dict) -> dict:
    return {"app": "cody", "version": __version__, "token": token, "language": config["language"]}


def pair_link(url: str) -> str:
    """cody://pair?url=https%3A%2F%2Fmy-pc.tailnet.ts.net%2F : the QR code the app's camera understands."""
    return f"cody://pair?url={quote(url, safe='')}"

"""Create your private network: takes the user from "no Tailscale" to "Cody opens on my phone", without a terminal.

Only your own devices can see Cody: Tailscale makes a private network of your devices, and Cody shares itself in it
with `tailscale serve` (never Funnel, which would put it on the public internet). The phone needs the Tailscale app
too, signed in to the same account.

Steps, each one checked again after it runs:
    install   Tailscale is missing: winget on Windows (the official package), else the official download page
    login     not signed in: `tailscale login` gives a sign-in link, opened in the browser
    dns       MagicDNS or HTTPS certificates are off: the admin page where they are switched on
    serve     on, but Cody is not shared yet: `tailscale serve --bg --https=<free port> <Cody's port>`
    done      the address for the phone (and a QR code on the screen)
"""
from __future__ import annotations

import json
import re
import shutil
import subprocess
import sys
import time

from cody import setup

DOWNLOAD_URL = "https://tailscale.com/download"
ADMIN_DNS_URL = "https://login.tailscale.com/admin/dns"
LOGIN_URL = re.compile(r"https://login\.tailscale\.com/\S+")
WINGET = ["winget", "install", "--id", "Tailscale.Tailscale", "--exact", "--silent",
          "--accept-package-agreements", "--accept-source-agreements"]
LOGIN_WAIT_S = 20


def _status(run) -> dict | None:
    out = setup.tailscale(["status", "--json"], run)
    if out is None:
        return None
    try:
        data = json.loads(out)
    except ValueError:
        return None
    return data if isinstance(data, dict) else None


def state(port: int, run=subprocess.run, which=shutil.which) -> dict:
    """Where the user stands. Each key is a plain fact the screen can show."""
    installed = which("tailscale") is not None
    status = _status(run) if installed else None
    backend = (status or {}).get("BackendState")
    tailnet = (status or {}).get("CurrentTailnet") or {}
    running = backend == "Running"
    hosts = setup.served(setup.serve_status(run), port) if running else []
    return {
        "installed": installed or status is not None,
        "running": running,
        "logged_in": running or backend in ("Starting", "Stopped"),
        "magicdns": bool(tailnet.get("MagicDNSEnabled")) if running else False,
        "https": bool((status or {}).get("CertDomains")) if running else False,
        "served": hosts,
        "phone_url": f"https://{hosts[0]}/" if hosts else None,
    }


def next_step(facts: dict) -> str:
    if not facts["installed"]:
        return "install"
    if not facts["running"]:
        return "login"
    if facts["served"]:
        return "done"
    if not (facts["magicdns"] and facts["https"]):
        return "dns"
    return "serve"


def install(popen=subprocess.Popen, which=shutil.which, platform=sys.platform) -> dict:
    """Starts the official installer. Returns {"open": url} when the user has to do it in the browser."""
    if platform == "win32" and which("winget"):
        popen(WINGET, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        return {"started": True, "open": None}
    return {"started": False, "open": DOWNLOAD_URL}


def login(popen=subprocess.Popen, clock=time.monotonic) -> dict:
    """Runs `tailscale login` in the background and returns the sign-in link it prints (or None)."""
    try:
        process = popen(["tailscale", "login"], stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
                        stderr=subprocess.STDOUT, text=True)
    except OSError:
        return {"open": None}
    deadline = clock() + LOGIN_WAIT_S
    for line in process.stdout:
        found = LOGIN_URL.search(line)
        if found:
            return {"open": found.group(0)}           # the process keeps waiting for the sign-in, in the background
        if clock() > deadline:
            break
    return {"open": None}


def serve(port: int, run=subprocess.run) -> dict:
    """Shares Cody in the tailnet on a free HTTPS port. Returns {"hosts": [...]} (empty when it did not work)."""
    https = setup.free_https_port(setup.serve_status(run))
    if not https:
        return {"hosts": []}
    if setup.tailscale(["serve", "--bg", f"--https={https}", str(port)], run) is None:
        return {"hosts": []}
    return {"hosts": setup.served(setup.serve_status(run), port)}


def identity_login(run=subprocess.run) -> str | None:
    me = setup.identity(run)
    return me["login"] if me else None

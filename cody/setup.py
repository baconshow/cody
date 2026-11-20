"""Cody sets itself up when it starts, so nothing has to be edited by hand:

  - the phone: when Tailscale runs on this computer and `tailscale serve` already forwards an HTTPS port to Cody,
    that address is allowed, for this computer's own Tailscale login only (unless config.json lists others). When
    nothing forwards to Cody yet, it asks once, in the terminal, and sets it up: inside your tailnet, never Funnel,
    on a free HTTPS port so whatever you already serve stays as it is;
  - the heads-up: it asks once whether to add the Claude Code hooks (cody/hooks.py).
The language comes from the computer when config.json does not say (cody/config.py). A "no" is remembered in
setup.json in the data folder, so it is not asked again; `python cody.py --setup` asks again, `--no-setup` skips all.
"""
from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

from cody import hooks
from cody.store import data_dir, read_json, write_atomic

TIMEOUT_S = 8
HTTPS_PORTS = (443, *range(8443, 8451))
TAGGED = "tagged-devices"         # the "login" of a tagged machine: it says nothing about who holds the phone


def state_file() -> Path:
    return data_dir() / "setup.json"


def tailscale_exe(which=shutil.which, env=os.environ) -> str:
    """tailscale on the PATH, or where the Windows installer puts it (a just-installed copy is not on Cody's PATH)."""
    found = which("tailscale")
    if found:
        return found
    default = Path(env.get("ProgramFiles") or r"C:\Program Files") / "Tailscale" / "tailscale.exe"
    return str(default) if sys.platform == "win32" and default.is_file() else "tailscale"


NO_WINDOW = {"creationflags": getattr(subprocess, "CREATE_NO_WINDOW", 0)} if sys.platform == "win32" else {}


def tailscale(args: list[str], run=subprocess.run) -> str | None:
    """The output of a tailscale command, or None (not installed, not running, refused). No console window."""
    try:
        done = run([tailscale_exe(), *args], capture_output=True, text=True, timeout=TIMEOUT_S, check=False,
                   **NO_WINDOW)
    except (OSError, subprocess.SubprocessError):
        return None
    return done.stdout if done.returncode == 0 else None


def identity(run=subprocess.run) -> dict | None:
    """{"host": "pc.tailnet.ts.net", "login": "you@example.com" | None} while Tailscale is up; otherwise None."""
    try:
        status = json.loads(tailscale(["status", "--json"], run) or "")
        if status.get("BackendState") != "Running":
            return None
        me = status["Self"]
        host = str(me["DNSName"]).rstrip(".").casefold()
        login = str((status.get("User") or {}).get(str(me.get("UserID")), {}).get("LoginName") or "").casefold()
    except (ValueError, KeyError, TypeError, AttributeError):
        return None
    if not host:
        return None
    return {"host": host, "login": login if login and login != TAGGED else None}


def served(serve: dict, port: int) -> list[str]:
    """The Host headers of the HTTPS addresses `tailscale serve` forwards to 127.0.0.1:port, Funnel excluded:
    "pc.tailnet.ts.net" for port 443, "pc.tailnet.ts.net:8443" otherwise."""
    targets = {f"http://127.0.0.1:{port}", f"http://localhost:{port}"}
    funnel = serve.get("AllowFunnel") or {}
    hosts = []
    for address, site in (serve.get("Web") or {}).items():
        proxy = str(((site or {}).get("Handlers") or {}).get("/", {}).get("Proxy") or "").rstrip("/")
        if proxy not in targets or funnel.get(address):
            continue
        name, _, https = address.rpartition(":")
        hosts.append((name if https == "443" else address).casefold())
    return hosts


def free_https_port(serve: dict) -> int | None:
    used = set((serve.get("TCP") or {}).keys())
    return next((p for p in HTTPS_PORTS if str(p) not in used), None)


def serve_status(run=subprocess.run) -> dict:
    try:
        data = json.loads(tailscale(["serve", "status", "--json"], run) or "{}")
    except ValueError:
        return {}
    return data if isinstance(data, dict) else {}


def hooks_installed(path: Path | None = None) -> bool:
    """Cody's hooks are in Claude Code's user settings, or the Cody plugin brings them."""
    if hooks.plugin_enabled(path):
        return True
    settings = read_json(path or hooks.settings_file())
    groups = (settings.get("hooks") or {}).get("Stop") if isinstance(settings, dict) else None
    return isinstance(groups, list) and any(hooks._ours(g) for g in groups)


def prepare(config: dict, ask=None, again: bool = False, run=subprocess.run, state_path: Path | None = None,
            settings_path: Path | None = None) -> tuple[dict, list[str]]:
    """A copy of the config with the phone's Tailscale address and login filled in, and what to tell the user.
    ask: (question) -> bool, to set things up (None when nobody is at the terminal: then nothing is changed)."""
    state_path = state_path or state_file()
    state = read_json(state_path) if not again else None
    declined = set(state.get("declined", [])) if isinstance(state, dict) else set()
    notes: list[str] = []
    config = {**config}
    me = identity(run)
    if me:
        serve = serve_status(run)
        hosts = served(serve, config["port"])
        if not hosts and ask and "tailscale" not in declined:
            https = free_https_port(serve)
            if https and ask("Open Cody on your phone through Tailscale (only your own devices)?"):
                if tailscale(["serve", "--bg", f"--https={https}", str(config["port"])], run) is not None:
                    hosts = served(serve_status(run), config["port"])
                else:
                    notes.append("tailscale serve did not work: see the README, \"Put it on your phone\".")
            elif https:
                declined.add("tailscale")
        config["extra_hosts"] = list(dict.fromkeys([*config["extra_hosts"], *hosts]))
        if hosts and not config["allowed_logins"]:
            if me["login"]:
                config["allowed_logins"] = [me["login"]]
            else:
                notes.append("This computer is a tagged Tailscale device: every device in your tailnet can use Cody. "
                             "List the allowed logins in config.json (allowed_logins).")
    if ask and "hooks" not in declined and not hooks_installed(settings_path):
        if ask("Tell you on the phone when Claude finishes a long task or needs you (adds 3 Claude Code hooks)?"):
            notes.append(hooks.install(path=settings_path))
        else:
            declined.add("hooks")
    if ask:
        write_atomic(state_path, json.dumps({"declined": sorted(declined)}))
    return config, notes


def terminal_ask(question: str, read=input) -> bool:
    """Yes unless the answer starts with n (Enter alone is yes)."""
    try:
        answer = read(f"{question} [Y/n] ").strip().casefold()
    except EOFError:
        return False
    return not answer.startswith("n")

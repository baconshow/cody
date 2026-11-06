"""The Cody server: standard library only, bound to 127.0.0.1.

Routes:
  GET  /                       the mascot page, with this run's token
  GET  /web/<file>             static files (no token needed: they hold no data)
  GET  /api/state              {"claude_open"}
  GET  /api/activity?cursor=N  tool events and recent sessions (cody/activity.py)
  GET  /api/cursor             the mouse position, -1..1 (Windows only), or the spot the mini Cody points at
  GET  /api/timers             timers and reminders set by voice (cody/timers.py)
  GET  /api/events?after=N     heads-up from the Claude Code hooks: done, needs you (cody/hooks.py)
  POST /api/voice              {"text"}: what you said, into the voice channel
  GET  /api/voice/replies?after=N
  GET  /api/voice/audio?seq=N  the reply in the ElevenLabs voice, when one is configured
  GET  /api/voice/alert?key=K  a timer ringing or a heads-up, in that voice (the text is made here, never sent in)
  GET  /api/voice/image?id=X   a screenshot the channel took because you asked for one

Security: the server listens on 127.0.0.1 only; reach it from a phone through Tailscale serve (inside your tailnet,
never Funnel). Every request must carry an allowed Host header (blocks DNS rebinding), every /api route the token
that only the page served at "/" knows, and the browser's Sec-Fetch-Site must say the request came from this page.
"""
from __future__ import annotations

import argparse
import hmac
import json
import logging
import secrets
import sys
import threading
import time
import webbrowser
from collections import deque
from pathlib import Path
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, unquote, urlsplit

from cody import cursor, doctor, hooks, launcher, network, page, pointer, qr, settings, setup, timers, updates, voice
from cody.activity import ActivityMonitor
from cody.claude_process import ClaudeWatcher
from cody.config import load_config
from cody.hooks import HookFeed

LOG = logging.getLogger("cody")
MAX_POST_BODY = 4096
SOCKET_TIMEOUT_S = 15       # a stalled connection (headers dripping in) is dropped
MAX_CONNECTIONS = 48        # concurrent connections; beyond that they are closed right away
SAME_SITE = ("", "same-origin", "none")     # accepted Sec-Fetch-Site values (empty = not a browser)
ENTRY_PAGES = ("/",)        # the only route a link from elsewhere may open (top-level GET navigation)
VOICE_MESSAGES_PER_MINUTE = 20
STATUS_CACHE_S = 10
# headers Tailscale serve always sets on what it forwards (and overwrites when a client sends them)
PROXY_HEADERS = ("X-Forwarded-For", "X-Forwarded-Proto", "X-Forwarded-Host", "Tailscale-User-Login",
                 "Tailscale-User-Name", "Tailscale-Funnel-Request")
PHONE_NOTE_S = 30
ACTIONS = ("voice", "hooks")
SETTINGS_POSTS = ("/api/settings", "/api/settings/key", "/api/settings/test", "/api/network")
NETWORK_STEPS = ("install", "login", "serve")


class RateLimit:
    """At most `count` events per sliding minute."""

    def __init__(self, count: int, clock=time.monotonic):
        self._count = count
        self._clock = clock
        self._times: deque = deque()
        self._lock = threading.Lock()

    def allow(self) -> bool:
        with self._lock:
            now = self._clock()
            while self._times and now - self._times[0] > 60:
                self._times.popleft()
            if len(self._times) >= self._count:
                return False
            self._times.append(now)
            return True


class App:
    """State shared by all requests."""

    def __init__(self, config: dict):
        self.config = config
        self.port = config["port"]
        self.token = secrets.token_urlsafe(32)
        extra = set(config["extra_hosts"])                 # e.g. your Tailscale serve host name
        self.hosts = {f"127.0.0.1:{self.port}", f"localhost:{self.port}"} | extra
        self.origins = {f"http://{h}" for h in self.hosts} | {f"https://{h}" for h in extra}
        self.activity = ActivityMonitor()
        self.claude = ClaudeWatcher(self.activity.last_signal)
        self.voice_limit = RateLimit(VOICE_MESSAGES_PER_MINUTE)
        self.hooks = HookFeed(language=config["language"])
        self._status: dict[str, tuple[float, list]] = {}
        self._status_lock = threading.Lock()
        self._phone_noted = 0.0

    def status(self, language: str = "", clock=time.monotonic) -> list[dict]:
        """The doctor's report in the page's language, at most every STATUS_CACHE_S (it runs tailscale)."""
        language = language if language in doctor.TEXT else self.config["language"]
        with self._status_lock:
            when, items = self._status.get(language, (0.0, []))
            if not items or clock() - when > STATUS_CACHE_S:
                items = doctor.report(self.config, server_running=True, language=language)
                self._status[language] = (clock(), items)
            return items

    def forget_status(self) -> None:
        with self._status_lock:
            self._status = {}

    def phone_seen(self, clock=time.monotonic) -> None:
        if clock() - self._phone_noted > PHONE_NOTE_S:
            self._phone_noted = clock()
            try:
                doctor.note_phone()
            except OSError:
                pass

    def change_settings(self, body: dict) -> dict:
        """Saves what changed and applies it now where it can (the voice channel reads the language at its start)."""
        keys = {"language", "voice_provider", "voice_id", "update_check", "voice_folder"}
        changed = {k: v for k, v in body.items() if k in keys}
        if changed:
            fresh = settings.save(changed)
            self.config.update({k: fresh[k] for k in (*keys - {"voice_id"}, "voice")})
            self.hooks._language = self.config["language"]
        notes = settings.apply_switches(body)
        self.forget_status()
        return {**settings.public(self.config), "notes": notes}

    def network_state(self) -> dict:
        facts = network.state(self.port)
        if facts["served"]:
            self.add_hosts(facts["served"])
        return {**facts, "step": network.next_step(facts), "admin_dns": network.ADMIN_DNS_URL,
                "download": network.DOWNLOAD_URL}

    def network_step(self, step: str) -> dict:
        """Runs one step of "Create your private network" and returns the new state (plus a page to open)."""
        if step not in NETWORK_STEPS:
            raise settings.SettingsError("unknown step")
        opened = None
        if step == "install":
            opened = network.install()["open"]
        elif step == "login":
            opened = network.login()["open"]
        else:
            self.add_hosts(network.serve(self.port)["hosts"])
        doctor.forget_network()
        self.forget_status()
        return {**self.network_state(), "open": opened}

    def add_hosts(self, hosts: list[str]) -> None:
        """A new Tailscale address for Cody: allowed from now on, for your own login only."""
        new = [h for h in hosts if h not in self.config["extra_hosts"]]
        if not new:
            return
        self.config["extra_hosts"] = [*self.config["extra_hosts"], *new]
        self.hosts |= set(new)
        self.origins |= {f"https://{h}" for h in new} | {f"http://{h}" for h in new}
        if not self.config["allowed_logins"]:
            login = network.identity_login()
            if login:
                self.config["allowed_logins"] = [login]
            else:
                LOG.warning("no Tailscale login found (tagged device?): every device in the tailnet can use Cody; "
                            "set allowed_logins in config.json")

    def act(self, what: str) -> dict:
        """A button on the Status screen (from this computer only)."""
        if what == "voice":
            if launcher.voice_session_running():
                return {"ok": True, "message": ""}
            problem = launcher.open_voice_window(launcher.voice_folder(None, self.config, Path.home()))
            result = {"ok": problem is None, "message": problem or ""}
        elif what == "hooks":
            result = {"ok": True, "message": hooks.install()}
        else:
            return {"ok": False, "message": "unknown action"}
        self.forget_status()
        return result


class Handler(BaseHTTPRequestHandler):
    server_version = "cody"
    sys_version = ""
    protocol_version = "HTTP/1.1"
    timeout = SOCKET_TIMEOUT_S

    @property
    def app(self) -> App:
        return self.server.app

    # ---- responses -------------------------------------------------------
    def _send(self, status: int, body: bytes, kind: str, extra: dict | None = None) -> None:
        self.send_response(status)
        self.send_header("Content-Type", kind)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        for key, value in (extra or {}).items():
            self.send_header(key, value)
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)

    def _json(self, status: int, data) -> None:
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self._send(status, body, "application/json; charset=utf-8", {"Cache-Control": "no-store"})

    def _error(self, status: int, message: str) -> None:
        self._json(status, {"error": message})

    def send_error(self, code, message=None, explain=None):  # noqa: N802 - stdlib API
        """Errors raised by the stdlib itself (bad request line, unsupported method) also go out as JSON."""
        try:
            self.close_connection = True
            self._error(code, "bad request" if code < 500 else "internal error")
        except OSError:
            pass

    def log_request(self, code="-", size="-"):
        LOG.debug("%s %s -> %s", self.command, urlsplit(self.path or "").path[:120], code)

    def log_message(self, format, *args):  # noqa: A002 - stdlib signature
        LOG.debug("http: request refused before routing")

    # ---- checks ----------------------------------------------------------
    def _host_ok(self) -> bool:
        return (self.headers.get("Host") or "").strip().casefold() in self.app.hosts

    def _via_tailnet(self) -> bool:
        """The request came through Tailscale serve. Serve passes the client's Host header through unchanged, so the
        Host alone cannot tell: serve always adds forwarding headers (and the login headers), which a browser on this
        computer never sends. Either sign, or a Tailscale host name, counts."""
        if any(self.headers.get(name) is not None for name in PROXY_HEADERS):
            return True
        return (self.headers.get("Host") or "").strip().casefold() in self.app.config["extra_hosts"]

    def _tailnet_refusal(self) -> str | None:
        """Refuses Tailscale Funnel (the public internet) always, and, when allowed_logins is set, anyone else coming
        through Tailscale serve. Serve sets Tailscale-User-Login itself; tagged devices carry none and are refused."""
        if self.headers.get("Tailscale-Funnel-Request") is not None:
            return "Tailscale Funnel is not allowed: use tailscale serve"
        allowed = self.app.config["allowed_logins"]
        if allowed and self._via_tailnet():
            login = (self.headers.get("Tailscale-User-Login") or "").strip().casefold()
            if login not in allowed:
                return "this Tailscale login is not allowed"
        return None

    def _token_ok(self) -> bool:
        token = self.headers.get("X-Cody-Token") or ""
        return hmac.compare_digest(token.encode("utf-8"), self.app.token.encode("utf-8"))

    def _cross_site(self, path: str) -> bool:
        """True if the browser says the request came from another site. Only a top-level navigation to an entry page
        passes (a link elsewhere opening the mascot): the other site can open the page but never read from it."""
        site = (self.headers.get("Sec-Fetch-Site") or "").strip().casefold()
        if site in SAME_SITE:
            return False
        navigation = (self.headers.get("Sec-Fetch-Mode") or "").strip().casefold() == "navigate"
        return not (path in ENTRY_PAGES and self.command == "GET" and navigation)

    def _post_refusal(self) -> str | None:
        origin = self.headers.get("Origin")
        if origin is not None and origin.casefold() not in self.app.origins:
            return "origin not allowed"
        if not self._token_ok():
            return "missing or invalid token"
        return None

    def _json_body(self):
        """The body as a dict, or (status, message) when refused."""
        try:
            length = int(self.headers.get("Content-Length", ""))
        except ValueError:
            return 411, "Content-Length required"
        if length < 0 or length > MAX_POST_BODY:
            return 413, "body too large"
        if "application/json" not in (self.headers.get("Content-Type") or "").casefold():
            return 415, "use Content-Type: application/json"
        try:
            data = json.loads(self.rfile.read(length).decode("utf-8"))
        except (ValueError, UnicodeDecodeError):
            return 400, "invalid JSON"
        return data if isinstance(data, dict) else (400, "the body must be a JSON object")

    # ---- methods ---------------------------------------------------------
    def do_GET(self):  # noqa: N802
        self._dispatch(self._route_get)

    def do_POST(self):  # noqa: N802
        self._dispatch(self._route_post)

    def do_HEAD(self):  # noqa: N802
        self._dispatch(lambda _p, _q: self._error(405, "method not allowed"))

    def do_OPTIONS(self):  # noqa: N802
        """CORS preflight refused on purpose: the server never answers another origin."""
        self._dispatch(lambda _p, _q: self._error(405, "method not allowed"))

    def _dispatch(self, route) -> None:
        if not self._host_ok():
            self.close_connection = True
            self._error(403, "host not allowed")
            return
        refusal = self._tailnet_refusal()
        if refusal:
            self.close_connection = True
            self._error(403, refusal)
            return
        try:
            parts = urlsplit(self.path)
            query = parse_qs(parts.query, max_num_fields=10)
        except ValueError:
            self._error(400, "invalid parameters")
            return
        path = unquote(parts.path)
        if self._cross_site(path):
            self.close_connection = True
            self._error(403, "cross-site request")
            return
        try:
            route(path, query)
        except Exception:  # noqa: BLE001 - never a stack trace to the client
            LOG.exception("error serving %s", path[:120])
            self._error(500, "internal error")

    def _route_post(self, path: str, _query: dict) -> None:
        self.close_connection = True     # a refused body must not linger on the connection
        refusal = self._post_refusal()
        if refusal:
            self._error(403, refusal)
            return
        if path not in ("/api/voice", "/api/action") and path not in SETTINGS_POSTS:
            self._error(404, "not found")
            return
        body = self._json_body()
        if isinstance(body, tuple):
            self._error(*body)
            return
        if path == "/api/action":
            self._action(body)
            return
        if path in SETTINGS_POSTS:
            self._settings_post(path, body if isinstance(body, dict) else {})
            return
        if not self.app.voice_limit.allow():
            self._error(429, "too many voice messages this minute")
            return
        try:
            self._json(202, voice.say(body))
        except voice.VoiceError as error:
            self._error(error.status, error.message)

    def _route_get(self, path: str, query: dict) -> None:
        def param(name: str) -> str:
            return (query.get(name) or [""])[0]

        if path.startswith("/api/") and not self._token_ok():
            self._error(403, "missing or invalid token")
            return
        if path.startswith("/api/") and not self._local():
            self.app.phone_seen()
        routes = {
            "/": self._index,
            "/api/state": lambda: self._json(200, {"claude_open": self.app.claude.is_open()}),
            "/api/status": lambda: self._json(200, {"items": self.app.status(param("lang")), "local": self._local()}),
            "/api/settings": lambda: self._json(200, {**settings.public(self.app.config), "local": self._local()}),
            "/api/qr": lambda: self._qr(param("for")),
            "/api/version": lambda: self._json(200, updates.status(self.app.config["update_check"])),
            "/api/network": lambda: (self._json(200, self.app.network_state()) if self._local()
                                     else self._error(403, "only from the computer itself")),
            "/api/activity": lambda: self._activity(param("cursor")),
            "/api/cursor": lambda: self._json(200, pointer.pointed() or cursor.position() or {"x": None, "y": None}),
            "/api/timers": lambda: self._json(200, timers.for_phone(language=self.app.config["language"])),
            "/api/events": lambda: self._events(param("after")),
            "/api/voice/replies": lambda: self._json(200, voice.replies(param("after"))),
            "/api/voice/audio": lambda: self._voice_audio(param("seq")),
            "/api/voice/alert": lambda: self._voice_alert(param("key")),
            "/api/voice/image": lambda: self._voice_image(param("id")),
        }
        if path in routes:
            routes[path]()
        elif path.startswith("/web/"):
            self._static(path[len("/web/"):])
        else:
            self._error(404, "not found")

    # ---- routes ----------------------------------------------------------
    def _local(self) -> bool:
        """The request came from this computer, not through Tailscale (see _via_tailnet)."""
        host = (self.headers.get("Host") or "").strip().casefold()
        return not self._via_tailnet() and host in (f"127.0.0.1:{self.app.port}", f"localhost:{self.app.port}")

    def _settings_post(self, path: str, body: dict) -> None:
        if not self._local():
            self._error(403, "settings change only on the computer itself")
            return
        try:
            if path == "/api/settings":
                self._json(200, {**self.app.change_settings(body), "local": True})
            elif path == "/api/network":
                self._json(200, self.app.network_step(str(body.get("step") or "")))
            elif path == "/api/settings/key":
                self._json(200, {"has_key": settings.set_key(str(body.get("key") or ""))})
            else:
                self._json(200, settings.test_voice(self.app.config))
        except settings.SettingsError as error:
            self._error(400, str(error))

    def _qr(self, which: str) -> None:
        target = {"phone": settings.phone_url(self.app.config), "tailscale": settings.TAILSCALE_APP}.get(which)
        if not target:
            self._error(404, "nothing to show")
            return
        self._send(200, qr.svg(target).encode("utf-8"), "image/svg+xml")

    def _action(self, body: dict) -> None:
        what = body.get("do") if isinstance(body, dict) else None
        if what not in ACTIONS:
            self._error(400, "unknown action")
        elif not self._local():
            self._error(403, "only from the computer itself")
        else:
            self._json(200, self.app.act(what))

    def _index(self) -> None:
        body = page.index_page(self.app.token)
        if body is None:
            self._error(404, "web/index.html is missing")
            return
        self._send(200, body, "text/html; charset=utf-8",
                   {"Cache-Control": "no-store", "Content-Security-Policy": page.policy(body)})

    def _activity(self, raw: str) -> None:
        try:
            position = int(raw or 0)
        except ValueError:
            self._error(400, "invalid cursor")
            return
        self._json(200, self.app.activity.state(position))

    def _events(self, raw: str) -> None:
        try:
            after = max(0, int(raw or 0))
        except ValueError:
            self._error(400, "invalid after")
            return
        self._json(200, self.app.hooks.read(after))

    def _voice_failed(self, error: voice.VoiceError) -> None:
        if error.status == 502:                  # the terminal says why the voice changed: nobody reads the phone's log
            LOG.warning("%s: the phone uses its own voice", error.message)
        self._error(error.status, error.message)

    def _voice_audio(self, seq: str) -> None:
        try:
            body = voice.audio(seq, self.app.config["voice"], self.app.config["language"])
        except voice.VoiceError as error:
            self._voice_failed(error)
            return
        self._send(200, body, "audio/mpeg", {"Cache-Control": "no-store"})

    def _voice_alert(self, key: str) -> None:
        try:
            body = voice.alert_audio(key, self.app.config["voice"], self.app.config["language"])
        except voice.VoiceError as error:
            self._voice_failed(error)
            return
        self._send(200, body, "audio/mpeg", {"Cache-Control": "no-store"})

    def _voice_image(self, image_id: str) -> None:
        try:
            body = voice.image(image_id)
        except voice.VoiceError as error:
            self._error(error.status, error.message)
            return
        self._send(200, body, "image/png", {"Cache-Control": "no-store"})

    def _static(self, relative: str) -> None:
        found = page.static_file(relative)
        if found is None:
            self._error(404, "file not found")
            return
        self._send(200, found[0], found[1], {"Cache-Control": "no-cache"})


class Server(ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = False      # on Windows it would let a second server share the port

    def __init__(self, app: App):
        self.app = app
        self._slots = threading.BoundedSemaphore(MAX_CONNECTIONS)
        super().__init__(("127.0.0.1", app.port), Handler)

    def process_request(self, request, client_address):
        """One thread per connection, up to MAX_CONNECTIONS; extra ones are closed without an answer."""
        if not self._slots.acquire(blocking=False):
            LOG.warning("%s concurrent connections reached; connection refused", MAX_CONNECTIONS)
            self.shutdown_request(request)
            return
        try:
            super().process_request(request, client_address)
        except Exception:
            self._slots.release()
            raise

    def process_request_thread(self, request, client_address):
        try:
            super().process_request_thread(request, client_address)
        finally:
            self._slots.release()


def _arguments(argv):
    parser = argparse.ArgumentParser(prog="cody", description="A desk mascot for Claude Code.")
    parser.add_argument("--open", action="store_true", help="open the mascot in the browser once it is up")
    parser.add_argument("--port", type=int, default=None, help="port (default: config.json, or 7420)")
    parser.add_argument("--verbose", action="store_true", help="log every request")
    parser.add_argument("--setup", action="store_true", help="ask the setup questions again (phone, heads-up)")
    parser.add_argument("--no-setup", action="store_true", help="no questions and no Tailscale detection")
    return parser.parse_args(argv)


def start(config: dict) -> tuple[App, Server]:
    """The app and its HTTP server, bound and watching the transcripts (OSError when the port is taken)."""
    app = App(config)
    server = Server(app)
    app.activity.start()
    return app, server


def main(argv=None) -> int:
    args = _arguments(argv)
    if hasattr(sys.stderr, "reconfigure"):
        sys.stderr.reconfigure(errors="backslashreplace")
    logging.basicConfig(level=logging.DEBUG if args.verbose else logging.INFO,
                        format="%(asctime)s %(levelname)s %(message)s", datefmt="%H:%M:%S")
    config = load_config()
    if args.port and 1024 <= args.port <= 65535:
        config["port"] = args.port
    if not args.no_setup:
        ask = setup.terminal_ask if sys.stdin.isatty() else None
        config, notes = setup.prepare(config, ask=ask, again=args.setup)
        for note in notes:
            LOG.info("%s", note)
    url = f"http://127.0.0.1:{config['port']}/"
    try:
        app, server = start(config)
    except OSError:
        LOG.error("port %s is already in use: is Cody already running?", config["port"])
        return 1
    LOG.info("Cody is up at %s (watching %s)", url, app.activity.projects_dir)
    for host in config["extra_hosts"]:
        LOG.info("phone: https://%s/ (through Tailscale serve)", host)
    if args.open:
        threading.Timer(0.8, webbrowser.open, args=(url,)).start()
    try:
        server.serve_forever(poll_interval=0.5)
    except KeyboardInterrupt:
        LOG.info("bye")
    finally:
        app.activity.stop()
        server.server_close()
    return 0

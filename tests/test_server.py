import http.client
import json
import re
import socket
import threading
import time
import unittest

from cody import page
from cody.server import App, Server


def free_port() -> int:
    with socket.socket() as probe:
        probe.bind(("127.0.0.1", 0))
        return probe.getsockname()[1]


class ServerTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.port = free_port()
        cls.app = App({"port": cls.port, "extra_hosts": ["pc.example.ts.net"], "allowed_logins": ["me@example.com"],
                       "language": "en", "voice": None})
        cls.server = Server(cls.app)
        threading.Thread(target=cls.server.serve_forever, daemon=True).start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()

    def request(self, method: str, path: str, headers: dict | None = None, body: bytes | None = None):
        connection = http.client.HTTPConnection("127.0.0.1", self.port, timeout=5)
        sent = {"Host": f"127.0.0.1:{self.port}", **(headers or {})}
        connection.request(method, path, body=body, headers=sent)
        response = connection.getresponse()
        data = response.read()
        connection.close()
        return response, data

    def token(self) -> str:
        _, body = self.request("GET", "/")
        return re.search(rb'name="cody-token" content="([^"]+)"', body).group(1).decode()

    def test_page_carries_the_token_and_a_matching_csp(self):
        response, body = self.request("GET", "/")
        self.assertEqual(response.status, 200)
        self.assertNotIn(page.TOKEN_MARKER.encode(), body)
        csp = response.getheader("Content-Security-Policy")
        for script_hash in page.script_hashes(body):
            self.assertIn(script_hash, csp)
        self.assertIn("frame-ancestors 'none'", csp)

    def test_page_loads_nothing_from_outside(self):
        # no CDN at run time: three.js and the font ship in web/, so the page works offline
        response, body = self.request("GET", "/")
        csp = response.getheader("Content-Security-Policy")
        self.assertNotIn("http", csp)
        for path in ("index.html", "style.css"):
            text = (page.WEB_DIR / path).read_text(encoding="utf-8")
            self.assertNotRegex(text, r"https?://(?!127\.0\.0\.1)[a-z]", path)

    def test_vendored_three_and_font_are_served(self):
        for path, kind in (("/web/vendor/three/build/three.module.js", "text/javascript"),
                           ("/web/vendor/three/examples/jsm/geometries/RoundedBoxGeometry.js", "text/javascript"),
                           ("/web/fonts/varelaround-latin.woff2", "font/woff2")):
            response, _ = self.request("GET", path)
            self.assertEqual(response.status, 200, path)
            self.assertTrue(response.getheader("Content-Type").startswith(kind), path)

    def test_meta_csp_hash_matches_the_importmap(self):
        _, body = self.request("GET", "/")
        meta = re.search(rb'http-equiv="Content-Security-Policy" content="([^"]+)"', body)
        if meta:
            for script_hash in page.script_hashes(body):
                self.assertIn(script_hash.encode(), meta.group(1))

    def test_api_needs_the_token(self):
        response, _ = self.request("GET", "/api/state")
        self.assertEqual(response.status, 403)
        response, body = self.request("GET", "/api/state", {"X-Cody-Token": self.token()})
        self.assertEqual(response.status, 200)
        self.assertIn("claude_open", json.loads(body))

    def test_activity_shape(self):
        response, body = self.request("GET", "/api/activity?cursor=0", {"X-Cody-Token": self.token()})
        self.assertEqual(response.status, 200)
        data = json.loads(body)
        self.assertEqual(set(data), {"cursor", "events", "sessions", "music", "typing", "wanted", "custom"})
        self.assertIsNone(data["wanted"])           # no scene asked for by voice
        self.assertIs(data["music"], False)          # the test app has the music reader off
        self.assertIs(data["typing"], False)         # and the typing watcher

    def test_timers_events_and_alerts(self):
        token = {"X-Cody-Token": self.token()}
        response, body = self.request("GET", "/api/timers", token)
        self.assertEqual(response.status, 200)
        self.assertEqual(set(json.loads(body)), {"now", "timers"})
        response, body = self.request("GET", "/api/events?after=0", token)
        self.assertEqual((response.status, set(json.loads(body))), (200, {"cursor", "events"}))
        response, _ = self.request("GET", "/api/events?after=x", token)
        self.assertEqual(response.status, 400)
        response, _ = self.request("GET", "/api/events?after=0&wait=x", token)
        self.assertEqual(response.status, 400)
        response, _ = self.request("GET", "/api/voice/alert?key=done", token)
        self.assertEqual(response.status, 404, "no ElevenLabs voice configured: the phone uses its own")
        response, _ = self.request("GET", "/api/timers")
        self.assertEqual(response.status, 403)

    def test_events_wait_until_something_happens(self):
        token = {"X-Cody-Token": self.token()}
        started = time.monotonic()
        response, body = self.request("GET", "/api/events?after=999999&wait=2", token)
        self.assertEqual(response.status, 200)
        self.assertLess(time.monotonic() - started, 1.0, "a count that went back comes back at once")
        cursor = json.loads(body)["cursor"]
        threading.Timer(0.3, lambda: self.app.hooks.add("notice", "WhatsApp: hi", app="WhatsApp")).start()
        started = time.monotonic()
        response, body = self.request("GET", f"/api/events?after={cursor}&wait=5", token)
        taken = time.monotonic() - started
        events = json.loads(body)["events"]
        self.assertEqual([e["say"] for e in events], ["WhatsApp: hi"])
        self.assertTrue(0.2 < taken < 2.0, f"held until the event, not the full wait: {taken:.2f}s")

    def test_the_android_app_gets_the_token_and_the_asset_links(self):
        response, body = self.request("GET", "/app/hello")
        self.assertEqual(response.status, 200)
        data = json.loads(body)
        self.assertEqual((data["app"], data["token"], data["language"]), ("cody", self.token(), "en"))
        response, body = self.request("GET", "/.well-known/assetlinks.json")
        self.assertEqual((response.status, json.loads(body)), (200, []), "no certificate known yet")
        self.assertIn("application/json", response.getheader("Content-Type"))
        response, _ = self.request("GET", "/app/hello", {"Host": "pc.example.ts.net", "Tailscale-User-Login": "else@example.com"})
        self.assertEqual(response.status, 403, "another login through Tailscale gets no token")
        response, body = self.request("GET", "/api/qr?for=app", {"X-Cody-Token": self.token()})
        self.assertEqual(response.status, 200)
        self.assertIn(b"<svg", body)

    def test_unknown_host_is_refused(self):
        response, _ = self.request("GET", "/", {"Host": "evil.example:80"})
        self.assertEqual(response.status, 403)
        response, _ = self.request("GET", "/", {"Host": "pc.example.ts.net", "Tailscale-User-Login": "me@example.com"})
        self.assertEqual(response.status, 200)

    def test_tailnet_login_and_funnel(self):
        response, _ = self.request("GET", "/", {"Host": "pc.example.ts.net", "Tailscale-User-Login": "else@example.com"})
        self.assertEqual(response.status, 403)
        response, _ = self.request("GET", "/", {"Host": "pc.example.ts.net"})
        self.assertEqual(response.status, 403, "a tagged device has no login")
        response, _ = self.request("GET", "/", {"Host": "pc.example.ts.net", "Tailscale-User-Login": "me@example.com",
                                                "Tailscale-Funnel-Request": "?1"})
        self.assertEqual(response.status, 403)
        response, _ = self.request("GET", "/", {"Tailscale-Funnel-Request": "?1"})
        self.assertEqual(response.status, 403)

    def test_cross_site_fetch_is_refused_but_a_link_may_open_the_page(self):
        response, _ = self.request("GET", "/api/state", {"Sec-Fetch-Site": "cross-site", "Sec-Fetch-Mode": "cors",
                                                         "X-Cody-Token": self.token()})
        self.assertEqual(response.status, 403)
        response, _ = self.request("GET", "/", {"Sec-Fetch-Site": "cross-site", "Sec-Fetch-Mode": "navigate"})
        self.assertEqual(response.status, 200)

    def test_post_from_another_origin_is_refused(self):
        body = json.dumps({"text": "hi"}).encode()
        response, _ = self.request("POST", "/api/voice", {"Origin": "https://evil.example",
                                                          "X-Cody-Token": self.token(),
                                                          "Content-Type": "application/json"}, body)
        self.assertEqual(response.status, 403)

    def test_static_files_stay_inside_web(self):
        response, _ = self.request("GET", "/web/index.html")
        self.assertEqual(response.status, 200)
        for path in ("/web/../cody/server.py", "/web/..%2Fconfig.example.json", "/web/C:/Windows/win.ini"):
            response, _ = self.request("GET", path)
            self.assertEqual(response.status, 404, path)

    def test_no_stack_trace_on_bad_requests(self):
        response, body = self.request("GET", "/api/activity?cursor=abc", {"X-Cody-Token": self.token()})
        self.assertEqual(response.status, 400)
        self.assertEqual(json.loads(body), {"error": "invalid cursor"})


if __name__ == "__main__":
    unittest.main()

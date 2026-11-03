import http.client
import json
import re
import socket
import threading
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
        self.assertEqual(set(json.loads(body)), {"cursor", "events", "sessions"})

    def test_timers_events_and_alerts(self):
        token = {"X-Cody-Token": self.token()}
        response, body = self.request("GET", "/api/timers", token)
        self.assertEqual(response.status, 200)
        self.assertEqual(set(json.loads(body)), {"now", "timers"})
        response, body = self.request("GET", "/api/events?after=0", token)
        self.assertEqual((response.status, set(json.loads(body))), (200, {"cursor", "events"}))
        response, _ = self.request("GET", "/api/events?after=x", token)
        self.assertEqual(response.status, 400)
        response, _ = self.request("GET", "/api/voice/alert?key=done", token)
        self.assertEqual(response.status, 404, "no ElevenLabs voice configured: the phone uses its own")
        response, _ = self.request("GET", "/api/timers")
        self.assertEqual(response.status, 403)

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

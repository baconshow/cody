"""Create your private network (cody/network.py) and the server's side of it."""
import json
import unittest
from unittest import mock

from cody import network


def fake_run(status: dict | None, serve: dict | None = None):
    def run(args, **_kwargs):
        if args[1:3] == ["status", "--json"]:
            out = json.dumps(status) if status is not None else ""
        elif args[1:4] == ["serve", "status", "--json"]:
            out = json.dumps(serve or {})
        else:
            out = ""
        return mock.Mock(returncode=0 if status is not None else 1, stdout=out)
    return run


RUNNING = {"BackendState": "Running", "Self": {"DNSName": "pc.tail1234.ts.net.", "UserID": 1},
           "User": {"1": {"LoginName": "me@example.com"}}, "CurrentTailnet": {"MagicDNSEnabled": True},
           "CertDomains": ["pc.tail1234.ts.net"]}
SERVED = {"Web": {"pc.tail1234.ts.net:8443": {"Handlers": {"/": {"Proxy": "http://127.0.0.1:7420"}}}}}


class NetworkTest(unittest.TestCase):
    def step(self, status, serve=None, installed=True):
        facts = network.state(7420, run=fake_run(status, serve), which=lambda _n: "/bin/tailscale" if installed else None)
        return network.next_step(facts), facts

    def test_the_steps_in_order(self):
        self.assertEqual(self.step(None, installed=False)[0], "install")
        self.assertEqual(self.step({"BackendState": "NeedsLogin"})[0], "login")
        self.assertEqual(self.step({**RUNNING, "CertDomains": None})[0], "dns")
        self.assertEqual(self.step({**RUNNING, "CurrentTailnet": {"MagicDNSEnabled": False}})[0], "dns")
        self.assertEqual(self.step(RUNNING)[0], "serve")
        step, facts = self.step(RUNNING, SERVED)
        self.assertEqual(step, "done")
        self.assertEqual(facts["phone_url"], "https://pc.tail1234.ts.net:8443/")

    def test_funnel_is_never_counted(self):
        funnel = {**SERVED, "AllowFunnel": {"pc.tail1234.ts.net:8443": True}}
        self.assertEqual(self.step(RUNNING, funnel)[0], "serve")

    def test_install_uses_winget_on_windows_else_the_download_page(self):
        popen = mock.Mock()
        self.assertEqual(network.install(popen, lambda _n: "winget.exe", "win32"), {"started": True, "open": None})
        self.assertEqual(popen.call_args.args[0][:4], ["winget", "install", "--id", "Tailscale.Tailscale"])
        self.assertEqual(network.install(popen, lambda _n: None, "darwin")["open"], network.DOWNLOAD_URL)

    def test_login_returns_the_sign_in_link(self):
        process = mock.Mock(stdout=iter(["\n", "To authenticate, visit:\n", "\thttps://login.tailscale.com/a/abc123\n"]))
        self.assertEqual(network.login(lambda *_a, **_k: process)["open"], "https://login.tailscale.com/a/abc123")
        quiet = mock.Mock(stdout=iter(["Success.\n"]))
        self.assertIsNone(network.login(lambda *_a, **_k: quiet)["open"])

    def test_serve_never_uses_funnel(self):
        calls = []

        def run(args, **kwargs):
            calls.append(args)
            return fake_run(RUNNING, SERVED if len(calls) > 2 else {})(args, **kwargs)
        self.assertEqual(network.serve(7420, run)["hosts"], ["pc.tail1234.ts.net:8443"])
        self.assertTrue(all("funnel" not in " ".join(c) for c in calls))
        self.assertIn(["tailscale", "serve", "--bg", "--https=443", "7420"], calls)


class ServerSideTest(unittest.TestCase):
    def test_a_new_address_is_allowed_for_your_login_only(self):
        from cody.server import App
        app = App({"port": 7499, "extra_hosts": [], "allowed_logins": [], "language": "en", "voice": None,
                   "voice_provider": "device", "update_check": False, "voice_folder": None})
        with mock.patch.object(network, "identity_login", return_value="me@example.com"):
            app.add_hosts(["pc.tail1234.ts.net:8443"])
        self.assertIn("pc.tail1234.ts.net:8443", app.hosts)
        self.assertIn("https://pc.tail1234.ts.net:8443", app.origins)
        self.assertEqual(app.config["allowed_logins"], ["me@example.com"])
        with self.assertRaises(ValueError):
            app.network_step("funnel")


if __name__ == "__main__":
    unittest.main()

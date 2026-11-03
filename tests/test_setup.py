import json
import subprocess
import tempfile
import unittest
from pathlib import Path

from cody import setup
from cody.config import system_language

STATUS = {"BackendState": "Running", "Self": {"DNSName": "pc.tail1234.ts.net.", "UserID": 7},
          "User": {"7": {"LoginName": "You@Example.com"}}}
SERVED = {"TCP": {"443": {"HTTPS": True}, "8443": {"HTTPS": True}},
          "Web": {"pc.tail1234.ts.net:443": {"Handlers": {"/": {"Proxy": "http://127.0.0.1:5000"}}},
                  "pc.tail1234.ts.net:8443": {"Handlers": {"/": {"Proxy": "http://127.0.0.1:7420"}}}}}


class FakeTailscale:
    """Answers `tailscale status --json` and `tailscale serve ...` like the real one; records what was run."""

    def __init__(self, status=STATUS, serve=None, installed=True):
        self.status, self.serve, self.installed, self.ran = status, serve or {}, installed, []

    def __call__(self, command, **_):
        if not self.installed:
            raise FileNotFoundError("tailscale")
        args = command[1:]
        self.ran.append(args)
        if args == ["status", "--json"]:
            out = json.dumps(self.status)
        elif args == ["serve", "status", "--json"]:
            out = json.dumps(self.serve)
        elif args[:2] == ["serve", "--bg"]:
            https, port = args[2].split("=")[1], args[3]
            self.serve.setdefault("TCP", {})[https] = {"HTTPS": True}
            self.serve.setdefault("Web", {})[f"pc.tail1234.ts.net:{https}"] = {
                "Handlers": {"/": {"Proxy": f"http://127.0.0.1:{port}"}}}
            out = ""
        else:
            return subprocess.CompletedProcess(command, 1, "", "unknown")
        return subprocess.CompletedProcess(command, 0, out, "")


class SetupTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.state = Path(self.tmp.name) / "setup.json"
        self.settings = Path(self.tmp.name) / "settings.json"
        self.config = {"port": 7420, "extra_hosts": [], "allowed_logins": [], "language": "en", "voice": None}
        self.asked = []

    def prepare(self, run, answer=True, config=None, again=False):
        def ask(question):
            self.asked.append(question)
            return answer
        return setup.prepare(config or self.config, ask=ask, again=again, run=run, state_path=self.state,
                             settings_path=self.settings)

    def test_an_address_already_served_is_found_with_only_your_login(self):
        config, _ = self.prepare(FakeTailscale(serve=json.loads(json.dumps(SERVED))), answer=False)
        self.assertEqual(config["extra_hosts"], ["pc.tail1234.ts.net:8443"])
        self.assertEqual(config["allowed_logins"], ["you@example.com"])
        self.assertEqual(len(self.asked), 1, "only the hooks question: the phone was already set up")

    def test_not_served_yet_it_asks_and_uses_a_free_https_port(self):
        fake = FakeTailscale(serve={"TCP": {"443": {"HTTPS": True}}, "Web": {}})
        config, _ = self.prepare(fake)
        self.assertIn(["serve", "--bg", "--https=8443", "7420"], fake.ran)
        self.assertEqual(config["extra_hosts"], ["pc.tail1234.ts.net:8443"])

    def test_port_443_free_means_a_plain_address(self):
        config, _ = self.prepare(FakeTailscale())
        self.assertEqual(config["extra_hosts"], ["pc.tail1234.ts.net"])

    def test_a_no_is_remembered_until_setup_is_asked_again(self):
        fake = FakeTailscale()
        self.prepare(fake, answer=False)
        self.assertEqual(len(self.asked), 2)
        self.prepare(fake, answer=False)
        self.assertEqual(len(self.asked), 2, "not asked again")
        self.prepare(fake, answer=False, again=True)
        self.assertEqual(len(self.asked), 4)
        self.assertFalse(any(args[:2] == ["serve", "--bg"] for args in fake.ran))

    def test_without_a_terminal_nothing_is_changed(self):
        fake = FakeTailscale()
        config, _ = setup.prepare(self.config, ask=None, run=fake, state_path=self.state, settings_path=self.settings)
        self.assertEqual(config["extra_hosts"], [])
        self.assertFalse(self.state.exists())
        self.assertFalse(any(args[:2] == ["serve", "--bg"] for args in fake.ran))

    def test_funnel_and_other_ports_are_never_trusted(self):
        serve = json.loads(json.dumps(SERVED))
        serve["AllowFunnel"] = {"pc.tail1234.ts.net:8443": True}
        self.assertEqual(setup.served(serve, 7420), [])
        self.assertEqual(setup.served(SERVED, 9999), [])

    def test_logins_in_config_win_and_tagged_machines_warn(self):
        mine = {**self.config, "allowed_logins": ["friend@example.com"]}
        config, _ = self.prepare(FakeTailscale(serve=json.loads(json.dumps(SERVED))), config=mine)
        self.assertEqual(config["allowed_logins"], ["friend@example.com"])
        tagged = {**STATUS, "User": {"7": {"LoginName": "tagged-devices"}}}
        config, notes = self.prepare(FakeTailscale(status=tagged, serve=json.loads(json.dumps(SERVED))))
        self.assertEqual(config["allowed_logins"], [])
        self.assertTrue(any("tagged" in n for n in notes))

    def test_no_tailscale_is_fine(self):
        config, _ = self.prepare(FakeTailscale(installed=False), answer=False)
        self.assertEqual(config["extra_hosts"], [])
        stopped = {**STATUS, "BackendState": "Stopped"}
        self.assertIsNone(setup.identity(FakeTailscale(status=stopped)))

    def test_yes_to_the_heads_up_installs_the_hooks_once(self):
        fake = FakeTailscale(installed=False)
        self.prepare(fake)
        self.assertTrue(setup.hooks_installed(self.settings))
        self.asked.clear()
        self.prepare(fake, again=True)
        self.assertEqual(self.asked, [], "already installed: nothing to ask")

    def test_enter_alone_is_yes(self):
        self.assertTrue(setup.terminal_ask("ok?", read=lambda prompt: ""))
        self.assertFalse(setup.terminal_ask("ok?", read=lambda prompt: "N"))


class LanguageTest(unittest.TestCase):
    def test_the_computer_language(self):
        self.assertEqual(system_language(lambda: ("pt_BR", "cp1252"), {}), "pt-BR")
        self.assertEqual(system_language(lambda: ("Portuguese_Brazil", "1252"), {}), "pt-BR")
        self.assertEqual(system_language(lambda: (None, None), {"LANG": "pt_PT.UTF-8"}), "pt-BR")
        self.assertEqual(system_language(lambda: ("en_US", "UTF-8"), {}), "en")
        self.assertEqual(system_language(lambda: (None, None), {}), "en")


if __name__ == "__main__":
    unittest.main()

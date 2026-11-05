"""The doctor (--doctor, /api/status), the Status screen's server side and ElevenLabs errors in plain words."""
import http.client
import json
import re
import tempfile
import threading
import unittest
from pathlib import Path
from unittest import mock

from cody import doctor, voice
from cody.server import App, Server
from tests.test_server import free_port

CONFIG = {"port": 7420, "language": "en", "voice": None, "voice_folder": None, "extra_hosts": [],
          "voice_provider": "device", "update_check": False,
          "allowed_logins": []}


def no_tailscale(*_a, **_k):
    raise OSError("no tailscale here")


class DoctorTest(unittest.TestCase):
    def setUp(self):
        self.folder = Path(tempfile.mkdtemp())
        patcher = mock.patch.object(doctor, "data_dir", return_value=self.folder)
        patcher.start()
        self.addCleanup(patcher.stop)

    def ids(self, items):
        return {entry["id"]: entry["state"] for entry in items}

    def test_everything_off(self):
        with mock.patch("cody.hooks.settings_file", return_value=self.folder / "settings.json"):
            items = doctor.report(CONFIG, server_running=False, run=no_tailscale)
        states = self.ids(items)
        self.assertEqual(states["server"], "fail")
        self.assertEqual(states["voice"], "fail")
        self.assertEqual(states["hooks"], "warn")
        self.assertEqual(states["tailscale"], "warn")
        self.assertEqual(states["provider"], "ok")
        voice_item = next(i for i in items if i["id"] == "voice")
        self.assertEqual(voice_item["action"], "voice")
        self.assertIn("FAIL  Voice session", doctor.render(items))

    def test_duplicate_voice_sessions_and_loaded_channel(self):
        sessions = self.folder / doctor.SESSIONS_DIR
        sessions.mkdir()
        for pid, port in ((1, 5001), (2, 5002), (3, 5003)):
            (sessions / f"{pid}.json").write_text(json.dumps({"port": port}))
        (self.folder / "channel.json").write_text(json.dumps({"port": 5003, "loaded": True}))
        with mock.patch("cody.launcher.server_running", side_effect=lambda port, _c=None: port != 5001):
            items = doctor.check_voice(doctor.TEXT["en"])
        self.assertEqual(items[0]["state"], "warn")
        self.assertIn("2 voice sessions", items[0]["say"])
        self.assertEqual(items[1]["state"], "ok")
        self.assertFalse((sessions / "1.json").exists())            # a dead session is cleaned up

    def test_phone_seen_recently(self):
        doctor.note_phone(clock=lambda: 1000)
        network = doctor.check_network(CONFIG, doctor.TEXT["pt-BR"], "pt-BR", run=no_tailscale,
                                       clock=lambda: 1030)
        self.assertEqual(network[1]["state"], "ok")
        self.assertIn("há 30 s", network[1]["say"])

    def test_elevenlabs_reason_is_shown(self):
        config = {**CONFIG, "voice": {"voice_id": "abcdefghij", "model": "eleven_flash_v2_5"}}
        text = doctor.TEXT["en"]
        self.assertEqual(doctor.check_provider(config, text, key=lambda: None)["state"], "warn")
        doctor.note_voice_error("payment pending")
        failed = doctor.check_provider(config, text, key=lambda: "k")
        self.assertEqual(failed["state"], "fail")
        self.assertIn("ElevenLabs: payment pending", failed["say"])
        doctor.note_voice_error(None)
        self.assertEqual(doctor.check_provider(config, text, key=lambda: "k")["state"], "ok")

    def test_texts_in_both_languages(self):
        self.assertEqual(set(doctor.TEXT["en"]), set(doctor.TEXT["pt-BR"]))


class ElevenReasonTest(unittest.TestCase):
    def test_known_and_unknown(self):
        self.assertEqual(voice.eleven_reason(402, {}), "payment pending")
        self.assertEqual(voice.eleven_reason(401, {"detail": {"status": "quota_exceeded"}}),
                         "monthly characters used up")
        self.assertEqual(voice.eleven_reason(418, {"detail": "teapot"}), "error 418")


class StatusRoutesTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.port = free_port()
        cls.app = App({**CONFIG, "port": cls.port, "extra_hosts": ["pc.example.ts.net"]})
        cls.server = Server(cls.app)
        threading.Thread(target=cls.server.serve_forever, daemon=True).start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()

    def request(self, method, path, host=None, body=None):
        connection = http.client.HTTPConnection("127.0.0.1", self.port, timeout=5)
        connection.request("GET", "/", headers={"Host": f"127.0.0.1:{self.port}"})
        token = re.search(rb'name="cody-token" content="([^"]+)"', connection.getresponse().read()).group(1)
        headers = {"Host": host or f"127.0.0.1:{self.port}", "X-Cody-Token": token.decode(),
                   "Content-Type": "application/json"}
        connection.request(method, path, body=body, headers=headers)
        response = connection.getresponse()
        data = response.read()
        connection.close()
        return response.status, json.loads(data or b"{}")

    def test_status_lists_the_checks(self):
        fake = [{"id": "server", "state": "ok"}]
        with mock.patch.object(doctor, "report", return_value=fake):
            self.app.forget_status()
            status, data = self.request("GET", "/api/status")
        self.assertEqual(status, 200)
        self.assertEqual(data, {"items": fake, "local": True})

    def test_actions_only_from_the_computer(self):
        with mock.patch.object(doctor, "note_phone"):
            status, _ = self.request("POST", "/api/action", host="pc.example.ts.net", body=b'{"do": "hooks"}')
        self.assertEqual(status, 403)
        status, _ = self.request("POST", "/api/action", body=b'{"do": "format-disk"}')
        self.assertEqual(status, 400)
        with mock.patch.object(self.app, "act", return_value={"ok": True, "message": "done"}) as act:
            status, data = self.request("POST", "/api/action", body=b'{"do": "voice"}')
        self.assertEqual((status, data["message"]), (200, "done"))
        act.assert_called_once_with("voice")


if __name__ == "__main__":
    unittest.main()

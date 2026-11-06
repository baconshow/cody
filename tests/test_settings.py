"""The Settings screen's side on the computer: saving, the key, the QR route and who may change things."""
import base64
import http.server
import io
import json
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
from pathlib import Path
from unittest import mock

from cody import settings, voice


class SettingsTest(unittest.TestCase):
    def setUp(self):
        self.folder = Path(tempfile.mkdtemp())
        self.config_path = self.folder / "config.json"
        self.config_path.write_text(json.dumps({"port": 7420, "allowed_logins": ["me@example.com"]}))
        for target in ("cody.settings.data_dir", "cody.store.data_dir"):
            patcher = mock.patch(target, return_value=self.folder)
            patcher.start()
            self.addCleanup(patcher.stop)
        env = mock.patch.dict("os.environ", {"ELEVENLABS_API_KEY": ""})
        env.start()
        self.addCleanup(env.stop)
        home_key = mock.patch.object(voice, "KEY_FILE", self.folder / "no-home-key")
        home_key.start()
        self.addCleanup(home_key.stop)
        settings.forget_voices()
        self.addCleanup(settings.forget_voices)

    def test_save_keeps_other_keys_and_checks_values(self):
        config = settings.save({"language": "pt-BR", "voice_provider": "sounds", "voice_id": "abcdefghij12"},
                               self.config_path)
        self.assertEqual((config["language"], config["voice_provider"]), ("pt-BR", "sounds"))
        self.assertEqual(config["voice"]["voice_id"], "abcdefghij12")
        self.assertEqual(json.loads(self.config_path.read_text())["allowed_logins"], ["me@example.com"])
        for bad in ({"language": "fr"}, {"voice_provider": "robot"}, {"voice_id": "../x"},
                    {"voice_folder": "/does/not/exist"}):
            with self.assertRaises(settings.SettingsError):
                settings.save(bad, self.config_path)

    def test_key_is_saved_privately_and_never_shown(self):
        self.assertFalse(settings.set_key(""))
        with self.assertRaises(settings.SettingsError):
            settings.set_key("short")
        key = "sk_" + "a" * 40
        self.assertTrue(settings.set_key(key))
        self.assertEqual(voice._api_key(), key)
        config = settings.save({}, self.config_path)
        shown = json.dumps(settings.public(config, settings_path=self.folder / "settings.json"))
        self.assertNotIn(key, shown)
        self.assertIn('"has_key": true', shown)
        self.assertFalse(settings.set_key(""))

    def test_an_unreadable_config_is_never_overwritten(self):
        self.config_path.write_text('{"port": 7420, "allowed_logins": ["me@example.com"],}')     # a trailing comma
        with self.assertRaises(settings.SettingsError):
            settings.save({"language": "pt-BR"}, self.config_path)
        self.assertIn("allowed_logins", self.config_path.read_text())

    def test_first_run_is_remembered(self):
        self.assertFalse(settings.first_run_done(self.folder))
        settings.apply_switches({"first_run_done": True})
        self.assertTrue(settings.first_run_done(self.folder))

    def test_voice_test_reports_the_reason(self):
        config = {"language": "en", "voice": {"voice_id": "abcdefghij", "model": "eleven_flash_v2_5"}}
        with mock.patch.object(voice, "_eleven", side_effect=voice.VoiceError(502, "ElevenLabs: payment pending")):
            self.assertEqual(settings.test_voice(config), {"ok": False, "reason": "payment pending"})
        with mock.patch.object(voice, "_eleven", return_value=b"mp3") as eleven:
            heard = settings.test_voice(config)
            self.assertEqual(heard["ok"], True)
            self.assertEqual(base64.b64decode(heard["audio"]), b"mp3", "the screen gets the audio to play")
            self.assertEqual(eleven.call_args.args[1]["voice_id"], "abcdefghij", "the saved voice")
            settings.test_voice(config, "zyxwvutsrq98")
            self.assertEqual(eleven.call_args.args[1], {"voice_id": "zyxwvutsrq98", "model": "eleven_flash_v2_5"},
                             "a voice being tried, before it is saved")
            settings.test_voice({"language": "en", "voice": None}, "zyxwvutsrq98")
            self.assertEqual(eleven.call_args.args[1]["model"], "eleven_flash_v2_5", "no saved voice: the usual model")
        self.assertFalse(settings.test_voice({"language": "en", "voice": None})["ok"])
        with self.assertRaises(settings.SettingsError):
            settings.test_voice(config, "../not-an-id")

    def test_a_voice_test_counts_against_the_same_limit_as_replies(self):
        config = {"language": "en", "voice": {"voice_id": "abcdefghij", "model": "eleven_flash_v2_5"}}
        with mock.patch.object(voice, "_take_synthesis_slot", side_effect=voice.VoiceError(429, "too many")), \
                mock.patch.object(voice, "_eleven") as eleven:
            self.assertEqual(settings.test_voice(config), {"ok": False, "reason": "too many"})
            eleven.assert_not_called()
        held = []
        with mock.patch.object(voice, "_take_synthesis_slot", side_effect=lambda: held.append(voice._lock.locked())), \
                mock.patch.object(voice, "_eleven", return_value=b"mp3"):
            settings.test_voice(config)
        self.assertEqual(held, [True], "the count is taken under the lock, like a spoken reply's")
        self.assertFalse(voice._lock.locked())

    def test_voices_of_the_account_are_listed_by_name(self):
        answer = {"voices": [
            {"voice_id": "bbbbbbbbbb22", "name": "  Rachel   Calm ", "labels": {"accent": "american", "gender": "female",
                                                                              "age": "young", "use case": "narration"}},
            {"voice_id": "aaaaaaaaaa11", "name": "adam", "labels": None},
            {"voice_id": "../etc", "name": "Bad id"}, {"voice_id": "cccccccccc33", "name": "  "}, "not a voice",
            {"voice_id": "dddddddddd44", "name": "Zoe", "labels": {"accent": 7, "gender": ""}},
        ]}
        self.assertEqual(voice.voice_list(answer), [
            {"id": "aaaaaaaaaa11", "name": "adam", "about": ""},
            {"id": "bbbbbbbbbb22", "name": "Rachel Calm", "about": "american, female, young"},
            {"id": "dddddddddd44", "name": "Zoe", "about": ""},
        ])
        for broken in (None, [], {"voices": "x"}, {"other": 1}):
            self.assertEqual(voice.voice_list(broken), [])
        odd = {"voices": [
            {"voice_id": "abcdefghij\n", "name": "Newline in the id"},
            {"voice_id": "eeeeeeeeee55", "name": "Ev\u202eil\u200b \x07 name", "labels": {"accent": "brit\u202eish"}},
            {"voice_id": "ffffffffff66", "name": "\u200b\u202e"},
        ]}
        self.assertEqual(voice.voice_list(odd), [{"id": "eeeeeeeeee55", "name": "Evil name", "about": "british"}],
                         "direction and control marks are dropped; an id is the whole string or nothing")

    def test_listing_voices_needs_a_key_and_reports_why_it_failed(self):
        self.assertEqual(settings.voices(), {"ok": False, "reason": "no ElevenLabs API key on this computer",
                                             "voices": []})
        key = "sk_" + "a" * 40
        settings.set_key(key)
        refused = urllib.error.HTTPError("u", 401, "no", {}, io.BytesIO(
            b'{"detail": {"status": "missing_permissions", "message": "..."}}'))
        with mock.patch.object(voice._ELEVEN, "open", side_effect=refused):
            listed = settings.voices()
        self.assertEqual((listed["ok"], listed["reason"]), (False, "the key lacks permission for this"))
        self.assertNotIn(key, json.dumps(listed))
        with mock.patch.object(voice._ELEVEN, "open", side_effect=urllib.error.URLError("offline")):
            self.assertEqual(settings.voices()["reason"], "ElevenLabs did not answer")
        with mock.patch.object(voice._ELEVEN, "open", return_value=self.answer(b"x" * (voice.MAX_VOICES_BYTES + 1))):
            self.assertEqual(settings.voices()["reason"], "ElevenLabs did not answer", "too much to be a list")
        listing = json.dumps({"voices": [{"voice_id": "aaaaaaaaaa11", "name": "Adam"}]}).encode()
        with mock.patch.object(voice._ELEVEN, "open", return_value=self.answer(listing)) as opened:
            self.assertEqual(settings.voices(), {"ok": True, "voices": [{"id": "aaaaaaaaaa11", "name": "Adam",
                                                                       "about": ""}]})
            request = opened.call_args.args[0]
            self.assertEqual(request.full_url, "https://api.elevenlabs.io/v1/voices")
            self.assertEqual(request.get_method(), "GET")
            self.assertEqual(request.get_header("Xi-api-key"), key)

    @staticmethod
    def answer(body: bytes):
        """What the opener returns: something to read, usable in a with block."""
        response = io.BytesIO(body)
        response.__enter__ = lambda *_: response
        response.__exit__ = lambda *_: False
        return response

    def test_a_good_list_of_voices_is_kept_for_a_minute_and_forgotten_with_the_key(self):
        settings.set_key("sk_" + "a" * 40)
        now = [1000.0]
        with mock.patch.object(voice, "eleven_voices", return_value=[{"id": "aaaaaaaaaa11", "name": "Adam",
                                                                     "about": ""}]) as asked:
            for _ in range(3):
                self.assertTrue(settings.voices(clock=lambda: now[0])["ok"])
            self.assertEqual(asked.call_count, 1, "the screen asks on every redraw; ElevenLabs is asked once")
            now[0] += settings.VOICES_TTL_S + 1
            settings.voices(clock=lambda: now[0])
            self.assertEqual(asked.call_count, 2, "a minute later it is asked again")
            settings.set_key("sk_" + "b" * 40)
            settings.voices(clock=lambda: now[0])
            self.assertEqual(asked.call_count, 3, "another key is another account")
        settings.forget_voices()
        with mock.patch.object(voice, "eleven_voices", side_effect=voice.VoiceError(502, "ElevenLabs: too many requests")) as asked:
            settings.voices(clock=lambda: now[0])
            settings.voices(clock=lambda: now[0])
            self.assertEqual(asked.call_count, 2, "a failure is not kept: the next look tries again")

    def test_the_key_is_never_sent_along_a_redirect(self):
        seen = []

        class Elsewhere(http.server.BaseHTTPRequestHandler):
            def do_GET(self):
                seen.append(self.headers.get("xi-api-key"))
                self.send_response(200)
                self.end_headers()

            def log_message(self, *args):
                pass

        elsewhere = http.server.HTTPServer(("127.0.0.1", 0), Elsewhere)

        class Redirecting(http.server.BaseHTTPRequestHandler):
            def do_GET(self):
                self.send_response(302)
                self.send_header("Location", f"http://127.0.0.1:{elsewhere.server_port}/stolen")
                self.end_headers()

            def log_message(self, *args):
                pass

        first = http.server.HTTPServer(("127.0.0.1", 0), Redirecting)
        for server in (elsewhere, first):
            threading.Thread(target=server.serve_forever, daemon=True).start()
            self.addCleanup(server.server_close)
            self.addCleanup(server.shutdown)
        request = urllib.request.Request(f"http://127.0.0.1:{first.server_port}/v1/voices",
                                         headers={"xi-api-key": "sk_secret"})
        with self.assertRaises(urllib.error.HTTPError) as refused:
            voice._ask_eleven(request, 1000)
        self.assertEqual(refused.exception.code, 302)
        self.assertEqual(seen, [], "the other address was never asked, so it never saw the key")

    def test_only_real_audio_of_a_sane_size_counts_as_a_voice_that_works(self):
        settings.set_key("sk_" + "a" * 40)
        spoken = {"voice_id": "abcdefghij", "model": "eleven_flash_v2_5"}
        with mock.patch.object(voice, "_note"):
            for mp3 in (b"ID3\x04rest", b"\xff\xfb\x90rest"):
                with mock.patch.object(voice._ELEVEN, "open", return_value=self.answer(mp3)):
                    self.assertEqual(voice._eleven("hi", spoken, "en"), mp3)
            with mock.patch.object(voice._ELEVEN, "open", return_value=self.answer(b"<html>busy</html>")):
                with self.assertRaises(voice.VoiceError) as wrong:
                    voice._eleven("hi", spoken, "en")
            self.assertEqual(wrong.exception.message, "ElevenLabs: the answer was not audio")
            with mock.patch.object(voice._ELEVEN, "open",
                                   return_value=self.answer(b"ID3" + b"x" * voice.MAX_AUDIO_BYTES)):
                with self.assertRaises(voice.VoiceError) as huge:
                    voice._eleven("hi", spoken, "en")
            self.assertEqual(huge.exception.message, "ElevenLabs did not answer")

    def test_a_voice_id_is_the_whole_string(self):
        from cody.config import VALID_MODEL, VALID_VOICE
        self.assertTrue(VALID_VOICE.match("abcdefghij12"))
        self.assertIsNone(VALID_VOICE.match("abcdefghij12\n"))
        self.assertIsNone(VALID_MODEL.match("eleven_flash_v2_5\n"))


class SettingsRoutesTest(unittest.TestCase):
    def test_changes_only_from_the_computer_and_qr(self):
        from tests.test_doctor import StatusRoutesTest
        case = StatusRoutesTest("test_status_lists_the_checks")
        StatusRoutesTest.setUpClass()
        try:
            with mock.patch("cody.doctor.note_phone"):
                status, data = case.request("POST", "/api/settings", host="pc.example.ts.net",
                                            body=b'{"language": "pt-BR"}')
            self.assertEqual(status, 403)
            with mock.patch.object(case.app, "change_settings", return_value={"ok": 1}):
                status, _ = case.request("POST", "/api/settings", body=b'{"language": "pt-BR"}')
            self.assertEqual(status, 200)
            status, data = case.request("GET", "/api/settings")
            self.assertEqual(status, 200)
            self.assertNotIn("key", {k for k in data if k != "has_key"})
            with mock.patch.object(settings, "voices", return_value={"ok": True, "voices": []}), \
                    mock.patch("cody.doctor.note_phone"):
                status, data = case.request("GET", "/api/settings/voices")
                self.assertEqual((status, data), (200, {"ok": True, "voices": []}))
                status, _ = case.request("GET", "/api/settings/voices", host="pc.example.ts.net")
                self.assertEqual(status, 403, "the account's voices are shown on the computer only")
            with mock.patch.object(settings, "test_voice", return_value={"ok": True, "audio": "bXAz"}) as heard:
                status, data = case.request("POST", "/api/settings/test", body=b'{"voice_id": "zyxwvutsrq98"}')
                self.assertEqual((status, data["audio"]), (200, "bXAz"))
                self.assertEqual(heard.call_args.args[1], "zyxwvutsrq98")
            status, data = case.request("POST", "/api/settings/test", body=b'{"voice_id": "../x"}')
            self.assertEqual(status, 400)
            with mock.patch.object(settings, "test_voice") as heard, mock.patch("cody.doctor.note_phone"):
                status, _ = case.request("POST", "/api/settings/test", host="pc.example.ts.net", body=b"{}")
                self.assertEqual(status, 403, "the test spends credits: from the computer only")
                heard.assert_not_called()
        finally:
            StatusRoutesTest.tearDownClass()


if __name__ == "__main__":
    unittest.main()

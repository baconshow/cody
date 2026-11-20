"""The clip (cody/uploads.py, voice.send_picture, POST /api/voice/picture): a picture from the phone is kept in Cody's
data folder and the voice session is told where it is."""
import http.client
import json
import re
import tempfile
import threading
import unittest
from pathlib import Path
from unittest import mock

from cody import uploads, voice
from cody.server import App, Server
from tests.test_doctor import CONFIG, free_port

PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64
JPEG = b"\xff\xd8\xff\xe0" + b"\x00" * 64
WEBP = b"RIFF\x10\x00\x00\x00WEBPVP8 " + b"\x00" * 64
GIF = b"GIF89a" + b"\x00" * 64


class KeepTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.folder = Path(self.tmp.name) / "uploads"

    def tearDown(self):
        self.tmp.cleanup()

    def test_pictures_are_told_by_their_first_bytes(self):
        self.assertEqual([uploads.kind(x) for x in (PNG, JPEG, WEBP, GIF)], ["png", "jpg", "webp", "gif"])
        for other in (b"", b"%PDF-1.7", b"MZ\x90\x00", b"<svg xmlns=", b"RIFF\x10\x00\x00\x00WAVEfmt "):
            self.assertIsNone(uploads.kind(other))

    def test_a_picture_is_kept_under_its_own_kind_and_the_time(self):
        path = uploads.save(JPEG, self.folder, clock=lambda: 1_700_000_000)
        self.assertEqual(path.parent, self.folder)
        self.assertRegex(path.name, r"^\d{8}-\d{6}-[0-9a-f]{6}\.jpg$")
        self.assertEqual(path.read_bytes(), JPEG)

    def test_what_is_not_a_picture_or_too_big_is_refused_and_nothing_is_written(self):
        for data, status in ((b"", 400), (b"#!/bin/sh\nrm -rf /", 415), (PNG + b"\x00" * uploads.MAX_BYTES, 413)):
            with self.assertRaises(uploads.UploadError) as caught:
                uploads.save(data, self.folder)
            self.assertEqual(caught.exception.status, status)
        self.assertFalse(self.folder.exists())

    def test_only_the_latest_pictures_stay_and_nothing_else_is_touched(self):
        self.folder.mkdir(parents=True)
        mine = self.folder / "notes.txt"
        mine.write_text("not a picture", encoding="utf-8")
        for i in range(uploads.KEEP + 3):
            uploads.save(PNG, self.folder, clock=lambda i=i: 1_700_000_000 + i)
        pictures = sorted(p for p in self.folder.iterdir() if p.suffix == ".png")
        self.assertEqual(len(pictures), uploads.KEEP)
        self.assertTrue(pictures[0].name.startswith("2023"), pictures[0].name)
        self.assertTrue(mine.exists(), "only Cody's own pictures are ever removed")


class SendPictureTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.folder = Path(self.tmp.name)

    def tearDown(self):
        self.tmp.cleanup()

    def test_without_the_channel_nothing_is_kept(self):
        with self.assertRaises(voice.VoiceError) as caught:
            voice.send_picture(PNG, Path("no-channel.json"), where=self.folder)
        self.assertEqual(caught.exception.status, 503)
        self.assertEqual(list(self.folder.iterdir()), [])

    def test_the_session_is_told_where_the_picture_is(self):
        with mock.patch.object(voice, "_channel", return_value=(1234, "secret")), \
                mock.patch.object(voice, "_ask", return_value={"request_id": "7"}) as ask:
            answer = voice.send_picture(PNG, language="pt-BR", where=self.folder)
        kept = self.folder / answer["file"]
        self.assertEqual(answer["request_id"], "7")
        self.assertTrue(kept.exists())
        method, route, body = ask.call_args.args[1:]
        self.assertEqual((method, route), ("POST", "/message"))
        self.assertIn(str(kept), body["text"])
        self.assertTrue(body["text"].startswith("Estou te mandando uma imagem"))

    def test_a_bad_file_is_said_with_its_reason(self):
        with mock.patch.object(voice, "_channel", return_value=(1234, "secret")), mock.patch.object(voice, "_ask") as ask:
            with self.assertRaises(voice.VoiceError) as caught:
                voice.send_picture(b"not a picture", where=self.folder)
        self.assertEqual(caught.exception.status, 415)
        ask.assert_not_called()


class PictureRouteTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.port = free_port()
        cls.app = App({**CONFIG, "port": cls.port})
        cls.server = Server(cls.app)
        threading.Thread(target=cls.server.serve_forever, daemon=True).start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()

    def post(self, body, content_type="image/png", token=True, length=None):
        connection = http.client.HTTPConnection("127.0.0.1", self.port, timeout=5)
        connection.request("GET", "/", headers={"Host": f"127.0.0.1:{self.port}"})
        found = re.search(rb'name="cody-token" content="([^"]+)"', connection.getresponse().read()).group(1)
        headers = {"Host": f"127.0.0.1:{self.port}", "Content-Type": content_type,
                   "Content-Length": str(len(body) if length is None else length)}
        if token:
            headers["X-Cody-Token"] = found.decode()
        connection.request("POST", "/api/voice/picture", body=body, headers=headers)
        response = connection.getresponse()
        data = json.loads(response.read() or b"{}")
        connection.close()
        return response.status, data

    def test_the_picture_goes_to_the_voice_session(self):
        with mock.patch.object(voice, "send_picture", return_value={"request_id": "3", "file": "x.png"}) as sent:
            status, data = self.post(PNG)
        self.assertEqual((status, data["request_id"]), (202, "3"))
        self.assertEqual(sent.call_args.args[0], PNG)

    def test_refusals(self):
        with mock.patch.object(voice, "send_picture") as sent:
            self.assertEqual(self.post(PNG, token=False)[0], 403)
            self.assertEqual(self.post(PNG, content_type="application/json")[0], 415)
            self.assertEqual(self.post(b"x", length=uploads.MAX_BYTES + 1)[0], 413)
        sent.assert_not_called()


if __name__ == "__main__":
    unittest.main()

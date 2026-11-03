import json
import os
import re
import subprocess
import sys
import tempfile
import threading
import time
import unittest
from pathlib import Path

from cody import voice
from cody.abilities import Abilities
from cody.channel import Channel, channel_file, create_http, spoken_verdict
from cody.memory import Memory
from cody.pointer import Pointer
from cody.timers import TimerStore

ROOT = Path(__file__).resolve().parent.parent


def isolated(folder: str, lang: str = "en") -> Abilities:
    """The channel's extra tools with their files in a temp folder, never the real data folder."""
    base = Path(folder)
    return Abilities(lang, store=TimerStore(base / "timers.json"), memory=Memory(base / "memory.json"),
                     pointer=Pointer(look=lambda: (b"\x89PNG", None), start=None, path=base / "pointer.json"))


class ChannelTest(unittest.TestCase):
    def setUp(self):
        self.sent = []
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.channel = self.make(lambda line: self.sent.append(json.loads(line)))

    def make(self, write=lambda line: None, **options) -> Channel:
        return Channel(write, abilities=isolated(self.tmp.name), **options)

    def test_initialize_declares_the_channel_and_the_permission_relay(self):
        answer = self.channel.handle({"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {}})
        experimental = answer["result"]["capabilities"]["experimental"]
        self.assertIn("claude/channel", experimental)
        self.assertIn("claude/channel/permission", experimental)
        self.assertEqual(answer["result"]["protocolVersion"], "2025-06-18")

    def test_utterance_becomes_a_channel_notification(self):
        request = self.channel.utterance("what time is it")
        self.assertEqual(self.sent[-1]["method"], "notifications/claude/channel")
        self.assertEqual(self.sent[-1]["params"]["meta"]["request_id"], request)

    def test_reply_tool_stores_what_to_say_and_show(self):
        self.channel.handle({"jsonrpc": "2.0", "id": 2, "method": "tools/call",
                             "params": {"name": "reply", "arguments": {"request_id": "1", "say": "Done.",
                                                                       "show": "https://example.com"}}})
        self.assertEqual(self.channel.replies(0)[0]["text"], "Done.")
        self.assertEqual(self.channel.replies(0)[0]["show"], "https://example.com")

    def test_empty_reply_is_an_error(self):
        answer = self.channel.handle({"jsonrpc": "2.0", "id": 3, "method": "tools/call",
                                      "params": {"name": "reply", "arguments": {"request_id": "1", "say": "  "}}})
        self.assertTrue(answer["result"]["isError"])

    def test_spoken_yes_answers_the_open_permission_prompt(self):
        self.channel.handle({"jsonrpc": "2.0", "method": "notifications/claude/channel/permission_request",
                             "params": {"request_id": "abcde", "tool_name": "Bash", "description": "list files",
                                        "input_preview": "ls -la"}})
        prompt = self.channel.replies(0)[0]
        self.assertEqual(prompt["permission"], "abcde")
        self.assertEqual(prompt["show"], "ls -la")
        self.assertEqual(self.channel.utterance("yes please"), "")
        self.assertEqual(self.sent[-1]["params"], {"request_id": "abcde", "behavior": "allow"})

    def open_prompt(self, preview: str = "ls -la") -> None:
        self.channel.handle({"jsonrpc": "2.0", "method": "notifications/claude/channel/permission_request",
                             "params": {"request_id": "abcde", "tool_name": "Bash", "description": "run it",
                                        "input_preview": preview}})

    def test_only_a_whole_short_yes_or_no_is_a_verdict(self):
        for text in ("ok, stop", "sure, wait", "claro, não faça isso", "yes but not rm", "okay so what does it do",
                     "não pode"):
            self.assertIsNone(spoken_verdict(text), text)
        self.assertEqual(spoken_verdict("Yes!"), "allow")
        self.assertEqual(spoken_verdict("go ahead please"), "allow")
        self.assertEqual(spoken_verdict("pode sim"), "allow")
        self.assertEqual(spoken_verdict("no, stop"), "deny")
        self.assertEqual(spoken_verdict("não"), "deny")

    def test_a_sentence_starting_with_ok_does_not_approve(self):
        self.open_prompt()
        self.assertNotEqual(self.channel.utterance("ok, stop"), "")
        self.assertEqual(self.sent[-1]["method"], "notifications/claude/channel")
        self.assertEqual(self.channel.utterance("no"), "")
        self.assertEqual(self.sent[-1]["params"]["behavior"], "deny")

    def test_line_breaks_stay_visible_in_the_preview(self):
        self.open_prompt("cd /tmp\nrm -rf *")
        self.assertEqual(self.channel.replies(0)[0]["show"], "cd /tmp rm -rf *")

    def test_a_preview_too_long_to_show_is_answered_in_the_terminal(self):
        self.open_prompt("x" * 900)
        prompt = self.channel.replies(0)[0]
        self.assertIsNone(prompt["permission"])
        self.assertTrue(prompt["show"].endswith("…"))
        self.assertNotEqual(self.channel.utterance("yes"), "", "no voice verdict for it")

    def call(self, name: str, arguments: dict | None = None) -> dict:
        return self.channel.handle({"jsonrpc": "2.0", "id": 7, "method": "tools/call",
                                    "params": {"name": name, "arguments": arguments or {}}})["result"]

    def test_screenshot_goes_to_the_phone_and_claude_only_gets_an_id(self):
        channel = self.make(capture=lambda: b"\x89PNG fake")
        tools = channel.handle({"jsonrpc": "2.0", "id": 1, "method": "tools/list"})["result"]["tools"]
        self.assertEqual([tool["name"] for tool in tools],
                         ["reply", "screenshot", "timer", "remember", "forget", "look", "point"])
        self.channel = channel
        result = self.call("screenshot")
        text = result["content"][0]["text"]
        self.assertNotIn("isError", result)
        self.assertEqual([c["type"] for c in result["content"]], ["text"], "never the picture itself")
        image_id = re.search(r'image="([^"]+)"', text).group(1)
        self.assertEqual(channel.image(image_id), b"\x89PNG fake")
        self.call("reply", {"request_id": "1", "say": "It is on your phone.", "image": image_id})
        self.assertEqual(channel.replies(0)[-1]["image"], image_id)

    def test_reply_with_an_unknown_image_is_an_error(self):
        result = self.call("reply", {"request_id": "1", "say": "Here.", "image": "nope"})
        self.assertTrue(result["isError"])
        self.assertEqual(self.channel.replies(0), [])

    def test_failed_screenshot_is_a_tool_error(self):
        def broken():
            raise OSError("locked")
        self.channel = self.make(capture=broken)
        self.assertTrue(self.call("screenshot")["isError"])

    def test_only_the_latest_screenshots_are_kept(self):
        self.channel = self.make(capture=lambda: b"\x89PNG")
        ids = [re.search(r'image="([^"]+)"', self.call("screenshot")["content"][0]["text"]).group(1) for _ in range(5)]
        self.assertIsNone(self.channel.image(ids[0]))
        self.assertIsNotNone(self.channel.image(ids[-1]))

    def test_yes_without_a_prompt_is_a_normal_message(self):
        self.assertNotEqual(self.channel.utterance("yes"), "")
        self.assertEqual(self.sent[-1]["method"], "notifications/claude/channel")

    def test_unknown_method(self):
        answer = self.channel.handle({"jsonrpc": "2.0", "id": 9, "method": "nope"})
        self.assertEqual(answer["error"]["code"], -32601)

    def test_saved_facts_ride_on_the_first_utterance_only(self):
        self.channel.abilities.memory.remember('The user\'s name is Ana, "Aninha".')
        self.channel.abilities.memory.remember("Ana likes tea.")
        request = self.channel.utterance("hi")
        self.assertEqual(len(self.sent), 1, "one message: no extra turn for the memory")
        meta = self.sent[-1]["params"]["meta"]
        self.assertEqual(meta["request_id"], request)
        self.assertEqual(meta["memory"], "The user's name is Ana, 'Aninha'. | Ana likes tea.")
        self.assertEqual(self.sent[-1]["params"]["content"], "hi")
        self.channel.utterance("and again")
        self.assertNotIn("memory", self.sent[-1]["params"]["meta"])

    def test_no_memory_without_saved_facts(self):
        self.channel.utterance("hi")
        self.assertNotIn("memory", self.sent[-1]["params"]["meta"])

    def test_a_saved_fact_shows_on_the_phone(self):
        self.call("remember", {"fact": "Ana likes tea."})
        self.assertEqual(self.channel.replies(0)[-1]["note"], "Ana likes tea.")
        self.assertEqual(self.channel.replies(0)[-1]["text"], "")

    def test_remember_through_the_channel(self):
        self.assertNotIn("isError", self.call("remember", {"fact": "Ana likes short answers."}))
        self.assertEqual(self.channel.abilities.memory.facts(), ["Ana likes short answers."])

    def test_timer_through_the_channel(self):
        result = self.call("timer", {"action": "set", "minutes": 10, "label": "pizza"})
        self.assertNotIn("isError", result)
        self.assertIn("pizza", self.call("timer", {"action": "list"})["content"][0]["text"])

    def test_each_channel_has_its_own_session_id(self):
        self.assertNotEqual(self.channel.session, self.make().session)


class EndToEndTest(unittest.TestCase):
    """The real channel process, driven the way Claude Code drives it, and the server side of the voice routes."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        env = {**os.environ, "LOCALAPPDATA": self.tmp.name, "XDG_STATE_HOME": self.tmp.name}
        self.path = Path(self.tmp.name) / "cody" / "channel.json"
        self.process = subprocess.Popen([sys.executable, str(ROOT / "cody" / "channel.py")], env=env,
                                        stdin=subprocess.PIPE, stdout=subprocess.PIPE)
        self.rpc({"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {}})
        self.assertEqual(self.read()["id"], 1)
        for _ in range(100):
            if self.path.exists():
                break
            time.sleep(0.05)

    def tearDown(self):
        self.process.stdin.close()
        self.process.wait(timeout=5)
        self.process.stdout.close()
        self.tmp.cleanup()

    def rpc(self, message: dict) -> None:
        self.process.stdin.write((json.dumps(message) + "\n").encode("utf-8"))
        self.process.stdin.flush()

    def read(self) -> dict:
        return json.loads(self.process.stdout.readline())

    def test_voice_round_trip(self):
        request = voice.say({"text": "hello mascot"}, self.path)["request_id"]
        pushed = self.read()
        self.assertEqual(pushed["params"]["content"], "hello mascot")
        self.rpc({"jsonrpc": "2.0", "id": 2, "method": "tools/call",
                  "params": {"name": "reply", "arguments": {"request_id": request, "say": "Hi there."}}})
        self.assertEqual(self.read()["id"], 2)
        replies = voice.replies("0", self.path)
        self.assertTrue(replies["channel"])
        self.assertRegex(replies["session"], r"^[0-9a-f]{8}$")
        self.assertEqual(replies["replies"][0]["text"], "Hi there.")

    def test_channel_file_is_removed_on_close(self):
        self.assertTrue(self.path.exists())
        self.process.stdin.close()
        self.process.wait(timeout=5)
        self.assertFalse(self.path.exists())

    def test_wrong_secret_is_refused(self):
        data = json.loads(self.path.read_text(encoding="utf-8"))
        with self.assertRaises(voice.VoiceError):
            voice.say({"text": "x"}, self._forged(data))

    def _forged(self, data: dict) -> Path:
        forged = Path(self.tmp.name) / "forged.json"
        forged.write_text(json.dumps({"port": data["port"], "secret": "wrong"}), encoding="utf-8")
        return forged


class ImageRouteTest(unittest.TestCase):
    """The screenshot travels channel -> mascot server -> phone, only with the channel's secret."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.channel = Channel(lambda line: None, capture=lambda: b"\x89PNG\r\n\x1a\nfake",
                               abilities=isolated(self.tmp.name))
        self.http = create_http(self.channel, "s3cret")
        threading.Thread(target=self.http.serve_forever, daemon=True).start()
        self.path = Path(self.tmp.name) / "channel.json"
        self.path.write_text(json.dumps({"port": self.http.server_address[1], "secret": "s3cret"}), encoding="utf-8")

    def tearDown(self):
        self.http.shutdown()
        self.http.server_close()
        self.tmp.cleanup()

    def test_image_round_trip(self):
        text = self.channel.handle({"jsonrpc": "2.0", "id": 1, "method": "tools/call",
                                    "params": {"name": "screenshot", "arguments": {}}})["result"]["content"][0]["text"]
        image_id = re.search(r'image="([^"]+)"', text).group(1)
        self.assertEqual(voice.image(image_id, self.path), b"\x89PNG\r\n\x1a\nfake")

    def test_bad_or_unknown_ids(self):
        for bad in ("../x", "", "a" * 65, "id?x=1"):
            with self.assertRaises(voice.VoiceError) as caught:
                voice.image(bad, self.path)
            self.assertEqual(caught.exception.status, 400, bad)
        with self.assertRaises(voice.VoiceError) as caught:
            voice.image("unknown", self.path)
        self.assertEqual(caught.exception.status, 404)

    def test_wrong_secret_gets_no_image(self):
        self.path.write_text(json.dumps({"port": self.http.server_address[1], "secret": "wrong"}), encoding="utf-8")
        with self.assertRaises(voice.VoiceError):
            voice.image("anything", self.path)


class VoiceTest(unittest.TestCase):
    def test_closed_channel(self):
        missing = Path(tempfile.gettempdir()) / "cody-missing" / "channel.json"
        with self.assertRaises(voice.VoiceError) as caught:
            voice.say({"text": "hi"}, missing)
        self.assertEqual(caught.exception.status, 503)
        self.assertEqual(voice.replies("0", missing), {"channel": False, "session": None, "replies": []})

    def test_text_is_validated(self):
        for bad in (None, 3, "   ", "\x00\x01"):
            with self.assertRaises(voice.VoiceError):
                voice.validate_text(bad)
        self.assertEqual(len(voice.validate_text("a" * 900)), voice.MAX_TEXT)

    def test_audio_without_voice_is_404(self):
        with self.assertRaises(voice.VoiceError) as caught:
            voice.audio("1", None)
        self.assertEqual(caught.exception.status, 404)

    def test_channel_file_location(self):
        self.assertEqual(channel_file().name, "channel.json")


if __name__ == "__main__":
    unittest.main()

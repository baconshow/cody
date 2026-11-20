"""Usage limits (cody/usage.py): the status line keeps the two windows, chains yours, and the question is answered."""
import io
import json
import tempfile
import unittest
from pathlib import Path

from cody import usage

STATUS = {"session_id": "secret", "cwd": "C:/private", "transcript_path": "x",
          "rate_limits": {"five_hour": {"used_percentage": 42.4, "resets_at": 1_800_000_000},
                          "seven_day": {"used_percentage": 10, "resets_at": "2027-01-21T15:00:00Z"}}}


class WindowsTest(unittest.TestCase):
    def test_only_the_two_windows_are_kept(self):
        w = usage.windows_of(STATUS)
        self.assertEqual(set(w), {"five_hour", "seven_day"})
        self.assertEqual(w["five_hour"], {"used": 42, "resets_at": 1_800_000_000.0})
        self.assertEqual(w["seven_day"]["used"], 10)
        self.assertAlmostEqual(w["seven_day"]["resets_at"], 1_800_000_000.0, delta=4e6)   # an ISO text, parsed
        self.assertIsNone(usage.windows_of({"cwd": "x"}), "an API account: no limits")
        self.assertIsNone(usage.windows_of({"rate_limits": {"five_hour": {"used_percentage": "no"}}}))
        self.assertEqual(usage.windows_of({"rate_limits": {"five_hour": {"utilization": 130}}})["five_hour"]["used"], 100)


class StatuslineTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.path = Path(self.tmp.name) / "usage.json"

    def tearDown(self):
        self.tmp.cleanup()

    def run_it(self, payload, config):
        out = io.StringIO()
        code = usage.run_statusline(io.BytesIO(json.dumps(payload).encode()), self.path, config, now=lambda: 1000.0, out=out)
        return code, out.getvalue()

    def test_keeps_the_windows_and_prints_its_own_line(self):
        code, line = self.run_it(STATUS, {"language": "en"})
        self.assertEqual(code, 0)
        self.assertEqual(line.strip(), "Cody · session 42% · week 10%")
        kept = json.loads(self.path.read_text(encoding="utf-8"))
        self.assertEqual(set(kept), {"at", "five_hour", "seven_day"}, "nothing else of the status JSON")
        self.assertNotIn("secret", self.path.read_text(encoding="utf-8"))

    def test_runs_the_status_line_you_had_with_the_same_input(self):
        yours = "import sys,json; print('yours:' + str(json.load(sys.stdin)['rate_limits']['seven_day']['used_percentage']))"
        previous = {"type": "command", "command": f'"{__import__("sys").executable}" -c "{yours}"'}
        code, line = self.run_it(STATUS, {"language": "en", "statusline_previous": previous})
        self.assertEqual(code, 0)
        self.assertEqual(line.strip(), "yours:10")

    def test_junk_input_never_fails(self):
        out = io.StringIO()
        self.assertEqual(usage.run_statusline(io.BytesIO(b"not json"), self.path, {"language": "pt-BR"}, out=out), 0)
        self.assertEqual(out.getvalue().strip(), "Cody · uso desconhecido")
        self.assertFalse(self.path.exists())

    def test_read_and_phrase(self):
        self.run_it(STATUS, {"language": "en"})
        data = usage.read(self.path, now=lambda: 1300.0)
        self.assertEqual(data["five_hour"]["used"], 42)
        self.assertEqual(data["age_s"], 300.0)
        said = usage.phrase(data, "en", now=lambda: 1_800_000_000 - 3600)
        self.assertTrue(said.startswith("Session: 42% used, resets at "), said)
        self.assertIn("Week: 10% used, resets on ", said)
        self.assertNotIn("ago", said)
        old = usage.phrase({**data, "age_s": 8 * 3600}, "pt-BR", now=lambda: 1_800_000_000 - 3600)
        self.assertIn("Isso foi há 8 horas", old)
        self.assertEqual(usage.phrase(None, "pt-BR"), usage.TEXT["pt-BR"]["unknown"])
        self.assertIsNone(usage.read(Path(self.tmp.name) / "missing.json"))

    def test_the_short_form_for_the_box_on_screen(self):
        self.run_it(STATUS, {"language": "en"})
        data = usage.read(self.path, now=lambda: 1300.0)
        self.assertEqual(usage.short(data, "en"), "session 42% · week 10%")
        self.assertEqual(usage.short(data, "pt-BR"), "sessão 42% · semana 10%")
        self.assertIsNone(usage.short(None, "en"), "nothing known: nothing in the box")


class QuestionTest(unittest.TestCase):
    def test_short_questions_about_my_usage(self):
        for text in ("quanto resta de uso?", "Cody, quanto resta de uso", "how much usage do I have left", "what are my limits",
                     "meu limite de uso", "quanto sobra da minha cota", "usage left?"):
            self.assertTrue(usage.is_usage_question(text), text)

    def test_other_limits_go_to_claude(self):
        for text in ("qual o limite do postgres", "set a limit on the query", "o que é uso de memória no linux",
                     "how much usage does the free plan of vercel have in a month compared to"):
            self.assertFalse(usage.is_usage_question(text), text)


class InstallTest(unittest.TestCase):
    def test_install_keeps_yours_and_remove_puts_it_back(self):
        with tempfile.TemporaryDirectory() as tmp:
            settings = Path(tmp) / "settings.json"
            config = Path(tmp) / "config.json"
            yours = {"type": "command", "command": "bash ~/.claude/statusline.sh"}
            settings.write_text(json.dumps({"statusLine": yours, "model": "opus"}), encoding="utf-8")
            note = usage.install(path=settings, config_path=config, command='"py" "cody.py" --statusline')
            self.assertIn("Yours still shows", note)
            saved = json.loads(settings.read_text(encoding="utf-8"))
            self.assertEqual(saved["model"], "opus")
            self.assertTrue(usage.is_ours(saved["statusLine"]))
            self.assertTrue(usage.installed(settings))
            self.assertEqual(json.loads(config.read_text(encoding="utf-8"))[usage.PREVIOUS_KEY], yours)
            self.assertEqual(usage.install(path=settings, config_path=config, command='"py" "cody.py" --statusline'),
                             "Cody is the status line already.")
            self.assertTrue(any(p.name.startswith("settings.json.cody-backup") for p in Path(tmp).iterdir()))
            usage.install(remove=True, path=settings, config_path=config)
            self.assertEqual(json.loads(settings.read_text(encoding="utf-8"))["statusLine"], yours)
            self.assertNotIn(usage.PREVIOUS_KEY, json.loads(config.read_text(encoding="utf-8")))
            self.assertFalse(usage.installed(settings))

    def test_without_a_status_line_before_removal_leaves_none(self):
        with tempfile.TemporaryDirectory() as tmp:
            settings = Path(tmp) / "settings.json"
            config = Path(tmp) / "config.json"
            usage.install(path=settings, config_path=config, command='"py" "cody.py" --statusline')
            self.assertTrue(usage.installed(settings))
            usage.install(remove=True, path=settings, config_path=config)
            self.assertNotIn("statusLine", json.loads(settings.read_text(encoding="utf-8")))


if __name__ == "__main__":
    unittest.main()

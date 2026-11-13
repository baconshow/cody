"""Cody's sounds: the files in web/sounds are exactly what tools/make_sounds.py makes (no outside audio)."""
import importlib.util
import tempfile
import unittest
from pathlib import Path
from unittest import mock

ROOT = Path(__file__).resolve().parent.parent


class SoundsTest(unittest.TestCase):
    def test_the_committed_sounds_come_from_the_generator(self):
        spec = importlib.util.spec_from_file_location("make_sounds", ROOT / "tools" / "make_sounds.py")
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        with tempfile.TemporaryDirectory() as tmp, mock.patch.object(module, "OUT", Path(tmp)), \
                mock.patch("builtins.print"):
            module.main()
            made = sorted(p.name for p in Path(tmp).glob("*.wav"))
            committed = sorted(p.name for p in (ROOT / "web" / "sounds").glob("*.wav"))
            self.assertEqual(made, committed)
            for name in made:
                self.assertEqual((Path(tmp) / name).read_bytes(), (ROOT / "web" / "sounds" / name).read_bytes(), name)

    def test_the_generator_uses_only_the_standard_library(self):
        source = (ROOT / "tools" / "make_sounds.py").read_text(encoding="utf-8")
        imports = {line.split()[1].split(".")[0] for line in source.splitlines()
                   if line.startswith(("import ", "from ")) and "__future__" not in line}
        self.assertLessEqual(imports, {"math", "random", "struct", "wave", "pathlib"})


if __name__ == "__main__":
    unittest.main()

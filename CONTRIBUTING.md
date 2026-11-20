# Contributing

Thanks for helping Cody! Small pull requests are easiest to review.

## Run it

```bash
python cody.py --open            # Python 3.10+, nothing to pip install
```

## Tests and lint (CI runs the same on Windows, macOS and Linux)

```bash
python -m unittest discover tests
node --test "tests/js/*.test.mjs"
ruff check .
```

## Rules of the house

- The server and the voice channel use the Python standard library only. Build tools (PyInstaller, pystray, Pillow
  for the Windows app; anything in `tools/`) are fine where they are.
- No telemetry, no outside services by default. Anything that leaves the computer is opt-in and explained on screen.
- Never skip Claude Code's permission prompts, never use Tailscale Funnel.
- Code, comments and docs in English; screen text in English and Brazilian Portuguese (`web/js/strings.js`,
  `cody/doctor.py`).
- Art and sounds are made from scratch: no assets from games, mods or Anthropic. New scenes go in
  `web/scenes/scenes.json`.
- Cody is an unofficial fan project: do not use "Claude" in product or skin names.

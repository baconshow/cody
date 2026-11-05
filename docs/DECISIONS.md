# Decisions

Reversible choices made while preparing the launch, with the reason. Newest last.

## 2026-11-05 · three.js and the font ship in the repository

three.js 0.186.1 (`build/three.module.js`, `build/three.core.js` and the two examples the mascot uses) lives in
`web/vendor/three`, with its MIT license, in the same folder layout as the npm package, so the importmap only changes
its base URL. The package has no minified build for this version, so the files are kept as published (about 2 MB).
The block font, Jersey 10 (SIL Open Font License), lives in `web/fonts` as the two woff2 subsets Google Fonts serves,
declared with `@font-face` in `style.css`. The Content-Security-Policy now allows only `'self'` (plus the importmap
hash): the page loads nothing from outside and works without internet.

## 2026-11-05 · Lint at 140 columns

`ruff check` (pyflakes and pycodestyle errors) runs in CI. The code wraps at about 120 columns; a handful of literals
and test tables go a little over, so the limit is 140 instead of reflowing them.

## 2026-11-05 · Coverage floors

CI fails below 65% line coverage for Python (72% today on Linux; `overlay.py` is Windows-only and reads 0% elsewhere)
and below 90% for the JavaScript tests (96% today).

## 2026-11-05 · Windows app: PyInstaller folder build and Inno Setup

`CodySetup.exe` is built in CI (`.github/workflows/windows-app.yml`) from `packaging/`: PyInstaller makes one folder
with two programs sharing the same files, `Cody.exe` (no console: the tray app) and `cody-cli.exe` (console: what
Claude Code runs for hooks and the voice channel, which talk over stdin and stdout). A folder build starts in a
fraction of a second, which matters for hooks; a one-file build unpacks itself on every run. Inno Setup installs per
user in `%LOCALAPPDATA%\Programs\Cody`, so no admin rights and no UAC prompt. The tray menu uses pystray and Pillow,
bundled only in the app: Cody from source still needs nothing from pip.

## 2026-11-05 · What opening the app does

Opening Cody.exe starts the server, opens the mascot in the browser and opens the voice session in a terminal
window, unless one is already running (`channel.json` names a port that answers). Started with Windows
(`--background`), it only starts the server and waits in the tray: a Claude Code window popping up at every login
would be rude. The voice session's MCP config is written with `json.dumps` to the data folder, which also fixes the
two script debts (unescaped `printf` JSON and leftover temp file in `voice.sh`, fixed `%TEMP%` path in `voice.ps1`):
both scripts now call `python cody.py --voice`.

## 2026-11-05 · Version 1.2.0

The package said 0.1.0 while the README history calls the current release v1.1. The launch build is 1.2.0, in
`cody/__init__.py`, shown by `--version` and sent as the MCP server version.

## 2026-11-05 · The plugin brings hooks and commands, not the channel's MCP server

The plugin (`.claude-plugin/`, `hooks/hooks.json`, `commands/`) installs with two commands from this repository's
marketplace. It does not declare the voice channel as an MCP server, for three reasons from the current plugin and
channel docs: a plugin's MCP servers start in every Claude Code session, while the channel belongs only in the voice
session (in other sessions it would take over `channel.json` and offer tools that do nothing); a channel from our
own marketplace still needs `--dangerously-load-development-channels` ("A channel published to your own marketplace
still needs `--dangerously-load-development-channels` to run, since it isn't on the approved allowlist"), so the
plugin would not save that step; and an MCP server is started without a shell, so there is no command that finds
Python on every system (`python3` is missing on most Windows machines). `/cody:voice` opens the voice session, which
loads the channel from the plugin's own folder with the absolute path of the Python that runs it.

A plugin cannot pre-approve tools for every session (the docs list only per-command `allowedTools`), so the list of
harmless tools stays in the voice session's command line (`cody/launcher.py`, `SAFE_TOOLS`).

## 2026-11-05 · No double hooks

With the plugin enabled (`enabledPlugins` in Claude Code's user settings), `--install-hooks` adds nothing and the
first-run question about hooks is not asked. If both copies are there anyway (the plugin enabled after
`--install-hooks`), the server counts a repeated "needs you" from the same session within 3 seconds once; a repeated
"done" is already ignored, since the first one consumes the turn's start.

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
and below 85% for the JavaScript tests. The JavaScript floor started at 90% and was lowered to 85% when the Status,
Settings and network screens and the audio fallback arrived: their decisions are pure functions with tests, but the
DOM and WebAudio wiring cannot run in Node, so it is checked with headless Chromium captures instead (88% today).

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

## 2026-11-05 · One doctor for the terminal, the API and the screen

`cody/doctor.py` holds the checks once: `--doctor` prints them, `GET /api/status` returns them in the page's
language (cached 10 s, since it runs `tailscale`), and the Status screen adds what only the browser knows
(microphone, speech recognition, sound, HTTPS). Buttons that change the computer (`POST /api/action`: open the voice
session, add the hooks) are refused through Tailscale: from the phone the screen shows the advice without the
button. Each voice channel registers itself in `voice-sessions/<pid>.json`; the doctor counts the ones whose port
answers (more than one is a warning) and deletes the rest. The channel marks `channel.json` as loaded when Claude
Code sends `notifications/initialized`. The known false alarm (`no MCP server configured with that name`) is
explained next to the channel item.

`channel.log` not being written by real sessions could not be reproduced here (the same `data_dir()` writes
`channel.json`, which works). The doctor now shows whether the channel loaded without relying on that log; the check
on a real machine is in `docs/MANUAL-TESTS.md`.

## 2026-11-05 · QR codes made in Cody, and settings only from the computer

`cody/qr.py` encodes QR codes itself (byte mode, level M, versions 1 to 10, standard mask scoring), so no QR service
sees the phone's address. It was checked by decoding seven samples (versions 2 to 10, including version 7 with
version bits and version 10 with a 16-bit count) with OpenCV; the test pins the output of the one that was checked.
The Settings screen reads everything from anywhere it is allowed to load, but every change (`POST /api/settings`,
`/api/settings/key`, `/api/settings/test`) is refused through Tailscale: the phone is trusted to talk to Claude, not
to change the computer. The ElevenLabs key goes to `elevenlabs.key` in the data folder (mode 600) and is never
returned; the environment variable and `~/.elevenlabs-key` still work and win in that order.

## 2026-11-05 · Cody's sounds and the voice fallback

The sounds are synthesized by `tools/make_sounds.py` with a fixed seed (a soft odd-harmonic voice through two
vowel-like resonances, plus vibrato), 16 kHz mono WAV, 22 files, 236 KB. A test remakes them and compares the bytes,
so the committed files are provably ours. The chatter picks one syllable per vowel group of the text, with pauses at
spaces and punctuation and a rise at a question, so the same reply always sounds the same.

The page tries the outputs from the chosen one down to Cody's sounds (`order()` in `web/js/sounds.js`). The hosted
voice is listed but returns "not available" until P1.6 exists. A fallback is announced once per visit per reason, not
on every reply. Timers now ring with the alarm sound (the old two-note chime still repeats while ringing).

## 2026-11-05 · Scenes as data

A scene is an entry in `web/scenes/scenes.json`: parts made of boxes in voxel units, an optional clip per part, an
optional sound when it starts, a trigger name and a priority. Triggers are a fixed list in `web/js/scenes.js`, so a
community scene can only use known conditions; an entry with an unknown trigger is dropped instead of breaking the
page. The 3D renderer shares one box geometry and one material per color, grows a scene in and out in about 0.2 s,
and stops all clips with "reduce motion". The 2D fallback shows no scenes. The debug scene needs a failure signal:
the activity reader now emits a content-free `!failed` event for a `tool_result` marked `is_error`. The headphones
scene is ready, but its trigger (music) only fires once P1.3 reads what is playing. Everything is drawn from
scratch; the reference figures were used only as a list of accessory ideas.

## 2026-11-05 · Security review of P0: what changed

- **Tailscale requests are recognized by the headers serve adds, not by the Host.** Serve passes the client's Host
  header through, so a tailnet device could send `Host: 127.0.0.1:7420`, look local, change settings and skip
  `allowed_logins` (that last part was already possible on main). A request with `X-Forwarded-For`,
  `X-Forwarded-Proto`, `X-Forwarded-Host` or a `Tailscale-*` header, or with a Tailscale host name, now counts as
  coming through Tailscale; "this computer" also requires Host `127.0.0.1:port` or `localhost:port`. Tests send the
  spoofed request.
- The slash commands no longer pre-approve `Bash(python3:*)`: that allowed any Python for the turn. Claude Code asks.
- The installer no longer shows the folder page, and uninstall only removes the folder if it is empty.
- The voice test in Settings goes through the same per-minute and per-day limits as spoken replies.
- `tailscale login` output is read by a thread with a timeout, so a silent process cannot hold a request forever.
- A Tailscale address added with no known login (a tagged device) is logged as open to the whole tailnet.
- Known and unchanged: another user account on the same computer can load the page from 127.0.0.1.

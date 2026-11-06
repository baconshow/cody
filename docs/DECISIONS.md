# Decisions

Reversible choices made while preparing the launch, with the reason. Newest last.

## 2026-11-05 · three.js and the font ship in the repository

three.js 0.186.1 (`build/three.module.js`, `build/three.core.js` and the two examples the mascot uses) lives in
`web/vendor/three`, with its MIT license, in the same folder layout as the npm package, so the importmap only changes
its base URL. The package has no minified build for this version, so the files are kept as published (about 2 MB).
The font lives in `web/fonts` as the two woff2 subsets Google Fonts serves (latin and latin-ext), declared with
`@font-face` in `style.css`. The Content-Security-Policy now allows only `'self'` (plus the importmap
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

## 2026-11-05 · Varela Round instead of the pixel font

The maintainer asked for Varela Round (SIL Open Font License, license in `web/fonts/OFL.txt`): the app looks modern
and the 8-bit pixel font no longer fits. It ships in `web/fonts` like the old one (no font service at run time).
Varela Round is much wider than the condensed pixel font, so every size in the mascot's font went to 80%. The debug
scene's terminal sign uses the system monospace font.

## 2026-11-06 · The feet follow a real turn, not the gaze

The legs were outside the group that turns, so listening sideways rotated the body box over four legs that stayed
put. They are now one group under the body. The rule the maintainer asked for (planted for small head movements,
following past a threshold) is split by where the turn comes from: the body's turn with the gaze (at most 0.32 rad)
leaves the feet planted up to 0.2 rad and drags them only by the excess; the sideways turn (0.95 rad) takes them
all the way, on a spring a little slower than the body's, stepping in diagonal pairs while they move. A threshold
on the total angle was tried on paper first: at a full sideways turn it made the legs shuffle with every glance.
The rule lives in `animator.js` (`feetYaw`), so the tests cover it without WebGL.

## 2026-11-06 · Scene parts are worn or stand in the room

A scene part with `"on": "body"` goes in a group on the mascot's body and turns, hops, tilts and breathes with it; a
`"pivot"` says where it grows from and sways around. Everything else stands still around the mascot. An anchor this
version does not know is treated as the room, so a newer scene file cannot break an older page. Worn today: the
nightcap (right half of the head, clear of the sprout; the Z letters moved to the left), the headphones (the band
leans back behind the sprout), the coffee mug (in the right hand) and the debug bug (walking on the head). The mug
and the bug used to sit on the floor in front, which a wide screen cuts off: only the steam showed.

## 2026-11-06 · The camera slides for a wide scene

The monitor and the debug sign stand beside the mascot and did not fit on a wide phone or a narrow window. Instead
of shrinking them or the mascot, the camera moves sideways by the least that fits both (the mascot keeps its size)
and pulls back only when the mascot and the scene together are wider than the screen (`scenes.js` `frameFor`). The
extent is read from the scene's own boxes, so a community scene gets the same treatment with no extra field.

## 2026-11-06 · A tap is silent, and only the mascot is tapped

Tapping and holding the face is how you call Cody when the wake word misses, so the pet sound no longer plays on a
tap; `pet.wav` stays in `web/sounds` (the sound test still remakes it) for a later use. A scene that was gone for
less than 5 seconds returns without its sound: a tap shows the party for a second, and the debug scene behind it
used to return with its error sound. What counts is how long the scene was away, not when its sound last played, so
a tap late in a long failure stays silent and a new failure after a real pause sounds again. A tap on a button or a panel drawn over the mascot is not a pat any more (no hop
and confetti while changing a setting), and Space or Enter typed in a field does not poke it.

## 2026-11-06 · The wake word light, and Settings as a drawer

The corner said "listening for Cody" in words; it is now a 12 px light (green on, red off) on a 44 px target. Its
words show on hover, on keyboard focus and for 1.8 s after a switch, since a phone has no hover. Next to it, a gear
opens Settings: before, only the tray menu and `#settings` did. Settings is a drawer on the right (the full width on
a phone) so the mascot stays in view, with a title bar and its close button at the top (Esc and a click outside
close it too) instead of a Close button floating in the bottom corner. The ElevenLabs fields show only while
ElevenLabs is the chosen voice. The hosted voice is listed as "coming soon" and cannot be picked: choosing it only
fell through to the device's voice with a notice.

The Status screen, the network screen and the first-run card still used the old full-screen layout at this point:
the drawer was the direction to be confirmed by the maintainer before the other three followed it (next entry but
one).

## 2026-11-06 · Code review of the polish: what changed

- **A broken scene box could take the camera away for good.** A box with missing numbers made the scene's width
  NaN, the camera slid to NaN and never came back (only "reduce motion" healed it). `sceneSpan` now skips a box it
  cannot measure, `frameFor` answers "the middle" for a width it cannot use, and the camera refuses a number that is
  not finite. A community scene still cannot break the page.
- **Picking a voice no longer redraws the whole drawer.** It redrew everything (two QR codes and a version request
  per pick), threw away the focused radio so the arrow keys stopped after one press, and two quick picks could
  paint out of order. Now only the box under the choice changes; a full redraw (a language change) carries a turn
  number so an older one cannot paint over a newer one, and a key typed but not saved survives it. Closing the
  drawer empties it, so nothing typed stays in a hidden field.
- **The drawer is a dialog.** `role="dialog"` and `aria-modal`, Tab stays inside it, closing returns the focus to
  the gear, the voice group keeps its name for screen readers (the legend is hidden from sight only), and the
  "Saved." line stays in the page while empty so it is announced. A drag that starts inside the drawer and ends
  outside does not close it.
- **The wake word light** keeps one name ("listening for Cody") and says its state with `aria-pressed`; on, it also
  glows, so the state is not told by red and green alone. Its words show under the light, clear of the gear.
- The first-run card's voice radios have their own group name: they shared one with the drawer's, and a redraw of
  the drawer could clear the card's selection.
- Found by opening the page, not by the review: the first version of the radio-name fix read a variable before its
  declaration and the drawer opened empty. The unit tests cannot see that (no DOM), so the check in
  `docs/MANUAL-TESTS.md` section 7 matters.

## 2026-11-06 · One drawer for every screen, and a fake page to test it

The maintainer confirmed the drawer, so Status, the private network and the first run moved into it. The drawer is
now its own module, `web/js/sheet.js`: the dialog behaviour (role, Esc, Tab kept inside, focus returned, a click
outside, only the top drawer answering the keyboard) is written once and the four screens only fill it. The first
run differs in one thing: a click outside does not close it, since a stray click should not skip the welcome; Skip,
the X and Esc all end it and mark it done. Its steps are said again when the language changes on the first one. The
old full-screen styles (`.status-panel`, `.settings-panel`, the floating Close buttons) are gone.

The screens had no tests: their code needs a page, and the first version of one fix opened an empty drawer that only
a browser showed. `tests/js/fake-dom.mjs` is a page small enough to read in one sitting (elements, classes, events
that bubble, focus, a `#hash`), and `tests/js/sheet.test.mjs` runs the drawer and the four screens on it: what
opens, what a key or a click does, what the server is asked. It found one real bug on its first run (the first run
could show twice in one visit: the page did not remember it was done). JavaScript line coverage on a developer
machine went from 80% to 96%, measured without the fake page itself (CI leaves it out with
`--test-coverage-exclude`); the 85% floor in CI stays.

## 2026-11-06 · Your ElevenLabs key, then a list of your voices to hear

A voice used to be an id copied from the ElevenLabs site into a field. With a key saved, Settings (and the first
step of the first run, when ElevenLabs is the chosen voice) now asks ElevenLabs for the voices of that account
(`GET /v1/voices`, no credits) and shows them by name; picking one saves it and Cody says one short sentence with it.

- **The sample is Cody speaking, not ElevenLabs' preview file.** Each voice has a preview mp3 on ElevenLabs' storage,
  free to play, but the page loads nothing from outside (the Content-Security-Policy allows only this server) and a
  preview is a stranger reading English. So the test is a real synthesis of "Hi! I'm Cody. Can you hear me?" in the
  page's language: about 30 characters, counted against the same per-minute and per-day limits as replies. The mp3
  comes back as base64 in the JSON answer and plays through the mascot's own output, so the mouth moves.
- **A key that cannot list voices still works.** ElevenLabs keys can be restricted per feature; one made for text to
  speech only gets "the key lacks permission for this". Settings then shows the reason and takes a voice id typed by
  hand, as before.
- **From the computer only.** The list names the voices of someone's account, so `GET /api/settings/voices` is
  refused through Tailscale, like every change to Settings.
- **The default without a key did not change**: the device's voice, then Cody's sounds. Whether a new install should
  start with Cody's sounds instead is a question for the maintainer (see `docs/BACON-TODO.md`).

## 2026-11-06 · Code review of the drawers: what changed

- **The newest drawer is in front.** The first run sat above the others by a higher `z-index`; "Create your private
  network" on its second step opened the network drawer underneath, where nobody could see it, while the keyboard
  already belonged to it. A drawer now moves to the end of the page when it opens, so what is on top of the stack is
  also what is in front, and the special `z-index` is gone.
- **The focus finds its way back.** Status draws its rows again after an action and on every look; the button that
  had the focus was thrown away, the focus fell to the page, and closing then did not return it to the light. Now
  the rows are only drawn again when something changed, the button of the same check gets the focus back, and
  closing returns the focus also when it had fallen to the page (but never to an element that is no longer there).
- Status takes its title and its close label again on each open, so they follow a language change. The private
  network forgets an old message when it opens again, marks the current step with `aria-current` and says "done" in
  words on a finished one. The first run keeps the keyboard on the language after saying the step again.
- **The fake page got stricter**, because it had hidden two of these: only an element that is in the page, shown and
  enabled takes the focus; the focus falls to the body when its element leaves; `querySelectorAll` returns a list
  without array methods (a first version of the focus fix called `find()` on it: fine on the fake, nothing in a
  browser); and a new `#hash` is told a moment later. Each fix has a test that fails without it.

## 2026-11-06 · Security review of the voice list: what changed

Nothing serious was found: the key never reaches the page or a log, the address asked is fixed, and both routes
answer the computer only. Four things were tightened:

- **No redirect is followed when ElevenLabs is asked.** urllib copies the request's headers to wherever a 30x
  points, the key included. It would take ElevenLabs itself, or a proxy that opens TLS, to send one; still, both
  calls (speech and the voice list) now go through an opener that refuses redirects, and a test with two local
  servers shows the second one is never asked.
- **The voice test counts under the same lock as replies.** It took its slot in the per-minute limit without the
  lock the spoken replies use, so a test racing a reply could slip past the limit.
- **Only real audio of a sane size passes for a working voice.** The answer is read up to 4 MB and has to start like
  an mp3; a 200 with something else used to end in "the voice works" with no sound.
- **The list is kept for a minute**, for the key it was asked with (a digest of it, not the key), and forgotten when
  the key changes. The drawer asks for it on every redraw; ElevenLabs is asked once. A failure is not kept.

Smaller: a voice id is the whole string (`\Z`, since `$` lets a trailing newline through); names and labels keep
only printable characters, so a shared voice cannot use direction marks to look like another; the test route's
refusal through Tailscale has its own test, since it spends credits.


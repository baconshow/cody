# Changelog

## 1.2.0 · launch

- **Windows app**: `CodySetup.exe` (no Python needed, per-user install) with a tray icon: open Cody, status, start
  the voice session, settings, start with Windows, quit. Opening it starts the server, the mascot and the voice
  session.
- **Claude Code plugin** from this repository's marketplace: heads-up hooks and `/cody:setup`, `/cody:status`,
  `/cody:voice`.
- **Status screen** and `python cody.py --doctor`: what is on and off, in plain words, with what to do; duplicate voice
  sessions and real error reasons (`ElevenLabs: payment pending`).
- **Settings** and a three-step **first run**; QR codes drawn on the computer.
- **Create your private network**: Tailscale from install to the phone, without a terminal (never Funnel), in one
  press: the sign-in and the DNS page open in the browser and Cody goes on by itself.
- **Voice with four outputs**: ElevenLabs, Cody's hosted voice (not offered yet), the device's voice, and **Cody's own
  sounds**, which always work and are the default until you pick something else (an install that never picked a
  voice moves from the device's voice to Cody's sounds; pick the device's voice in Settings to keep it). With your
  ElevenLabs key saved (in Settings or on the first run), the voices of your account are listed: pick one and Cody
  says hi with it.
- **Scenes as data**: coding, thinking, coffee, debug, party, headphones and sleeping. What Cody wears (the nightcap,
  the headphones, the coffee in its hand, the bug on its head) moves with it; the camera slides to keep the monitor
  and the debug sign in the picture on any screen.
- The legs turn with the body instead of staying behind when Cody listens sideways, and stay on the body when it
  looks up or down.
- **Settings, Status, the private network and the first run** are one drawer beside the mascot (a dialog: the X,
  Esc and a click outside close it), instead of full-screen lists with a Close button in the corner. A gear in the
  corner opens Settings. The wake word state is a small light (green on, red off) instead of words. A tap on Cody is
  silent.
- The sleeping Z is one piece, and after a shake Cody swears (`&#$*%@!`). Thinking, Cody holds a front leg up, and
  the thought is one block with three dots, in front of its face.
- The keyboard is a real one (number row, Tab, Caps, Enter, two Shifts, space bar, numeric keypad), laid out from
  Cody's seat; its hands land on the keys instead of going through them, and the key under the hand lights up.
- **Toc-toc**: when Claude is waiting for your permission, Cody knocks on the screen (the fist in front of its
  face, little impact marks, two raps) before saying it needs you.
- **"Cody, take a screenshot"** ("Cody, printa"): a screenshot on the spot, with a shutter click, shown with Share;
  no round trip through Claude and no voice session needed.
- **Headphones when music plays** (Windows): Cody asks the system whether any player is playing, never what, and
  wears the headphones over whatever else is going on. Off in Settings.
- Opt-in update check (off by default). three.js and the font ship with Cody: the page works offline.
- CI on Windows, macOS and Linux.

## 1.1

Timers, memory, heads-up from other sessions, the mini Cody pointing on Windows, self-setup.

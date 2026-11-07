# Changelog

## 1.2.0 · launch

- **Android app** (`android/`): the mascot page in Chrome as a Trusted Web Activity (full screen, landscape, the
  microphone and speech of a Chrome tab), paired by typing the address or scanning the new QR code in Settings;
  **notifications with the app closed** (opt-in: a quiet notification waits on the computer, `/api/events` held open
  up to 25 s with `wait=`) and a **home screen widget** with Cody's face for the last heads-up. The computer vouches
  for the app at `/.well-known/assetlinks.json` and hands it the token at `/app/hello`. Through Tailscale serve the
  page now arrives whole: connections beyond the server's cap wait their turn instead of being dropped (the phone
  used to get half the files, and a black screen, on the first open).
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
- The voice session knows what time it is here: everything you say carries this computer's date, time and UTC
  offset, so *"Cody, what time is it?"* is answered with your clock (Claude only knew the date, and guessed).
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
- **Scenes on request** (*"Cody, put your headphones on"*) and **scenes of Cody's own** (*"make yourself a rainbow"*):
  Claude writes scene data, never code, checked field by field and kept in Cody's data folder; *"undo"* removes it.
- **Skin shop**, with Jack-o'-Cody for Halloween (ridges, a glowing grin, a witch hat). Skins are data, like the
  scenes; all free while Cody is Cody.
- **"Cody, how much usage do I have left?"** (opt-in): Cody as Claude Code's status line keeps your plan's session
  and week usage (and runs the status line you had); the question is answered on the spot.
- **Typing along** (opt-in): while you type in a Claude window, Cody types on its keyboard too. It only learns that
  keys are being pressed, never which; no keyboard hook, nothing recorded.
- **Your Windows notifications, read aloud** (opt-in): the important ones (messages, mail, calendar, calls, or an
  urgent word) make Cody knock and say the app and the title; the title never leaves the computer.
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

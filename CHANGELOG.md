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
- **Create your private network**: Tailscale from install to the phone, without a terminal (never Funnel).
- **Voice with four outputs**: ElevenLabs, Cody's hosted voice (not offered yet), the device's voice, and **Cody's own
  sounds**, which always work.
- **Scenes as data**: coding, thinking, coffee, debug, party, headphones and sleeping.
- The sleeping Z is one piece, the thought bubbles grow to four, and after a shake Cody swears (`&#$*%@!`).
- Opt-in update check (off by default). three.js and the font ship with Cody: the page works offline.
- CI on Windows, macOS and Linux.

## 1.1

Timers, memory, heads-up from other sessions, the mini Cody pointing on Windows, self-setup.

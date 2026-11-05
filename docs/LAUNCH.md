# Launch checklist

State of each item on the `launch` branch. "Verified" means it ran: tests, CI, or a real device. What could only be
checked on a real device is listed in `docs/MANUAL-TESTS.md`.

## P0: needed to launch

| # | Item | State |
|---|---|---|
| 0 | Base: CI on Windows, macOS and Linux (tests, lint, coverage); three.js and the font bundled, CSP without CDNs, page works offline | Done: CI green on Windows, macOS and Linux (Python 3.12; the Python 3.10 job needed an older `coverage` pin). The page renders the 3D mascot with every outside request blocked |
| 1 | Windows installer (`CodySetup.exe` built in CI) with a tray icon | Done: the `Windows app` workflow builds `CodySetup.exe`, installs it silently on Windows, runs the console and tray builds, and uninstalls it (files and Run value gone). Tray clicks, SmartScreen and the voice window: `docs/MANUAL-TESTS.md` |
| 2 | Claude Code plugin and marketplace in this repository | Done: `claude plugin validate` passes (also in CI); installed with Claude Code 2.1.318 in an isolated config (3 commands, 3 hooks); a hook run records the event |
| 3 | Status screen (PC and phone) and `--doctor` | Done: `cody/doctor.py` feeds `--doctor`, `/api/status` and the Status screen (light in the corner, 9 checks, buttons on the PC only); duplicate voice sessions and the real ElevenLabs reason are reported. Unit tests plus screenshots at 1280 px and 412 px; the real voice session and phone: `docs/MANUAL-TESTS.md` |
| 4 | Settings screen and guided first run, QR code | Done: Settings (language, voice provider, ElevenLabs key saved locally with Test, privacy, hooks, start with Windows, voice folder), a 3-step first run that ends in "say hi", QR codes made locally and decoded by OpenCV for versions 2 to 10. Changes only from the computer itself |
| 5 | "Create your private network" (Tailscale) | Done: `cody/network.py` and the `#network` screen go install, sign in, MagicDNS/HTTPS, serve (never Funnel), then two QR codes; the new address is allowed at once for your own login only. Unit tests with a fake `tailscale`; a real install and sign-in: `docs/MANUAL-TESTS.md` |
| 6 | Voice with four outputs, including Cody's own sounds | Not started |
| 7 | Essential scenes | Not started |
| 8 | Launch materials (README media, landing page, changelog, policies, templates) | Not started |

## P1 and P2

Not started.

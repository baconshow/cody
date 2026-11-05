# Launch checklist

State of each item on the `launch` branch. "Verified" means it ran: tests, CI, or a real device. What could only be
checked on a real device is listed in `docs/MANUAL-TESTS.md`.

## P0: needed to launch

| # | Item | State |
|---|---|---|
| 0 | Base: CI on Windows, macOS and Linux (tests, lint, coverage); three.js and the font bundled, CSP without CDNs, page works offline | Done: CI green on Windows, macOS and Linux (Python 3.12; the Python 3.10 job needed an older `coverage` pin). The page renders the 3D mascot with every outside request blocked |
| 1 | Windows installer (`CodySetup.exe` built in CI) with a tray icon | In progress: app, tray menu, `--voice` launcher and installer written; waiting for the `Windows app` workflow |
| 2 | Claude Code plugin and marketplace in this repository | Not started |
| 3 | Status screen (PC and phone) and `--doctor` | Not started |
| 4 | Settings screen and guided first run, QR code | Not started |
| 5 | "Create your private network" (Tailscale) | Not started |
| 6 | Voice with four outputs, including Cody's own sounds | Not started |
| 7 | Essential scenes | Not started |
| 8 | Launch materials (README media, landing page, changelog, policies, templates) | Not started |

## P1 and P2

Not started.

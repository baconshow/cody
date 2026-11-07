# For the maintainer

Things only the maintainer can do. Newest last.

- [ ] **Push `main` and `launch`.** `web/js/stale-page.js` (reloads a page opened before the server restarted) is
      committed on the local `main` and merged into `launch`, but neither is pushed: `main` is 1 commit ahead of
      `origin/main`; `launch` is 12 commits ahead of `origin/launch` (the 2026-11-06 keyboard and thought bubble,
      and the night of 2026-11-07: hips and the held leg, headphones with music, the quick screenshot, the knock,
      notifications, typing along, usage limits, the skin shop, scenes by voice). Review the morning after, then push.
- [ ] **Try the night's opt-ins on the real page** (restart `python cody.py` first; the server code changed): in
      Settings turn on *Read my important Windows notifications* (Windows asks under Privacy > Notifications),
      *Type along when I type to Claude* and *Usage limits* (Cody becomes the status line and runs yours after; a
      new Claude Code session is needed), then say *"Cody, printa"*, *"Cody, quanto resta de uso?"*, *"Cody, põe os
      fones"* and *"Cody, faz um arco-íris para você"* in the voice session (restart it: the channel has two new
      tools). Play something on Spotify: the headphones should come on within a few seconds.
- [ ] **Spotify, if ever**: not an OAuth app with a backend of refresh tokens (user data on your server, and a
      Spotify app in development mode serves 25 users). SMTC covers "something is playing" for every player. A
      player-specific link would be PKCE on the user's machine with the token in `%LOCALAPPDATA%\cody`: decide
      only if a feature needs it (pause when Cody speaks, the song's name).
- [ ] **Code-signing certificate for the Windows installer.** Without one, SmartScreen warns "Windows protected your
      PC" on every download until the file builds reputation (the README explains More info, Run anyway). Options:
      an OV or EV certificate from a CA, or Azure Trusted Signing (cheaper, needs an identity check). Once you have
      it, the signing step goes after `iscc` in `.github/workflows/windows-app.yml`. Status: decided, buying it.
- [ ] **Attach `CodySetup.exe` to the release.** The `Windows app` workflow uploads it as a build artifact on every
      push and tag; download it from the run of the release tag and attach it to the GitHub release.
- [ ] **Turn on GitHub Pages** for the landing page: repository Settings > Pages > Source: "GitHub Actions". The
      `Landing page` workflow then publishes `site/` on every push to `main` that touches it.
- [ ] **Run `docs/MANUAL-TESTS.md`** on the Windows PC and the Android phone before the release.
- [ ] **Merge the `launch` pull request**, tag `v1.2.0`, attach `CodySetup.exe` (from the tag's `Windows app` run) to
      the release, and write the release notes from `CHANGELOG.md`.
- [ ] **Post on Reddit** from `docs/launch/reddit.md` (attach `docs/media/cody-scenes.gif`, or record a short video
      of the real thing: it will be better than the headless captures). Status: recording the video.
- [x] **ElevenLabs payment**: paid on 2026-11-06; the Status screen shows the ElevenLabs voice working.
- [x] **The drawer is the direction** (said yes on 2026-11-06): Status, the private network and the first run now
      use the same drawer as Settings.
- [x] **What a new install sounds like without an ElevenLabs key**: Cody's sounds (decided 2026-11-06); the
      device's voice is there to pick in Settings.

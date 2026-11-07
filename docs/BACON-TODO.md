# For the maintainer

Things only the maintainer can do. Newest last.

- [x] **Push `main` and `launch`.** Done on 2026-11-07: `main` was already on GitHub (`e04569a`, the page that
      reloads itself after a restart), and `launch` went up with the 2026-11-06 keyboard and thought bubble and the
      night of 2026-11-07 (hips and the held leg, headphones with music, the quick screenshot, the knock,
      notifications, typing along, usage limits, the skin shop, scenes by voice). PR #1 is mergeable.
- [ ] **Try the night's opt-ins on the real page** (restart `python cody.py` first; the server code changed): in
      Settings turn on *Read my important Windows notifications* (Windows asks under Privacy > Notifications),
      *Type along when I type to Claude* and *Usage limits* (Cody becomes the status line and runs yours after; a
      new Claude Code session is needed), then say *"Cody, printa"*, *"Cody, quanto resta de uso?"*, *"Cody, põe os
      fones"* and *"Cody, faz um arco-íris para você"* in the voice session (restart it: the channel has two new
      tools). Play something on Spotify: the headphones should come on within a few seconds.
- [ ] **The Android app on Google Play.** `android/` builds (`cd android && ./gradlew assembleDebug`); the
      `Android app` workflow uploads `Cody-debug.apk` and `Cody-release.aab` on every push that touches it. To
      publish: (1) a Google Play developer account (US$ 25, one time; only you can create it); (2) an upload key,
      `keytool -genkeypair -v -keystore upload.jks -alias upload -keyalg RSA -keysize 2048 -validity 10000`, kept
      out of the repository, with the four `ANDROID_*` secrets in the repository settings (see the workflow), or
      `android/keystore.properties` for a local release build; (3) Play App Signing on: copy the **app signing**
      certificate's SHA-256 from Play Console > App integrity into `RELEASE_FINGERPRINTS` in `cody/android.py`,
      so every user's computer vouches for the published app; (4) the listing: icon 512 (`web/icon-512.png`),
      feature graphic 1024x500, phone screenshots, the privacy policy URL (PRIVACY.md on GitHub), and the
      foreground service declaration (type `specialUse`: "keeps a connection to the user's own computer on
      their private network to show their coding assistant's notifications; opt-in; no data leaves the network",
      with a short video of the switch and a notification), and the "app access" note for reviewers (the app only
      shows something with the user's own computer running Cody on their Tailscale network: say so, point at the
      video); (5) upload the `.aab` to internal testing, then closed testing: a personal account created after
      13 Nov 2023 needs 12 testers opted in for 14 days in a row before it can ask for production (the Reddit post
      can recruit them; never bought testers), then "apply for production access" on the dashboard. Until then,
      install the debug APK from the workflow run (or `adb install`) and add your debug fingerprint to
      `android_fingerprints` in `config.json` so Chrome shows it full screen. Known from the first run on a real
      phone: an old Cody PWA on the same address steals the launch (Chrome opens it instead of the app), so
      uninstall it; the phone must have Tailscale connected before the first launch, or Chrome keeps the failed
      verification for that window (closing Chrome clears it).
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

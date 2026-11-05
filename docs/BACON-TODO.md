# For the maintainer

Things only the maintainer can do. Newest last.

- [ ] **`web/js/stale-page.js` is not on `main`.** The commit that reloads a page opened before the server restarted
      (each start changes the token) is missing from `main`. Push it to `main`, or say where it lives, so `launch`
      can include it.
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
- [ ] **ElevenLabs payment** (pending): only needed for the ElevenLabs voice and for the hosted voice (P1.6).
      Status: scheduled. After paying, Settings > Test voice should say it works.

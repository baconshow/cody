# For the maintainer

Things only the maintainer can do. Newest last.

- [ ] **`web/js/stale-page.js` is not on `main`.** The commit that reloads a page opened before the server restarted
      (each start changes the token) is missing from `main`. Push it to `main`, or say where it lives, so `launch`
      can include it.
- [ ] **Code-signing certificate for the Windows installer.** Without one, SmartScreen warns "Windows protected your
      PC" on every download until the file builds reputation (the README explains More info, Run anyway). Options:
      an OV or EV certificate from a CA, or Azure Trusted Signing (cheaper, needs an identity check). Once you have
      it, the signing step goes after `iscc` in `.github/workflows/windows-app.yml`.
- [ ] **Attach `CodySetup.exe` to the release.** The `Windows app` workflow uploads it as a build artifact on every
      push and tag; download it from the run of the release tag and attach it to the GitHub release.

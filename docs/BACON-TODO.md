# For the maintainer

Things only the maintainer can do. Newest last.

- [ ] **`web/js/stale-page.js` is not on `main`.** The commit that reloads a page opened before the server restarted
      (each start changes the token) is missing from `main`. Push it to `main`, or say where it lives, so `launch`
      can include it.

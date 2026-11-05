# Decisions

Reversible choices made while preparing the launch, with the reason. Newest last.

## 2026-11-05 · three.js and the font ship in the repository

three.js 0.186.1 (`build/three.module.js`, `build/three.core.js` and the two examples the mascot uses) lives in
`web/vendor/three`, with its MIT license, in the same folder layout as the npm package, so the importmap only changes
its base URL. The package has no minified build for this version, so the files are kept as published (about 2 MB).
The block font, Jersey 10 (SIL Open Font License), lives in `web/fonts` as the two woff2 subsets Google Fonts serves,
declared with `@font-face` in `style.css`. The Content-Security-Policy now allows only `'self'` (plus the importmap
hash): the page loads nothing from outside and works without internet.

## 2026-11-05 · Lint at 140 columns

`ruff check` (pyflakes and pycodestyle errors) runs in CI. The code wraps at about 120 columns; a handful of literals
and test tables go a little over, so the limit is 140 instead of reflowing them.

## 2026-11-05 · Coverage floors

CI fails below 65% line coverage for Python (72% today on Linux; `overlay.py` is Windows-only and reads 0% elsewhere)
and below 90% for the JavaScript tests (96% today).

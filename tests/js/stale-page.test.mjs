// Tests for a page left open across a server restart (web/js/stale-page.js): a refused token reloads the page, once
// in a while, and nothing else does.
// Run with: node --test "tests/js/*.test.mjs"
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reloadIfStale, TOKEN_REFUSED, RELOAD_EVERY } from '../../web/js/stale-page.js';

function page(now = 1000000) {
  const data = new Map();
  const st = { reloads: 0, now };
  return {
    st,
    options: {
      storage: { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, v) },
      now: () => st.now, reload: () => { st.reloads += 1; },
    },
  };
}

test('a refused token reloads the page', () => {
  const { st, options } = page();
  assert.equal(reloadIfStale(403, TOKEN_REFUSED, options), true);
  assert.equal(st.reloads, 1);
});

test('it never loops: at most one reload per period', () => {
  const { st, options } = page();
  reloadIfStale(403, TOKEN_REFUSED, options);
  st.now += RELOAD_EVERY - 1;
  assert.equal(reloadIfStale(403, TOKEN_REFUSED, options), false);
  st.now += 1;
  assert.equal(reloadIfStale(403, TOKEN_REFUSED, options), true);
  assert.equal(st.reloads, 2);
});

test('other refusals and errors leave the page alone', () => {
  const { st, options } = page();
  assert.equal(reloadIfStale(403, 'this Tailscale login is not allowed', options), false);
  assert.equal(reloadIfStale(503, TOKEN_REFUSED, options), false);
  assert.equal(reloadIfStale(404, 'not found', options), false);
  assert.equal(st.reloads, 0);
});

test('without storage it does not reload, so it can never loop', () => {
  const { st, options } = page();
  assert.equal(reloadIfStale(403, TOKEN_REFUSED, { ...options, storage: null }), false);
  assert.equal(st.reloads, 0);
});

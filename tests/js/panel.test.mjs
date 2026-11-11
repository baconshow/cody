// The list of sections Settings and Status share (web/js/panel.js): which sections there are, the address of each,
// and the list itself on the small fake page.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPage } from './fake-dom.mjs';
import { sections, hashOf, routeOf, navList, markActive, markLight, STATUS } from '../../web/js/panel.js';
import { en } from '../../web/js/strings.js';

const t = (key) => en[key] ?? key;

test('every section has an address, and an address says which drawer and which section', () => {
  assert.equal(hashOf('voice'), '#settings/voice');
  assert.equal(hashOf(STATUS), '#status');
  assert.deepEqual(routeOf('#settings'), { panel: 'settings', section: null });
  assert.deepEqual(routeOf('#settings/phone'), { panel: 'settings', section: 'phone' });
  assert.deepEqual(routeOf('#settings/status'), { panel: 'settings', section: null }, 'Status is not a section of Settings');
  assert.deepEqual(routeOf('#settings/made-up'), { panel: 'settings', section: null });
  assert.deepEqual(routeOf('#status'), { panel: 'status', section: 'status' });
  for (const other of ['', '#network', '#settingsx', null]) assert.equal(routeOf(other).panel, null);
});

test('on the computer every section; from the phone only what that browser may change', () => {
  assert.deepEqual(sections({ local: true }), ['voice', 'phone', 'general', 'skins', 'about']);
  assert.deepEqual(sections({ local: false }), ['general', 'skins']);
  assert.deepEqual(sections(null), ['general', 'skins']);
});

test('the list: one button per section and Status last with its light; a pick goes to the section\u2019s address', () => {
  const p = createPage();
  globalThis.document = p.document;
  const nav = navList({ ids: ['voice', 'skins'], active: 'skins', t, light: 'warn', win: p.win });
  const [voice, skins, status] = nav.children;
  assert.deepEqual(nav.children.map((b) => b.textContent), ['Voice', 'Skins', 'Status']);
  assert.equal(skins.getAttribute('aria-current'), 'page');
  assert.equal(voice.getAttribute('aria-current'), null);
  assert.equal(status.dataset.state, 'warn');
  assert.equal(voice.dataset.state, undefined, 'only Status has a light');
  voice.click();
  assert.equal(p.win.location.hash, '#settings/voice');
  status.click();
  assert.equal(p.win.location.hash, '#status');
  markActive(nav, 'voice');
  assert.deepEqual(nav.children.map((b) => b.getAttribute('aria-current')), ['page', null, null]);
  markLight(nav, 'fail');
  assert.equal(status.dataset.state, 'fail');
  markLight(nav, null);
  assert.equal(status.dataset.state, 'fail', 'no news is no change');
  assert.equal(navList({ ids: [], active: STATUS, t, win: p.win }).children[0].dataset.state, undefined, 'no light known yet');
});

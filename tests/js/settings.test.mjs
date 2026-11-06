import { test } from 'node:test';
import assert from 'node:assert/strict';
import { firstRunSteps, providers, sections, PROVIDERS } from '../../web/js/settings.js';
import { en, pt } from '../../web/js/strings.js';

const t = (key) => en[key] ?? key;

test('the first run has three steps and ends in "say hi"', () => {
  const steps = firstRunSteps({ phone_url: null }, t);
  assert.equal(steps.length, 3);
  assert.equal(steps.at(-1).last, en['first.sayHi']);
  assert.equal(steps[1].say, en['first.phone.network']);
  assert.equal(firstRunSteps({ phone_url: 'https://pc.example.ts.net/' }, t)[1].say, en['first.phone.qr']);
});

test('the four voice outputs, best first, each explained', () => {
  assert.deepEqual(PROVIDERS, ['elevenlabs', 'hosted', 'device', 'sounds']);
  for (const p of providers(t)) assert.ok(p.label !== `settings.voice.${p.id}` && p.note);
});

test('the hosted voice is listed as coming soon; the other three can be chosen', () => {
  assert.deepEqual(providers(t).filter((p) => p.soon).map((p) => p.id), ['hosted']);
  assert.ok(en['settings.soon'] && pt['settings.soon']);
});

test('on the computer the drawer has every group; from the phone, only what that browser may change', () => {
  assert.deepEqual(sections({ local: true }), ['voice', 'phone', 'general', 'about']);
  assert.deepEqual(sections({ local: false }), ['general']);
  assert.deepEqual(sections(null), ['general'], 'settings did not load: still the language');
});

test('every settings and first-run string exists in both languages', () => {
  const keys = Object.keys(en).filter((k) => k.startsWith('settings.') || k.startsWith('first.'));
  assert.ok(keys.length > 30);
  for (const k of keys) assert.ok(pt[k], k);
});

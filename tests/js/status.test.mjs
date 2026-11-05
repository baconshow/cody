import { test } from 'node:test';
import assert from 'node:assert/strict';
import { worst, summary, clientChecks } from '../../web/js/status.js';
import { en, pt } from '../../web/js/strings.js';

const t = (key) => en[key] ?? key;

test('the light shows the worst state', () => {
  assert.equal(worst([{ state: 'ok' }, { state: 'warn' }]), 'warn');
  assert.equal(worst([{ state: 'warn' }, { state: 'fail' }, { state: 'ok' }]), 'fail');
  assert.equal(worst([]), 'ok');
});

test('a closed voice session is named first', () => {
  const items = [{ id: 'server', state: 'ok', title: 'S' }, { id: 'voice', state: 'fail', title: 'Voice session' }];
  assert.equal(summary(items, t), en['status.chip.voiceOff']);
  assert.equal(summary([{ id: 'hooks', state: 'warn', title: 'Hooks' }], t), en['status.chip.ok']);
  assert.equal(summary([{ id: 'x', state: 'fail', title: 'Broken' }], t), 'Broken');
});

test('browser checks: secure page, microphone and sound', () => {
  const plain = clientChecks({ secure: false, recognizer: true, mic: 'prompt', sound: 'suspended' }, t);
  assert.deepEqual(plain.map((it) => [it.id, it.state, it.action]),
    [['secure', 'fail', null], ['mic', 'warn', 'mic'], ['sound', 'warn', 'sound']]);
  const good = clientChecks({ secure: true, recognizer: true, mic: 'granted', sound: 'running' }, t);
  assert.ok(good.every((it) => it.state === 'ok' && it.action === null));
  assert.equal(clientChecks({ secure: true, recognizer: false, mic: null, sound: null }, t)[0].state, 'fail');
  assert.equal(clientChecks({ secure: true, recognizer: true, mic: 'denied', sound: 'running' }, t)[0].say, en['status.mic.denied']);
});

test('every status string exists in both languages', () => {
  const keys = Object.keys(en).filter((k) => k.startsWith('status.'));
  assert.ok(keys.length > 20);
  for (const k of keys) assert.ok(pt[k], k);
});

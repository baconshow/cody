import { test } from 'node:test';
import assert from 'node:assert/strict';
import { view } from '../../web/js/network.js';
import { en, pt } from '../../web/js/strings.js';

const t = (key) => en[key] ?? key;

test('each step has a sentence and the right action', () => {
  assert.deepEqual([view({ step: 'install' }, t).action, view({ step: 'login' }, t).action, view({ step: 'serve' }, t).action],
    ['install', 'login', 'serve']);
  const dns = view({ step: 'dns', admin_dns: 'https://login.tailscale.com/admin/dns' }, t);
  assert.equal(dns.action, null);
  assert.equal(dns.link, 'https://login.tailscale.com/admin/dns');
  assert.equal(view({ step: 'done' }, t).say, en['network.done']);
  assert.equal(view({ step: 'nonsense' }, t).step, 'install');
});

test('it says only your devices see Cody, in both languages', () => {
  assert.match(en['network.why'], /Only your own devices/);
  assert.match(pt['network.why'], /Só os seus aparelhos enxergam o Cody/);
  for (const k of Object.keys(en).filter((k) => k.startsWith('network.'))) assert.ok(pt[k], k);
});

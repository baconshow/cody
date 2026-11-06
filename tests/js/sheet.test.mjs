// Tests for the drawer (web/js/sheet.js) and the three screens that live in it: Settings and the first run
// (settings.js), Status (status.js) and the private network (network.js). They run on a small fake page
// (fake-dom.mjs): what is checked is behaviour (what opens, what a key or a click does, what the server is asked),
// not looks.
// Run with: node --test "tests/js/*.test.mjs"
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPage } from './fake-dom.mjs';
import { createSheet, wrapFocus } from '../../web/js/sheet.js';
import { createSettings, mp3Bytes } from '../../web/js/settings.js';
import { createStatus } from '../../web/js/status.js';
import { createNetwork, NETWORK } from '../../web/js/network.js';
import { en, pt } from '../../web/js/strings.js';

// a fresh page for each test; the modules reach `document` and `history` as globals, like in a browser
function page() {
  const p = createPage();
  globalThis.document = p.document;
  globalThis.history = p.history;
  return p;
}
// {name} in a text is filled in, as the page's own t() does
const fill = (text, vars = {}) => String(text).replace(/\{(\w+)\}/g, (whole, name) => (name in vars ? vars[name] : whole));
const t = (key, vars) => fill(en[key] ?? key, vars);
const all = (root, selector) => [...root.querySelectorAll(selector)];
const open = (p) => all(p.document.body, '.sheet-backdrop').filter((panel) => !panel.hidden);
const withText = (root, selector, text) => all(root, selector).find((e) => e.textContent === text);

test('Tab wraps around inside the drawer; in the middle the browser moves on by itself', () => {
  assert.equal(wrapFocus(4, 3, false), 0, 'Tab on the last control: the first');
  assert.equal(wrapFocus(4, 0, true), 3, 'Shift+Tab on the first: the last');
  assert.equal(wrapFocus(4, 1, false), null);
  assert.equal(wrapFocus(4, 2, true), null);
  assert.equal(wrapFocus(4, -1, false), 0, 'the focus is on the drawer itself: Tab goes to the first');
  assert.equal(wrapFocus(4, -1, true), 3);
  assert.equal(wrapFocus(0, -1, false), null, 'nothing to focus');
});

test('the drawer is a dialog: it takes the focus, Esc and the X close it, and the focus goes back', () => {
  const p = page();
  const opener = p.document.createElement('button');
  p.document.body.append(opener);
  let closed = 0;
  const sheet = createSheet({ win: p.win, onClose: () => { closed += 1; } });
  sheet.setTitle('Settings', 'Close');
  const box = sheet.panel.querySelector('.sheet');
  assert.equal(sheet.isOpen, false);
  assert.equal(box.getAttribute('role'), 'dialog');
  assert.equal(box.getAttribute('aria-modal'), 'true');
  assert.equal(box.getAttribute('aria-label'), 'Settings');
  assert.equal(sheet.panel.querySelector('.sheet-close').getAttribute('aria-label'), 'Close');
  assert.equal(sheet.note.getAttribute('role'), 'status');

  opener.focus();
  sheet.open();
  assert.equal(sheet.isOpen, true);
  assert.equal(p.document.activeElement, box, 'the keyboard starts inside');
  sheet.open();                                          // already open: nothing changes
  p.key('Escape');
  assert.equal(sheet.isOpen, false);
  assert.equal(p.document.activeElement, opener, 'and goes back to what opened it');
  assert.equal(closed, 1);
  p.key('Escape');
  assert.equal(closed, 1, 'closed, it no longer listens to the keyboard');

  sheet.open();
  sheet.panel.querySelector('.sheet-close').click();
  assert.equal(sheet.isOpen, false);
  assert.equal(closed, 2);
});

test('Tab stays inside the open drawer, skipping what is disabled or hidden', () => {
  const p = page();
  const sheet = createSheet({ win: p.win });
  const make = (props = {}) => Object.assign(p.document.createElement('button'), props);
  const [first, off, last] = [make(), make({ disabled: true }), make()];
  const hiddenBox = Object.assign(p.document.createElement('div'), { hidden: true });
  hiddenBox.append(make());
  sheet.body.append(first, off, last, hiddenBox);
  sheet.open();
  const x = sheet.panel.querySelector('.sheet-close');   // the X comes first in the drawer

  last.focus();
  const tab = p.key('Tab');
  assert.equal(p.document.activeElement, x, 'past the last control: back to the first');
  assert.equal(tab.defaultPrevented, true);
  const back = p.key('Tab', { shiftKey: true });
  assert.equal(p.document.activeElement, last, 'and the other way round');
  assert.equal(back.defaultPrevented, true);
  first.focus();
  assert.equal(p.key('Tab').defaultPrevented, undefined, 'in the middle the browser moves on by itself');
  sheet.close();
});

test('a click outside closes the drawer; a drag from inside does not; the first run ignores both', () => {
  const p = page();
  const sheet = createSheet({ win: p.win });
  sheet.open();
  sheet.body.dispatchEvent({ type: 'pointerdown', bubbles: true });       // pressed inside (selecting the address)...
  sheet.panel.dispatchEvent({ type: 'click', bubbles: true });            // ...and released over the dim page
  assert.equal(sheet.isOpen, true);
  sheet.body.click();
  assert.equal(sheet.isOpen, true, 'a click inside is just a click');
  sheet.panel.click();
  assert.equal(sheet.isOpen, false);

  const firm = createSheet({ win: p.win, outside: false });
  firm.open();
  firm.panel.click();
  assert.equal(firm.isOpen, true, 'a stray click should not skip the welcome');
  firm.close();
});

test('of two open drawers, only the one on top answers the keyboard', () => {
  const p = page();
  const under = createSheet({ win: p.win });
  const top = createSheet({ win: p.win });
  under.open();
  top.open();
  p.key('Escape');
  assert.deepEqual([under.isOpen, top.isOpen], [true, false]);
  p.key('Escape');
  assert.equal(under.isOpen, false);
});

// --- Settings ---------------------------------------------------------------------------------------------------

function settingsApi(info = {}) {
  const calls = [];
  const state = { local: true, voice_provider: 'elevenlabs', has_key: false, voice_id: 'voice-1', phone_url: null,
    hooks: { on: true, plugin: false }, autostart: false, update_check: false, first_run_done: true, ...info };
  return {
    calls, state,
    settings: async () => ({ ...state }),
    saveSettings: async (updates) => { calls.push(['save', updates]); Object.assign(state, updates); return { ...updates }; },
    saveKey: async (key) => { calls.push(['key', key]); return { has_key: true }; },
    testVoice: async (id) => { calls.push(['test', id]); return { ok: false, reason: 'payment pending' }; },
    voices: async () => ({ ok: true, voices: [{ id: 'voice-1', name: 'Adam', about: 'american, male' },
      { id: 'voice-2', name: 'Bella', about: '' }] }),
    version: async () => ({ version: '1.2.0', update: false }),
    qr: async () => { throw new Error('no picture in this test'); },
    action: async (what) => { calls.push(['action', what]); return {}; },
  };
}

function settings(p, api, more = {}) {
  const lang = { now: 'en' };
  const said = [];
  const made = createSettings({
    api, win: p.win, language: () => lang.now, setLanguage: (v) => { lang.now = v; },
    t: (key, vars) => fill((lang.now === 'pt-BR' ? pt : en)[key] ?? key, vars), announce: (m) => said.push(m.text), ...more,
  });
  return { ...made, said, lang, gear: p.document.body.querySelector('.settings-open') };
}

test('Settings opens from the gear with its four groups; the hosted voice cannot be picked', async () => {
  const p = page();
  const api = settingsApi();
  const s = settings(p, api);
  assert.equal(s.gear.getAttribute('aria-label'), 'Settings');
  assert.equal(open(p).length, 0);
  s.gear.focus();
  s.gear.click();
  await p.settle();
  const [panel] = open(p);
  assert.equal(p.win.location.hash, '#settings');
  assert.deepEqual(all(panel, 'h3').map((h) => h.textContent), ['Voice', 'On your phone', 'General', 'About']);
  const radios = all(panel, 'input[type=radio]');
  assert.deepEqual(radios.map((r) => `${r.value}:${r.checked}:${r.disabled}`),
    ['elevenlabs:true:false', 'hosted:false:true', 'device:false:false', 'sounds:false:false']);
  assert.ok(withText(panel, 'em', 'coming soon'));
  assert.ok(panel.querySelector('input[type=password]'), 'ElevenLabs is chosen: its key field shows');
  assert.ok(withText(panel, 'p', 'Cody 1.2.0'), 'the version line filled in');

  p.key('Escape');
  assert.equal(open(p).length, 0);
  assert.equal(p.win.location.hash, '', 'closing clears the #hash');
  assert.equal(p.document.activeElement, s.gear, 'and the focus returns to the gear');
  assert.equal(panel.querySelector('.sheet-body').children.length, 0, 'nothing stays behind in the closed drawer');
});

test('picking a voice saves it and only swaps what is under the choice: the radios are not rebuilt', async () => {
  const p = page();
  const api = settingsApi();
  const s = settings(p, api);
  await s.open();
  const [panel] = open(p);
  const before = all(panel, 'input[type=radio]');
  const device = before.find((r) => r.value === 'device');
  device.checked = true;
  device.dispatchEvent({ type: 'change', bubbles: true });
  await p.settle();
  assert.deepEqual(api.calls, [['save', { voice_provider: 'device' }]]);
  assert.equal(panel.querySelector('.sheet-note').textContent, 'Saved.');
  assert.equal(panel.querySelector('input[type=password]'), null, 'no ElevenLabs fields for the device voice');
  const after = all(panel, 'input[type=radio]');
  assert.ok(after.every((r, i) => r === before[i]), 'the same radios: the keyboard keeps its place');

  before.find((r) => r.value === 'elevenlabs').dispatchEvent({ type: 'change', bubbles: true });
  await p.settle();
  assert.ok(panel.querySelector('input[type=password]'), 'back to ElevenLabs: the fields return');
  s.close();
});

test('the ElevenLabs key: a draft survives a language change, is saved once and never shown again', async () => {
  const p = page();
  const api = settingsApi();
  const s = settings(p, api);
  await s.open();
  const [panel] = open(p);
  panel.querySelector('input[type=password]').enter('sk-draft');
  panel.querySelector('.settings-language').enter('pt-BR', 'change');
  await p.settle();
  assert.equal(panel.querySelector('h2').textContent, 'Configurações', 'the drawer is drawn again in the new language');
  assert.deepEqual(api.calls[0], ['save', { language: 'pt-BR' }]);
  assert.equal(p.document.activeElement, panel.querySelector('.settings-language'), 'the keyboard stays on the language');
  const key = panel.querySelector('input[type=password]');
  assert.equal(key.value, 'sk-draft', 'what was typed is still there');

  withText(panel, 'button', 'Salvar chave').click();
  await p.settle();
  assert.deepEqual(api.calls.at(-1), ['key', 'sk-draft']);
  assert.equal(key.value, '', 'saved: the field is empty again');
  assert.equal(key.placeholder, pt['settings.key.saved']);

  withText(panel, 'button', 'Testar a voz').click();
  await p.settle();
  assert.equal(panel.querySelector('.sheet-note').textContent, 'ElevenLabs: payment pending', 'the real reason shows');

  key.enter('sk-never-saved');
  s.close();
  await s.open();
  assert.equal(open(p)[0].querySelector('input[type=password]').value, '', 'a draft does not outlive the drawer');
  s.close();
});

test('with a key saved, the account\'s voices are listed; picking one saves it and Cody says hi with it', async () => {
  const p = page();
  const api = settingsApi({ has_key: true, voice_id: 'voice-2' });
  api.testVoice = async (id) => { api.calls.push(['test', id]); return { ok: true, audio: 'bXAz' }; };
  const played = [];
  const s = settings(p, api, { play: (bytes) => played.push(Buffer.from(bytes).toString()) });
  await s.open();
  await p.settle();
  const [panel] = open(p);
  const voice = all(panel, 'select').find((e) => !e.classList.contains('settings-language'));
  assert.deepEqual(voice.children.map((o) => `${o.value}|${o.textContent}|${o.selected}`),
    ['voice-1|Adam · american, male|false', 'voice-2|Bella|true'], 'by name, the one in use selected');

  voice.enter('voice-1', 'change');
  await p.settle();
  assert.deepEqual(api.calls, [['save', { voice_id: 'voice-1' }], ['test', 'voice-1']]);
  assert.deepEqual(played, ['mp3'], 'the sample is played through the mascot');
  assert.equal(panel.querySelector('.sheet-note').textContent, en['settings.key.ok']);

  withText(panel, 'button', en['settings.key.test']).click();
  await p.settle();
  assert.deepEqual(api.calls.at(-1), ['test', 'voice-1'], 'the button says it again, in the voice just picked');
  assert.equal(played.length, 2);
  s.close();
  assert.equal(Buffer.from(mp3Bytes('bXAz')).toString(), 'mp3');
  assert.equal(mp3Bytes('').byteLength, 0);
});

test('a voice that is not in the list stays chosen; without a key the list waits for one', async () => {
  const p = page();
  const s = settings(p, settingsApi({ has_key: true, voice_id: 'voice-9' }));
  await s.open();
  await p.settle();
  const voice = all(open(p)[0], 'select').find((e) => !e.classList.contains('settings-language'));
  assert.deepEqual(voice.children.map((o) => `${o.value}|${o.textContent}|${o.selected}`).slice(0, 1),
    [`voice-9|${en['settings.voicePick.current']}|true`]);
  s.close();

  const q = page();
  const api = settingsApi({ has_key: false, voice_id: '' });
  const fresh = settings(q, api);
  await fresh.open();
  await q.settle();
  const [panel] = open(q);
  assert.ok(withText(panel, 'small', en['settings.voicePick.needKey']));
  assert.equal(all(panel, 'select').length, 1, 'only the language: no voices without a key');
  panel.querySelector('input[type=password]').enter('sk-new');
  withText(panel, 'button', en['settings.key.save']).click();
  await q.settle();
  const listed = all(panel, 'select').find((e) => !e.classList.contains('settings-language'));
  assert.deepEqual(listed.children.map((o) => o.textContent), [en['settings.voicePick.choose'], 'Adam · american, male', 'Bella'],
    'the key is in: its voices show, none chosen yet');
  fresh.close();
});

test('when the voices cannot be listed, the voice id is typed by hand, with the reason', async () => {
  const p = page();
  const api = settingsApi({ has_key: true, voice_id: 'voice-1' });
  api.voices = async () => ({ ok: false, reason: 'the key lacks permission for this', voices: [] });
  const s = settings(p, api);
  await s.open();
  await p.settle();
  const [panel] = open(p);
  assert.ok(withText(panel, 'small', fill(en['settings.voicePick.byHand'], { reason: 'the key lacks permission for this' })),
    'the reason shows');
  const typed = all(panel, 'input').find((e) => e.placeholder === en['settings.voiceId']);
  assert.equal(typed.value, 'voice-1');
  typed.enter('  voice-7 ', 'change');
  await p.settle();
  assert.deepEqual(api.calls, [['save', { voice_id: 'voice-7' }]]);
  s.close();
});

test('a switch saves what it switches; the plugin keeps the hooks switch off limits', async () => {
  const p = page();
  const api = settingsApi({ hooks: { on: true, plugin: true } });
  const s = settings(p, api);
  await s.open();
  const [hooks, autostart, updates] = all(open(p)[0], 'input[type=checkbox]');
  assert.equal(hooks.disabled, true, 'the plugin brings the hooks: nothing to switch here');
  autostart.checked = true;
  autostart.dispatchEvent({ type: 'change', bubbles: true });
  updates.checked = true;
  updates.dispatchEvent({ type: 'change', bubbles: true });
  await p.settle();
  assert.deepEqual(api.calls, [['save', { autostart: true }], ['save', { update_check: true }]]);
  s.close();
});

test('from the phone the drawer only has the language, and says where the rest is', async () => {
  const p = page();
  const api = settingsApi({ local: false });
  const s = settings(p, api);
  await s.open();
  const [panel] = open(p);
  assert.deepEqual(all(panel, 'h3').map((h) => h.textContent), ['General']);
  assert.equal(all(panel, 'input').length, 0, 'no key, no switches');
  assert.ok(withText(panel, 'p', en['settings.onComputer']));
  panel.querySelector('.settings-language').enter('pt-BR', 'change');
  await p.settle();
  assert.deepEqual(api.calls, [], 'the language of this browser only: the computer is not asked to change');
  assert.equal(s.lang.now, 'pt-BR');
  s.close();
});

test('without a phone address, Settings offers to create the private network', async () => {
  const p = page();
  const s = settings(p, settingsApi());
  await s.open();
  withText(open(p)[0], 'button', en['settings.network']).click();
  assert.equal(p.win.location.hash, '#network');
  await p.settle();
  assert.equal(open(p).length, 0, 'leaving for another screen closes the drawer');
});

test('the first run: three steps said out loud, Next to the end, and it is remembered as done', async () => {
  const p = page();
  const api = settingsApi({ first_run_done: false, phone_url: 'https://pc.example.ts.net/' });
  const s = settings(p, api);
  await s.firstRun();
  await p.settle();
  const [panel] = open(p);
  assert.ok(panel.classList.contains('first-run'));
  assert.equal(panel.querySelector('h2').textContent, 'First steps');
  assert.equal(panel.querySelector('.first-step').textContent, '1/3');
  assert.equal(panel.querySelector('.first-say').textContent, en['first.hello']);
  assert.deepEqual(s.said, [en['first.hello']]);
  assert.deepEqual([...new Set(all(panel, 'input[type=radio]').map((r) => r.name))], ['first-provider'],
    'its radios are a group of their own, apart from the ones in Settings');
  assert.deepEqual(all(panel.querySelector('.sheet-foot'), 'button').map((b) => b.textContent), ['Skip', 'Next']);
  assert.ok(panel.querySelector('input[type=password]'), 'ElevenLabs is the voice: the key is asked right here');
  const device = all(panel, 'input[type=radio]').find((r) => r.value === 'device');
  device.dispatchEvent({ type: 'change', bubbles: true });
  await p.settle();
  assert.equal(panel.querySelector('input[type=password]'), null, 'another voice: no key needed');
  assert.deepEqual(api.calls.at(-1), ['save', { voice_provider: 'device' }]);

  panel.querySelector('.settings-language').enter('pt-BR', 'change');
  await p.settle();
  assert.equal(panel.querySelector('.first-say').textContent, pt['first.hello'], 'the step is said again in the new language');
  assert.equal(panel.querySelector('h2').textContent, 'Primeiros passos');

  withText(panel, 'button', 'Próximo').click();
  await p.settle();
  assert.equal(panel.querySelector('.first-step').textContent, '2/3');
  assert.equal(panel.querySelector('code').textContent, 'https://pc.example.ts.net/');
  withText(panel, 'button', 'Próximo').click();
  await p.settle();
  assert.equal(panel.querySelector('.first-say').textContent, pt['first.voice']);
  withText(panel, 'button', pt['status.do.voice']).click();
  await p.settle();
  assert.deepEqual(api.calls.at(-1), ['action', 'voice']);
  assert.equal(s.said.at(-1), pt['first.sayHi'], 'it ends in "say hi"');
  withText(panel, 'button', 'Pronto').click();
  await p.settle();
  assert.equal(open(p).length, 0);
  assert.deepEqual(api.calls.at(-1), ['save', { first_run_done: true }]);

  await s.firstRun();
  assert.equal(open(p).length, 0, 'done once, it does not come back by itself');
});

test('Skip and Esc end the first run too; from the phone it never shows', async () => {
  const p = page();
  const api = settingsApi({ first_run_done: false });
  const s = settings(p, api);
  await s.firstRun();
  await p.settle();
  assert.equal(open(p)[0].querySelector('.first-say').textContent, en['first.hello']);
  withText(open(p)[0], 'button', 'Skip').click();
  assert.equal(open(p).length, 0);
  assert.deepEqual(api.calls.at(-1), ['save', { first_run_done: true }]);

  await s.firstRun(true);                                // "show the first steps again"
  await p.settle();
  p.key('Escape');
  assert.equal(open(p).length, 0);

  const phone = page();
  const remote = settings(phone, settingsApi({ local: false, first_run_done: false }));
  await remote.firstRun();
  assert.equal(open(phone).length, 0);
});

// --- Status -----------------------------------------------------------------------------------------------------

function statusApi({ local = true } = {}) {
  const calls = [];
  const items = [
    { id: 'server', state: 'ok', title: 'Mascot server', say: 'On.', fix: '', action: null },
    { id: 'voice', state: 'fail', title: 'Voice session', say: 'Closed.', fix: 'Open it.', action: 'voice', urgent: true },
  ];
  return {
    calls,
    status: async (lang) => { calls.push(['status', lang]); return { items, local }; },
    action: async (what) => { calls.push(['action', what]); return { message: 'Opening the voice session.' }; },
  };
}

test('Status: the light says the first broken thing; a tap opens the checks, a button acts and says what it did', async (ctx) => {
  ctx.mock.timers.enable({ apis: ['setInterval', 'setTimeout'] });
  const p = page();
  const api = statusApi();
  createStatus({ api, t, lang: () => 'en', audio: { state: () => 'running', unlock: () => {} }, win: p.win });
  await p.settle();
  const chip = p.document.body.querySelector('.status-chip');
  assert.equal(chip.textContent, en['status.chip.voiceOff']);
  assert.equal(chip.dataset.state, 'fail');
  assert.equal(open(p).length, 0);

  chip.click();
  await p.settle();
  const [panel] = open(p);
  assert.equal(p.win.location.hash, '#status');
  assert.equal(panel.querySelector('h2').textContent, 'Status');
  assert.deepEqual(all(panel, 'strong').map((e) => e.textContent),
    ['Mascot server', 'Voice session', 'Microphone', 'Sound'], 'the server checks, then the ones only the browser knows');
  assert.ok(panel.querySelector('.status-fail'), 'the broken one is marked');
  withText(panel, 'button', en['status.do.voice']).click();
  await p.settle();
  assert.deepEqual(api.calls.at(-1), ['action', 'voice']);
  ctx.mock.timers.tick(600);                             // it looks again a moment after acting
  await p.settle();
  assert.ok(withText(panel, 'p', 'Opening the voice session.'), 'what the action answered shows under the check');

  p.key('Escape');
  assert.equal(open(p).length, 0);
  assert.equal(p.win.location.hash, '');
});

test('Status from the phone: the checks show, the buttons that change the computer do not', async (ctx) => {
  ctx.mock.timers.enable({ apis: ['setInterval', 'setTimeout'] });
  const p = page();
  const made = createStatus({ api: statusApi({ local: false }), t, win: p.win });
  await p.settle();
  made.open();
  await p.settle();
  const [panel] = open(p);
  assert.equal(withText(panel, 'button', en['status.do.voice']), undefined);
  assert.ok(withText(panel, 'p', 'Open it.'), 'the advice stays');
  made.close();
});

test('Status with the server down: one red check with the reason', async (ctx) => {
  ctx.mock.timers.enable({ apis: ['setInterval', 'setTimeout'] });
  const p = page();
  const made = createStatus({ api: { status: async () => { throw new Error('no connection to the server'); } }, t, win: p.win });
  made.open();
  await p.settle();
  assert.ok(withText(open(p)[0], 'p', 'no connection to the server'));
  assert.equal(p.document.body.querySelector('.status-chip').dataset.state, 'fail');
  made.close();
});

// --- the private network ------------------------------------------------------------------------------------------

test('the private network: the steps so far, one button for the next, and what the press did', async (ctx) => {
  ctx.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  const p = page();
  const calls = [];
  const states = [{ step: 'login' }, { step: 'done', phone_url: 'https://pc.example.ts.net/' }];
  const api = {
    network: async () => { calls.push('look'); return states.shift(); },
    networkStep: async (step) => { calls.push(step); return { step: 'login', open: 'https://login.example/' }; },
    qr: async () => { throw new Error('no picture in this test'); },
  };
  createNetwork({ api, t, win: p.win });
  assert.equal(open(p).length, 0);
  p.win.location.hash = 'network';
  await p.settle();
  const [panel] = open(p);
  assert.equal(panel.querySelector('h2').textContent, en['settings.network']);
  assert.deepEqual(all(panel, 'li').map((li) => li.className), ['done', 'now', '', '']);
  assert.equal(panel.querySelector('.network-say').textContent, en['network.login']);

  withText(panel, 'button', en['network.do.login']).click();
  await p.settle();
  assert.deepEqual(calls, ['look', 'login']);
  assert.deepEqual(p.win.opened, ['https://login.example/'], 'the sign-in page opens in the browser');
  assert.equal(panel.querySelector('.sheet-note').textContent, en['network.finishInBrowser']);

  withText(panel, 'button', en['network.check']).click();
  await p.settle();
  assert.deepEqual(all(panel, 'li').map((li) => li.className), ['done', 'done', 'done', 'done']);
  assert.equal(panel.querySelector('code').textContent, 'https://pc.example.ts.net/');
  assert.equal(panel.querySelector('.network-actions'), null, 'done: nothing left to press');
  assert.equal(panel.querySelector('.sheet-note').textContent, '');

  p.key('Escape');
  assert.equal(open(p).length, 0);
  assert.equal(p.win.location.hash, '');
});

test('the private network: the DNS step opens the admin page; a failure shows its reason', async () => {
  const p = page();
  const api = {
    network: async () => ({ step: 'dns', admin_dns: 'https://admin.example/dns' }),
    networkStep: async () => { throw new Error('tailscale did not answer'); },
    qr: async () => null,
  };
  const made = createNetwork({ api, t, win: p.win });
  made.open();
  await p.settle();
  const [panel] = open(p);
  withText(panel, 'button', en['network.do.dns']).click();
  await p.settle();
  assert.deepEqual(p.win.opened, ['https://admin.example/dns']);
  assert.equal(panel.querySelector('.sheet-note').textContent, en['network.afterDns']);
  made.close();

  const q = page();
  const failing = createNetwork({ api: { ...api, network: async () => ({ step: 'serve' }) }, t, win: q.win });
  failing.open();
  await q.settle();
  withText(open(q)[0], 'button', en['network.do.serve']).click();
  await q.settle();
  assert.equal(open(q)[0].querySelector('.sheet-note').textContent, 'tailscale did not answer');
  failing.close();
});

// --- the screens together, as main.js makes them: Status, then Settings, then the private network -------------------

function wholePage(p, api, lang = { now: 'en' }) {
  const tt = (key, vars) => fill((lang.now === 'pt-BR' ? pt : en)[key] ?? key, vars);
  const status = createStatus({ api, t: tt, lang: () => lang.now, audio: { state: () => 'running', unlock: () => {} }, win: p.win });
  const made = createSettings({ api, t: tt, win: p.win, language: () => lang.now, setLanguage: (v) => { lang.now = v; } });
  const network = createNetwork({ api, t: tt, win: p.win });
  return { status, settings: made, network, lang, gear: p.document.body.querySelector('.settings-open'),
    chip: p.document.body.querySelector('.status-chip') };
}

test('from Settings to the private network: one drawer leaves, the other comes in front, the focus finds the gear', async (ctx) => {
  ctx.mock.timers.enable({ apis: ['setInterval', 'setTimeout'] });
  const p = page();
  const api = { ...settingsApi(), ...statusApi(), network: async () => ({ step: 'login' }) };
  const w = wholePage(p, api);
  await p.settle();
  w.gear.focus();
  w.gear.click();
  await p.settle();
  const go = withText(open(p)[0], 'button', en['settings.network']);
  go.focus();
  go.click();
  await p.settle();
  const [panel, ...others] = open(p);
  assert.equal(others.length, 0, 'only one drawer is open');
  assert.equal(panel.querySelector('h2').textContent, en['settings.network']);
  assert.equal(p.document.body.children.at(-1), panel, 'and it is the last thing in the page: in front');
  assert.ok(panel.contains(p.document.activeElement), 'the keyboard is inside it');
  p.key('Escape');
  assert.equal(open(p).length, 0);
  assert.equal(p.document.activeElement, w.gear, 'back at the gear, not on a button that no longer exists');
});

test('a drawer opened over the first run is in front of it and takes the keyboard; Esc closes only that one', async () => {
  const p = page();
  const api = { ...settingsApi({ first_run_done: false, phone_url: null, voice_provider: 'device' }), network: async () => ({ step: 'login' }) };
  const s = settings(p, api);
  createNetwork({ api, t, win: p.win });
  await s.firstRun();
  await p.settle();
  withText(open(p)[0], 'button', en['first.next']).click();
  await p.settle();
  withText(open(p)[0], 'button', en['settings.network']).click();        // step 2, no phone yet: make the network
  await p.settle();
  const shown = open(p);
  assert.equal(shown.length, 2);
  const network = shown.find((panel) => !panel.classList.contains('first-run'));
  assert.equal(p.document.body.children.at(-1), network, 'the network drawer is in front of the first run');
  p.key('Escape');
  assert.deepEqual(open(p).map((panel) => panel.classList.contains('first-run')), [true], 'the first run is still there');
  p.key('Escape');
  assert.equal(open(p).length, 0);
});

test('Status follows the language; a redraw keeps the keyboard on its button; closing returns to the light', async (ctx) => {
  ctx.mock.timers.enable({ apis: ['setInterval', 'setTimeout'] });
  const p = page();
  const api = { ...settingsApi(), ...statusApi() };
  const w = wholePage(p, api);
  await p.settle();
  w.chip.focus();
  w.chip.click();
  await p.settle();
  let [panel] = open(p);
  assert.equal(panel.querySelector('h2').textContent, 'Status');
  assert.equal(panel.querySelector('.status-dot').getAttribute('role'), 'img');

  const before = withText(panel, 'button', en['status.do.voice']);
  before.focus();
  before.click();
  await p.settle();
  ctx.mock.timers.tick(600);                             // it looks again: the rows are made anew
  await p.settle();
  const after = withText(panel, 'button', en['status.do.voice']);
  assert.notEqual(after, before, 'the row was drawn again');
  assert.equal(p.document.activeElement, after, 'and the keyboard is on the same button of the new row');

  const rows = all(panel, '.status-row');
  ctx.mock.timers.tick(15000);                           // the regular look: nothing changed
  await p.settle();
  assert.ok(all(panel, '.status-row').every((row, i) => row === rows[i]), 'the same rows: nothing was redrawn');

  after.remove();                                        // the focused control vanishes: the focus falls to the page
  assert.equal(p.document.activeElement, p.document.body);
  p.key('Escape');
  assert.equal(p.document.activeElement, w.chip, 'closing still returns the focus to the light');

  w.lang.now = 'pt-BR';
  w.chip.click();
  await p.settle();
  [panel] = open(p);
  assert.equal(panel.querySelector('h2').textContent, 'Estado', 'opened again after a language change');
  assert.equal(panel.querySelector('.sheet-close').getAttribute('aria-label'), 'Fechar');
  w.status.close();
});

test('the private network says its steps to a screen reader, and forgets an old message when opened again', async () => {
  const p = page();
  const api = {
    network: async () => ({ step: 'dns', admin_dns: 'https://admin.example/dns' }),
    networkStep: async () => ({ step: 'dns' }),
    qr: async () => null,
  };
  const made = createNetwork({ api, t, win: p.win });
  made.open();
  await p.settle();
  let [panel] = open(p);
  const steps = all(panel, 'li');
  assert.deepEqual(steps.map((li) => li.getAttribute('aria-current')), [null, null, 'step', null]);
  assert.equal(steps[0].textContent, `${en['network.step.install']} (done)`, 'a done step says so in words too');
  assert.equal(steps[3].textContent, en['network.step.serve']);
  withText(panel, 'button', en['network.do.dns']).click();
  await p.settle();
  assert.equal(panel.querySelector('.sheet-note').textContent, en['network.afterDns']);
  made.close();
  made.open();
  assert.equal(panel.querySelector('.sheet-note').textContent, '', 'no message left over from last time');
  await p.settle();
  made.close();
});

test('the fake page behaves like a browser where the drawers depend on it', async () => {
  const p = page();
  const make = (tag = 'button', props = {}) => Object.assign(p.document.createElement(tag), props);
  const loose = make();
  loose.focus();
  assert.equal(p.document.activeElement, p.document.body, 'not in the page: no focus');
  const box = make('div');
  const [shown, off] = [make(), make('button', { disabled: true })];
  box.append(shown, off);
  p.document.body.append(box);
  off.focus();
  assert.equal(p.document.activeElement, p.document.body, 'disabled: no focus');
  box.hidden = true;
  shown.focus();
  assert.equal(p.document.activeElement, p.document.body, 'inside something hidden: no focus');
  box.hidden = false;
  shown.focus();
  assert.equal(p.document.activeElement, shown);
  box.replaceChildren();
  assert.equal(p.document.activeElement, p.document.body, 'the focused element left the page: the focus falls back');
  assert.equal(shown.isConnected, false);
  const list = p.document.body.querySelectorAll('div');
  assert.equal(list.map, undefined, 'a list of elements is not an array');
  assert.deepEqual([...list], [box]);
  let told = 0;
  p.win.addEventListener('hashchange', () => { told += 1; });
  p.win.location.hash = 'status';
  assert.equal(told, 0, 'a new #hash is told a moment later');
  await p.settle();
  assert.equal(told, 1);
});

test('the private network in one press: install, sign in, the DNS page, share, the codes; it looks again by itself', async (ctx) => {
  ctx.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  const p = page();
  const calls = [];
  // what each look finds, in order: Tailscale missing; installed (winget done); signed in but DNS off; still off;
  // DNS on; and the step answers: install started, the sign-in link, Cody shared
  const looks = [{ step: 'install' }, { step: 'login' }, { step: 'dns', admin_dns: 'https://admin.example/dns' },
    { step: 'dns', admin_dns: 'https://admin.example/dns' }, { step: 'serve' }];
  const api = {
    network: async () => { calls.push('look'); return looks.length > 1 ? looks.shift() : looks[0]; },
    networkStep: async (step) => {
      calls.push(step);
      return { install: { step: 'install' }, login: { step: 'login', open: 'https://login.example/' },
        serve: { step: 'done', phone_url: 'https://pc.example.ts.net/' } }[step];
    },
    qr: async () => { throw new Error('no picture in this test'); },
  };
  const made = createNetwork({ api, t, win: p.win });
  made.open();
  await p.settle();
  const [panel] = open(p);
  const note = () => panel.querySelector('.sheet-note').textContent;
  withText(panel, 'button', en['network.do.install']).click();           // the one press
  await p.settle();
  assert.deepEqual(calls, ['look', 'install']);
  assert.equal(note(), en['network.installing']);
  assert.equal(withText(panel, 'button', en['network.do.install']).disabled, true, 'the button waits while it runs');

  ctx.mock.timers.tick(NETWORK.poll);                                    // installed: it signs in by itself
  await p.settle();
  assert.deepEqual(calls.slice(2), ['look', 'login']);
  assert.deepEqual(p.win.opened, ['https://login.example/'], 'the sign-in page opened');
  assert.equal(note(), en['network.finishInBrowser']);

  ctx.mock.timers.tick(NETWORK.poll);                                    // signed in, DNS off: the admin page opens
  await p.settle();
  assert.deepEqual(p.win.opened.at(-1), 'https://admin.example/dns');
  assert.equal(note(), en['network.afterDns']);
  ctx.mock.timers.tick(NETWORK.poll);                                    // still off: no second window
  await p.settle();
  assert.equal(p.win.opened.length, 2, 'each page opens once');
  assert.deepEqual(all(panel, 'li').map((li) => li.className), ['done', 'done', 'now', '']);

  ctx.mock.timers.tick(NETWORK.poll);                                    // DNS on: it shares Cody and is done
  await p.settle();
  assert.equal(calls.at(-1), 'serve');
  assert.equal(panel.querySelector('code').textContent, 'https://pc.example.ts.net/');
  assert.deepEqual(all(panel, 'li').map((li) => li.className), ['done', 'done', 'done', 'done']);
  const seen = calls.length;
  ctx.mock.timers.tick(NETWORK.poll * 3);
  await p.settle();
  assert.equal(calls.length, seen, 'done: it stops looking');
  made.close();
});

test('closing the private network drawer stops the looking; a failed step says why and lets you press again', async (ctx) => {
  ctx.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  const p = page();
  const calls = [];
  const api = {
    network: async () => { calls.push('look'); return { step: 'login' }; },
    networkStep: async () => { calls.push('login'); return { step: 'login', open: 'https://login.example/' }; },
    qr: async () => null,
  };
  const made = createNetwork({ api, t, win: p.win });
  made.open();
  await p.settle();
  withText(open(p)[0], 'button', en['network.do.login']).click();
  await p.settle();
  made.close();
  const seen = calls.length;
  ctx.mock.timers.tick(NETWORK.poll * 3);
  await p.settle();
  assert.equal(calls.length, seen, 'closed: no more looks');

  const q = page();
  const failing = createNetwork({ api: { ...api, networkStep: async () => { throw new Error('tailscale did not answer'); } }, t, win: q.win });
  failing.open();
  await q.settle();
  const [panel] = open(q);
  withText(panel, 'button', en['network.do.login']).click();
  await q.settle();
  assert.equal(panel.querySelector('.sheet-note').textContent, 'tailscale did not answer');
  assert.equal(withText(panel, 'button', en['network.do.login']).disabled, false, 'the button is back');
  failing.close();
});

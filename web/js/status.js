// status.js — the Status screen and the light in the corner. The server's checks (GET /api/status: server, voice
// session, channel, hooks, Tailscale, phone, voice provider; cody/doctor.py) plus the ones only the browser knows:
// the microphone, speech recognition, the sound and the secure connection. Each item is a traffic light, one plain
// sentence and what to do; a button where Cody can do it (from the computer itself for server actions). The screen
// is the drawer of sheet.js (#status, or a tap on the light): the mascot stays in view beside it.
//
//   createStatus({ api, t, audio, request }) → { refresh(), open(), close() }
//   worst(items), clientChecks(env, t), summary(items, t) are pure, for the tests.

import { createSheet } from './sheet.js';

const ORDER = { fail: 0, warn: 1, ok: 2 };
const REFRESH_MS = 15000;

export function worst(items) {
  return items.reduce((bad, it) => (ORDER[it.state] < ORDER[bad] ? it.state : bad), 'ok');
}

// the short label next to the light: the first broken thing, or "all good"
export function summary(items, t) {
  const voice = items.find((it) => it.id === 'voice');
  if (voice && voice.state === 'fail') return t('status.chip.voiceOff');
  const bad = items.find((it) => it.state === 'fail') || items.find((it) => it.state === 'warn' && it.urgent);
  return bad ? bad.title : t('status.chip.ok');
}

// env: { secure, recognizer, mic: 'granted' | 'denied' | 'prompt' | null, sound: 'running' | 'suspended' | null }
export function clientChecks(env, t) {
  const items = [];
  if (!env.secure) {
    items.push({ id: 'secure', state: 'fail', title: t('status.secure'), say: t('status.secure.no'),
      fix: t('status.secure.fix'), action: null, urgent: true });
  }
  if (!env.recognizer) {
    items.push({ id: 'mic', state: 'fail', title: t('status.mic'), say: t('status.mic.noRecognition'),
      fix: t('status.mic.browser'), action: null, urgent: true });
  } else if (env.mic === 'denied') {
    items.push({ id: 'mic', state: 'fail', title: t('status.mic'), say: t('status.mic.denied'),
      fix: t('status.mic.deniedFix'), action: null, urgent: true });
  } else {
    items.push({ id: 'mic', state: env.mic === 'granted' ? 'ok' : 'warn', title: t('status.mic'),
      say: t(env.mic === 'granted' ? 'status.mic.ok' : 'status.mic.ask'), fix: '',
      action: env.mic === 'granted' ? null : 'mic' });
  }
  const sound = env.sound === 'running';
  items.push({ id: 'sound', state: sound ? 'ok' : 'warn', title: t('status.sound'),
    say: t(sound ? 'status.sound.ok' : 'status.sound.locked'), fix: '', action: sound ? null : 'sound' });
  return items;
}

async function micState(nav) {
  try { return (await nav.permissions.query({ name: 'microphone' })).state; } catch { return null; }
}

function row(item, t, act, said) {
  const li = document.createElement('li');
  li.className = `status-row status-${item.state}`;
  const dot = Object.assign(document.createElement('span'), { className: 'status-dot' });
  dot.setAttribute('aria-label', t(`status.state.${item.state}`));
  const body = document.createElement('div');
  const title = Object.assign(document.createElement('strong'), { textContent: item.title });
  const say = Object.assign(document.createElement('p'), { textContent: item.say });
  body.append(title, say);
  if (item.fix && item.state !== 'ok') body.append(Object.assign(document.createElement('p'), { className: 'status-fix', textContent: item.fix }));
  if (item.action) {
    const button = Object.assign(document.createElement('button'), { type: 'button', className: 'primary', textContent: t(`status.do.${item.action}`) });
    button.addEventListener('click', () => act(item.action, button, item.id));
    body.append(button);
  }
  if (said) body.append(Object.assign(document.createElement('p'), { className: 'status-fix', textContent: said }));
  li.append(dot, body);
  return li;
}

export function createStatus({ api, t, lang = () => 'en', audio, request = () => {}, win = window }) {
  const chip = Object.assign(document.createElement('button'), { type: 'button', className: 'status-chip' });
  const sheet = createSheet({
    win,
    onClose: () => { if (win.location.hash === '#status') history.replaceState(null, '', ' '); },
  });
  sheet.setTitle(t('status.title'), t('status.close'));
  const list = Object.assign(document.createElement('ul'), { className: 'status-list' });
  sheet.body.append(list);
  document.body.append(chip);
  const st = { items: [], local: false, timer: 0, said: new Map() };   // said: an action's answer, by item

  async function act(action, button, id) {
    button.disabled = true;
    st.said.delete(id);
    try {
      if (action === 'sound') audio?.unlock();
      else if (action === 'mic') (await win.navigator.mediaDevices.getUserMedia({ audio: true })).getTracks().forEach((tr) => tr.stop());
      else if (action === 'network') win.location.hash = 'network';
      else {
        const done = await api.action(action);
        if (done?.message) st.said.set(id, done.message);
      }
    } catch (e) {
      st.said.set(id, String(e?.message || e));
    }
    setTimeout(refresh, 600);
  }

  function paint() {
    const light = worst(st.items);
    chip.dataset.state = light;
    chip.textContent = summary(st.items, t);
    chip.setAttribute('aria-label', `${t('status.title')}: ${chip.textContent}`);
    if (!sheet.isOpen) return;
    list.replaceChildren(...st.items.map((it) => row(st.local || !['voice', 'hooks'].includes(it.action) ? it : { ...it, action: null }, t, act, st.said.get(it.id))));
  }

  async function refresh() {
    let server = [];
    try {
      const data = await api.status(lang());
      server = Array.isArray(data?.items) ? data.items : [];
      st.local = !!data?.local;
    } catch (e) {
      server = [{ id: 'server', state: 'fail', title: t('status.server'), say: String(e?.message || e), fix: '', action: null }];
    }
    const nav = win.navigator;
    const env = { secure: win.isSecureContext, recognizer: !!(win.SpeechRecognition || win.webkitSpeechRecognition),
      mic: await micState(nav), sound: audio?.state?.() ?? null };
    st.items = [...server, ...clientChecks(env, t)];
    paint();
    request();
  }

  function open() { sheet.open(); paint(); refresh(); }
  chip.addEventListener('click', () => { win.location.hash = 'status'; });
  const route = () => (win.location.hash === '#status' ? open() : sheet.close());
  win.addEventListener('hashchange', route);
  route();
  refresh();
  st.timer = setInterval(() => { if (!document.hidden) refresh(); }, REFRESH_MS);
  return { refresh, open, close: () => sheet.close() };
}

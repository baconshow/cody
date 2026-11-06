// network.js — "Create your private network" (#network): from no Tailscale to Cody on the phone, with no terminal and
// one press. The computer does the work (POST /api/network, from the computer only); what the user has to do
// themself happens in the browser (sign in with Google, Microsoft, GitHub or Apple; switch on MagicDNS and HTTPS),
// and the drawer looks again every few seconds until it is done, going on by itself: install, then sign in, then
// the DNS page if it is needed, then share Cody, then two QR codes (the Tailscale app for the phone, and Cody's
// private address). It is the drawer of sheet.js: the steps, what is happening now, and the last message at the
// bottom.
//
//   createNetwork({ api, t, win }) → { open(), close() }
//   view(state, t) is pure, for the tests. NETWORK.poll: how often it looks again while it waits for the user.

import { createSheet, el } from './sheet.js';

const ORDER = ['install', 'login', 'dns', 'serve', 'done'];
export const NETWORK = Object.freeze({ poll: 4000 });

// what each step needs: 'run' the computer does alone; 'browser' needs the user there, then a look again later
const NEEDS = Object.freeze({ install: 'run', login: 'browser', dns: 'browser', serve: 'run' });

export function view(state, t) {
  const step = ORDER.includes(state?.step) ? state.step : 'install';
  const action = { install: 'install', login: 'login', serve: 'serve' }[step] || null;
  const link = step === 'dns' ? state.admin_dns : null;
  return { step, index: ORDER.indexOf(step), say: t(`network.${step}`), button: t(`network.do.${step}`), action, link };
}

export function createNetwork({ api, t, win = window }) {
  const sheet = createSheet({
    win,
    onClose: () => {
      stop();
      if (win.location.hash === '#network') history.replaceState(null, '', ' ');
    },
  });
  const { body, note } = sheet;
  // going: the press started the chain and it is not done · did: the steps run in this chain (install and serve
  // once each, the browser opened once per step) · poll: the next look
  const st = { going: false, did: new Set(), poll: 0 };

  async function qr(which) {
    try {
      const buffer = await api.qr(which);
      return el('img', { className: 'settings-qr', alt: '', src: URL.createObjectURL(new Blob([buffer], { type: 'image/svg+xml' })) });
    } catch { return null; }
  }

  async function render(state, message = '') {
    const v = view(state, t);
    const steps = el('ol', { className: 'network-steps' }, ...ORDER.slice(0, 4).map((id, i) => {
      const done = i < v.index;
      const li = el('li', { className: done ? 'done' : (i === v.index ? 'now' : '') }, el('span', { textContent: t(`network.step.${id}`) }),
        done ? el('span', { className: 'sr-only', textContent: ` (${t('network.step.isDone')})` }) : null);
      if (i === v.index) li.setAttribute('aria-current', 'step');
      return li;
    }));
    sheet.setTitle(t('settings.network'), t('status.close'));
    const parts = [el('p', { className: 'settings-privacy', textContent: t('network.why') }), steps,
      el('p', { className: 'network-say', textContent: v.say })];
    if (v.step === 'done') {
      parts.push(el('div', { className: 'settings-phone' }, el('p', { textContent: t('settings.phone.app') }), await qr('tailscale'),
        el('p', { textContent: t('settings.phone.scan') }), await qr('phone'), el('code', { textContent: state.phone_url })));
    } else {
      // one press starts the chain; while it runs, the button waits and "check again" is there for the impatient
      const go = el('button', { type: 'button', className: 'primary', textContent: v.button, disabled: st.going });
      go.addEventListener('click', () => { st.did.clear(); drive(state); });
      const again = el('button', { type: 'button', textContent: t('network.check') });
      again.addEventListener('click', () => look());
      parts.push(el('div', { className: 'network-actions' }, go, again));
    }
    parts.push(el('p', { className: 'settings-privacy', textContent: t('network.phoneToo') }));
    note.textContent = message;
    body.replaceChildren(...parts);
  }

  // the chain: does what the current step needs and goes on until done; what needs the user waits for a look again
  async function drive(state) {
    const v = view(state, t);
    st.going = true;
    if (v.step === 'done') { st.going = false; await render(state); return; }
    if (st.did.has(v.step)) { await render(state, waitingWord(v.step)); later(); return; }   // started: wait for it
    st.did.add(v.step);
    try {
      if (NEEDS[v.step] === 'run' || v.step === 'login') {
        const next = await api.networkStep(v.action);
        if (next.open) win.open(next.open, '_blank', 'noopener');
        if (view(next, t).step !== v.step) { await drive(next); return; }       // on to the next step at once
        await render(next, waitingWord(v.step));
      } else {
        win.open(v.link, '_blank', 'noopener');
        await render(state, waitingWord(v.step));
      }
      later();
    } catch (e) {
      st.going = false;
      await render({ step: v.step }, String(e?.message || e));
    }
  }

  // what the note says while a step is on its way
  function waitingWord(step) {
    return t(step === 'install' ? 'network.installing' : step === 'dns' ? 'network.afterDns' : step === 'serve'
      ? 'network.sharing' : 'network.finishInBrowser');
  }

  function later() {
    clearTimeout(st.poll);
    if (st.going && sheet.isOpen) st.poll = setTimeout(look, NETWORK.poll);
  }

  function stop() {
    st.going = false;
    st.did.clear();
    clearTimeout(st.poll);
  }

  // a look at where things stand; in a chain, it goes on from there
  async function look() {
    let state;
    try { state = await api.network(); } catch (e) {
      stop();
      note.textContent = '';
      body.replaceChildren(el('p', { textContent: String(e?.message || e) }));
      return;
    }
    if (!sheet.isOpen) return;
    if (st.going) await drive(state);
    else await render(state);
  }

  function open() {
    sheet.setTitle(t('settings.network'), t('status.close'));
    sheet.open();
    note.textContent = '';
    body.replaceChildren(el('p', { textContent: '…' }));
    look();
  }
  const route = () => (win.location.hash === '#network' ? open() : sheet.close());
  win.addEventListener('hashchange', route);
  route();
  return { open, close: () => sheet.close() };
}

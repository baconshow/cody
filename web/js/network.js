// network.js — "Create your private network" (#network): one step at a time from no Tailscale to Cody on the phone,
// with no terminal. The computer does the work (POST /api/network, from the computer only); pages the user has to
// see (sign-in, the DNS settings, the download) open in the browser. Ends with two QR codes: the Tailscale app for
// the phone and Cody's private address.
//
//   createNetwork({ api, t, win }) → { open(), close() }
//   view(state, t) is pure, for the tests.

const ORDER = ['install', 'login', 'dns', 'serve', 'done'];

export function view(state, t) {
  const step = ORDER.includes(state?.step) ? state.step : 'install';
  const action = { install: 'install', login: 'login', serve: 'serve' }[step] || null;
  const link = step === 'dns' ? state.admin_dns : null;
  return { step, index: ORDER.indexOf(step), say: t(`network.${step}`), button: t(`network.do.${step}`), action, link };
}

const el = (tag, props = {}, ...kids) => {
  const e = Object.assign(document.createElement(tag), props);
  e.append(...kids.filter(Boolean));
  return e;
};

export function createNetwork({ api, t, win = window }) {
  const panel = el('section', { className: 'settings-panel network-panel', hidden: true });
  document.body.append(panel);

  async function qr(which) {
    try {
      const buffer = await api.qr(which);
      return el('img', { className: 'settings-qr', alt: '', src: URL.createObjectURL(new Blob([buffer], { type: 'image/svg+xml' })) });
    } catch { return null; }
  }

  async function render(state, message = '') {
    const v = view(state, t);
    const steps = el('ol', { className: 'network-steps' },
      ...ORDER.slice(0, 4).map((id, i) => el('li', { className: i < v.index ? 'done' : (i === v.index ? 'now' : ''), textContent: t(`network.step.${id}`) })));
    const parts = [el('h2', { textContent: t('settings.network') }), el('p', { textContent: t('network.why') }), steps,
      el('p', { className: 'network-say', textContent: v.say })];
    if (v.step === 'done') {
      parts.push(el('p', { textContent: t('settings.phone.app') }), await qr('tailscale'),
        el('p', { textContent: t('settings.phone.scan') }), await qr('phone'), el('code', { textContent: state.phone_url }));
    } else {
      const go = el('button', { type: 'button', textContent: v.button });
      go.addEventListener('click', () => run(v, go));
      const again = el('button', { type: 'button', className: 'first-skip', textContent: t('network.check') });
      again.addEventListener('click', refresh);
      parts.push(el('div', {}, go, again));
    }
    if (message) parts.push(el('p', { className: 'settings-note', textContent: message }));
    const close = el('button', { type: 'button', className: 'settings-close', textContent: t('status.close') });
    close.addEventListener('click', closePanel);
    parts.push(el('p', { className: 'settings-privacy', textContent: t('network.phoneToo') }), close);
    panel.replaceChildren(...parts);
  }

  async function run(v, button) {
    button.disabled = true;
    try {
      if (v.link) { win.open(v.link, '_blank', 'noopener'); await render(await api.network(), t('network.afterDns')); return; }
      const state = await api.networkStep(v.action);
      if (state.open) win.open(state.open, '_blank', 'noopener');
      await render(state, state.open ? t('network.finishInBrowser') : '');
    } catch (e) { await render({ step: v.step }, String(e?.message || e)); }
  }

  async function refresh() {
    try { await render(await api.network()); } catch (e) { panel.replaceChildren(el('p', { textContent: String(e?.message || e) })); }
  }

  function open() { panel.hidden = false; panel.replaceChildren(el('p', { textContent: '…' })); refresh(); }
  function closePanel() { panel.hidden = true; if (win.location.hash === '#network') history.replaceState(null, '', ' '); }
  const route = () => (win.location.hash === '#network' ? open() : (panel.hidden = true));
  win.addEventListener('hashchange', route);
  route();
  return { open, close: closePanel };
}

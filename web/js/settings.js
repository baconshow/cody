// settings.js — the Settings screen (#settings) and the guided first run. On the computer everything can be changed;
// from the phone the screen only shows the language (this browser) and says where to change the rest. The
// ElevenLabs key is typed here, saved on the computer only, and never comes back (only "a key is saved").
//
//   createSettings({ api, t, setLanguage, language, announce, win }) → { open(), close(), firstRun() }
//   firstRunSteps(info, t), providers(t) are pure, for the tests.

export const PROVIDERS = Object.freeze(['elevenlabs', 'hosted', 'device', 'sounds']);

export function providers(t) {
  return PROVIDERS.map((id) => ({ id, label: t(`settings.voice.${id}`), note: t(`settings.voice.${id}.note`) }));
}

// three steps at most, the last one ends in "say hi"
export function firstRunSteps(info, t) {
  return [
    { id: 'hello', say: t('first.hello'), choices: ['language', 'voice'] },
    { id: 'phone', say: info.phone_url ? t('first.phone.qr') : t('first.phone.network'), choices: ['phone'] },
    { id: 'voice', say: t('first.voice'), choices: ['open-voice'], last: t('first.sayHi') },
  ];
}

const el = (tag, props = {}, ...kids) => {
  const e = Object.assign(document.createElement(tag), props);
  e.append(...kids.filter(Boolean));
  return e;
};

async function qrImage(api, which) {
  try {
    const buffer = await api.qr(which);
    return el('img', { className: 'settings-qr', alt: '', src: URL.createObjectURL(new Blob([buffer], { type: 'image/svg+xml' })) });
  } catch { return null; }
}

export function createSettings({ api, t, setLanguage, language, announce = () => {}, win = window }) {
  const panel = el('section', { className: 'settings-panel', hidden: true });
  panel.setAttribute('aria-label', t('settings.title'));
  document.body.append(panel);
  const st = { info: null };

  async function load() { st.info = await api.settings(); return st.info; }

  async function change(updates, note) {
    try {
      st.info = { ...st.info, ...(await api.saveSettings(updates)) };   // keeps what the answer leaves out
      note.textContent = (st.info.notes || []).join(' ') || t('settings.saved');
    } catch (e) { note.textContent = String(e?.message || e); }
  }

  function field(label, control, hint) {
    return el('label', { className: 'settings-field' }, el('span', { textContent: label }), control,
      hint ? el('small', { textContent: hint }) : null);
  }

  function languageField(note) {
    const select = el('select');
    for (const [v, name] of [['en', 'English'], ['pt-BR', 'Português (Brasil)']]) select.append(el('option', { value: v, textContent: name, selected: v === language() }));
    select.addEventListener('change', async () => {
      setLanguage(select.value);
      if (st.info?.local) await change({ language: select.value }, note);
      render();
    });
    return field(t('settings.language'), select);
  }

  function voiceFields(info, note, { compact = false } = {}) {
    const box = el('fieldset', { className: 'settings-voice' }, el('legend', { textContent: t('settings.voice') }));
    for (const p of providers(t)) {
      const radio = el('input', { type: 'radio', name: 'provider', value: p.id, checked: info.voice_provider === p.id });
      radio.addEventListener('change', () => change({ voice_provider: p.id }, note));
      box.append(el('label', { className: 'settings-radio' }, radio, el('span', { textContent: p.label }), el('small', { textContent: p.note })));
    }
    if (compact) return box;                          // the first run: just the choice; the key is in Settings
    const key = el('input', { type: 'password', autocomplete: 'off', placeholder: t(info.has_key ? 'settings.key.saved' : 'settings.key.none') });
    const saveKey = el('button', { type: 'button', textContent: t('settings.key.save') });
    saveKey.addEventListener('click', async () => {
      try { st.info.has_key = (await api.saveKey(key.value)).has_key; key.value = ''; note.textContent = t('settings.saved'); } catch (e) { note.textContent = String(e?.message || e); }
    });
    const voiceId = el('input', { value: info.voice_id || '', placeholder: t('settings.voiceId') });
    voiceId.addEventListener('change', () => change({ voice_id: voiceId.value }, note));
    const test = el('button', { type: 'button', textContent: t('settings.key.test') });
    test.addEventListener('click', async () => {
      note.textContent = '…';
      try {
        const r = await api.testVoice();
        note.textContent = r.ok ? t('settings.key.ok') : `ElevenLabs: ${r.reason}`;
      } catch (e) { note.textContent = String(e?.message || e); }
    });
    box.append(field(t('settings.key'), key, t('settings.key.hint')), saveKey, field(t('settings.voiceId'), voiceId), test);
    return box;
  }

  function switches(info, note) {
    const out = [];
    const check = (label, on, updates, hint, disabled = false) => {
      const box = el('input', { type: 'checkbox', checked: !!on, disabled });
      box.addEventListener('change', () => change(updates(box.checked), note));
      out.push(el('label', { className: 'settings-check' }, box, el('span', { textContent: label }), hint ? el('small', { textContent: hint }) : null));
    };
    check(t('settings.hooks'), info.hooks.on, (on) => ({ hooks: on }), info.hooks.plugin ? t('settings.hooks.plugin') : t('settings.hooks.hint'), info.hooks.plugin);
    if (info.autostart !== null) check(t('settings.autostart'), info.autostart, (on) => ({ autostart: on }));
    check(t('settings.updates'), info.update_check, (on) => ({ update_check: on }), t('settings.updates.hint'));
    return out;
  }

  async function phoneBox(info) {
    const box = el('div', { className: 'settings-phone' }, el('h3', { textContent: t('settings.phone') }));
    if (info.phone_url) {
      box.append(el('p', { textContent: t('settings.phone.scan') }), await qrImage(api, 'phone') || '', el('code', { textContent: info.phone_url }));
    } else {
      const go = el('button', { type: 'button', textContent: t('settings.network') });
      go.addEventListener('click', () => { win.location.hash = 'network'; });
      box.append(el('p', { textContent: t('settings.phone.none') }), go);
    }
    box.append(el('p', { textContent: t('settings.phone.app') }), await qrImage(api, 'tailscale') || '');
    return box;
  }

  async function render() {
    const info = st.info || await load().catch(() => null);
    const note = el('p', { className: 'settings-note', role: 'status' });
    const close = el('button', { type: 'button', className: 'settings-close', textContent: t('status.close') });
    close.addEventListener('click', closePanel);
    const body = [el('h2', { textContent: t('settings.title') }), languageField(note)];
    try {
      const v = await api.version();
      body.push(el('p', { className: 'settings-privacy', textContent: v.update ? t('settings.version.new', { version: v.version, latest: v.latest }) : t('settings.version', { version: v.version }) }));
    } catch { /* the version line is a nicety */ }
    if (info?.local) {
      const again = el('button', { type: 'button', textContent: t('settings.firstRun') });
      again.addEventListener('click', () => firstRun(true));
      body.push(voiceFields(info, note), ...switches(info, note), await phoneBox(info),
        el('p', { className: 'settings-privacy', textContent: t('settings.privacy') }), again);
    } else {
      body.push(el('p', { textContent: t('settings.onComputer') }));
    }
    panel.replaceChildren(...body, note, close);
  }

  async function open() { panel.hidden = false; st.info = null; await render(); }
  function closePanel() { panel.hidden = true; if (win.location.hash === '#settings') history.replaceState(null, '', ' '); }

  async function firstRun(force = false) {
    const info = st.info || await load().catch(() => null);
    if (!info?.local || (info.first_run_done && !force)) return;
    const steps = firstRunSteps(info, t);
    const card = el('section', { className: 'first-run' });
    document.body.append(card);
    const finish = async () => { card.remove(); await api.saveSettings({ first_run_done: true }).catch(() => {}); };
    const show = async (i) => {
      const step = steps[i];
      announce({ text: step.say });
      const next = el('button', { type: 'button', textContent: t(i === steps.length - 1 ? 'first.done' : 'first.next') });
      next.addEventListener('click', () => (i === steps.length - 1 ? finish() : show(i + 1)));
      const skip = el('button', { type: 'button', className: 'first-skip', textContent: t('first.skip') });
      skip.addEventListener('click', finish);
      const extra = [];
      if (step.id === 'hello') extra.push(languageField(el('p')), voiceFields(info, el('p'), { compact: true }));
      if (step.id === 'phone') extra.push(await phoneBox(info));
      if (step.id === 'voice') {
        const go = el('button', { type: 'button', textContent: t('status.do.voice') });
        go.addEventListener('click', async () => { await api.action('voice').catch(() => {}); announce({ text: step.last }); });
        extra.push(go);
      }
      card.replaceChildren(el('p', { className: 'first-step', textContent: `${i + 1}/${steps.length}` }),
        el('h2', { textContent: step.say }), ...extra, el('div', { className: 'first-buttons' }, skip, next));
    };
    show(0);
  }

  const route = () => (win.location.hash === '#settings' ? open() : (panel.hidden = true));
  win.addEventListener('hashchange', route);
  route();
  return { open, close: closePanel, firstRun };
}

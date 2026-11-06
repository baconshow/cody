// settings.js — the Settings screen (#settings) and the guided first run. Settings is a drawer on the right, so the
// mascot stays in view beside it: a title with the close button at the top (Esc and a click outside close it too),
// and the settings in groups: voice, phone, general, about. It opens from the gear in the corner of the mascot page,
// from the tray menu and from #settings. On the computer everything can be changed; from the phone the drawer only
// shows the language (this browser) and says where to change the rest. The ElevenLabs key is typed here, saved on
// the computer only, and never comes back (only "a key is saved").
//
//   createSettings({ api, t, setLanguage, language, announce, win }) → { open(), close(), firstRun() }
//   firstRunSteps(info, t), providers(t), sections(info) are pure, for the tests.

export const PROVIDERS = Object.freeze(['elevenlabs', 'hosted', 'device', 'sounds']);
const NOT_YET = new Set(['hosted']);        // listed so people know it is coming, but it cannot be chosen yet

export function providers(t) {
  return PROVIDERS.map((id) => ({ id, label: t(`settings.voice.${id}`), note: t(`settings.voice.${id}.note`),
    soon: NOT_YET.has(id) }));
}

// the groups of the drawer, in order: on the computer all of them; from the phone only what that browser may change
export function sections(info) {
  return info?.local ? ['voice', 'phone', 'general', 'about'] : ['general'];
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
  const title = el('h2');
  const close = el('button', { type: 'button', className: 'sheet-close' });
  const body = el('div', { className: 'sheet-body' });
  const note = el('p', { className: 'sheet-note', role: 'status' });      // what the last change did ("Saved.")
  const sheet = el('div', { className: 'sheet' }, el('header', { className: 'sheet-head' }, title, close), body, note);
  sheet.tabIndex = -1;
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-modal', 'true');
  const panel = el('section', { className: 'sheet-backdrop', hidden: true }, sheet);
  const opener = el('button', { type: 'button', className: 'settings-open' });   // the gear on the mascot page
  document.body.append(opener, panel);
  // renders: each render's turn (a slower, older one must not paint over a newer one) · draftKey: a key typed and
  // not saved yet, so redrawing the drawer does not throw it away · pressed: where the pointer went down
  const st = { info: null, renders: 0, draftKey: '', pressed: null };

  function label() {
    title.textContent = t('settings.title');
    for (const e of [sheet, opener]) e.setAttribute('aria-label', t('settings.title'));
    opener.dataset.tip = t('settings.title');
    close.setAttribute('aria-label', t('status.close'));
  }

  async function load() { st.info = await api.settings(); return st.info; }

  async function change(updates, says) {
    try {
      st.info = { ...st.info, ...(await api.saveSettings(updates)) };   // keeps what the answer leaves out
      says.textContent = (st.info.notes || []).join(' ') || t('settings.saved');
    } catch (e) { says.textContent = String(e?.message || e); }
  }

  function field(text, control, hint) {
    return el('label', { className: 'settings-field' }, el('span', { textContent: text }), control,
      hint ? el('small', { textContent: hint }) : null);
  }

  function group(name, ...kids) {
    return el('section', { className: 'settings-group' }, el('h3', { textContent: name }), ...kids);
  }

  function languageField(says) {
    const select = el('select');
    for (const [v, name] of [['en', 'English'], ['pt-BR', 'Português (Brasil)']]) select.append(el('option', { value: v, textContent: name, selected: v === language() }));
    select.addEventListener('change', async () => {
      setLanguage(select.value);
      if (st.info?.local) await change({ language: select.value }, says);
      await render();                                  // every text changes: the drawer is drawn again
      if (!panel.hidden) body.querySelector('select')?.focus({ preventScroll: true });   // the keyboard stays here
    });
    return field(t('settings.language'), select);
  }

  // the four ways to sound, one to pick; what is not offered yet shows, greyed, with "coming soon"
  // radios: the radio group's own name (the first-run card and the drawer can be in the page together)
  function voiceChoice(info, says, onPick = () => {}, radios = 'provider') {
    const box = el('fieldset', { className: 'settings-voice' }, el('legend', { textContent: t('settings.voice') }));
    for (const p of providers(t)) {
      const chosen = info.voice_provider === p.id;
      const radio = el('input', { type: 'radio', name: radios, value: p.id, checked: chosen, disabled: p.soon && !chosen });
      radio.addEventListener('change', async () => { await change({ voice_provider: p.id }, says); onPick(); });
      const name = el('span', { textContent: p.label }, p.soon ? el('em', { className: 'settings-soon', textContent: t('settings.soon') }) : null);
      box.append(el('label', { className: 'settings-radio' }, radio, name, el('small', { textContent: p.note })));
    }
    return box;
  }

  // your own ElevenLabs key, the voice and a test: shown while ElevenLabs is the chosen voice
  function elevenLabsBox(info, says) {
    const key = el('input', { type: 'password', autocomplete: 'off', value: st.draftKey, placeholder: t(info.has_key ? 'settings.key.saved' : 'settings.key.none') });
    key.addEventListener('input', () => { st.draftKey = key.value; });
    const saveKey = el('button', { type: 'button', textContent: t('settings.key.save') });
    saveKey.addEventListener('click', async () => {
      try {
        st.info.has_key = (await api.saveKey(key.value)).has_key;
        key.value = st.draftKey = '';
        key.placeholder = t('settings.key.saved');
        says.textContent = t('settings.saved');
      } catch (e) { says.textContent = String(e?.message || e); }
    });
    const voiceId = el('input', { value: info.voice_id || '', placeholder: t('settings.voiceId') });
    voiceId.addEventListener('change', () => change({ voice_id: voiceId.value }, says));
    const test = el('button', { type: 'button', className: 'primary', textContent: t('settings.key.test') });
    test.addEventListener('click', async () => {
      says.textContent = '…';
      try {
        const r = await api.testVoice();
        says.textContent = r.ok ? t('settings.key.ok') : `ElevenLabs: ${r.reason}`;
      } catch (e) { says.textContent = String(e?.message || e); }
    });
    return el('div', { className: 'settings-card' },
      el('div', { className: 'settings-field' }, el('span', { textContent: t('settings.key') }),
        el('div', { className: 'settings-inline' }, key, saveKey), el('small', { textContent: t('settings.key.hint') })),
      field(t('settings.voiceId'), voiceId), test);
  }

  function switches(info, says) {
    const out = [];
    const check = (text, on, updates, hint, disabled = false) => {
      const box = el('input', { type: 'checkbox', checked: !!on, disabled });
      box.addEventListener('change', () => change(updates(box.checked), says));
      out.push(el('label', { className: 'settings-check' }, box, el('span', { textContent: text }), hint ? el('small', { textContent: hint }) : null));
    };
    check(t('settings.hooks'), info.hooks.on, (on) => ({ hooks: on }), info.hooks.plugin ? t('settings.hooks.plugin') : t('settings.hooks.hint'), info.hooks.plugin);
    if (info.autostart !== null) check(t('settings.autostart'), info.autostart, (on) => ({ autostart: on }));
    check(t('settings.updates'), info.update_check, (on) => ({ update_check: on }), t('settings.updates.hint'));
    return out;
  }

  async function phoneBox(info, { heading = true } = {}) {
    const box = el('div', { className: 'settings-phone' }, heading ? el('h3', { textContent: t('settings.phone') }) : null);
    if (info.phone_url) {
      box.append(el('p', { textContent: t('settings.phone.scan') }), await qrImage(api, 'phone') || '', el('code', { textContent: info.phone_url }));
    } else {
      const go = el('button', { type: 'button', className: 'primary', textContent: t('settings.network') });
      go.addEventListener('click', () => { win.location.hash = 'network'; });
      box.append(el('p', { textContent: t('settings.phone.none') }), go);
    }
    box.append(el('p', { textContent: t('settings.phone.app') }), await qrImage(api, 'tailscale') || '');
    return box;
  }

  // the version line fills in when the answer comes: asking about a new version may take a while
  function versionLine() {
    const line = el('p', { className: 'settings-privacy' });
    api.version().then((v) => {
      line.textContent = v.update ? t('settings.version.new', { version: v.version, latest: v.latest }) : t('settings.version', { version: v.version });
    }).catch(() => { /* the version line is a nicety */ });
    return line;
  }

  const GROUPS = {
    // picking a voice only swaps what is under the choice: the radios stay, so the keyboard keeps its place
    voice: (info) => {
      const under = el('div');
      const fill = () => under.replaceChildren(...(st.info?.voice_provider === 'elevenlabs' ? [elevenLabsBox(st.info, note)] : []));
      fill();
      return group(t('settings.voice'), voiceChoice(info, note, fill), under);
    },
    phone: async (info) => group(t('settings.phone'), await phoneBox(info, { heading: false })),
    general: (info) => group(t('settings.group.general'), el('div', { className: 'settings-card' }, languageField(note),
      ...(info?.local ? switches(info, note) : [])),
    info?.local ? null : el('p', { className: 'settings-privacy', textContent: t('settings.onComputer') })),
    about: () => {
      const again = el('button', { type: 'button', className: 'ghost', textContent: t('settings.firstRun') });
      again.addEventListener('click', () => { closePanel(); firstRun(true); });
      return group(t('settings.group.about'), versionLine(),
        el('p', { className: 'settings-privacy', textContent: t('settings.privacy') }), again);
    },
  };

  async function render() {
    const turn = ++st.renders;
    const info = st.info || await load().catch(() => null);
    label();
    const groups = [];
    for (const id of sections(info)) groups.push(await GROUPS[id](info));
    if (turn !== st.renders) return;                   // a newer render started meanwhile: its picture wins
    body.replaceChildren(...groups);
  }

  async function open() {
    panel.hidden = false;
    st.info = null;
    note.textContent = '';
    await render();
    sheet.focus({ preventScroll: true });               // keyboard and screen readers start inside the drawer
  }
  function closePanel() {
    const inside = sheet.contains(document.activeElement);
    panel.hidden = true;
    st.draftKey = '';
    body.replaceChildren();                            // nothing typed stays behind in a hidden field
    if (win.location.hash === '#settings') history.replaceState(null, '', ' ');
    if (inside) opener.focus({ preventScroll: true });   // the keyboard goes back to where the drawer came from
  }

  // Tab stays inside the open drawer: past the last control it goes back to the first, and the other way round
  function keepInside(e) {
    const stops = [...sheet.querySelectorAll('button, input, select')].filter((n) => !n.disabled && n.offsetParent !== null);
    if (!stops.length) return;
    const at = document.activeElement;
    const out = !sheet.contains(at) || at === sheet;
    if (e.shiftKey && (out || at === stops[0])) { e.preventDefault(); stops.at(-1).focus(); }
    else if (!e.shiftKey && (out || at === stops.at(-1))) { e.preventDefault(); stops[0].focus(); }
  }

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
      // the key waits in Settings; the group has its own name, apart from the drawer's radios
      if (step.id === 'hello') extra.push(languageField(el('p')), voiceChoice(info, el('p'), () => {}, 'first-provider'));
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

  label();
  opener.addEventListener('click', () => { win.location.hash = 'settings'; });
  close.addEventListener('click', closePanel);
  // a click outside the drawer closes it; a drag that started inside (selecting the address) and ended outside does not
  panel.addEventListener('pointerdown', (e) => { st.pressed = e.target; });
  panel.addEventListener('click', (e) => { if (e.target === panel && st.pressed === panel) closePanel(); });
  win.addEventListener('keydown', (e) => {
    if (panel.hidden) return;
    if (e.key === 'Escape') closePanel();
    else if (e.key === 'Tab') keepInside(e);
  });
  const route = () => {
    if (win.location.hash === '#settings') open();
    else if (!panel.hidden) closePanel();
  };
  win.addEventListener('hashchange', route);
  route();
  return { open, close: closePanel, firstRun };
}

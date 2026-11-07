// settings.js — the Settings screen (#settings) and the guided first run, both in the drawer of sheet.js: on the
// right, with the mascot still in view beside it. Settings has its groups (voice, phone, general, about) and opens
// from the gear in the corner of the mascot page, from the tray menu and from #settings. On the computer everything
// can be changed; from the phone the drawer only shows the language (this browser) and says where to change the
// rest. The ElevenLabs key is typed here, saved on the computer only, and never comes back (only "a key is saved");
// with a key saved, the voices of that account are listed, and picking one makes Cody say hi with it right away.
// The first run is three steps, said out loud, with Skip and Next at the bottom.
//
//   createSettings({ api, t, setLanguage, language, announce, play, win }) → { open(), close(), firstRun() }
//     play   (mp3 bytes) plays a sound through the mascot's voice (the test of a voice)
//   firstRunSteps(info, t), providers(t), sections(info), mp3Bytes(base64) are pure, for the tests.

import { createSheet, el } from './sheet.js';

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

// the test of a voice comes from the server as base64 text
export function mp3Bytes(base64) {
  return Uint8Array.from(atob(String(base64 || '')), (ch) => ch.charCodeAt(0)).buffer;
}

// three steps at most, the last one ends in "say hi"
export function firstRunSteps(info, t) {
  return [
    { id: 'hello', say: t('first.hello'), choices: ['language', 'voice'] },
    { id: 'phone', say: info.phone_url ? t('first.phone.qr') : t('first.phone.network'), choices: ['phone'] },
    { id: 'voice', say: t('first.voice'), choices: ['open-voice'], last: t('first.sayHi') },
  ];
}

async function qrImage(api, which) {
  try {
    const buffer = await api.qr(which);
    return el('img', { className: 'settings-qr', alt: '', src: URL.createObjectURL(new Blob([buffer], { type: 'image/svg+xml' })) });
  } catch { return null; }
}

export function createSettings({ api, t, setLanguage, language, announce = () => {}, play = () => {}, win = window }) {
  // renders: each render's turn (a slower, older one must not paint over a newer one) · draftKey: a key typed and
  // not saved yet, so redrawing the drawer does not throw it away · run: the first run's drawer, made when needed
  const st = { info: null, renders: 0, draftKey: '', run: null };
  const sheet = createSheet({
    win,
    onClose: () => {
      st.draftKey = '';
      sheet.body.replaceChildren();                    // nothing typed stays behind in a hidden field
      if (win.location.hash === '#settings') history.replaceState(null, '', ' ');
    },
  });
  const { body, note } = sheet;                        // note: what the last change did ("Saved.")
  const opener = el('button', { type: 'button', className: 'settings-open' });   // the gear on the mascot page
  document.body.append(opener);

  function label() {
    sheet.setTitle(t('settings.title'), t('status.close'));
    opener.setAttribute('aria-label', t('settings.title'));
    opener.dataset.tip = t('settings.title');
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

  // after: what to draw again once the language changed (every text on screen is in the old one)
  function languageField(says, after) {
    const select = el('select', { className: 'settings-language' });
    for (const [v, name] of [['en', 'English'], ['pt-BR', 'Português (Brasil)']]) select.append(el('option', { value: v, textContent: name, selected: v === language() }));
    select.addEventListener('change', async () => {
      setLanguage(select.value);
      if (st.info?.local) await change({ language: select.value }, says);
      await after();
    });
    return field(t('settings.language'), select);
  }

  // the four ways to sound, one to pick; what is not offered yet shows, greyed, with "coming soon"
  // radios: the radio group's own name (the first run and Settings can be in the page together)
  function voiceChoice(info, says, onPick = () => {}, radios = 'provider') {
    const box = el('fieldset', { className: 'settings-voice' }, el('legend', { textContent: t('settings.voice') }));
    for (const p of providers(t)) {
      const chosen = info.voice_provider === p.id;
      const radio = el('input', { type: 'radio', name: radios, value: p.id, checked: chosen, disabled: p.soon && !chosen });
      radio.addEventListener('change', async () => { await change({ voice_provider: p.id }, says); onPick(); });
      const words = el('span', { textContent: p.label }, p.soon ? el('em', { className: 'settings-soon', textContent: t('settings.soon') }) : null);
      box.append(el('label', { className: 'settings-radio' }, radio, words, el('small', { textContent: p.note })));
    }
    return box;
  }

  // your own ElevenLabs key, then the voice: shown while ElevenLabs is the chosen voice. With a key saved, the
  // voices of that account are listed and picking one is heard at once; if they cannot be listed (a key made for
  // speech only), the voice id is typed by hand
  function elevenLabsBox(info, says) {
    let chosen = info.voice_id || '';
    const key = el('input', { type: 'password', autocomplete: 'off', value: st.draftKey, placeholder: t(info.has_key ? 'settings.key.saved' : 'settings.key.none') });
    key.addEventListener('input', () => { st.draftKey = key.value; });
    const saveKey = el('button', { type: 'button', textContent: t('settings.key.save') });
    const voiceRow = el('div');
    const test = el('button', { type: 'button', className: 'primary', textContent: t('settings.key.test') });

    // Cody says one short sentence in the chosen voice (the saved one when none is being tried)
    const hear = async () => {
      says.textContent = '…';
      try {
        const r = await api.testVoice(chosen);
        if (r.ok && r.audio) play(mp3Bytes(r.audio));
        says.textContent = r.ok ? t('settings.key.ok') : `ElevenLabs: ${r.reason}`;
      } catch (e) { says.textContent = String(e?.message || e); }
    };
    const choose = async (id) => {
      chosen = id;
      await change({ voice_id: id }, says);
    };
    const byHand = (reason) => {
      const voiceId = el('input', { value: chosen, placeholder: t('settings.voiceId') });
      voiceId.addEventListener('change', () => choose(voiceId.value.trim()));
      voiceRow.replaceChildren(field(t('settings.voiceId'), voiceId, t('settings.voicePick.byHand', { reason })));
    };
    const listVoices = async () => {
      if (!st.info?.has_key) {
        voiceRow.replaceChildren(field(t('settings.voicePick'), null, t('settings.voicePick.needKey')));
        return;
      }
      voiceRow.replaceChildren(field(t('settings.voicePick'), null, t('settings.voicePick.loading')));
      let listed;
      try { listed = await api.voices(); } catch (e) { listed = { ok: false, reason: String(e?.message || e) }; }
      if (!listed.ok || !listed.voices?.length) { byHand(listed.reason || t('mascot.voice.unavailable')); return; }
      const select = el('select');
      if (!listed.voices.some((v) => v.id === chosen)) {       // none yet, or one that is not in the account's list
        select.append(el('option', { value: chosen, selected: true, textContent: t(chosen ? 'settings.voicePick.current' : 'settings.voicePick.choose') }));
      }
      for (const v of listed.voices) select.append(el('option', { value: v.id, selected: v.id === chosen, textContent: v.about ? `${v.name} · ${v.about}` : v.name }));
      select.addEventListener('change', async () => {
        if (!select.value) return;
        await choose(select.value);
        hear();
      });
      voiceRow.replaceChildren(field(t('settings.voicePick'), select, t('settings.voicePick.hint')));
    };

    saveKey.addEventListener('click', async () => {
      try {
        st.info.has_key = (await api.saveKey(key.value)).has_key;
        key.value = st.draftKey = '';
        key.placeholder = t('settings.key.saved');
        says.textContent = t('settings.saved');
        listVoices();                                  // the key is in: its voices can be listed now
      } catch (e) { says.textContent = String(e?.message || e); }
    });
    test.addEventListener('click', hear);
    listVoices();
    return el('div', { className: 'settings-card' },
      el('div', { className: 'settings-field' }, el('span', { textContent: t('settings.key') }),
        el('div', { className: 'settings-inline' }, key, saveKey), el('small', { textContent: t('settings.key.hint') })),
      voiceRow, test);
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
    if (info.music !== null && info.music !== undefined) check(t('settings.music'), info.music, (on) => ({ music: on }), t('settings.music.hint'));
    if (info.notifications !== null && info.notifications !== undefined) check(t('settings.notices'), info.notifications, (on) => ({ notifications: on }), t('settings.notices.hint'));
    return out;
  }

  async function phoneBox(info) {
    const box = el('div', { className: 'settings-phone' });
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

  // the language changed in Settings: the whole drawer is drawn again, and the keyboard stays on the language
  async function redraw() {
    await render();
    if (sheet.isOpen) body.querySelector('.settings-language')?.focus({ preventScroll: true });
  }

  const GROUPS = {
    // picking a voice only swaps what is under the choice: the radios stay, so the keyboard keeps its place
    voice: (info) => {
      const under = el('div');
      const fill = () => under.replaceChildren(...(st.info?.voice_provider === 'elevenlabs' ? [elevenLabsBox(st.info, note)] : []));
      fill();
      return group(t('settings.voice'), voiceChoice(info, note, fill), under);
    },
    phone: async (info) => group(t('settings.phone'), await phoneBox(info)),
    general: (info) => group(t('settings.group.general'), el('div', { className: 'settings-card' }, languageField(note, redraw),
      ...(info?.local ? switches(info, note) : [])),
    info?.local ? null : el('p', { className: 'settings-privacy', textContent: t('settings.onComputer') })),
    about: () => {
      const again = el('button', { type: 'button', className: 'ghost', textContent: t('settings.firstRun') });
      again.addEventListener('click', () => { sheet.close(); firstRun(true); });
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
    if (turn !== st.renders || !sheet.isOpen) return;  // a newer render started meanwhile, or the drawer closed
    body.replaceChildren(...groups);
  }

  async function open() {
    sheet.open();
    st.info = null;
    note.textContent = '';
    await render();
  }

  // the first run: one step at a time in its own drawer, Cody saying each one. Skip, the X and Esc all end it; a
  // click outside does not (a stray click should not skip the welcome)
  async function firstRun(force = false) {
    const info = st.info || await load().catch(() => null);
    if (!info?.local || (info.first_run_done && !force)) return;
    st.run ??= createSheet({
      win, className: 'first-run', outside: false,
      onClose: () => {
        if (st.info) st.info.first_run_done = true;    // this page knows it too, without asking again
        api.saveSettings({ first_run_done: true }).catch(() => {});
      },
    });
    const run = st.run;
    const show = async (i) => {
      const steps = firstRunSteps(st.info, t);         // read again: the language may have just changed
      const step = steps[i];
      const last = i === steps.length - 1;
      run.setTitle(t('first.title'), t('first.skip'));
      run.note.textContent = '';
      announce({ text: step.say });
      const next = el('button', { type: 'button', className: 'primary', textContent: t(last ? 'first.done' : 'first.next') });
      next.addEventListener('click', () => (last ? run.close() : show(i + 1)));
      const skip = el('button', { type: 'button', className: 'ghost', textContent: t('first.skip') });
      skip.addEventListener('click', () => run.close());
      const extra = [];
      if (step.id === 'hello') {
        // with ElevenLabs picked, the key and the voice are asked right here; the radios have their own group name,
        // apart from the ones in Settings
        const under = el('div');
        const fill = () => under.replaceChildren(...(st.info.voice_provider === 'elevenlabs' ? [elevenLabsBox(st.info, run.note)] : []));
        fill();
        const again = async () => {                    // the step again, in the new language; the keyboard stays put
          await show(i);
          run.body.querySelector('.settings-language')?.focus({ preventScroll: true });
        };
        extra.push(languageField(run.note, again), voiceChoice(st.info, run.note, fill, 'first-provider'), under);
      }
      if (step.id === 'phone') extra.push(await phoneBox(st.info));
      if (step.id === 'voice') {
        const go = el('button', { type: 'button', className: 'primary', textContent: t('status.do.voice') });
        go.addEventListener('click', async () => { await api.action('voice').catch(() => {}); announce({ text: step.last }); });
        extra.push(go);
      }
      run.body.replaceChildren(el('p', { className: 'first-step', textContent: `${i + 1}/${steps.length}` }),
        el('p', { className: 'first-say', textContent: step.say }), ...extra);
      run.foot.replaceChildren(skip, next);
    };
    run.open();
    show(0);
  }

  label();
  opener.addEventListener('click', () => { win.location.hash = 'settings'; });
  const route = () => (win.location.hash === '#settings' ? open() : sheet.close());
  win.addEventListener('hashchange', route);
  route();
  return { open, close: () => sheet.close(), firstRun };
}

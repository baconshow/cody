// panel.js — what makes the Settings and the Status drawers read as one panel: the same list of sections in both
// (beside the content on a phone lying down, above it in the drawer on a computer), Status being its last entry.
// A pick goes to the section's #hash, which the two drawers already follow, so one leaves as the other comes.
// Pure logic and one small element builder, run in Node by the tests.
//
//   sections(info) → the Settings sections, in order: on the computer all of them; from the phone only what that
//                    browser may change
//   hashOf(id) → '#settings/voice', '#status' · routeOf(hash) → { panel: 'settings' | 'status' | null, section }
//   navList({ ids, active, t, light, win }) → <nav> of buttons; light: the Status light ('ok' | 'warn' | 'fail')
//   markActive(nav, id): the section that shows now (the buttons stay, so the keyboard keeps its place)
//   markLight(nav, light): the Status entry's light, when the checks change while the list is on screen

export const STATUS = 'status';
const LABEL = Object.freeze({
  voice: 'settings.voice', phone: 'settings.phone', general: 'settings.group.general', skins: 'settings.tab.skins',
  about: 'settings.group.about', [STATUS]: 'status.title',
});

export function sections(info) {
  return info?.local ? ['voice', 'phone', 'general', 'skins', 'about'] : ['general', 'skins'];
}

export const hashOf = (id) => (id === STATUS ? '#status' : `#settings/${id}`);

export function routeOf(hash) {
  const [name, section] = String(hash || '').replace(/^#/, '').split('/');
  if (name === STATUS) return { panel: STATUS, section: STATUS };
  if (name === 'settings') return { panel: 'settings', section: section && LABEL[section] && section !== STATUS ? section : null };
  return { panel: null, section: null };
}

export function navList({ ids, active, t, light = null, win = window }) {
  const nav = document.createElement('nav');
  nav.className = 'panel-nav';
  nav.setAttribute('aria-label', t('settings.sections'));
  for (const id of [...ids, STATUS]) {
    const tab = Object.assign(document.createElement('button'), { type: 'button', className: 'panel-tab', textContent: t(LABEL[id]) });
    tab.dataset.section = id;
    if (id === STATUS) {
      tab.classList.add('panel-tab-status');
      if (light) tab.dataset.state = light;
    }
    tab.addEventListener('click', () => { win.location.hash = hashOf(id).slice(1); });
    nav.append(tab);
  }
  markActive(nav, active);
  return nav;
}

export function markActive(nav, id) {
  for (const tab of nav.children) {
    if (tab.dataset.section === id) tab.setAttribute('aria-current', 'page');
    else tab.removeAttribute('aria-current');
  }
}

export function markLight(nav, light) {
  for (const tab of nav.children) if (tab.dataset.section === STATUS && light) tab.dataset.state = light;
}

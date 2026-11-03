// timer-panel.js — the timers in the top-left corner (timers.js gives the rows): a big countdown for a timer, the
// time of day for a reminder that is more than an hour away, and the label under it. A ringing timer glows; a tap
// on it stops it.
//
//   createTimerPanel({ t, locale, onDismiss }) → { render(rows) }

import { formatLeft } from './timers.js';

export function createTimerPanel({ t, locale, onDismiss }) {
  const panel = Object.assign(document.createElement('div'), { className: 'timers' });
  panel.setAttribute('aria-label', t('mascot.timer.panel'));
  document.body.append(panel);
  panel.addEventListener('click', (e) => { if (e.target.closest('.timer.ringing')) onDismiss(); });
  const shown = new Map();                               // id → { row, time, label, key }
  let clock = null;

  function time(r) {
    if (!r.clock) return formatLeft(r.left);
    clock ??= new Intl.DateTimeFormat(locale(), { hour: '2-digit', minute: '2-digit' });
    return clock.format(new Date(r.at));
  }

  function make(r) {
    const row = Object.assign(document.createElement('div'), { className: 'timer' });
    const timeText = Object.assign(document.createElement('span'), { className: 'timer-time' });
    const label = Object.assign(document.createElement('span'), { className: 'timer-label' });
    row.append(timeText, label);
    return { row, time: timeText, label, key: '' };
  }

  // only what changed is touched: a tick a quarter of a second must not rebuild the panel
  function render(rows) {
    const ids = new Set(rows.map((r) => r.id));
    for (const [id, e] of shown) if (!ids.has(id)) { e.row.remove(); shown.delete(id); }
    rows.forEach((r, i) => {
      const e = shown.get(r.id) ?? make(r);
      shown.set(r.id, e);
      const key = `${r.ringing}|${r.kind}|${r.clock}`;
      if (e.key !== key) {
        e.key = key;
        e.row.className = `timer${r.ringing ? ' ringing' : ''}${r.kind === 'reminder' ? ' reminder' : ''}`;
        e.row.setAttribute('role', r.ringing ? 'button' : 'timer');
        e.row.tabIndex = r.ringing ? 0 : -1;
        e.row.title = r.ringing ? t('mascot.timer.dismiss') : '';
      }
      const text = r.ringing ? t('mascot.timer.ringing') : time(r);
      if (e.time.textContent !== text) e.time.textContent = text;
      if (e.label.textContent !== r.label) e.label.textContent = r.label;
      if (panel.children[i] !== e.row) panel.insertBefore(e.row, panel.children[i] ?? null);
    });
    panel.classList.toggle('visible', rows.length > 0);
  }

  panel.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.closest('.timer.ringing')) { e.preventDefault(); onDismiss(); }
  });
  return { render };
}

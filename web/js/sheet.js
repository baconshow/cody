// sheet.js — the drawer every screen over the mascot uses: Settings, Status, the private network and the first run.
// The page dims and the drawer comes in on the right (the full width on a phone), so the mascot stays in view. It is
// a dialog: a title with the close button at the top, the content (scrolling), an optional row of buttons and, at
// the bottom, a line for what the last action did. Esc and the X close it, and so does a click outside (unless the
// owner says no: the first run should not vanish on a stray click); Tab stays inside; closing puts the keyboard
// focus back where it was. Of the drawers open at one time, only the one on top answers the keyboard.
//
//   createSheet({ className, outside, onClose, win }) → sheet
//     className   an extra class on the backdrop
//     outside     false: a click outside the drawer does not close it
//     onClose     () after it closed, however it closed (the owner tidies up: the #hash, a draft)
//   sheet.body · sheet.foot · sheet.note   the elements to fill (content, buttons, what the last action did)
//   sheet.open() · sheet.close() · sheet.isOpen · sheet.setTitle(text, closeLabel)
//   el(tag, props, ...kids) builds an element · wrapFocus(count, index, back) is pure, for the tests

export const el = (tag, props = {}, ...kids) => {
  const e = Object.assign(document.createElement(tag), props);
  e.append(...kids.filter(Boolean));
  return e;
};

// Tab at the end of the drawer goes back to its first control, and Shift+Tab at the start to its last. count: how
// many controls; index: the focused one (-1 when the focus is not on any). Returns the one to focus, or null to
// let the browser move on by itself
export function wrapFocus(count, index, back) {
  if (count < 1) return null;
  if (back) return index <= 0 ? count - 1 : null;
  return index < 0 || index === count - 1 ? 0 : null;
}

const stack = [];                         // the drawers open now; the last one is on top

export function createSheet({ className = '', outside = true, onClose = () => {}, win = window } = {}) {
  const heading = el('h2');
  const x = el('button', { type: 'button', className: 'sheet-close' });
  const body = el('div', { className: 'sheet-body' });
  const foot = el('div', { className: 'sheet-foot' });
  const note = el('p', { className: 'sheet-note' });
  note.setAttribute('role', 'status');
  const box = el('div', { className: 'sheet' }, el('header', { className: 'sheet-head' }, heading, x), body, foot, note);
  box.tabIndex = -1;
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-modal', 'true');
  const panel = el('section', { className: `sheet-backdrop ${className}`.trim(), hidden: true }, box);
  document.body.append(panel);
  const st = { before: null, pressed: null };

  const sheet = {
    body, foot, note, panel,
    get isOpen() { return !panel.hidden; },
    setTitle(text, closeLabel) {
      heading.textContent = text;
      box.setAttribute('aria-label', text);
      if (closeLabel) x.setAttribute('aria-label', closeLabel);
    },
    open() {
      if (!panel.hidden) return;
      st.before = document.activeElement;
      panel.hidden = false;
      stack.push(sheet);
      box.focus({ preventScroll: true });              // keyboard and screen readers start inside the drawer
    },
    close() {
      if (panel.hidden) return;
      const inside = box.contains(document.activeElement);
      panel.hidden = true;
      stack.splice(stack.indexOf(sheet), 1);
      if (inside) st.before?.focus?.({ preventScroll: true });   // back to where the drawer came from
      onClose();
    },
  };

  x.addEventListener('click', () => sheet.close());
  // a click outside closes it; a drag that started inside (selecting an address) and ended outside does not
  panel.addEventListener('pointerdown', (e) => { st.pressed = e.target; });
  panel.addEventListener('click', (e) => { if (outside && e.target === panel && st.pressed === panel) sheet.close(); });
  win.addEventListener('keydown', (e) => {
    if (panel.hidden || e.sheet || stack.at(-1) !== sheet) return;
    e.sheet = true;                                    // the drawer under this one leaves the key alone
    if (e.key === 'Escape') { sheet.close(); return; }
    if (e.key !== 'Tab') return;
    const stops = [...box.querySelectorAll('button, input, select')].filter((n) => !n.disabled && n.offsetParent !== null);
    const next = wrapFocus(stops.length, stops.indexOf(document.activeElement), e.shiftKey);
    if (next === null) return;
    e.preventDefault();
    stops[next].focus();
  });
  return sheet;
}

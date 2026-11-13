// overlays.js — the pills over the mascot (Settings, the Status light with its words, the wake word) step back
// after a while without a touch, so they do not compete with Cody, and come back with a tap, a move of the mouse
// or a key. Stepping back is only a class on the page (style.css decides what each pill does with it: Settings
// fades away, the Status pill too unless something needs a look, the wake word keeps its light on so the
// microphone at work is always seen).
//
//   createOverlays({ win, doc, rest }) → { show() }   rest: ms without a touch before they step back

export const OVERLAYS = Object.freeze({ rest: 4000, class: 'overlays-rest' });

export function createOverlays({ win = window, doc = document, rest = OVERLAYS.rest } = {}) {
  let timer = 0;
  const show = () => {
    doc.body.classList.remove(OVERLAYS.class);
    clearTimeout(timer);
    timer = setTimeout(() => doc.body.classList.add(OVERLAYS.class), rest);
  };
  for (const type of ['pointerdown', 'pointermove', 'keydown', 'focusin']) win.addEventListener(type, show, { passive: true });
  show();
  return { show };
}

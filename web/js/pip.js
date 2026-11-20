// pip.js — Cody in a little window of its own, floating over the other apps, without the browser's bar (Chrome and
// Edge on a computer: the Document Picture-in-Picture API; elsewhere there is no button). The little window does not
// borrow this page's elements: it loads the whole face again in an iframe (?pip=1), a page of its own that is always
// on screen. So its drawing, its microphone and its timers never slow down when this tab is hidden or covered (the
// browser slows a hidden tab to a crawl, and the face stops listening while its page is hidden: main.js). While the
// little window is open this page steps aside (presence.js): it stops listening, reading and drawing, so Cody never
// answers twice. Closed (its own x, or "back to tab"), this page takes over again.
//
//   pipSupported(win) → true where the browser has the API
//   isPip(search) → true in the page inside the little window
//   pipUrl(href) → this page's address with ?pip=1 (keeps ?lang and the rest, drops the #hash)
//   speakerFor(win) → the window the sound should play from: inside the little window, the big page (the browser
//                     only plays sound for a page that was tapped, and nobody has tapped the little one yet; the big
//                     page was, to open it), elsewhere win itself
//   createPip({ win, onChange, size, title }) → { open(), close(), active }
//     open      only from a tap or a key (the browser asks for a gesture); while open it brings the window up
//     onChange  (open) when the little window opens or closes

export const PIP = Object.freeze({ width: 300, height: 380, param: 'pip', title: 'Cody', speaker: 'codySpeaker' });

export const pipSupported = (win) => typeof win?.documentPictureInPicture?.requestWindow === 'function';

export const isPip = (search) => new URLSearchParams(search).get(PIP.param) === '1';

export function speakerFor(win) {
  try {
    const host = win.parent && win.parent !== win ? win.parent[PIP.speaker] : null;
    return host?.AudioContext || host?.speechSynthesis ? host : win;
  } catch {
    return win;                                            // another site's frame: never reached for
  }
}

export function pipUrl(href) {
  const url = new URL(href);
  url.searchParams.set(PIP.param, '1');
  url.hash = '';
  return url.href;
}

// the little window's own page: black, with the face filling it. It inherits this page's CSP, so no <style> and no
// style attribute: the stylesheet, plus the background through the CSSOM so it never flashes white while that loads
function fill(little, win, title) {
  const doc = little.document;
  doc.title = title;
  doc.documentElement.classList.add('pip-host');
  doc.documentElement.style.background = '#000';
  const sheet = doc.createElement('link');
  sheet.rel = 'stylesheet';
  sheet.href = new URL('/web/style.css', win.location.href).href;
  const frame = doc.createElement('iframe');
  frame.className = 'pip-frame';
  frame.title = title;
  frame.allow = 'microphone; autoplay; screen-wake-lock';
  frame.src = pipUrl(win.location.href);
  doc.head.append(sheet);
  doc.body.append(frame);
  little[PIP.speaker] = win;                               // the face inside plays its sound from here (speakerFor)
}

export function createPip({ win, onChange = () => {}, size = PIP, title = PIP.title }) {
  const st = { little: null, opening: null };
  const closed = () => {
    st.little = null;
    onChange(false);
  };

  async function request() {
    const little = await win.documentPictureInPicture.requestWindow({ width: size.width, height: size.height });
    fill(little, win, title);
    little.addEventListener('pagehide', closed, { once: true });
    st.little = little;
    onChange(true);
    return little;
  }

  async function open() {
    if (st.little) {
      st.little.focus?.();
      return st.little;
    }
    if (!st.opening) st.opening = request().finally(() => { st.opening = null; });   // two quick taps: one window
    return st.opening;
  }

  return {
    open,
    close: () => st.little?.close(),
    get active() { return st.little !== null; },
  };
}

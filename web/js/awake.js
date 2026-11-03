// awake.js — the phone as a desk display: the screen does not turn off while the face is visible (Wake Lock), and
// the first tap puts the page in fullscreen, landscape. Wake Lock only exists on a secure page (HTTPS, or
// localhost); without it, or if the browser refuses (low battery, hidden tab), the page carries on and the screen
// turns off as usual. On a computer it does nothing: there the screen timeout belongs to the system.
//
//   keepAwake(win = window) → { release() }   only on a touch screen or when opened from the home screen (display-mode)

const ON_PHONE = '(pointer: coarse), (display-mode: standalone), (display-mode: fullscreen)';

export function keepAwake(win = window) {
  if (!win.matchMedia?.(ON_PHONE).matches) return { release() {} };
  const doc = win.document;
  let lock = null;
  const request = async () => {
    if (!win.navigator.wakeLock || doc.visibilityState !== 'visible' || lock) return;
    try {
      lock = await win.navigator.wakeLock.request('screen');
      lock.addEventListener('release', () => { lock = null; });
    } catch (error) {
      lock = null;
      console.info('[cody] the screen may turn off: the browser refused the Wake Lock', error?.name);
    }
  };
  // the browser drops the lock when the tab is hidden; when it comes back, ask again
  const onVisible = () => { if (doc.visibilityState === 'visible') request(); };
  const fullscreen = () => {
    if (!doc.fullscreenElement && doc.documentElement.requestFullscreen) {
      doc.documentElement.requestFullscreen()
        .then(() => win.screen?.orientation?.lock?.('landscape'))
        .catch(() => {});                                // no fullscreen (iPhone outside the home screen): carry on
    }
    request();
  };
  doc.addEventListener('visibilitychange', onVisible);
  win.addEventListener('pointerup', fullscreen, { once: true });
  request();
  return {
    release() {
      doc.removeEventListener('visibilitychange', onVisible);
      lock?.release();
      lock = null;
    },
  };
}

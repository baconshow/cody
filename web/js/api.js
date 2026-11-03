// api.js — access to the local server's API (the same origin that served the page). Every request carries the
// token the server writes into the page (meta cody-token); opened without it, hasToken() is false and the
// mascot fetches nothing. The client's own failure messages come from the catalogue (api.*); an error the server
// sends back ({ "error": "message" }) is shown as it came.

import { t } from './i18n.js';

const TOKEN = (() => {
  const v = document.querySelector('meta[name="cody-token"]')?.getAttribute('content') || '';
  return v.includes('{{') ? '' : v;
})();

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

async function readBody(resp) {
  try { return await resp.json(); } catch { return null; }
}

async function call(method, path, body, { timeout = 9000 } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  let resp;
  try {
    // the server requires the token on every /api/* route, reads included
    const headers = { Accept: 'application/json', 'X-Cody-Token': TOKEN };
    if (method !== 'GET') headers['Content-Type'] = 'application/json';
    resp = await fetch(path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: 'no-store',
      credentials: 'same-origin',
      signal: ctrl.signal,
    });
  } catch (e) {
    throw new ApiError(0, t(e?.name === 'AbortError' ? 'api.timeout' : 'api.offline'));
  } finally {
    clearTimeout(timer);
  }
  const data = await readBody(resp);
  if (!resp.ok) throw new ApiError(resp.status, (data && typeof data.error === 'string' && data.error) || t('api.error', { status: resp.status }));
  return data;
}

// raw bytes (the reply audio): fetch with the token (an <audio> tag cannot send headers) and an ArrayBuffer
async function bytes(path) {
  let resp;
  try {
    resp = await fetch(path, { headers: { 'X-Cody-Token': TOKEN }, cache: 'no-store', credentials: 'same-origin' });
  } catch {
    throw new ApiError(0, t('api.offline'));
  }
  if (!resp.ok) throw new ApiError(resp.status, t('api.error', { status: resp.status }));
  return resp.arrayBuffer();
}

export const api = {
  state: () => call('GET', '/api/state'),
  activity: (cursor) => call('GET', `/api/activity?cursor=${encodeURIComponent(cursor)}`),
  cursor: () => call('GET', '/api/cursor', undefined, { timeout: 3000 }),
  voice: (text) => call('POST', '/api/voice', { text }, { timeout: 6000 }),
  voiceReplies: (after) => call('GET', `/api/voice/replies?after=${encodeURIComponent(after)}`),
  voiceAudio: (seq) => bytes(`/api/voice/audio?seq=${encodeURIComponent(seq)}`),
  voiceImage: (id) => bytes(`/api/voice/image?id=${encodeURIComponent(id)}`),
  voiceAlert: (key) => bytes(`/api/voice/alert?key=${encodeURIComponent(key)}`),
  timers: () => call('GET', '/api/timers'),
  events: (after) => call('GET', `/api/events?after=${encodeURIComponent(after)}`),
  hasToken: () => TOKEN.length > 0,
};

/**
 * Schedule API (Cloudflare Worker)
 *
 * Routes:
 *  - GET  /api/schedule        -> returns JSON array (or [])
 *  - PUT  /api/schedule        -> saves JSON array (Basic Auth)
 *
 * Bindings required:
 *  - KV namespace binding: SCHEDULE_KV (point to your `schedule_kv` namespace)
 *  - Secrets: ADMIN_USERNAME, ADMIN_PASSWORD
 */

const SCHEDULE_KEY = 'schedule_v1';

function jsonResponse(data, init = {}) {
  const headers = new Headers(init.headers || {});
  headers.set('content-type', 'application/json; charset=utf-8');
  headers.set('cache-control', 'no-store');
  return new Response(JSON.stringify(data), { ...init, headers });
}

function unauthorizedResponse() {
  return new Response('Unauthorized', {
    status: 401,
    headers: {
      'www-authenticate': 'Basic realm="Schedule Admin"',
      'cache-control': 'no-store',
    },
  });
}

function methodNotAllowed() {
  return new Response('Method Not Allowed', { status: 405, headers: { 'cache-control': 'no-store' } });
}

function safeEqual(a, b) {
  // Constant-time-ish compare to reduce timing leaks.
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i += 1) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

function parseBasicAuth(request) {
  const header = request.headers.get('authorization') || '';
  const m = header.match(/^Basic\s+(.+)$/i);
  if (!m) return null;
  try {
    const decoded = atob(m[1]);
    const idx = decoded.indexOf(':');
    if (idx < 0) return null;
    return { username: decoded.slice(0, idx), password: decoded.slice(idx + 1) };
  } catch {
    return null;
  }
}

function isValidScheduleArray(value) {
  if (!Array.isArray(value)) return false;
  if (value.length < 1 || value.length > 14) return false; // allow a bit of flexibility

  for (const item of value) {
    if (!item || typeof item !== 'object') return false;

    // Required-ish fields used by index/admin
    if (typeof item.dateKey !== 'string' || !/^\d{1,2}-\d{1,2}$/.test(item.dateKey)) return false;
    if (typeof item.dayName !== 'string') return false;
    if (typeof item.dateText !== 'string') return false;

    if (typeof item.status !== 'string') return false;
    const status = item.status.toLowerCase();
    if (!['none', 'scheduled', 'completed', 'cancelled'].includes(status)) return false;

    // Optional fields
    if (item.zuluTime !== null && item.zuluTime !== undefined && typeof item.zuluTime !== 'string') return false;
    if (item.timeText !== null && item.timeText !== undefined && typeof item.timeText !== 'string') return false;
    if (item.streamTitle !== null && item.streamTitle !== undefined && typeof item.streamTitle !== 'string') return false;
    if (item.vodUrl !== null && item.vodUrl !== undefined && typeof item.vodUrl !== 'string') return false;
    if (item.gameLogo !== null && item.gameLogo !== undefined && typeof item.gameLogo !== 'string') return false;
  }

  return true;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Only handle the schedule endpoint (route usually limits this already)
    if (!url.pathname.startsWith('/api/schedule')) {
      return new Response('Not Found', { status: 404, headers: { 'cache-control': 'no-store' } });
    }

    if (!env.SCHEDULE_KV) {
      return jsonResponse({ error: 'Missing KV binding SCHEDULE_KV.' }, { status: 500 });
    }

    if (request.method === 'GET') {
      const raw = await env.SCHEDULE_KV.get(SCHEDULE_KEY);
      if (!raw) return jsonResponse([]);

      try {
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return jsonResponse([]);
        return jsonResponse(parsed);
      } catch {
        return jsonResponse([]);
      }
    }

    if (request.method === 'PUT') {
      const creds = parseBasicAuth(request);
      const userOk = creds && safeEqual(creds.username, env.ADMIN_USERNAME || '');
      const passOk = creds && safeEqual(creds.password, env.ADMIN_PASSWORD || '');
      if (!userOk || !passOk) return unauthorizedResponse();

      let body;
      try {
        body = await request.json();
      } catch {
        return jsonResponse({ error: 'Invalid JSON body.' }, { status: 400 });
      }

      if (!isValidScheduleArray(body)) {
        return jsonResponse({ error: 'Schedule must be a valid array of schedule items.' }, { status: 400 });
      }

      await env.SCHEDULE_KV.put(SCHEDULE_KEY, JSON.stringify(body));
      return jsonResponse({ ok: true });
    }

    return methodNotAllowed();
  },
};

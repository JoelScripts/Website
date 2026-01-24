// Cloudflare Worker: Suggestions proxy
// - Receives sanitized flight suggestion JSON from the website
// - Optionally verifies Turnstile
// - Optionally rate-limits using a KV binding
// - Forwards the message to Discord using a secret webhook URL (never exposed to the browser)
//
// Required secrets/bindings:
// - DISCORD_WEBHOOK_URL (secret)
// Optional:
// - TURNSTILE_SECRET_KEY (secret)
// - ALLOWED_ORIGINS (comma-separated string) for CORS when not using same-origin routing
// - SUGGESTIONS_KV (KV namespace binding) for simple IP rate limiting

const DEFAULT_ALLOWED_ORIGINS = [
  'https://flyingwithjoel.co.uk',
  'https://www.flyingwithjoel.co.uk',
];

function jsonResponse(body, init = {}) {
  return new Response(JSON.stringify(body), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      ...init.headers,
    },
    status: init.status ?? 200,
  });
}

function getAllowedOrigins(env) {
  const raw = (env.ALLOWED_ORIGINS || '').trim();
  if (!raw) return DEFAULT_ALLOWED_ORIGINS;
  return raw.split(',').map((s) => s.trim()).filter(Boolean);
}

function corsHeaders(request, env) {
  const origin = request.headers.get('Origin');
  if (!origin) return {};

  const allowed = getAllowedOrigins(env);
  if (!allowed.includes(origin)) return {};

  return {
    'access-control-allow-origin': origin,
    'access-control-allow-methods': 'POST, OPTIONS',
    'access-control-allow-headers': 'content-type',
    'access-control-max-age': '86400',
    'vary': 'Origin',
  };
}

function clampString(value, maxLen) {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  return trimmed.length > maxLen ? trimmed.slice(0, maxLen) : trimmed;
}

function validateFlightRadarLink(link) {
  if (!link) return null;
  try {
    const url = new URL(link);
    if (url.protocol !== 'https:') return 'FlightRadar24 link must start with https://';
    if (!url.hostname.toLowerCase().includes('flightradar24.com')) return 'Please use a FlightRadar24 link (flightradar24.com).';
    return null;
  } catch {
    return 'FlightRadar24 link is not a valid URL.';
  }
}

async function verifyTurnstile(token, env, remoteIp) {
  if (!env.TURNSTILE_SECRET_KEY) return { ok: true, skipped: true };
  if (!token) return { ok: false, error: 'Missing Turnstile token.' };

  const form = new FormData();
  form.append('secret', env.TURNSTILE_SECRET_KEY);
  form.append('response', token);
  if (remoteIp) form.append('remoteip', remoteIp);

  const resp = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    body: form,
  });

  if (!resp.ok) return { ok: false, error: 'Turnstile verification failed.' };
  const data = await resp.json();
  if (!data.success) return { ok: false, error: 'Turnstile verification rejected.' };
  return { ok: true };
}

async function enforceRateLimit(env, ip) {
  if (!env.SUGGESTIONS_KV) return { ok: true, skipped: true };
  if (!ip) return { ok: true, skipped: true };

  const key = `rl:${ip}`;
  const existing = await env.SUGGESTIONS_KV.get(key);
  if (existing) {
    return { ok: false, retryAfterSeconds: 120 };
  }

  // 2 minute cooldown per IP
  await env.SUGGESTIONS_KV.put(key, String(Date.now()), { expirationTtl: 120 });
  return { ok: true };
}

function buildDiscordMessage(s) {
  const submittedAt = s.timestamp ? new Date(s.timestamp) : new Date();
  const submittedAtText = Number.isFinite(submittedAt.getTime())
    ? submittedAt.toLocaleString('en-GB', { timeZone: 'UTC' }) + ' UTC'
    : new Date().toISOString();

  return {
    content: `✈️ **New Flight Suggestion from ${s.name}**`,
    embeds: [
      {
        title: '✈️ Flight Suggestion Received',
        description: `${s.flightNumber} - ${s.departure} to ${s.arrival}`,
        color: 0xff8c42,
        fields: [
          { name: '✈️ Flight Number', value: s.flightNumber, inline: true },
          { name: '📡 Callsign', value: s.callsign, inline: true },
          { name: '🛩️ Aircraft', value: s.aircraft, inline: true },
          { name: '🛫 Departure', value: s.departure, inline: true },
          { name: '🛬 Arrival', value: s.arrival, inline: true },
          { name: '📍 Route', value: s.route, inline: false },
          { name: '🔗 FlightRadar24 Link', value: s.flightRadarLink || 'Not provided', inline: false },
          { name: '⏱️ Flight Time', value: s.flightTime, inline: true },
          { name: '📊 Flight Length', value: s.flightLength, inline: true },
          { name: '📅 Date of Flight', value: s.flightDate || 'Not specified', inline: true },
          { name: '👤 Suggested By', value: s.name, inline: true },
          { name: '🎥 Twitch Handle', value: s.twitchHandle || 'Not provided', inline: true },
          { name: '⏰ Submitted', value: submittedAtText, inline: false },
        ],
        footer: { text: 'From: flyingwithjoel.co.uk' },
      },
    ],
  };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(request, env) });
    }

    // If you route the Worker on the same domain (recommended), CORS is unnecessary,
    // but it remains useful during testing.
    const cors = corsHeaders(request, env);

    if (request.method !== 'POST') {
      return jsonResponse({ error: 'Method not allowed' }, { status: 405, headers: cors });
    }

    if (!env.DISCORD_WEBHOOK_URL) {
      return jsonResponse({ error: 'Server not configured.' }, { status: 500, headers: cors });
    }

    // Allow a trailing slash to avoid accidental 404s when routing.
    if (url.pathname !== '/api/suggestions' && url.pathname !== '/api/suggestions/') {
      return jsonResponse({ error: 'Not found' }, { status: 404, headers: cors });
    }

    let payload;
    try {
      payload = await request.json();
    } catch {
      return jsonResponse({ error: 'Invalid JSON.' }, { status: 400, headers: cors });
    }

    const remoteIp = request.headers.get('cf-connecting-ip') || undefined;

    const rate = await enforceRateLimit(env, remoteIp);
    if (!rate.ok) {
      return jsonResponse(
        { error: 'Too many submissions. Please wait before trying again.' },
        {
          status: 429,
          headers: { ...cors, 'retry-after': String(rate.retryAfterSeconds ?? 120) },
        }
      );
    }

    const turnstile = await verifyTurnstile(payload.turnstileToken, env, remoteIp);
    if (!turnstile.ok) {
      return jsonResponse({ error: turnstile.error || 'Verification failed.' }, { status: 400, headers: cors });
    }

    const suggestion = {
      flightDate: clampString(payload.flightDate, 40),
      flightNumber: clampString(payload.flightNumber, 30),
      callsign: clampString(payload.callsign, 30),
      aircraft: clampString(payload.aircraft, 40),
      departure: clampString(payload.departure, 60),
      arrival: clampString(payload.arrival, 60),
      route: clampString(payload.route, 200),
      flightRadarLink: clampString(payload.flightRadarLink, 300),
      flightTime: clampString(payload.flightTime, 20),
      flightLength: clampString(payload.flightLength, 20),
      name: clampString(payload.name, 60),
      twitchHandle: clampString(payload.twitchHandle, 40),
      timestamp: clampString(payload.timestamp, 40) || new Date().toISOString(),
    };

    const required = ['flightNumber', 'callsign', 'aircraft', 'departure', 'arrival', 'route', 'flightTime', 'flightLength', 'name'];
    for (const key of required) {
      if (!suggestion[key]) {
        return jsonResponse({ error: `Missing required field: ${key}` }, { status: 400, headers: cors });
      }
    }

    const frErr = validateFlightRadarLink(suggestion.flightRadarLink);
    if (frErr) {
      return jsonResponse({ error: frErr }, { status: 400, headers: cors });
    }

    const discordMessage = buildDiscordMessage(suggestion);

    const forward = await fetch(env.DISCORD_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(discordMessage),
    });

    if (!forward.ok) {
      return jsonResponse({ error: 'Upstream delivery failed.' }, { status: 502, headers: cors });
    }

    return jsonResponse({ ok: true }, { status: 200, headers: cors });
  },
};

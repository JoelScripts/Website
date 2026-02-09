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
const TWITCH_TOKEN_KEY = 'twitch_token_v1';
const SITE_MODE_KEY = 'site_mode_v1';
const EXPECTED_RETURN_KEY = 'expected_return_v1';
const TWITCH_FOLLOWERS_KEY = 'twitch_followers_v1';
const TWITCH_CLIPS_KEY = 'twitch_clips_v1';
const INCIDENT_NOTICE_KEY = 'incident_notice_v1';
const ADMIN_NOTES_PREFIX = 'admin_notes_v1:';
const FIXED_ADMIN_NOTES = 'Note:\nDad Thinks im in college on\n\nMONDAY\nTUESDAY\nFRIDAY\n.';
const DATA_REQUEST_PREFIX = 'data_request_v1:';
const DATA_REQUEST_RATE_LIMIT_PREFIX = 'data_request_rl_v1:';
const AUTH_FAIL_PREFIX = 'auth_fail_v1:';

const DEFAULT_SITE_MODE = 'live';

const DEFAULT_TWITCH_LOGIN = 'flyingwithjoel';

const ALLOWED_ORIGINS = new Set([
  'https://flyingwithjoel.co.uk',
  'https://www.flyingwithjoel.co.uk',
]);

function corsHeadersFor(request) {
  const origin = request.headers.get('origin');
  if (!origin) {
    return {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET,PUT,POST,OPTIONS',
      'access-control-allow-headers': 'content-type, authorization',
    };
  }

  if (ALLOWED_ORIGINS.has(origin)) {
    return {
      'access-control-allow-origin': origin,
      'vary': 'origin',
      'access-control-allow-methods': 'GET,PUT,POST,OPTIONS',
      'access-control-allow-headers': 'content-type, authorization',
    };
  }

  // Not an allowed browser origin; omit CORS headers.
  return {};
}

function jsonResponse(data, init = {}) {
  const headers = new Headers(init.headers || {});
  headers.set('content-type', 'application/json; charset=utf-8');
  headers.set('cache-control', 'no-store');
  return new Response(JSON.stringify(data), { ...init, headers });
}

function clampLen(value, maxLen) {
  const s = (value || '').toString();
  if (s.length <= maxLen) return s;
  return s.slice(0, maxLen);
}

function safeOneLine(value, maxLen = 500) {
  const s = (value || '').toString().replace(/[\r\n\t]+/g, ' ').trim();
  return clampLen(s, maxLen);
}

function getEnvString(env, key) {
  try {
    const v = env && env[key] != null ? String(env[key]) : '';
    return v.trim();
  } catch {
    return '';
  }
}

function isProbablyDiscordWebhookUrl(url) {
  const s = (url || '').toString().trim();
  if (!s) return false;
  // Keep loose: Discord webhooks are HTTPS and include /api/webhooks/
  return /^https:\/\//i.test(s) && s.includes('/api/webhooks/');
}

async function postDiscordWebhook(env, { event, enabled, updatedAtUtc, title, message, apiUrl }) {
  const webhookUrl = getEnvString(env, 'INCIDENT_ALERT_DISCORD_WEBHOOK_URL');
  if (!isProbablyDiscordWebhookUrl(webhookUrl)) return { ok: false, skipped: true, error: 'Webhook not configured.' };

  const evt = safeOneLine(event || 'updated', 40);
  const t = safeOneLine(title || 'Security incident notice', 200);
  const m = clampLen((message || '').toString().trim(), 1500);
  const when = safeOneLine(updatedAtUtc || '', 80);
  const enabledText = enabled ? 'On' : 'Off';
  const statusUrl = apiUrl || 'https://flyingwithjoel.co.uk/pages/status.html';

  const payload = {
    // Prevent accidental mentions.
    allowed_mentions: { parse: [] },
    embeds: [
      {
        title: `Security incident notice ${evt}`,
        description: `**Status:** ${enabledText}${when ? `\n**Updated:** ${when}` : ''}`,
        fields: [
          { name: 'Title', value: t || '-', inline: false },
          { name: 'Message', value: m || '-', inline: false },
          { name: 'Status page', value: statusUrl, inline: false },
        ],
      },
    ],
  };

  const resp = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!resp.ok) {
    let detail = null;
    try { detail = await resp.text(); } catch { detail = null; }
    return { ok: false, error: `Discord webhook failed (${resp.status}). ${String(detail || '').slice(0, 220)}`.trim() };
  }
  return { ok: true };
}

function buildIncidentAlertEmail({ event, enabled, updatedAtUtc, title, message }) {
  const evt = safeOneLine(event || 'updated', 40);
  const enabledText = enabled ? 'On' : 'Off';
  const when = safeOneLine(updatedAtUtc || '', 80);
  const t = (title || '').toString().trim();
  const m = (message || '').toString().trim();

  const subject = `Security incident notice ${evt} (${enabledText})`;
  const text = (
    `Security incident notice ${evt}\n` +
    `Status: ${enabledText}\n` +
    (when ? `Updated (UTC): ${when}\n` : '') +
    `\nTitle:\n${t || '-'}\n` +
    `\nMessage:\n${m || '-'}\n` +
    `\nLinks:\n` +
    `- Status: https://flyingwithjoel.co.uk/pages/status.html\n` +
    `- Security: https://flyingwithjoel.co.uk/pages/security.html\n`
  );
  return { subject, text };
}

function htmlResponse(html, init = {}) {
  const headers = new Headers(init.headers || {});
  headers.set('content-type', 'text/html; charset=utf-8');
  headers.set('cache-control', 'no-store');
  return new Response(html, { ...init, headers });
}

function isValidEmail(email) {
  const s = (email || '').toString().trim();
  if (!s || s.length > 254) return false;
  // Intentionally simple: we just need a reasonable check.
  if (!s.includes('@') || s.includes(' ')) return false;
  const parts = s.split('@');
  if (parts.length !== 2) return false;
  if (!parts[0] || !parts[1]) return false;
  if (!parts[1].includes('.')) return false;
  return true;
}

function base64UrlEncode(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  // btoa is available in Workers.
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function generateToken(bytes = 24) {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return base64UrlEncode(buf);
}

async function sha256Hex(value) {
  const enc = new TextEncoder();
  const data = enc.encode(String(value || ''));
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function getDsrRateLimitSeconds(env) {
  const raw = (env && env.DSAR_RATE_LIMIT_SECONDS != null) ? String(env.DSAR_RATE_LIMIT_SECONDS).trim() : '';
  const n = raw ? parseInt(raw, 10) : NaN;
  // Default: 2 minutes. Clamp to a sane range.
  if (!Number.isFinite(n)) return 120;
  return Math.max(5, Math.min(600, Math.trunc(n)));
}

function getAuthFailWindowSeconds(env) {
  const raw = (env && env.AUTH_FAIL_WINDOW_SECONDS != null) ? String(env.AUTH_FAIL_WINDOW_SECONDS).trim() : '';
  const n = raw ? parseInt(raw, 10) : NaN;
  // Default: 10 minutes. Clamp to 1–60 minutes.
  if (!Number.isFinite(n)) return 600;
  return Math.max(60, Math.min(3600, Math.trunc(n)));
}

function getAuthFailMaxAttempts(env) {
  const raw = (env && env.AUTH_FAIL_MAX_ATTEMPTS != null) ? String(env.AUTH_FAIL_MAX_ATTEMPTS).trim() : '';
  const n = raw ? parseInt(raw, 10) : NaN;
  // Default: 12 attempts per window. Clamp to 3–100.
  if (!Number.isFinite(n)) return 12;
  return Math.max(3, Math.min(100, Math.trunc(n)));
}

async function getAuthFailState(env, ip) {
  if (!env || !env.SCHEDULE_KV) return { ok: true, skipped: true, blocked: false };
  if (!ip) return { ok: true, skipped: true, blocked: false };

  const windowSeconds = getAuthFailWindowSeconds(env);
  const maxAttempts = getAuthFailMaxAttempts(env);
  const key = `${AUTH_FAIL_PREFIX}${await sha256Hex(ip)}`;

  const raw = await env.SCHEDULE_KV.get(key);
  if (!raw) return { ok: true, blocked: false, attempts: 0, maxAttempts, windowSeconds, key };

  try {
    const parsed = JSON.parse(raw);
    const attempts = parsed && Number.isFinite(parsed.attempts) ? Math.max(0, Math.trunc(parsed.attempts)) : 0;
    return {
      ok: true,
      blocked: attempts >= maxAttempts,
      attempts,
      maxAttempts,
      windowSeconds,
      key,
    };
  } catch {
    return { ok: true, blocked: false, attempts: 0, maxAttempts, windowSeconds, key };
  }
}

async function recordAuthFailure(env, ip) {
  if (!env || !env.SCHEDULE_KV) return { ok: true, skipped: true, blocked: false };
  if (!ip) return { ok: true, skipped: true, blocked: false };

  const state = await getAuthFailState(env, ip);
  if (!state || state.skipped) return { ok: true, skipped: true, blocked: false };

  const nextAttempts = Math.max(0, (state.attempts || 0)) + 1;
  await env.SCHEDULE_KV.put(
    state.key,
    JSON.stringify({ attempts: nextAttempts, updatedAtUtc: new Date().toISOString() }),
    { expirationTtl: state.windowSeconds }
  );

  return {
    ok: true,
    blocked: nextAttempts >= state.maxAttempts,
    attempts: nextAttempts,
    maxAttempts: state.maxAttempts,
    windowSeconds: state.windowSeconds,
  };
}

async function unauthorizedWithCors(request, env) {
  const cors = corsHeadersFor(request);
  const ip = request.headers.get('cf-connecting-ip') || '';

  // If the IP is already blocked, return 429.
  try {
    const state = await getAuthFailState(env, ip);
    if (state && state.blocked) {
      return new Response('Too Many Attempts', {
        status: 429,
        headers: {
          ...cors,
          'cache-control': 'no-store',
          'retry-after': String(state.windowSeconds || 600),
        },
      });
    }
  } catch {
    // ignore
  }

  // Record a failure (best-effort). If this pushes the IP over the limit, return 429.
  try {
    const r = await recordAuthFailure(env, ip);
    if (r && r.blocked) {
      return new Response('Too Many Attempts', {
        status: 429,
        headers: {
          ...cors,
          'cache-control': 'no-store',
          'retry-after': String(r.windowSeconds || 600),
        },
      });
    }
  } catch {
    // ignore
  }

  const resp = unauthorizedResponse();
  const headers = new Headers(resp.headers);
  for (const [k, v] of Object.entries(cors)) headers.set(k, v);
  return new Response(resp.body, { status: resp.status, headers });
}

async function enforceDataRequestRateLimit(env, ip) {
  if (!env.SCHEDULE_KV) return { ok: true, skipped: true };
  if (!ip) return { ok: true, skipped: true };

  const limitSeconds = getDsrRateLimitSeconds(env);
  const ipHash = await sha256Hex(ip);
  const key = `${DATA_REQUEST_RATE_LIMIT_PREFIX}${ipHash}`;
  const existing = await env.SCHEDULE_KV.get(key);
  if (existing) return { ok: false, retryAfterSeconds: limitSeconds };
  await env.SCHEDULE_KV.put(key, String(Date.now()), { expirationTtl: limitSeconds });
  return { ok: true };
}

async function sendEmailViaMailchannels(env, { to, subject, text }) {
  const fromEmail = (env.DSAR_FROM_EMAIL || env.MAIL_FROM || env.EMAIL_FROM || '').toString().trim();
  const fromName = (env.DSAR_FROM_NAME || env.MAIL_FROM_NAME || env.EMAIL_FROM_NAME || 'Flying With Joel').toString().trim();
  const replyTo = (env.DSAR_REPLY_TO || env.MAIL_REPLY_TO || env.EMAIL_REPLY_TO || '').toString().trim();
  const apiKey = (env.DSAR_MAILCHANNELS_API_KEY || env.MAILCHANNELS_API_KEY || '').toString().trim();

  if (!fromEmail) {
    return { ok: false, error: 'Email sending not configured (missing DSAR_FROM_EMAIL / MAIL_FROM / EMAIL_FROM).' };
  }

  // MailChannels Email API now requires an API key (X-Api-Key) + Domain Lockdown DNS record.
  if (!apiKey) {
    return {
      ok: false,
      error: 'Email sending not configured (missing DSAR_MAILCHANNELS_API_KEY / MAILCHANNELS_API_KEY).',
    };
  }

  const payload = {
    personalizations: [{ to: [{ email: to }] }],
    from: { email: fromEmail, name: fromName },
    subject,
    content: [{ type: 'text/plain', value: text }],
  };
  if (replyTo) payload.reply_to = { email: replyTo };

  const resp = await fetch('https://api.mailchannels.net/tx/v1/send', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
    },
    body: JSON.stringify(payload),
  });

  if (!resp.ok) {
    let detail = null;
    try {
      detail = (await resp.text()) || null;
    } catch {
      detail = null;
    }
    const extra = detail ? ` ${String(detail).trim().slice(0, 280)}` : '';
    const hint = resp.status === 401
      ? ' (MailChannels rejected the request: check API key + Domain Lockdown DNS _mailchannels TXT record.)'
      : '';
    return { ok: false, error: `Email send failed (${resp.status})${hint}.${extra}` };
  }
  return { ok: true };
}

function buildConfirmHtml(title, body) {
  const safeTitle = (title || 'Request').toString();
  const safeBody = (body || '').toString();
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${safeTitle}</title>
    <style>
      :root { color-scheme: dark; }
      body { margin:0; font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; background:#0a0a0a; color:#e0e0e0; }
      .wrap { max-width: 720px; margin: 0 auto; padding: 48px 20px; }
      .card { background: #1a1a1a; border: 1px solid #2a2a2a; border-radius: 12px; padding: 20px; }
      h1 { margin: 0 0 10px 0; font-size: 20px; }
      p { margin: 0; color: #a0a0a0; line-height: 1.6; }
      a { color: #FF8C42; text-decoration: none; font-weight: 700; }
    </style>
  </head>
  <body>
    <div class="wrap">
      <div class="card">
        <h1>${safeTitle}</h1>
        <p>${safeBody}</p>
        <p style="margin-top:14px"><a href="/">Return to the website</a></p>
      </div>
    </div>
  </body>
</html>`;
}

async function getCachedTwitchToken(env) {
  if (!env.SCHEDULE_KV) return null;
  const raw = await env.SCHEDULE_KV.get(TWITCH_TOKEN_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    if (typeof parsed.access_token !== 'string') return null;
    if (typeof parsed.expires_at !== 'number') return null;
    if (Date.now() >= parsed.expires_at) return null;
    return parsed.access_token;
  } catch {
    return null;
  }
}

async function cacheTwitchToken(env, token, expiresAt) {
  if (!env.SCHEDULE_KV) return;
  await env.SCHEDULE_KV.put(
    TWITCH_TOKEN_KEY,
    JSON.stringify({ access_token: token, expires_at: expiresAt })
  );
}

async function getTwitchAccessToken(env) {
  const cached = await getCachedTwitchToken(env);
  if (cached) return cached;

  const clientId = env.TWITCH_CLIENT_ID;
  const clientSecret = env.TWITCH_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  const tokenUrl = new URL('https://id.twitch.tv/oauth2/token');
  tokenUrl.searchParams.set('client_id', clientId);
  tokenUrl.searchParams.set('client_secret', clientSecret);
  tokenUrl.searchParams.set('grant_type', 'client_credentials');

  const resp = await fetch(tokenUrl.toString(), { method: 'POST' });
  if (!resp.ok) return null;

  const json = await resp.json();
  const accessToken = json && typeof json.access_token === 'string' ? json.access_token : null;
  const expiresIn = json && typeof json.expires_in === 'number' ? json.expires_in : null;
  if (!accessToken || !expiresIn) return null;

  // Refresh a minute early.
  const expiresAt = Date.now() + Math.max(60, expiresIn - 60) * 1000;
  await cacheTwitchToken(env, accessToken, expiresAt);
  return accessToken;
}

async function isTwitchChannelLive(env) {
  const clientId = env.TWITCH_CLIENT_ID;
  if (!clientId) return null;

  const token = await getTwitchAccessToken(env);
  if (!token) return null;

  const login = (env.TWITCH_CHANNEL_LOGIN || DEFAULT_TWITCH_LOGIN).toString().trim().toLowerCase();
  const url = new URL('https://api.twitch.tv/helix/streams');
  url.searchParams.set('user_login', login);

  const resp = await fetch(url.toString(), {
    headers: {
      'Client-ID': clientId,
      'Authorization': `Bearer ${token}`,
    },
  });

  if (!resp.ok) return null;
  const json = await resp.json();
  const data = json && Array.isArray(json.data) ? json.data : [];
  return data.length > 0;
}

function clampInt(n, min, max) {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

function clampString(value, maxLen) {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  return trimmed.length > maxLen ? trimmed.slice(0, maxLen) : trimmed;
}

function getRandomSample(array, count) {
  if (!Array.isArray(array) || array.length === 0) return [];
  const copy = array.slice();
  // Fisher–Yates shuffle (partial)
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = copy[i];
    copy[i] = copy[j];
    copy[j] = tmp;
  }
  return copy.slice(0, Math.min(count, copy.length));
}

async function getCachedClips(env) {
  if (!env.SCHEDULE_KV) return null;
  const raw = await env.SCHEDULE_KV.get(TWITCH_CLIPS_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    const clips = parsed && Array.isArray(parsed.clips) ? parsed.clips : null;
    const fetchedAtUtc = parsed && typeof parsed.fetchedAtUtc === 'string' ? parsed.fetchedAtUtc : null;
    if (!clips || !fetchedAtUtc) return null;
    return { clips, fetchedAtUtc };
  } catch {
    return null;
  }
}

async function setCachedClips(env, clips) {
  if (!env.SCHEDULE_KV) return null;
  const fetchedAtUtc = new Date().toISOString();
  await env.SCHEDULE_KV.put(TWITCH_CLIPS_KEY, JSON.stringify({ clips, fetchedAtUtc }));
  return fetchedAtUtc;
}

function buildTwitchClipEmbedUrl(clipId) {
  const id = (clipId || '').toString().trim();
  if (!id) return null;
  const u = new URL('https://clips.twitch.tv/embed');
  u.searchParams.set('clip', id);
  u.searchParams.append('parent', 'flyingwithjoel.co.uk');
  u.searchParams.append('parent', 'www.flyingwithjoel.co.uk');
  u.searchParams.set('autoplay', 'false');
  return u.toString();
}

async function fetchClipsFromTwitch(env, count) {
  const clientId = env.TWITCH_CLIENT_ID;
  if (!clientId) return { ok: false };

  const token = await getTwitchAccessToken(env);
  if (!token) return { ok: false };

  const userId = await fetchTwitchUserId(env);
  if (!userId) return { ok: false };

  // Fetch clips from the last 30 days, then randomize client-side.
  const now = new Date();
  const startedAt = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const url = new URL('https://api.twitch.tv/helix/clips');
  url.searchParams.set('broadcaster_id', userId);
  url.searchParams.set('first', '100');
  url.searchParams.set('started_at', startedAt.toISOString());
  url.searchParams.set('ended_at', now.toISOString());

  const resp = await fetch(url.toString(), {
    headers: {
      'Client-ID': clientId,
      'Authorization': `Bearer ${token}`,
    },
  });

  if (!resp.ok) return { ok: false, status: resp.status };
  const json = await resp.json();
  const data = json && Array.isArray(json.data) ? json.data : [];

  const normalized = data
    .map((c) => {
      const id = c && typeof c.id === 'string' ? c.id : null;
      if (!id) return null;
      const title = c && typeof c.title === 'string' ? c.title : 'Twitch Clip';
      const urlVal = c && typeof c.url === 'string' ? c.url : null;
      const thumbnailUrl = c && typeof c.thumbnail_url === 'string' ? c.thumbnail_url : null;
      const viewCount = c && typeof c.view_count === 'number' ? c.view_count : null;
      const createdAtUtc = c && typeof c.created_at === 'string' ? c.created_at : null;
      const embedUrl = buildTwitchClipEmbedUrl(id);
      return {
        id,
        title,
        url: urlVal,
        embedUrl,
        thumbnailUrl,
        viewCount: Number.isFinite(viewCount) ? viewCount : null,
        createdAtUtc,
      };
    })
    .filter(Boolean);

  const clips = getRandomSample(normalized, count);
  if (!clips.length) return { ok: false };
  return { ok: true, clips };
}

async function getRandomTwitchClips(env, count) {
  const cached = await getCachedClips(env);
  if (cached && cached.fetchedAtUtc) {
    const ageMs = Date.now() - Date.parse(cached.fetchedAtUtc);
    // Cache the *pool result* for 30 minutes.
    if (Number.isFinite(ageMs) && ageMs >= 0 && ageMs < 30 * 60 * 1000) {
      const sample = getRandomSample(cached.clips, count);
      if (sample.length) {
        return { ok: true, clips: sample, fetchedAtUtc: cached.fetchedAtUtc, source: 'cache' };
      }
    }
  }

  const fromTwitch = await fetchClipsFromTwitch(env, 20);
  if (fromTwitch.ok) {
    const fetchedAtUtc = await setCachedClips(env, fromTwitch.clips);
    const sample = getRandomSample(fromTwitch.clips, count);
    return { ok: true, clips: sample, fetchedAtUtc, source: 'twitch' };
  }

  if (cached && Array.isArray(cached.clips) && cached.clips.length) {
    const sample = getRandomSample(cached.clips, count);
    return { ok: true, clips: sample, fetchedAtUtc: cached.fetchedAtUtc, source: 'stale-cache' };
  }

  return { ok: false };
}

function parseDecapiFollowerCount(text) {
  const s = (text || '').toString().trim();
  const m = s.match(/\d+/);
  if (!m) return null;
  const n = parseInt(m[0], 10);
  return Number.isFinite(n) ? n : null;
}

async function getCachedFollowerCount(env) {
  if (!env.SCHEDULE_KV) return null;
  const raw = await env.SCHEDULE_KV.get(TWITCH_FOLLOWERS_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    const followers = parsed && typeof parsed.followers === 'number' ? parsed.followers : null;
    const fetchedAtUtc = parsed && typeof parsed.fetchedAtUtc === 'string' ? parsed.fetchedAtUtc : null;
    if (!Number.isFinite(followers) || !fetchedAtUtc) return null;
    return { followers, fetchedAtUtc };
  } catch {
    return null;
  }
}

async function setCachedFollowerCount(env, followers) {
  if (!env.SCHEDULE_KV) return;
  const fetchedAtUtc = new Date().toISOString();
  await env.SCHEDULE_KV.put(TWITCH_FOLLOWERS_KEY, JSON.stringify({ followers, fetchedAtUtc }));
  return fetchedAtUtc;
}

async function fetchTwitchUserId(env) {
  const clientId = env.TWITCH_CLIENT_ID;
  if (!clientId) return null;

  const token = await getTwitchAccessToken(env);
  if (!token) return null;

  const login = (env.TWITCH_CHANNEL_LOGIN || DEFAULT_TWITCH_LOGIN).toString().trim().toLowerCase();
  const url = new URL('https://api.twitch.tv/helix/users');
  url.searchParams.set('login', login);

  const resp = await fetch(url.toString(), {
    headers: {
      'Client-ID': clientId,
      'Authorization': `Bearer ${token}`,
    },
  });
  if (!resp.ok) return null;
  const json = await resp.json();
  const data = json && Array.isArray(json.data) ? json.data : [];
  const id = data[0] && typeof data[0].id === 'string' ? data[0].id : null;
  return id || null;
}

async function fetchFollowerCountFromTwitch(env) {
  const clientId = env.TWITCH_CLIENT_ID;
  if (!clientId) return { ok: false };

  const userId = await fetchTwitchUserId(env);
  if (!userId) return { ok: false };

  // For follower count, Twitch may require a user access token with additional scopes.
  // If TWITCH_FOLLOWERS_ACCESS_TOKEN is not provided, we try with the app token and
  // fall back to a public provider if Twitch rejects it.
  const token =
    (env.TWITCH_FOLLOWERS_ACCESS_TOKEN && env.TWITCH_FOLLOWERS_ACCESS_TOKEN.toString().trim())
      || (await getTwitchAccessToken(env));
  if (!token) return { ok: false };

  const url = new URL('https://api.twitch.tv/helix/channels/followers');
  url.searchParams.set('broadcaster_id', userId);
  url.searchParams.set('first', '1');

  const resp = await fetch(url.toString(), {
    headers: {
      'Client-ID': clientId,
      'Authorization': `Bearer ${token}`,
    },
  });

  if (!resp.ok) return { ok: false, status: resp.status };

  const json = await resp.json();
  const total = json && typeof json.total === 'number' ? json.total : null;
  if (!Number.isFinite(total)) return { ok: false };
  return { ok: true, followers: total };
}

async function fetchFollowerCountFromDecapi(env) {
  const login = (env.TWITCH_CHANNEL_LOGIN || DEFAULT_TWITCH_LOGIN).toString().trim().toLowerCase();
  const url = `https://decapi.me/twitch/followcount/${encodeURIComponent(login)}`;
  try {
    const resp = await fetch(url, { headers: { 'user-agent': 'FlyingWithJoelWorker/1.0 (+https://flyingwithjoel.co.uk)' } });
    if (!resp.ok) return { ok: false };
    const text = await resp.text();
    const n = parseDecapiFollowerCount(text);
    if (!Number.isFinite(n)) return { ok: false };
    return { ok: true, followers: n };
  } catch {
    return { ok: false };
  }
}

async function getTwitchFollowerCount(env) {
  const cached = await getCachedFollowerCount(env);
  if (cached && cached.fetchedAtUtc) {
    const ageMs = Date.now() - Date.parse(cached.fetchedAtUtc);
    // Cache for 10 minutes.
    if (Number.isFinite(ageMs) && ageMs >= 0 && ageMs < 10 * 60 * 1000) {
      return { ok: true, followers: cached.followers, fetchedAtUtc: cached.fetchedAtUtc, source: 'cache' };
    }
  }

  const fromTwitch = await fetchFollowerCountFromTwitch(env);
  if (fromTwitch.ok) {
    const fetchedAtUtc = await setCachedFollowerCount(env, fromTwitch.followers);
    return { ok: true, followers: fromTwitch.followers, fetchedAtUtc, source: 'twitch' };
  }

  const fromDecapi = await fetchFollowerCountFromDecapi(env);
  if (fromDecapi.ok) {
    const fetchedAtUtc = await setCachedFollowerCount(env, fromDecapi.followers);
    return { ok: true, followers: fromDecapi.followers, fetchedAtUtc, source: 'decapi' };
  }

  if (cached) {
    return { ok: true, followers: cached.followers, fetchedAtUtc: cached.fetchedAtUtc, source: 'stale-cache' };
  }

  return { ok: false };
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

function isAuthorized(request, env) {
  const creds = parseBasicAuth(request);
  const userOk = creds && safeEqual(creds.username, env.ADMIN_USERNAME || '');
  const passOk = creds && safeEqual(creds.password, env.ADMIN_PASSWORD || '');
  return Boolean(userOk && passOk);
}

function validateScheduleArray(value) {
  if (!Array.isArray(value)) return { ok: false, reason: 'Body is not an array.' };
  if (value.length < 1 || value.length > 14) return { ok: false, reason: 'Array length must be between 1 and 14.' };

  for (let i = 0; i < value.length; i += 1) {
    const item = value[i];
    if (!item || typeof item !== 'object') return { ok: false, index: i, reason: 'Item is not an object.' };

    // Required-ish fields used by index/admin
    if (typeof item.dateKey !== 'string' || !/^\d{1,2}-\d{1,2}$/.test(item.dateKey)) {
      return { ok: false, index: i, field: 'dateKey', reason: 'dateKey must look like M-D (e.g. 1-24).' };
    }
    if (typeof item.dayName !== 'string') {
      return { ok: false, index: i, field: 'dayName', reason: 'dayName must be a string.' };
    }
    if (typeof item.dateText !== 'string') {
      return { ok: false, index: i, field: 'dateText', reason: 'dateText must be a string.' };
    }

    if (typeof item.status !== 'string') {
      return { ok: false, index: i, field: 'status', reason: 'status must be a string.' };
    }
    const status = item.status.toLowerCase();
    if (!['none', 'scheduled', 'completed', 'cancelled', 'delayed'].includes(status)) {
      return { ok: false, index: i, field: 'status', reason: `Unsupported status: ${status}` };
    }

    // Optional fields
    if (item.zuluTime !== null && item.zuluTime !== undefined && typeof item.zuluTime !== 'string') {
      return { ok: false, index: i, field: 'zuluTime', reason: 'zuluTime must be a string or null.' };
    }
    if (item.originalZuluTime !== null && item.originalZuluTime !== undefined && typeof item.originalZuluTime !== 'string') {
      return { ok: false, index: i, field: 'originalZuluTime', reason: 'originalZuluTime must be a string or null.' };
    }
    if (item.timeText !== null && item.timeText !== undefined && typeof item.timeText !== 'string') {
      return { ok: false, index: i, field: 'timeText', reason: 'timeText must be a string or null.' };
    }
    if (item.streamTitle !== null && item.streamTitle !== undefined && typeof item.streamTitle !== 'string') {
      return { ok: false, index: i, field: 'streamTitle', reason: 'streamTitle must be a string or null.' };
    }
    if (item.vodUrl !== null && item.vodUrl !== undefined && typeof item.vodUrl !== 'string') {
      return { ok: false, index: i, field: 'vodUrl', reason: 'vodUrl must be a string or null.' };
    }
    if (item.gameLogo !== null && item.gameLogo !== undefined && typeof item.gameLogo !== 'string') {
      return { ok: false, index: i, field: 'gameLogo', reason: 'gameLogo must be a string or null.' };
    }
  }

  return { ok: true };
}

function validateSiteModeBody(value) {
  if (!value || typeof value !== 'object') return { ok: false, reason: 'Body is not an object.' };
  const mode = typeof value.mode === 'string' ? value.mode.trim().toLowerCase() : '';
  if (mode !== 'live' && mode !== 'maintenance') {
    return { ok: false, reason: 'mode must be "live" or "maintenance".' };
  }
  return { ok: true, mode };
}

function validateIncidentNoticeBody(value) {
  if (!value || typeof value !== 'object') return { ok: false, reason: 'Body is not an object.' };

  const enabled = Boolean(value.enabled);
  const title = typeof value.title === 'string' ? value.title.trim() : '';
  const message = typeof value.message === 'string' ? value.message.trim() : '';

  if (title.length > 80) return { ok: false, reason: 'title must be 0-80 characters.' };
  if (message.length > 220) return { ok: false, reason: 'message must be 0-220 characters.' };

  if (enabled && (!title || !message)) {
    return { ok: false, reason: 'When enabled, title and message are required.' };
  }

  return { ok: true, enabled, title: title || null, message: message || null };
}

function validateAdminNotesBody(value) {
  if (!value || typeof value !== 'object') return { ok: false, reason: 'Body is not an object.' };
  const notes = (typeof value.notes === 'string' ? value.notes : '').toString();
  // Keep this generous but bounded (KV is not meant for huge blobs).
  if (notes.length > 20000) return { ok: false, reason: 'notes must be 0-20000 characters.' };
  return { ok: true, notes };
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    const path = url.pathname;

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          ...corsHeadersFor(request),
          'access-control-max-age': '86400',
        },
      });
    }

    const isSchedule = path.startsWith('/api/schedule');
    const isSiteMode = path.startsWith('/api/site-mode');
    const isIncidentNotice = path.startsWith('/api/incident-notice');
    const isDataRequests = path.startsWith('/api/data-requests');
    if (!isSchedule && !isSiteMode && !isIncidentNotice && !isDataRequests) {
      return new Response('Not Found', {
        status: 404,
        headers: {
          ...corsHeadersFor(request),
          'cache-control': 'no-store',
        },
      });
    }

    // ===== Admin notes (saved to KV; requires Basic Auth) =====
    // Route is under /api/schedule* so it works with the existing Cloudflare route.
    if (path === '/api/schedule/admin-notes') {
      if (!env.SCHEDULE_KV) {
        return jsonResponse(
          { error: 'Missing KV binding SCHEDULE_KV.' },
          { status: 500, headers: corsHeadersFor(request) }
        );
      }

      if (!env.ADMIN_USERNAME || !env.ADMIN_PASSWORD) {
        return jsonResponse(
          { error: 'Missing ADMIN_USERNAME/ADMIN_PASSWORD secrets.' },
          { status: 500, headers: corsHeadersFor(request) }
        );
      }

      if (!isAuthorized(request, env)) {
          return unauthorizedWithCors(request, env);
      }

      const creds = parseBasicAuth(request);
      const username = (creds && typeof creds.username === 'string' ? creds.username : 'admin').trim() || 'admin';
      const key = `${ADMIN_NOTES_PREFIX}${username}`;

      if (request.method === 'GET') {
        // Overwrite any previously-saved notes with the fixed message.
        const updatedAtUtc = new Date().toISOString();
        await env.SCHEDULE_KV.put(key, JSON.stringify({ notes: FIXED_ADMIN_NOTES, updatedAtUtc }));
        return jsonResponse({ ok: true, notes: FIXED_ADMIN_NOTES, updatedAtUtc }, { headers: corsHeadersFor(request) });
      }

      // Disallow edits.
      if (request.method === 'PUT') {
        return new Response('Method Not Allowed', {
          status: 405,
          headers: {
            ...corsHeadersFor(request),
            'cache-control': 'no-store',
          },
        });
      }

      return new Response('Method Not Allowed', {
        status: 405,
        headers: {
          ...corsHeadersFor(request),
          'cache-control': 'no-store',
        },
      });
    }

    // ===== Data access / deletion request endpoints =====
    // Purpose:
    //  - Let a user request a copy of data we can associate with their email address, or request deletion.
    // Safety:
    //  - We require email confirmation (token link) before fulfilling the request.
    // Routes:
    //  - POST /api/data-requests            -> creates a pending request and emails a confirmation link
    //  - GET  /api/data-requests/confirm    -> confirms + processes, then emails the result
    if (isDataRequests) {
      if (!env.SCHEDULE_KV) {
        return jsonResponse(
          { error: 'Missing KV binding SCHEDULE_KV.' },
          { status: 500, headers: corsHeadersFor(request) }
        );
      }

      if (request.method === 'POST' && path === '/api/data-requests') {
        let body;
        try {
          body = await request.json();
        } catch {
          return jsonResponse(
            { error: 'Invalid JSON body.' },
            { status: 400, headers: corsHeadersFor(request) }
          );
        }

        const email = (body && typeof body.email === 'string' ? body.email : '').trim();
        const action = (body && typeof body.action === 'string' ? body.action : '').trim().toLowerCase();
        if (!isValidEmail(email)) {
          return jsonResponse(
            { error: 'Please enter a valid email address.' },
            { status: 400, headers: corsHeadersFor(request) }
          );
        }

        if (action !== 'access' && action !== 'delete') {
          return jsonResponse(
            { error: 'Invalid action. Use "access" or "delete".' },
            { status: 400, headers: corsHeadersFor(request) }
          );
        }

        const remoteIp = request.headers.get('cf-connecting-ip') || undefined;
        const rate = await enforceDataRequestRateLimit(env, remoteIp);
        if (!rate.ok) {
          return jsonResponse(
            { error: 'Too many requests. Please wait and try again.', retryAfterSeconds: rate.retryAfterSeconds ?? null },
            {
              status: 429,
              headers: { ...corsHeadersFor(request), 'retry-after': String(rate.retryAfterSeconds ?? 120) },
            }
          );
        }

        const token = generateToken(24);
        const createdAtUtc = new Date().toISOString();
        const requestKey = `${DATA_REQUEST_PREFIX}${token}`;

        // Store the request briefly. We only need it long enough for the user to confirm.
        await env.SCHEDULE_KV.put(
          requestKey,
          JSON.stringify({
            email,
            action,
            createdAtUtc,
            confirmedAtUtc: null,
            processedAtUtc: null,
          }),
          { expirationTtl: 24 * 60 * 60 }
        );

        const origin = url.origin;
        const confirmUrl = `${origin}/api/data-requests/confirm?token=${encodeURIComponent(token)}`;
        const subject = action === 'delete'
          ? 'Confirm your data deletion request'
          : 'Confirm your data access request';

        const text =
          `We received a request to ${action === 'delete' ? 'delete your data' : 'get a copy of your data'} associated with this email address.\n\n` +
          `To confirm, open this link:\n${confirmUrl}\n\n` +
          `If you did not request this, you can ignore this email.\n`;

        const sent = await sendEmailViaMailchannels(env, { to: email, subject, text });
        if (!sent.ok) {
          return jsonResponse(
            { error: sent.error || 'Email could not be sent.' },
            { status: 500, headers: corsHeadersFor(request) }
          );
        }

        return jsonResponse(
          { ok: true, message: 'Check your inbox for the confirmation link.' },
          { headers: corsHeadersFor(request) }
        );
      }

      if (request.method === 'GET' && path === '/api/data-requests/confirm') {
        const token = (url.searchParams.get('token') || '').trim();
        if (!token) {
          return htmlResponse(
            buildConfirmHtml('Invalid request', 'Missing token.'),
            { status: 400, headers: corsHeadersFor(request) }
          );
        }

        const requestKey = `${DATA_REQUEST_PREFIX}${token}`;
        const raw = await env.SCHEDULE_KV.get(requestKey);
        if (!raw) {
          return htmlResponse(
            buildConfirmHtml('Request expired', 'This link is invalid or has expired. Please submit a new request.'),
            { status: 404, headers: corsHeadersFor(request) }
          );
        }

        let record;
        try {
          record = JSON.parse(raw);
        } catch {
          return htmlResponse(
            buildConfirmHtml('Request error', 'This request could not be processed.'),
            { status: 500, headers: corsHeadersFor(request) }
          );
        }

        const email = record && typeof record.email === 'string' ? record.email : null;
        const action = record && typeof record.action === 'string' ? record.action : null;
        if (!email || !action) {
          return htmlResponse(
            buildConfirmHtml('Request error', 'This request could not be processed.'),
            { status: 500, headers: corsHeadersFor(request) }
          );
        }

        // Idempotency: if already processed, just show a friendly page.
        if (record.processedAtUtc) {
          return htmlResponse(
            buildConfirmHtml('Request already processed', 'This request has already been confirmed and processed. Please check your email.'),
            { headers: corsHeadersFor(request) }
          );
        }

        const confirmedAtUtc = new Date().toISOString();
        const emailHash = await sha256Hex(email.toLowerCase());

        // Build the response email.
        const subject = action === 'delete' ? 'Your data deletion request' : 'Your data access request';
        const processedAtUtc = new Date().toISOString();

        // IMPORTANT: This site does not run user accounts. Unless you explicitly store data keyed by email,
        // we likely have nothing server-side to return besides the request itself.
        // This message is intentionally conservative and avoids claiming data sources we cannot reliably enumerate.
        const text = action === 'delete'
          ? (
            `We have processed your data deletion request.\n\n` +
            `What we deleted:\n` +
            `- Any server-side records we can associate with this email address (if any).\n` +
            `\nNotes:\n` +
            `- Some data may exist in provider logs (e.g., CDN/hosting logs) or third-party services you interacted with. Those are not always deletable automatically from here.\n` +
            `\nProcessed at: ${processedAtUtc} UTC\n`
          )
          : (
            `We have processed your data access request.\n\n` +
            `Data we can associate with this email address:\n` +
            `- (None found in our server-side storage.)\n` +
            `\nNotes:\n` +
            `- This website does not use user accounts. Most preferences (like cookie consent) are stored locally in your browser and are not sent to our servers.\n` +
            `- If you submitted content via forms that are delivered to third-party systems (e.g., Discord), those systems may hold a copy.\n` +
            `\nProcessed at: ${processedAtUtc} UTC\n`
          );

        const sent = await sendEmailViaMailchannels(env, { to: email, subject, text });
        if (!sent.ok) {
          return htmlResponse(
            buildConfirmHtml('Email failed', 'We confirmed your request but could not send the response email. Please try again later.'),
            { status: 500, headers: corsHeadersFor(request) }
          );
        }

        // Minimize stored personal data: replace the record with a minimal audit entry and expire it.
        await env.SCHEDULE_KV.put(
          requestKey,
          JSON.stringify({
            action,
            createdAtUtc: record.createdAtUtc || null,
            confirmedAtUtc,
            processedAtUtc,
            emailHash,
          }),
          { expirationTtl: 30 * 24 * 60 * 60 }
        );

        return htmlResponse(
          buildConfirmHtml('Request confirmed', 'Thanks — your request has been confirmed and an email has been sent.'),
          { headers: corsHeadersFor(request) }
        );
      }

      return new Response('Not Found', {
        status: 404,
        headers: {
          ...corsHeadersFor(request),
          'cache-control': 'no-store',
        },
      });
    }

    // ===== Incident notice endpoints =====
    // Routes:
    //  - GET /api/incident-notice -> { enabled: boolean, title: string|null, message: string|null, updatedAtUtc: string|null }
    //  - PUT /api/incident-notice -> saves { enabled, title, message }
    if (isIncidentNotice) {
      if (path !== '/api/incident-notice') {
        return new Response('Not Found', {
          status: 404,
          headers: {
            ...corsHeadersFor(request),
            'cache-control': 'no-store',
          },
        });
      }

      if (!env.SCHEDULE_KV) {
        return jsonResponse(
          { error: 'Missing KV binding SCHEDULE_KV.' },
          { status: 500, headers: corsHeadersFor(request) }
        );
      }

      if (request.method === 'GET') {
        const raw = await env.SCHEDULE_KV.get(INCIDENT_NOTICE_KEY);
        if (!raw) {
          return jsonResponse(
            { enabled: false, title: null, message: null, updatedAtUtc: null },
            { headers: corsHeadersFor(request) }
          );
        }
        try {
          const parsed = JSON.parse(raw);
          const enabled = Boolean(parsed && parsed.enabled);
          const title = parsed && typeof parsed.title === 'string' ? parsed.title : null;
          const message = parsed && typeof parsed.message === 'string' ? parsed.message : null;
          const updatedAtUtc = parsed && typeof parsed.updatedAtUtc === 'string' ? parsed.updatedAtUtc : null;
          return jsonResponse(
            { enabled, title: title || null, message: message || null, updatedAtUtc: updatedAtUtc || null },
            { headers: corsHeadersFor(request) }
          );
        } catch {
          return jsonResponse(
            { enabled: false, title: null, message: null, updatedAtUtc: null },
            { headers: corsHeadersFor(request) }
          );
        }
      }

      if (request.method === 'PUT') {
        if (!env.ADMIN_USERNAME || !env.ADMIN_PASSWORD) {
          return jsonResponse(
            { error: 'Missing ADMIN_USERNAME/ADMIN_PASSWORD secrets.' },
            { status: 500, headers: corsHeadersFor(request) }
          );
        }

        if (!isAuthorized(request, env)) {
           return unauthorizedWithCors(request, env);
        }

        let body;
        try {
          body = await request.json();
        } catch {
          return jsonResponse(
            { error: 'Invalid JSON body.' },
            { status: 400, headers: corsHeadersFor(request) }
          );
        }

        const validation = validateIncidentNoticeBody(body);
        if (!validation.ok) {
          return jsonResponse(
            { error: 'Invalid incident notice.', details: validation },
            { status: 400, headers: corsHeadersFor(request) }
          );
        }

        // Read existing config so we can avoid spamming notifications for no-op saves.
        let prev = { enabled: false, title: null, message: null, updatedAtUtc: null };
        try {
          const prevRaw = await env.SCHEDULE_KV.get(INCIDENT_NOTICE_KEY);
          if (prevRaw) {
            const p = JSON.parse(prevRaw);
            prev = {
              enabled: Boolean(p && p.enabled),
              title: p && typeof p.title === 'string' ? p.title : null,
              message: p && typeof p.message === 'string' ? p.message : null,
              updatedAtUtc: p && typeof p.updatedAtUtc === 'string' ? p.updatedAtUtc : null,
            };
          }
        } catch {
          // ignore
        }

        const updatedAtUtc = new Date().toISOString();
        const next = {
          enabled: validation.enabled,
          title: validation.title,
          message: validation.message,
          updatedAtUtc,
        };

        await env.SCHEDULE_KV.put(INCIDENT_NOTICE_KEY, JSON.stringify(next));

        const prevEnabled = Boolean(prev.enabled);
        const prevTitle = (prev.title || '').toString();
        const prevMessage = (prev.message || '').toString();
        const nextTitle = (next.title || '').toString();
        const nextMessage = (next.message || '').toString();

        const contentChanged = (prevEnabled !== next.enabled) || (prevTitle !== nextTitle) || (prevMessage !== nextMessage);
        let event = 'updated';
        if (!contentChanged) event = 'noop';
        else if (!prevEnabled && next.enabled) event = 'enabled';
        else if (prevEnabled && !next.enabled) event = 'disabled';

        // Best-effort outbound notifications.
        if (event !== 'noop') {
          const notifyPromises = [];

          // Discord webhook
          notifyPromises.push(
            postDiscordWebhook(env, {
              event,
              enabled: next.enabled,
              updatedAtUtc,
              title: next.title,
              message: next.message,
              apiUrl: 'https://flyingwithjoel.co.uk/pages/status.html',
            })
          );

          // Owner email
          const alertTo = getEnvString(env, 'INCIDENT_ALERT_EMAIL_TO');
          if (alertTo) {
            const { subject, text } = buildIncidentAlertEmail({
              event,
              enabled: next.enabled,
              updatedAtUtc,
              title: next.title,
              message: next.message,
            });
            notifyPromises.push(sendEmailViaMailchannels(env, { to: alertTo, subject, text }));
          }

          // Don't block the response; run in background if ctx is available.
          const work = Promise.allSettled(notifyPromises).then(() => null);
          if (ctx && typeof ctx.waitUntil === 'function') ctx.waitUntil(work);
          else await work;
        }

        return jsonResponse(
          { ok: true, enabled: next.enabled, title: next.title, message: next.message, updatedAtUtc },
          { headers: corsHeadersFor(request) }
        );
      }

      return new Response('Method Not Allowed', {
        status: 405,
        headers: {
          ...corsHeadersFor(request),
          'cache-control': 'no-store',
        },
      });
    }

    // ===== Site mode endpoints =====
    // Routes:
    //  - GET /api/site-mode -> { mode: 'live'|'maintenance', updatedAtUtc: string|null }
    //  - PUT /api/site-mode -> saves { mode }
    //  - GET /api/site-mode/auth -> verifies Basic Auth (for debugging)
    //  - GET /api/site-mode/expected-return -> { message: string|null, updatedAtUtc: string|null }
    //  - PUT /api/site-mode/expected-return -> saves { message }
    if (isSiteMode) {
      // GET/PUT expected return message
      if (path === '/api/site-mode/expected-return') {
        if (!env.SCHEDULE_KV) {
          return jsonResponse(
            { error: 'Missing KV binding SCHEDULE_KV.' },
            { status: 500, headers: corsHeadersFor(request) }
          );
        }

        if (request.method === 'GET') {
          const raw = await env.SCHEDULE_KV.get(EXPECTED_RETURN_KEY);
          if (!raw) {
            return jsonResponse(
              { message: null, updatedAtUtc: null },
              { headers: corsHeadersFor(request) }
            );
          }
          try {
            const parsed = JSON.parse(raw);
            const message = typeof parsed.message === 'string' ? parsed.message : null;
            const updatedAtUtc = typeof parsed.updatedAtUtc === 'string' ? parsed.updatedAtUtc : null;
            return jsonResponse(
              { message, updatedAtUtc },
              { headers: corsHeadersFor(request) }
            );
          } catch {
            return jsonResponse(
              { message: null, updatedAtUtc: null },
              { headers: corsHeadersFor(request) }
            );
          }
        }

        if (request.method === 'PUT') {
          if (!env.ADMIN_USERNAME || !env.ADMIN_PASSWORD) {
            return jsonResponse(
              { error: 'Missing ADMIN_USERNAME/ADMIN_PASSWORD secrets.' },
              { status: 500, headers: corsHeadersFor(request) }
            );
          }
          if (!isAuthorized(request, env)) {
            return unauthorizedWithCors(request, env);
          }
          let body;
          try {
            body = await request.json();
          } catch {
            return jsonResponse(
              { error: 'Invalid JSON body.' },
              { status: 400, headers: corsHeadersFor(request) }
            );
          }
          const message = typeof body.message === 'string' ? body.message.trim() : '';
          if (!message || message.length > 120) {
            return jsonResponse(
              { error: 'Message must be a non-empty string up to 120 characters.' },
              { status: 400, headers: corsHeadersFor(request) }
            );
          }
          const updatedAtUtc = new Date().toISOString();
          await env.SCHEDULE_KV.put(EXPECTED_RETURN_KEY, JSON.stringify({ message, updatedAtUtc }));
          return jsonResponse({ ok: true, message, updatedAtUtc }, { headers: corsHeadersFor(request) });
        }

        return new Response('Method Not Allowed', {
          status: 405,
          headers: {
            ...corsHeadersFor(request),
            'cache-control': 'no-store',
          },
        });
      }
      if (path === '/api/site-mode/auth') {
        if (request.method !== 'GET') {
          return new Response('Method Not Allowed', {
            status: 405,
            headers: {
              ...corsHeadersFor(request),
              'cache-control': 'no-store',
            },
          });
        }

        if (!env.ADMIN_USERNAME || !env.ADMIN_PASSWORD) {
          return jsonResponse(
            { error: 'Missing ADMIN_USERNAME/ADMIN_PASSWORD secrets.' },
            { status: 500, headers: corsHeadersFor(request) }
          );
        }

        if (!isAuthorized(request, env)) {
           return unauthorizedWithCors(request, env);
        }

        return jsonResponse({ ok: true }, { headers: corsHeadersFor(request) });
      }

      if (!env.SCHEDULE_KV) {
        return jsonResponse(
          { error: 'Missing KV binding SCHEDULE_KV.' },
          { status: 500, headers: corsHeadersFor(request) }
        );
      }

      if (request.method === 'GET') {
        const raw = await env.SCHEDULE_KV.get(SITE_MODE_KEY);
        if (!raw) {
          return jsonResponse(
            { mode: DEFAULT_SITE_MODE, updatedAtUtc: null },
            { headers: corsHeadersFor(request) }
          );
        }

        try {
          const parsed = JSON.parse(raw);
          const mode = parsed && typeof parsed.mode === 'string' ? parsed.mode.trim().toLowerCase() : DEFAULT_SITE_MODE;
          const safeMode = mode === 'maintenance' ? 'maintenance' : 'live';
          const updatedAtUtc = parsed && typeof parsed.updatedAtUtc === 'string' ? parsed.updatedAtUtc : null;
          return jsonResponse(
            { mode: safeMode, updatedAtUtc: updatedAtUtc || null },
            { headers: corsHeadersFor(request) }
          );
        } catch {
          return jsonResponse(
            { mode: DEFAULT_SITE_MODE, updatedAtUtc: null },
            { headers: corsHeadersFor(request) }
          );
        }
      }

      if (request.method === 'PUT') {
        if (!env.ADMIN_USERNAME || !env.ADMIN_PASSWORD) {
          return jsonResponse(
            { error: 'Missing ADMIN_USERNAME/ADMIN_PASSWORD secrets.' },
            { status: 500, headers: corsHeadersFor(request) }
          );
        }

        if (!isAuthorized(request, env)) {
            return unauthorizedWithCors(request, env);
        }

        let body;
        try {
          body = await request.json();
        } catch {
          return jsonResponse(
            { error: 'Invalid JSON body.' },
            { status: 400, headers: corsHeadersFor(request) }
          );
        }

        const validation = validateSiteModeBody(body);
        if (!validation.ok) {
          return jsonResponse(
            { error: 'Invalid site mode.', details: validation },
            { status: 400, headers: corsHeadersFor(request) }
          );
        }

        const updatedAtUtc = new Date().toISOString();
        await env.SCHEDULE_KV.put(SITE_MODE_KEY, JSON.stringify({ mode: validation.mode, updatedAtUtc }));
        return jsonResponse({ ok: true, mode: validation.mode, updatedAtUtc }, { headers: corsHeadersFor(request) });
      }

      return new Response('Method Not Allowed', {
        status: 405,
        headers: {
          ...corsHeadersFor(request),
          'cache-control': 'no-store',
        },
      });
    }

    // Auth verification endpoint for the admin UI.
    if (path === '/api/schedule/auth') {
      if (request.method !== 'GET') {
        return new Response('Method Not Allowed', {
          status: 405,
          headers: {
            ...corsHeadersFor(request),
            'cache-control': 'no-store',
          },
        });
      }

      if (!env.ADMIN_USERNAME || !env.ADMIN_PASSWORD) {
        return jsonResponse(
          { error: 'Missing ADMIN_USERNAME/ADMIN_PASSWORD secrets.' },
          { status: 500, headers: corsHeadersFor(request) }
        );
      }

      if (!isAuthorized(request, env)) {
        return unauthorizedWithCors(request, env);
      }

      return jsonResponse({ ok: true }, { headers: corsHeadersFor(request) });
    }

    // Live status endpoint for the public schedule UI.
    // Note: kept under /api/schedule* so it matches the same Cloudflare route.
    if (path === '/api/schedule/live') {
      if (request.method !== 'GET') {
        return new Response('Method Not Allowed', {
          status: 405,
          headers: {
            ...corsHeadersFor(request),
            'cache-control': 'no-store',
          },
        });
      }

      if (!env.SCHEDULE_KV) {
        return jsonResponse(
          { error: 'Missing KV binding SCHEDULE_KV.' },
          { status: 500, headers: corsHeadersFor(request) }
        );
      }

      const live = await isTwitchChannelLive(env);
      if (live === null) {
        return jsonResponse(
          { ok: false, error: 'Twitch live status unavailable (missing secrets or upstream error).' },
          { status: 200, headers: corsHeadersFor(request) }
        );
      }

      return jsonResponse({ ok: true, live }, { headers: corsHeadersFor(request) });
    }

    // Twitch follower count endpoint for the homepage.
    // Uses Worker-held secrets and caches results in KV.
    if (path === '/api/schedule/followers') {
      if (request.method !== 'GET') {
        return new Response('Method Not Allowed', {
          status: 405,
          headers: {
            ...corsHeadersFor(request),
            'cache-control': 'no-store',
          },
        });
      }

      if (!env.SCHEDULE_KV) {
        return jsonResponse(
          { ok: false, error: 'Missing KV binding SCHEDULE_KV.' },
          { status: 500, headers: corsHeadersFor(request) }
        );
      }

      const result = await getTwitchFollowerCount(env);
      if (!result.ok) {
        return jsonResponse(
          { ok: false, error: 'Follower count unavailable.' },
          { status: 200, headers: corsHeadersFor(request) }
        );
      }

      return jsonResponse(
        {
          ok: true,
          followers: result.followers,
          fetchedAtUtc: result.fetchedAtUtc || null,
          source: result.source || 'unknown',
        },
        { headers: corsHeadersFor(request) }
      );
    }

    // Twitch clips endpoint for the homepage highlights.
    // Uses Worker-held secrets and caches a pool of clips in KV.
    if (path === '/api/schedule/clips') {
      if (request.method !== 'GET') {
        return new Response('Method Not Allowed', {
          status: 405,
          headers: {
            ...corsHeadersFor(request),
            'cache-control': 'no-store',
          },
        });
      }

      if (!env.SCHEDULE_KV) {
        return jsonResponse(
          { ok: false, error: 'Missing KV binding SCHEDULE_KV.' },
          { status: 500, headers: corsHeadersFor(request) }
        );
      }

      const requestedCount = clampInt(parseInt(url.searchParams.get('count') || '2', 10), 1, 6);
      const result = await getRandomTwitchClips(env, requestedCount);
      if (!result.ok) {
        return jsonResponse(
          { ok: false, error: 'Clips unavailable.' },
          { status: 200, headers: corsHeadersFor(request) }
        );
      }

      return jsonResponse(
        {
          ok: true,
          clips: Array.isArray(result.clips) ? result.clips : [],
          fetchedAtUtc: result.fetchedAtUtc || null,
          source: result.source || 'unknown',
        },
        { headers: corsHeadersFor(request) }
      );
    }

    if (!env.SCHEDULE_KV) {
      return jsonResponse(
        { error: 'Missing KV binding SCHEDULE_KV.' },
        { status: 500, headers: corsHeadersFor(request) }
      );
    }

    if (request.method === 'GET') {
      const raw = await env.SCHEDULE_KV.get(SCHEDULE_KEY);
      if (!raw) return jsonResponse([], { headers: corsHeadersFor(request) });

      try {
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return jsonResponse([], { headers: corsHeadersFor(request) });
        return jsonResponse(parsed, { headers: corsHeadersFor(request) });
      } catch {
        return jsonResponse([], { headers: corsHeadersFor(request) });
      }
    }

    if (request.method === 'PUT') {
      if (!env.ADMIN_USERNAME || !env.ADMIN_PASSWORD) {
        return jsonResponse(
          { error: 'Missing ADMIN_USERNAME/ADMIN_PASSWORD secrets.' },
          { status: 500, headers: corsHeadersFor(request) }
        );
      }

      if (!isAuthorized(request, env)) {
        return unauthorizedWithCors(request, env);
      }

      let body;
      try {
        body = await request.json();
      } catch {
        return jsonResponse(
          { error: 'Invalid JSON body.' },
          { status: 400, headers: corsHeadersFor(request) }
        );
      }

      const validation = validateScheduleArray(body);
      if (!validation.ok) {
        return jsonResponse(
          { error: 'Schedule must be a valid array of schedule items.', details: validation },
          { status: 400, headers: corsHeadersFor(request) }
        );
      }

      await env.SCHEDULE_KV.put(SCHEDULE_KEY, JSON.stringify(body));
      return jsonResponse({ ok: true }, { headers: corsHeadersFor(request) });
    }

    return new Response('Method Not Allowed', {
      status: 405,
      headers: {
        ...corsHeadersFor(request),
        'cache-control': 'no-store',
      },
    });
  },
};

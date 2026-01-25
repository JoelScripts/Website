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
      'access-control-allow-methods': 'GET,PUT,OPTIONS',
      'access-control-allow-headers': 'content-type, authorization',
    };
  }

  if (ALLOWED_ORIGINS.has(origin)) {
    return {
      'access-control-allow-origin': origin,
      'vary': 'origin',
      'access-control-allow-methods': 'GET,PUT,OPTIONS',
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

function statusMeta(status) {
  const s = (status || 'none').toString().trim().toLowerCase();
  if (s === 'scheduled') return { emoji: '🗓️', label: 'Scheduled' };
  if (s === 'completed') return { emoji: '✅', label: 'Completed' };
  if (s === 'cancelled') return { emoji: '❌', label: 'Cancelled' };
  if (s === 'delayed') return { emoji: '⏳', label: 'Delayed' };
  return { emoji: '🚫', label: 'No stream' };
}

function parseDateKey(dateKey) {
  const m = (dateKey || '').toString().trim().match(/^(\d{1,2})-(\d{1,2})$/);
  if (!m) return null;
  const month = parseInt(m[1], 10);
  const day = parseInt(m[2], 10);
  if (!Number.isFinite(month) || !Number.isFinite(day)) return null;
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > 31) return null;
  return { month, day };
}

function parseZuluClock(zuluTimeStr) {
  const s = (zuluTimeStr || '').toString().trim();
  if (!s) return null;

  // Examples we accept:
  //  - 18:00 Zulu
  //  - 11:00 AM Zulu
  //  - 11:00AM Zulu
  const m = s.match(/(\d{1,2}):(\d{2})(?:\s*(AM|PM))?\s+Zulu/i);
  if (!m) return null;
  let hour = parseInt(m[1], 10);
  const minute = parseInt(m[2], 10);
  const ampm = (m[3] || '').toUpperCase();
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  if (hour < 0 || hour > 12 && ampm) return null;
  if (hour < 0 || hour > 23) return null;
  if (minute < 0 || minute > 59) return null;

  if (ampm) {
    // 12-hour to 24-hour conversion
    const h = hour % 12;
    hour = ampm === 'PM' ? h + 12 : h;
  }

  return { hour, minute };
}

function inferYearForMonthDay(month, day) {
  const now = new Date();
  const nowY = now.getUTCFullYear();
  const startOfTodayUtc = Date.UTC(nowY, now.getUTCMonth(), now.getUTCDate());
  const candidateUtc = Date.UTC(nowY, month - 1, day);
  const diffDays = (candidateUtc - startOfTodayUtc) / 86400000;

  // Schedules are typically within the next ~14 days. If month/day is far in the past,
  // assume it's next year (e.g. editing Jan dates while it's late December).
  if (diffDays < -30) return nowY + 1;
  return nowY;
}

function toUtcDateFromDateKeyAndZuluClock(dateKey, zuluTimeStr) {
  const md = parseDateKey(dateKey);
  const hm = parseZuluClock(zuluTimeStr);
  if (!md || !hm) return null;
  const year = inferYearForMonthDay(md.month, md.day);
  return new Date(Date.UTC(year, md.month - 1, md.day, hm.hour, hm.minute, 0));
}

function formatZonedTime(date, timeZone) {
  try {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZoneName: 'short',
    }).format(date);
  } catch {
    return null;
  }
}

function formatZuluAndUkTimeLine(dateKey, zuluTimeStr, originalZuluTimeStr) {
  const d1 = originalZuluTimeStr ? toUtcDateFromDateKeyAndZuluClock(dateKey, originalZuluTimeStr) : null;
  const d2 = zuluTimeStr ? toUtcDateFromDateKeyAndZuluClock(dateKey, zuluTimeStr) : null;

  const fmtUtc = (d) => (d ? formatZonedTime(d, 'UTC') : null);
  const fmtUk = (d) => (d ? formatZonedTime(d, 'Europe/London') : null);

  if (d1 && d2) {
    const z1 = fmtUtc(d1);
    const z2 = fmtUtc(d2);
    const u1 = fmtUk(d1);
    const u2 = fmtUk(d2);
    if (z1 && z2 && u1 && u2) {
      return {
        zulu: `${z1} → ${z2}`,
        uk: `${u1} → ${u2}`,
      };
    }
  }

  if (d2) {
    const z = fmtUtc(d2);
    const u = fmtUk(d2);
    if (z && u) return { zulu: z, uk: u };
  }

  // Fallback: only show the raw Zulu string if we can't parse/format.
  if (zuluTimeStr) return { zulu: zuluTimeStr, uk: null };
  return { zulu: null, uk: null };
}

function dayNameLong(dayName) {
  const d = (dayName || '').toString().trim().toUpperCase();
  if (d === 'MON' || d === 'MONDAY') return 'Monday';
  if (d === 'TUE' || d === 'TUESDAY') return 'Tuesday';
  if (d === 'WED' || d === 'WEDNESDAY') return 'Wednesday';
  if (d === 'THU' || d === 'THURSDAY') return 'Thursday';
  if (d === 'FRI' || d === 'FRIDAY') return 'Friday';
  if (d === 'SAT' || d === 'SATURDAY') return 'Saturday';
  if (d === 'SUN' || d === 'SUNDAY') return 'Sunday';
  return (dayName || '').toString().trim() || 'Day';
}

function ordinalSuffix(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return '';
  const v = x % 100;
  if (v >= 11 && v <= 13) return 'th';
  const last = x % 10;
  if (last === 1) return 'st';
  if (last === 2) return 'nd';
  if (last === 3) return 'rd';
  return 'th';
}

function monthLongFromAbbrev(abbrev) {
  const m = (abbrev || '').toString().trim().slice(0, 3).toLowerCase();
  if (m === 'jan') return 'January';
  if (m === 'feb') return 'February';
  if (m === 'mar') return 'March';
  if (m === 'apr') return 'April';
  if (m === 'may') return 'May';
  if (m === 'jun') return 'June';
  if (m === 'jul') return 'July';
  if (m === 'aug') return 'August';
  if (m === 'sep') return 'September';
  if (m === 'oct') return 'October';
  if (m === 'nov') return 'November';
  if (m === 'dec') return 'December';
  return null;
}

function formatDateTextLong(dateText) {
  // Expected: "Jan 19" (from admin) — convert to "19th January"
  const s = (dateText || '').toString().trim();
  if (!s) return '';
  const m = s.match(/^([A-Za-z]{3,})\s+(\d{1,2})$/);
  if (!m) return s;
  const month = monthLongFromAbbrev(m[1]);
  const day = parseInt(m[2], 10);
  if (!month || !Number.isFinite(day)) return s;
  return `${day}${ordinalSuffix(day)} ${month}`;
}

function scheduleLineText(item) {
  const day = dayNameLong(item && item.dayName);
  const date = formatDateTextLong(item && item.dateText);
  const status = (item && typeof item.status === 'string' ? item.status.trim().toLowerCase() : 'none') || 'none';

  const zuluTime = item && typeof item.zuluTime === 'string' ? item.zuluTime.trim() : '';
  const originalZulu = item && typeof item.originalZuluTime === 'string' ? item.originalZuluTime.trim() : '';
  const dateKey = (item && typeof item.dateKey === 'string' ? item.dateKey.trim() : '') || '';

  const labelPrefix = `${day}${date ? ` ${date}` : ''}`.trim();

  if (status === 'none') return `🛑 ${labelPrefix}  -  No Stream`;

  if (status === 'cancelled') {
    return `❌ ${labelPrefix}  -  Cancelled`;
  }

  if (status === 'completed') {
    const tp = formatZuluAndUkTimeLine(dateKey, zuluTime, null);
    const timePart = tp.zulu ? ` @ ${tp.zulu}` : '';
    const ukPart = tp.uk ? ` (UK ${tp.uk})` : '';
    return `✅ ${labelPrefix}  -  Completed${timePart}${ukPart}`;
  }

  if (status === 'delayed') {
    const tp = formatZuluAndUkTimeLine(dateKey, zuluTime, originalZulu);
    const timePart = tp.zulu ? ` @ ${tp.zulu}` : '';
    const ukPart = tp.uk ? ` (UK ${tp.uk})` : '';
    return `⏳ ${labelPrefix}  -  Delayed${timePart}${ukPart}`;
  }

  // scheduled
  const tp = formatZuluAndUkTimeLine(dateKey, zuluTime, null);
  const timePart = tp.zulu ? ` @ ${tp.zulu}` : '';
  const ukPart = tp.uk ? ` (UK ${tp.uk})` : '';
  return `📺 ${labelPrefix}  -  Stream${timePart}${ukPart}`;
}

function buildDiscordScheduleText(schedule) {
  const items = Array.isArray(schedule) ? schedule.slice(0, 7) : [];
  if (items.length === 0) return 'Schedule updated.';

  const first = items[0];
  const last = items[items.length - 1];
  const from = formatDateTextLong(first && first.dateText);
  const to = formatDateTextLong(last && last.dateText);
  const headerRange = (from && to) ? `${from}  -->  ${to}` : 'Next 7 days';

  const lines = items.map(scheduleLineText);

  return [
    '---------------------------------------------',
    headerRange,
    '---------------------------------------------',
    '',
    ...lines.map((l) => `  ${l}`),
  ].join('\n');
}

function buildDiscordScheduleFields(schedule) {
  const items = Array.isArray(schedule) ? schedule.slice(0, 7) : [];

  return items.map((item) => {
    const dateKey = (item && typeof item.dateKey === 'string' ? item.dateKey.trim() : '') || '';
    const day = (item && typeof item.dayName === 'string' ? item.dayName.trim() : '') || '—';
    const date = (item && typeof item.dateText === 'string' ? item.dateText.trim() : '') || '—';
    const status = (item && typeof item.status === 'string' ? item.status.trim().toLowerCase() : 'none') || 'none';
    const title = (item && typeof item.streamTitle === 'string' ? item.streamTitle.trim() : '') || '';
    const vodUrl = (item && typeof item.vodUrl === 'string' ? item.vodUrl.trim() : '') || '';

    const zuluTime = item && typeof item.zuluTime === 'string' ? item.zuluTime.trim() : '';
    const originalZulu = item && typeof item.originalZuluTime === 'string' ? item.originalZuluTime.trim() : '';
    const timeText = (item && typeof item.timeText === 'string' ? item.timeText.trim() : '') || '';

    const meta = statusMeta(status);

    const lines = [];
    lines.push(`**${meta.label}**`);

    if (status === 'none') {
      // Keep it short.
    } else {
      const timePair = formatZuluAndUkTimeLine(dateKey, zuluTime, status === 'delayed' ? originalZulu : null);
      if (timePair.zulu) lines.push(`**Zulu:** ${timePair.zulu}`);
      if (timePair.uk) lines.push(`**UK:** ${timePair.uk}`);

      // If we couldn't parse Zulu into a UK conversion, fall back to the human text.
      if (!timePair.zulu && timeText) lines.push(`**Time:** ${timeText}`);
      if (!timePair.zulu && !timeText && status !== 'cancelled') lines.push('**Time:** TBC');
    }

    if (status !== 'none') {
      if (title) lines.push(`**Title:** ${title}`);
      if (status === 'completed' && vodUrl) lines.push(`**VOD:** ${vodUrl}`);
    }

    return {
      name: `${meta.emoji} ${day} ${date}`,
      value: lines.join('\n'),
      inline: false,
    };
  });
}

function buildDiscordScheduleCardFields(schedule) {
  const items = Array.isArray(schedule) ? schedule.slice(0, 7) : [];

  return items.map((item) => {
    const day = (item && typeof item.dayName === 'string' ? item.dayName.trim().toUpperCase() : '') || 'DAY';
    const date = (item && typeof item.dateText === 'string' ? item.dateText.trim() : '') || '';
    const status = (item && typeof item.status === 'string' ? item.status.trim().toLowerCase() : 'none') || 'none';
    const gameLogo = (item && typeof item.gameLogo === 'string' ? item.gameLogo.trim() : '') || '';
    const zuluTime = item && typeof item.zuluTime === 'string' ? item.zuluTime.trim() : '';
    const timeText = (item && typeof item.timeText === 'string' ? item.timeText.trim() : '') || '';
    const streamTitle = (item && typeof item.streamTitle === 'string' ? item.streamTitle.trim() : '') || '';
    const vodUrl = (item && typeof item.vodUrl === 'string' ? item.vodUrl.trim() : '') || '';

    const statusLabel =
      status === 'completed' ? 'COMPLETED'
        : status === 'cancelled' ? 'CANCELLED'
          : status === 'delayed' ? 'DELAYED'
            : status === 'scheduled' ? 'SCHEDULED'
              : '';

    const lines = [];

    if (status === 'none') {
      // Website uses a simple card with dashes.
      lines.push('—');
      lines.push('**No Stream Planned**');
      lines.push('—');
    } else {
      // Website vibe: icon, big main line, small title.
      if (gameLogo && gameLogo !== '-') lines.push(gameLogo);

      const rawMain = (timeText || zuluTime || '').trim();
      let mainLine = rawMain;

      if (status === 'completed') {
        const looksLikeCompleted = !rawMain || /^completed$/i.test(rawMain) || rawMain.toLowerCase().includes('completed');
        mainLine = looksLikeCompleted ? 'Completed' : rawMain;
      }

      if (status === 'cancelled') {
        const looksLikeTime = /\bZulu\b/i.test(rawMain) || /(\d{1,2}:\d{2})(?:\s*(AM|PM))?/i.test(rawMain);
        mainLine = looksLikeTime && rawMain ? `~~${rawMain}~~` : 'Cancelled';
      }

      if (!mainLine) mainLine = 'TBC';
      lines.push(`**${mainLine}**`);

      const title = (streamTitle || 'Stream').trim();
      if (title) {
        const safe = title.length > 42 ? `${title.slice(0, 42)}…` : title;
        lines.push(`_${safe}_`);
      }

      if (status === 'completed' && vodUrl) {
        lines.push(`[✓ Completed - Watch VOD](${vodUrl})`);
      }

      if (status === 'cancelled') {
        lines.push('✖️ Cancelled');
      }

      if (status === 'delayed') {
        lines.push('⏰ Delayed');
      }
    }

    return {
      name: `${statusLabel ? `${statusLabel}\n` : ''}${day}${date ? `\n${date}` : ''}`,
      value: lines.length ? lines.join('\n') : '\u200B',
      inline: true,
    };
  });
}

function buildScheduleScreenshotUrl(env, pageUrl) {
  const template = env && typeof env.SCREENSHOT_URL_TEMPLATE === 'string' ? env.SCREENSHOT_URL_TEMPLATE.trim() : '';
  if (template && template.includes('{url}')) {
    return template.replace('{url}', encodeURIComponent(pageUrl));
  }

  // Default: WordPress mShots (free, no key). Uses the target URL as an encoded path segment.
  // Docs/examples: https://s.wordpress.com/mshots/v1/<encoded_url>?w=1200
  return `https://s.wordpress.com/mshots/v1/${encodeURIComponent(pageUrl)}?w=1200`;
}

function buildDiscordScheduleScreenshotPayload(env) {
  const siteUrl = env && env.SITE_URL;
  const base = (siteUrl || 'https://flyingwithjoel.co.uk').replace(/\/$/, '');

  // Normal clickable link.
  const scheduleUrl = `${base}/pages/schedule.html`;

  // Render URL (used by screenshot service). Cache-bust so screenshots refresh.
  // `render=1` is used by the maintenance gate to avoid redirect.
  const renderUrl = `${scheduleUrl}?render=1&v=${Date.now()}`;
  const screenshotUrl = buildScheduleScreenshotUrl(env, renderUrl);

  return {
    content: '',
    allowed_mentions: { parse: [] },
    embeds: [
      {
        title: '🗓️ 7 Day Schedule',
        url: scheduleUrl,
        description: 'Schedule updated. Screenshot below.',
        image: { url: screenshotUrl },
        color: 0xff8c42,
        footer: { text: 'Flying With Joel' },
        timestamp: new Date().toISOString(),
      },
    ],
  };
}

function buildDiscordSchedulePayload(env, schedule) {
  const siteUrl = env && env.SITE_URL;
  const scheduleUrl = `${(siteUrl || 'https://flyingwithjoel.co.uk').replace(/\/$/, '')}/pages/schedule.html`;

  const styleRaw = env && env.DISCORD_SCHEDULE_STYLE;
  // Default: screenshot of the schedule page.
  const style = (styleRaw || 'screenshot').toString().trim().toLowerCase();

  if (style === 'screenshot' || style === 'screen' || style === 'image') {
    return buildDiscordScheduleScreenshotPayload(env);
  }

  if (style === 'cards') {
    const fields = buildDiscordScheduleCardFields(schedule);
    return {
      content: '',
      allowed_mentions: { parse: [] },
      embeds: [
        {
          title: '🗓️ 7 Day Schedule',
          url: scheduleUrl,
          description: 'Live badge auto-applies when the stream is live (Zulu time).',
          fields,
          color: 0xff8c42,
          footer: { text: 'Flying With Joel' },
          timestamp: new Date().toISOString(),
        },
      ],
    };
  }

  if (style === 'embed') {
    const fields = buildDiscordScheduleFields(schedule);
    return {
      content: '',
      allowed_mentions: { parse: [] },
      embeds: [
        {
          title: '📅 Stream schedule updated',
          url: scheduleUrl,
          description: 'Latest 7-day schedule (Zulu + UK time).',
          fields,
          color: 0xff8c42,
          footer: { text: 'Flying With Joel' },
          timestamp: new Date().toISOString(),
        },
      ],
    };
  }

  // Default: text-style message similar to the screenshot.
  const text = buildDiscordScheduleText(schedule);
  return {
    content: `${text}\n\n${scheduleUrl}`,
    allowed_mentions: { parse: [] },
  };
}

async function postDiscordWebhook(env, schedule) {
  const webhookUrl = env.DISCORD_SCHEDULE_WEBHOOK_URL;
  if (!webhookUrl || typeof webhookUrl !== 'string') return;

  const mention = env.DISCORD_SCHEDULE_MENTION;

  const payload = buildDiscordSchedulePayload(env, schedule);
  if (mention && typeof mention === 'string' && mention.trim()) {
    const m = mention.trim();
    // Never allow @everyone/@here pings or text.
    if (!/^@everyone$/i.test(m) && !/^@here$/i.test(m) && !m.toLowerCase().includes('@everyone') && !m.toLowerCase().includes('@here')) {
      payload.content = payload.content ? `${m}\n${payload.content}` : m;
    }
  }

  // Discord expects JSON; webhook responds 204 on success.
  await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
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

export default {
  async fetch(request, env) {
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
    if (!isSchedule && !isSiteMode) {
      return new Response('Not Found', {
        status: 404,
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
    if (isSiteMode) {
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
          const resp = unauthorizedResponse();
          const headers = new Headers(resp.headers);
          const cors = corsHeadersFor(request);
          for (const [k, v] of Object.entries(cors)) headers.set(k, v);
          return new Response(resp.body, { status: resp.status, headers });
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
          const resp = unauthorizedResponse();
          const headers = new Headers(resp.headers);
          const cors = corsHeadersFor(request);
          for (const [k, v] of Object.entries(cors)) headers.set(k, v);
          return new Response(resp.body, { status: resp.status, headers });
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
        const resp = unauthorizedResponse();
        const headers = new Headers(resp.headers);
        const cors = corsHeadersFor(request);
        for (const [k, v] of Object.entries(cors)) headers.set(k, v);
        return new Response(resp.body, { status: resp.status, headers });
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
        const resp = unauthorizedResponse();
        const headers = new Headers(resp.headers);
        const cors = corsHeadersFor(request);
        for (const [k, v] of Object.entries(cors)) headers.set(k, v);
        return new Response(resp.body, { status: resp.status, headers });
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

      // Only notify Discord if the schedule actually changed.
      const nextRaw = JSON.stringify(body);
      let prevRaw = null;
      try {
        prevRaw = await env.SCHEDULE_KV.get(SCHEDULE_KEY);
      } catch {
        prevRaw = null;
      }

      await env.SCHEDULE_KV.put(SCHEDULE_KEY, nextRaw);

      if (prevRaw !== nextRaw) {
        try {
          await postDiscordWebhook(env, body);
        } catch {
          // Don't fail the save if Discord is down/misconfigured.
        }
      }

      return jsonResponse({ ok: true, notified: prevRaw !== nextRaw }, { headers: corsHeadersFor(request) });
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

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

function isValidEmail(email) {
  return !email || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function buildDiscordMessage(appeal) {
  const submittedAt = new Date().toISOString();
  return {
    content: `New Twitch Ban Appeal from ${appeal.twitchUsername}`,
    embeds: [
      {
        title: 'Twitch Ban Appeal',
        color: 0x9146ff,
        fields: [
          { name: 'Twitch Username', value: appeal.twitchUsername, inline: true },
          { name: 'Discord Username', value: appeal.discordUsername || 'Not provided', inline: true },
          { name: 'Contact Email', value: appeal.contactEmail || 'Not provided', inline: true },
          { name: 'Approximate Ban Date', value: appeal.banDate, inline: true },
          { name: 'Ban Context', value: appeal.banReason, inline: false },
          { name: 'Why It Should Be Reviewed', value: appeal.appealReason, inline: false },
          { name: 'What Will Change Going Forward', value: appeal.futureCommitment, inline: false },
          { name: 'Honesty Confirmed', value: appeal.honestyConfirmed ? 'Yes' : 'No', inline: true },
          { name: 'Submitted', value: submittedAt, inline: true },
        ],
        footer: { text: 'From: flyingwithjoel.co.uk rules page' },
      },
    ],
  };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const cors = corsHeaders(request, env);
    const webhookUrl = String(
      env.TWITCH_BAN_APPEAL_DISCORD_WEBHOOK_URL ||
      env.BAN_APPEALS_DISCORD_WEBHOOK_URL ||
      env.DISCORD_WEBHOOK_URL ||
      ''
    ).trim();

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }

    if (request.method !== 'POST') {
      return jsonResponse({ error: 'Method not allowed' }, { status: 405, headers: cors });
    }

    if (url.pathname !== '/api/twitch-ban-appeal' && url.pathname !== '/api/twitch-ban-appeal/') {
      return jsonResponse({ error: 'Not found' }, { status: 404, headers: cors });
    }

    if (!webhookUrl) {
      return jsonResponse({ error: 'Server not configured. Missing webhook secret.' }, { status: 500, headers: cors });
    }

    let payload;
    try {
      payload = await request.json();
    } catch {
      return jsonResponse({ error: 'Invalid JSON.' }, { status: 400, headers: cors });
    }

    const appeal = {
      website: clampString(payload.website, 50),
      twitchUsername: clampString(payload.twitchUsername, 40),
      discordUsername: clampString(payload.discordUsername, 60),
      banDate: clampString(payload.banDate, 40),
      contactEmail: clampString(payload.contactEmail, 120),
      banReason: clampString(payload.banReason, 1000),
      appealReason: clampString(payload.appealReason, 1200),
      futureCommitment: clampString(payload.futureCommitment, 1000),
      honestyConfirmed: Boolean(payload.honestyConfirmed),
    };

    if (appeal.website) {
      return jsonResponse({ error: 'Submission blocked.' }, { status: 400, headers: cors });
    }

    const required = ['twitchUsername', 'banDate', 'banReason', 'appealReason', 'futureCommitment'];
    for (const field of required) {
      if (!appeal[field]) {
        return jsonResponse({ error: `Missing required field: ${field}` }, { status: 400, headers: cors });
      }
    }

    if (!appeal.honestyConfirmed) {
      return jsonResponse({ error: 'You must confirm the appeal is honest.' }, { status: 400, headers: cors });
    }

    if (!isValidEmail(appeal.contactEmail)) {
      return jsonResponse({ error: 'Please enter a valid email address.' }, { status: 400, headers: cors });
    }

    const forward = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(buildDiscordMessage(appeal)),
    });

    if (!forward.ok) {
      return jsonResponse({ error: 'Upstream delivery failed.' }, { status: 502, headers: cors });
    }

    return jsonResponse({ ok: true }, { status: 200, headers: cors });
  },
};

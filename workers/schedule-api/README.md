# Cloudflare Worker: Schedule API

This Worker provides a simple backend for your GitHub Pages site so `admin.html` can save the 7‑day schedule and `index.html` can load it.

## What it does

- `GET /api/schedule` → returns the saved schedule JSON array (or `[]` if empty)
- `PUT /api/schedule` → saves the schedule JSON array (requires HTTP Basic Auth)
- `GET /api/site-mode` → returns `{ ok?: true, mode: "live"|"maintenance", updatedAtUtc: string|null }`
- `PUT /api/site-mode` → saves `{ mode: "live"|"maintenance" }` (requires HTTP Basic Auth)
- `GET /api/incident-notice` → returns `{ enabled: boolean, title: string|null, message: string|null, updatedAtUtc: string|null }`
- `PUT /api/incident-notice` → saves `{ enabled, title, message }` (requires HTTP Basic Auth)
- `GET /api/schedule/live` → returns `{ ok: true, live: boolean }` based on the channel’s actual Twitch live status (requires Twitch API secrets)
- `GET /api/schedule/followers` → returns `{ ok: true, followers: number }` for the homepage follower card (uses Worker secrets; cached in KV)
- `GET /api/schedule/clips` → returns `{ ok: true, clips: [...] }` for the homepage highlights section (uses Worker secrets; cached in KV)

Your frontend already calls `/api/schedule` as its first choice.

## Cloudflare dashboard setup (no local dev)

1. **Create KV namespace**
   - Workers & Pages → KV → Create
   - Name: `schedule_kv`

2. **Create the Worker**
   - Workers & Pages → **Create application** → **Workers** → **Create Worker**
   - Name it e.g. `schedule-api`
   - Click **Deploy**

3. **Paste the code**
   - Open the Worker → **Edit code**
   - Replace contents with `worker.js`
   - **Save and deploy**

4. **Bind KV**
   - Worker → **Settings** → **Bindings** → **Add** → KV namespace
   - Variable name: `SCHEDULE_KV`
   - Namespace: `schedule_kv`

5. **Add secrets (username/password)**
   - Worker → **Settings** → **Variables**
   - Add **secrets**:
     - `ADMIN_USERNAME` (your chosen username)
     - `ADMIN_PASSWORD` (your chosen password)

6. **(Optional, for LIVE badge) Add Twitch API secrets**
    - Create a Twitch Developer application and grab the Client ID/Secret
    - Worker → **Settings** → **Variables** → add **secrets**:
       - `TWITCH_CLIENT_ID`
       - `TWITCH_CLIENT_SECRET`
    - Optional variable (secret or plain text):
       - `TWITCH_CHANNEL_LOGIN` (defaults to `flyingwithjoel`)

   **Follower count note**
   - The Worker will try to read follower count from Twitch first.
   - Twitch may require a user access token with additional scopes; if you have one, store it as a Worker secret:
     - `TWITCH_FOLLOWERS_ACCESS_TOKEN`
   - If Twitch rejects the request, the Worker falls back to a public provider and still caches results in KV.

8. **Add the route**
   - Worker → **Triggers** → **Routes** → Add route
   - Route: `flyingwithjoel.co.uk/api/schedule*`
   - Zone: `flyingwithjoel.co.uk`

9. **Add the site-mode route**
   - Worker → **Triggers** → **Routes** → Add route
   - Route: `flyingwithjoel.co.uk/api/site-mode*`
   - Zone: `flyingwithjoel.co.uk`

10. **Add the incident-notice route**
    - Worker → **Triggers** → **Routes** → Add route
    - Route: `flyingwithjoel.co.uk/api/incident-notice*`
    - Zone: `flyingwithjoel.co.uk`

## Optional: Discord webhook / Email alerts (recommended)

If you want to be notified *outside the website* when you enable/update/disable the incident notice (e.g., a data breach notice), set these Worker variables:

- Discord (posts to a channel):
   - `INCIDENT_ALERT_DISCORD_WEBHOOK_URL` = your Discord webhook URL
- Email (sends to you):
   - `INCIDENT_ALERT_EMAIL_TO` = your email address

Email sending uses the existing MailChannels config in this Worker:
- `MAILCHANNELS_API_KEY` (or `DSAR_MAILCHANNELS_API_KEY`)
- `EMAIL_FROM` (or `MAIL_FROM` / `DSAR_FROM_EMAIL`)
- Optional: `EMAIL_FROM_NAME`, `EMAIL_REPLY_TO`

Notes:
- Alerts are **best-effort** and will not block saving the incident notice.
- Alerts are only sent when the incident notice actually changes (no-op saves won’t spam you).

8. **Make sure traffic goes through Cloudflare**
   - Cloudflare DNS: your `@` and `www` records should be **Proxied** (orange cloud)

## Testing

- Visit `https://flyingwithjoel.co.uk/api/schedule` → should show `[]` initially.
- Visit `https://flyingwithjoel.co.uk/api/site-mode` → should show `{ "mode": "live", "updatedAtUtc": null }` initially.
- (If Twitch secrets set) Visit `https://flyingwithjoel.co.uk/api/schedule/live` → should show `{ ok: true, live: false }` when offline.
- Visit `https://flyingwithjoel.co.uk/api/schedule/followers` → should show `{ ok: true, followers: <number> }`.
- Visit `https://flyingwithjoel.co.uk/api/schedule/clips?count=2` → should show `{ ok: true, clips: [...] }`.
- Visit `https://flyingwithjoel.co.uk/admin.html`
  - Enter username/password matching the secrets
  - Click **Save schedule**
   - Use **Site Mode** → **Set Maintenance** and refresh `index.html` to confirm redirect
  - Then refresh `/api/schedule` — you should see your saved JSON array.

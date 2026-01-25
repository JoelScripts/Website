# Cloudflare Worker: Schedule API

This Worker provides a simple backend for your GitHub Pages site so `admin.html` can save the 7‑day schedule and `index.html` can load it.

## What it does

- `GET /api/schedule` → returns the saved schedule JSON array (or `[]` if empty)
- `PUT /api/schedule` → saves the schedule JSON array (requires HTTP Basic Auth)
- `GET /api/site-mode` → returns `{ ok?: true, mode: "live"|"maintenance", updatedAtUtc: string|null }`
- `PUT /api/site-mode` → saves `{ mode: "live"|"maintenance" }` (requires HTTP Basic Auth)
- `GET /api/schedule/live` → returns `{ ok: true, live: boolean }` based on the channel’s actual Twitch live status (requires Twitch API secrets)

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

6. **(Optional) Discord notifications on schedule updates**
    - Create a Discord webhook in the channel you want (Server Settings → Integrations → Webhooks)
    - Worker → **Settings** → **Variables** → add **secret**:
       - `DISCORD_SCHEDULE_WEBHOOK_URL`
    - Optional plain-text vars:
       - `DISCORD_SCHEDULE_MENTION` (optional prefix text; `@everyone` / `@here` are blocked)
       - `SITE_URL` (defaults to `https://flyingwithjoel.co.uk`)

7. **(Optional, for LIVE badge) Add Twitch API secrets**
    - Create a Twitch Developer application and grab the Client ID/Secret
    - Worker → **Settings** → **Variables** → add **secrets**:
       - `TWITCH_CLIENT_ID`
       - `TWITCH_CLIENT_SECRET`
    - Optional variable (secret or plain text):
       - `TWITCH_CHANNEL_LOGIN` (defaults to `flyingwithjoel`)

8. **Add the route**
   - Worker → **Triggers** → **Routes** → Add route
   - Route: `flyingwithjoel.co.uk/api/schedule*`
   - Zone: `flyingwithjoel.co.uk`

9. **Add the site-mode route**
   - Worker → **Triggers** → **Routes** → Add route
   - Route: `flyingwithjoel.co.uk/api/site-mode*`
   - Zone: `flyingwithjoel.co.uk`

8. **Make sure traffic goes through Cloudflare**
   - Cloudflare DNS: your `@` and `www` records should be **Proxied** (orange cloud)

## Testing

- Visit `https://flyingwithjoel.co.uk/api/schedule` → should show `[]` initially.
- Visit `https://flyingwithjoel.co.uk/api/site-mode` → should show `{ "mode": "live", "updatedAtUtc": null }` initially.
- (If Twitch secrets set) Visit `https://flyingwithjoel.co.uk/api/schedule/live` → should show `{ ok: true, live: false }` when offline.
- Visit `https://flyingwithjoel.co.uk/admin.html`
  - Enter username/password matching the secrets
  - Click **Save schedule**
   - If `DISCORD_SCHEDULE_WEBHOOK_URL` is set, Discord should receive a “Schedule updated” message
   - Use **Site Mode** → **Set Maintenance** and refresh `index.html` to confirm redirect
  - Then refresh `/api/schedule` — you should see your saved JSON array.

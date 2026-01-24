# Cloudflare Worker: Schedule API

This Worker provides a simple backend for your GitHub Pages site so `admin.html` can save the 7‑day schedule and `index.html` can load it.

## What it does

- `GET /api/schedule` → returns the saved schedule JSON array (or `[]` if empty)
- `PUT /api/schedule` → saves the schedule JSON array (requires HTTP Basic Auth)

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

6. **Add the route**
   - Worker → **Triggers** → **Routes** → Add route
   - Route: `flyingwithjoel.co.uk/api/schedule*`
   - Zone: `flyingwithjoel.co.uk`

7. **Make sure traffic goes through Cloudflare**
   - Cloudflare DNS: your `@` and `www` records should be **Proxied** (orange cloud)

## Testing

- Visit `https://flyingwithjoel.co.uk/api/schedule` → should show `[]` initially.
- Visit `https://flyingwithjoel.co.uk/admin.html`
  - Enter username/password matching the secrets
  - Click **Save schedule**
  - Then refresh `/api/schedule` — you should see your saved JSON array.

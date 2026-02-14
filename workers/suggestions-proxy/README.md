# Suggestions Proxy (Cloudflare Worker)

This Worker receives flight suggestions from the website and forwards them to Discord **without exposing the Discord webhook URL** in client-side code.

## Why
- Stops webhook URL leakage (reduces spam/abuse)
- Allows server-side validation and rate limiting
- Lets you add CAPTCHA (Turnstile) later without changing Discord

## Route (recommended)
Route the Worker to your own domain path:
- `https://flyingwithjoel.co.uk/api/suggestions`

That way the website can `fetch('/api/suggestions')` (same-origin, no CORS headaches).

### Testing before routing (workers.dev)
If you deploy to a `*.workers.dev` URL first, you can test without setting up a domain route by updating the Suggestions page meta tag:

- In [pages/suggestions.html](pages/suggestions.html), set:
	- `<meta name="fwj-suggestions-endpoint" content="https://YOUR-WORKER.YOUR-ACCOUNT.workers.dev/api/suggestions">`

If you do this, you may also need to set `ALLOWED_ORIGINS` to include `https://flyingwithjoel.co.uk`.

## Cloudflare Dashboard setup (click-by-click)
Use this if you are deploying from the Cloudflare Worker page instead of Wrangler CLI.

1. Open **Cloudflare Dashboard** → **Workers & Pages**.
2. Click **Create** → **Create Worker**.
3. Name it (example: `fwj-suggestions-proxy`) and click **Deploy**.
4. Open the Worker and click **Edit code**.
5. Replace default code with [worker.js](worker.js), then **Save and deploy**.
6. Go to **Settings** → **Variables**:
	- Add secret `DISCORD_WEBHOOK_URL` with your Discord webhook value.
	- (Optional) add secret `TURNSTILE_SECRET_KEY`.
	- (Optional) add text variable `ALLOWED_ORIGINS` (comma-separated origins).
7. Go to **Triggers**:
	- Add **Route**: `flyingwithjoel.co.uk/api/suggestions*` and select this Worker.
	- If your site is on `www`, also add `www.flyingwithjoel.co.uk/api/suggestions*`.
8. Ensure DNS for your domain is managed in Cloudflare (orange-cloud proxy on the site host record).
9. Test in browser/devtools:
	- `POST https://flyingwithjoel.co.uk/api/suggestions` should return `200` for valid payload.
	- If it still returns `405`, the route is not attached to this Worker yet.

### Quick temporary test via workers.dev
If custom route is not ready yet:

1. Open your Worker and copy its `*.workers.dev` URL.
2. In [pages/suggestions.html](pages/suggestions.html), set:
	- `<meta name="fwj-suggestions-endpoint" content="https://YOUR-WORKER.YOUR-ACCOUNT.workers.dev/api/suggestions">`
3. Deploy site changes and test a submission.

## Required secrets
- `DISCORD_WEBHOOK_URL` (Discord webhook URL)

Important: do **not** commit your Discord webhook URL into this repository. Store it as a Worker secret.

## Optional
- `SUGGESTIONS_KV` (KV namespace binding) for simple IP rate limiting
- `TURNSTILE_SECRET_KEY` (Cloudflare Turnstile secret) for anti-bot verification
- `ALLOWED_ORIGINS` (comma-separated origins) if you *aren’t* routing on the same domain

## Minimal wrangler config
Create `wrangler.toml` next to `worker.js` (example):

```toml
name = "fwj-suggestions-proxy"
main = "worker.js"
compatibility_date = "2026-01-01"

# Optional if you want a KV-based cooldown
# kv_namespaces = [
#   { binding = "SUGGESTIONS_KV", id = "<KV_ID>" }
# ]
```

Then set secrets:

```bash
wrangler secret put DISCORD_WEBHOOK_URL
# optional
wrangler secret put TURNSTILE_SECRET_KEY
```

Deploy:

```bash
wrangler deploy
```

Finally, configure the route in Cloudflare for your domain:
- Route: `flyingwithjoel.co.uk/api/suggestions*` → this Worker

## Turnstile (optional)
If you set `TURNSTILE_SECRET_KEY`, the Worker expects the client to send a `turnstileToken` field.

The Suggestions page supports this automatically when you provide a Turnstile site key.

### Enable Turnstile on the website
1. Create a Turnstile site in Cloudflare and copy the **site key**.
2. In [pages/suggestions.html](pages/suggestions.html), add this meta tag in the `<head>`:
	- `<meta name="fwj-turnstile-sitekey" content="YOUR_TURNSTILE_SITE_KEY">`
3. Deploy the site changes.

When configured:
- The widget will appear above the submit button.
- The page will send `turnstileToken` with the JSON payload.

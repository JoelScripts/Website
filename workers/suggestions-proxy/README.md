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

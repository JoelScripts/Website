# Clean URL Setup (No `.html` in page URLs)

This site is hosted on **GitHub Pages** behind **Cloudflare**.  
To support professional URLs like `/pages/schedule` (instead of `/pages/schedule.html`), add a Cloudflare URL rewrite rule.

## What this does

- Request: `/pages/schedule`
- Edge rewrite target: `/pages/schedule.html`
- Browser URL stays clean (`/pages/schedule`)

## Cloudflare configuration

In Cloudflare Dashboard:

1. Go to **Rules** → **Transform Rules** → **URL Rewrite Rules**.
2. Create a new rewrite rule (Dynamic).
3. Use this expression:

```txt
(http.host in {"flyingwithjoel.co.uk" "www.flyingwithjoel.co.uk"}
 and not starts_with(http.request.uri.path, "/api/")
 and not starts_with(http.request.uri.path, "/assets/")
 and not starts_with(http.request.uri.path, "/workers/")
 and not starts_with(http.request.uri.path, "/docs/")
 and not starts_with(http.request.uri.path, "/data_requests/")
 and not starts_with(http.request.uri.path, "/.well-known/")
 and http.request.uri.path ne "/"
 and not ends_with(http.request.uri.path, "/")
 and not contains(http.request.uri.path, "."))
```

4. Rewrite **Path** using Dynamic expression:

```txt
concat(http.request.uri.path, ".html")
```

5. Save and deploy the rule.

## Optional redirect rule (old `.html` links → clean URL)

Add a **Redirect Rule** if you want old links to canonicalize:

- Match: paths ending with `.html`
- Redirect to: same path without `.html`
- Status: **301**

Keep root `index.html` handling separate if needed (`/index.html` → `/`).

## Validation checklist

After deployment, verify:

- `/pages/schedule` loads the schedule page
- `/pages/privacy` loads privacy page
- `/pages/setup` loads setup page
- Shared links in Discord/Messenger use clean URLs and still show embeds

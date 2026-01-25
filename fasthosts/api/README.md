# FastHosts Schedule API (PHP)

GitHub Pages is static, so it cannot accept schedule updates.
This folder contains a small PHP endpoint you can upload to your FastHosts web space to provide:

- `GET /api/schedule.php` (public) — returns schedule JSON
- `PUT /api/schedule.php` (protected) — updates schedule JSON (HTTP Basic auth)

It also includes an optional site mode endpoint:

- `GET /api/site_mode.php` (public) — returns `{ "mode": "live"|"maintenance" }`
- `PUT /api/site_mode.php` (protected) — updates site mode (HTTP Basic auth)

## Recommended DNS

Point a subdomain like `api.flyingwithjoel.co.uk` to your FastHosts hosting.
Then the website/admin can call:

- `https://api.flyingwithjoel.co.uk/api/schedule.php`
- `https://api.flyingwithjoel.co.uk/api/site_mode.php`

## Upload

1. Create a folder `api/` on your FastHosts hosting.
2. Upload:
   - `schedule.php`
   - `site_mode.php` (optional)

The script stores the current schedule in `schedule.store.json` alongside it.

## Configure credentials (FastHosts)

Set environment variables if your hosting supports it:

- `SCHEDULE_ADMIN_USERNAME`
- `SCHEDULE_ADMIN_PASSWORD`

For the site mode endpoint you can either reuse the schedule credentials (default), or set separate ones:

- `SITE_MODE_ADMIN_USERNAME`
- `SITE_MODE_ADMIN_PASSWORD`

If your hosting does not support env vars, edit the top of `schedule.php` and set `$ADMIN_USER` and `$ADMIN_PASS`.

## CORS / Origin

By default, the API allows requests from:

- `https://flyingwithjoel.co.uk`
- `https://www.flyingwithjoel.co.uk`

If you need to add more origins, edit `$ALLOWED_ORIGINS`.

## Test

- Visit `https://api.flyingwithjoel.co.uk/api/schedule.php` in a browser — should return JSON.
- Then go to `https://flyingwithjoel.co.uk/admin.html`, enter username/password, and click **Save schedule**.

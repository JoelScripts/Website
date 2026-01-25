// Global maintenance-mode gate.
//
// Best-effort: if the site-mode API is unreachable, we assume "live".
// When mode === "maintenance", redirect to /pages/maintenance.html.
//
// Admin pages are intentionally excluded so you can switch it back.

(function () {
  const pathname = (function () {
    try {
      return (window.location.pathname || '').toLowerCase();
    } catch {
      return '';
    }
  })();

  // Don't redirect the maintenance page itself.
  if (pathname.endsWith('/pages/maintenance.html')) return;

  // Don't lock admins out of the toggle.
  if (pathname.endsWith('/admin.html') || pathname.endsWith('/admin-preview.html')) return;

  const MAINTENANCE_PATH = '/pages/maintenance.html';
  const API_CANDIDATES = [
    '/api/site-mode',
    'https://api.flyingwithjoel.co.uk/api/site_mode.php',
  ];

  function withTimeout(ms) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ms);
    return { controller, clear: () => clearTimeout(timer) };
  }

  async function fetchFirstOkJson(urls, init) {
    for (const url of urls) {
      try {
        const resp = await fetch(url, init);
        if (!resp.ok) continue;
        return await resp.json();
      } catch {
        // try next
      }
    }
    return null;
  }

  (async function () {
    const timeout = withTimeout(1200);
    try {
      const data = await fetchFirstOkJson(API_CANDIDATES, {
        cache: 'no-store',
        signal: timeout.controller.signal,
      });

      const mode = (data && typeof data.mode === 'string' ? data.mode : 'live').toLowerCase();
      if (mode === 'maintenance') {
        window.location.replace(MAINTENANCE_PATH);
      }
    } catch {
      // Default to live.
    } finally {
      timeout.clear();
    }
  })();
})();

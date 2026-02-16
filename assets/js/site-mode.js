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

  function toCleanPath(path) {
    if (!path || !path.endsWith('.html')) return path;
    if (path === '/index.html') return '/';
    return path.slice(0, -5);
  }

  (function normalizeAddressBarUrl() {
    try {
      const cleaned = toCleanPath(pathname);
      if (!cleaned || cleaned === pathname) return;
      const suffix = `${window.location.search || ''}${window.location.hash || ''}`;
      window.history.replaceState(null, '', `${cleaned}${suffix}`);
    } catch {
      // no-op
    }
  })();

  function toCleanHref(rawHref) {
    if (!rawHref) return rawHref;
    const href = String(rawHref).trim();
    if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:') || href.startsWith('javascript:')) {
      return rawHref;
    }

    try {
      const target = new URL(href, window.location.origin);
      if (target.origin !== window.location.origin) return rawHref;

      if (target.pathname === '/index.html') {
        target.pathname = '/';
      } else if (target.pathname.endsWith('.html')) {
        target.pathname = target.pathname.slice(0, -5);
      } else {
        return rawHref;
      }

      return `${target.pathname}${target.search}${target.hash}`;
    } catch {
      return rawHref;
    }
  }

  function normalizeAnchorHrefs() {
    try {
      const anchors = document.querySelectorAll('a[href]');
      for (const anchor of anchors) {
        const rawHref = anchor.getAttribute('href');
        const cleanedHref = toCleanHref(rawHref);
        if (cleanedHref && cleanedHref !== rawHref) {
          anchor.setAttribute('href', cleanedHref);
        }
      }
    } catch {
      // no-op
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', normalizeAnchorHrefs, { once: true });
  } else {
    normalizeAnchorHrefs();
  }

  // Don't redirect the maintenance page itself.
  if (pathname.endsWith('/pages/maintenance.html') || pathname.endsWith('/pages/maintenance')) return;

  // Don't lock admins out of the toggle.
  if (
    pathname.endsWith('/admin.html') ||
    pathname.endsWith('/admin-preview.html') ||
    pathname.endsWith('/admin') ||
    pathname.endsWith('/admin-preview')
  ) {
    return;
  }

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

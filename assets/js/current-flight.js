(function () {
  const FALLBACK_JSON_URL = '/assets/data/current-flight.json';
  const CONSENT_KEY = 'gdpr-consent-accepted';
  const CURRENT_FLIGHT_API_LOCALSTORAGE_KEY = 'fwj_current_flight_api';

  function $(id) {
    return document.getElementById(id);
  }

  function safeText(value) {
    return typeof value === 'string' ? value.trim() : '';
  }

  function looksLikeUrl(value) {
    try {
      const u = new URL(value);
      return u.protocol === 'https:' || u.protocol === 'http:';
    } catch {
      return false;
    }
  }

  function sanitizeApiUrl(raw) {
    const s = (raw || '').toString().trim();
    if (!s) return null;
    if (/^https?:\/\//i.test(s)) return s.replace(/\s+/g, '');
    if (s.startsWith('/')) return s;
    return null;
  }

  function getApiOverride() {
    try {
      const params = new URLSearchParams(window.location.search);
      const qp = sanitizeApiUrl(params.get('currentFlightApi'));
      if (qp) {
        localStorage.setItem(CURRENT_FLIGHT_API_LOCALSTORAGE_KEY, qp);
        return qp;
      }
    } catch {
      // ignore
    }

    try {
      const fromLs = sanitizeApiUrl(localStorage.getItem(CURRENT_FLIGHT_API_LOCALSTORAGE_KEY));
      if (fromLs) return fromLs;
    } catch {
      // ignore
    }

    const meta = document.querySelector('meta[name="current-flight-api"]');
    const metaVal = sanitizeApiUrl(meta ? meta.getAttribute('content') : '');
    return metaVal;
  }

  function getApiCandidates() {
    const override = getApiOverride();
    const candidates = [override, '/api/current-flight', '/api/schedule/current-flight', FALLBACK_JSON_URL].filter(Boolean);
    return Array.from(new Set(candidates));
  }

  async function fetchFirstOkJson(urls) {
    for (const u of urls) {
      try {
        const resp = await fetch(u, { cache: 'no-store' });
        if (!resp.ok) continue;
        return { url: u, data: await resp.json() };
      } catch {
        // try next
      }
    }
    return null;
  }

  function setDataSourceLabel(sourceUrl) {
    const el = $('dataSource');
    if (!el) return;
    el.textContent = safeText(sourceUrl) || 'Unknown';
  }

  function providerLabel(provider) {
    const p = safeText(provider).toLowerCase();
    if (p === 'volanta') return 'Volanta';
    if (p === 'elevatex') return 'ElevateX';
    if (p) return p;
    return 'Tracking';
  }

  function hasConsent() {
    try {
      return localStorage.getItem(CONSENT_KEY) === 'true';
    } catch {
      return false;
    }
  }

  function setStatusPill(status) {
    const pill = $('statusPill');
    if (!pill) return;

    const s = safeText(status).toLowerCase();
    if (s === 'live') {
      pill.className = 'pill ok';
      pill.textContent = 'LIVE';
    } else {
      pill.className = 'pill warn';
      pill.textContent = 'OFFLINE';
    }
  }

  function renderDetails(cfg) {
    const title = $('flightTitle');
    const meta = $('flightMeta');

    const status = safeText(cfg.status) || 'offline';
    setStatusPill(status);

    const prettyTitle = safeText(cfg.title) || (status.toLowerCase() === 'live' ? 'Currently flying' : 'Not flying right now');
    if (title) title.textContent = prettyTitle;

    const bits = [];
    const flightNumber = safeText(cfg.flightNumber);
    const callsign = safeText(cfg.callsign);
    const aircraft = safeText(cfg.aircraft);
    const departure = safeText(cfg.departure);
    const arrival = safeText(cfg.arrival);

    if (flightNumber) bits.push(`Flight: ${flightNumber}`);
    if (callsign) bits.push(`Callsign: ${callsign}`);
    if (aircraft) bits.push(`Aircraft: ${aircraft}`);
    if (departure || arrival) bits.push(`Route: ${departure || '—'} → ${arrival || '—'}`);

    const lastUpdated = safeText(cfg.lastUpdated);
    if (lastUpdated) {
      try {
        const d = new Date(lastUpdated);
        if (Number.isFinite(d.getTime())) {
          bits.push(`Updated: ${d.toLocaleString('en-GB', { timeZone: 'UTC' })} UTC`);
        }
      } catch {
        // ignore
      }
    }

    if (meta) {
      meta.textContent = bits.length ? bits.join(' • ') : 'Update this page by editing /assets/data/current-flight.json';
    }
  }

  function renderTracking(cfg) {
    const trackingUrl = safeText(cfg?.tracking?.url);
    const trackingProvider = safeText(cfg?.tracking?.provider);

    const linkWrap = $('trackingLinkWrap');
    const link = $('trackingLink');
    const embedWrap = $('embedWrap');
    const embedFrame = $('trackingFrame');
    const embedNote = $('embedNote');

    if (!looksLikeUrl(trackingUrl)) {
      if (linkWrap) linkWrap.style.display = 'none';
      if (embedWrap) embedWrap.style.display = 'none';
      if (embedNote) embedNote.textContent = 'No tracking link has been set yet.';
      return;
    }

    if (linkWrap) linkWrap.style.display = 'block';
    if (link) {
      link.href = trackingUrl;
      link.textContent = `Open ${providerLabel(trackingProvider)} tracking`;
    }

    // Only embed after consent: third-party pages may set cookies.
    if (!hasConsent()) {
      if (embedWrap) embedWrap.style.display = 'none';
      if (embedNote) {
        embedNote.innerHTML = 'To embed the tracker here, accept optional resources via <a href="#" id="cookie-settings-link-inline">Cookie Settings</a>. You can still open the tracking link above.';
        const a = document.getElementById('cookie-settings-link-inline');
        a?.addEventListener('click', (e) => {
          e.preventDefault();
          try {
            localStorage.removeItem(CONSENT_KEY);
          } catch {
            // ignore
          }
          const banner = document.getElementById('cookie-consent-banner');
          banner?.classList?.add('show');
          if (banner) banner.style.display = 'flex';
        });
      }
      return;
    }

    if (embedWrap) embedWrap.style.display = 'block';
    if (embedNote) {
      embedNote.textContent = 'If the embed is blank, the provider may block embedding. Use the button above to open it.';
    }
    if (embedFrame) {
      embedFrame.src = trackingUrl;
      embedFrame.title = `${providerLabel(trackingProvider)} tracking`;
    }
  }

  async function loadConfig() {
    const result = await fetchFirstOkJson(getApiCandidates());
    if (!result) throw new Error('Failed to load current flight config.');
    setDataSourceLabel(result.url);
    return result.data;
  }

  function applyQueryParamOverrides(cfg) {
    // Convenience: allow temporary override via URL params.
    // Example: /pages/current-flight.html?trackingUrl=https%3A%2F%2F...
    try {
      const p = new URLSearchParams(window.location.search);
      const trackingUrl = safeText(p.get('trackingUrl'));
      const provider = safeText(p.get('provider'));
      const title = safeText(p.get('title'));
      const status = safeText(p.get('status'));

      if (title) cfg.title = title;
      if (status) cfg.status = status;
      if (provider) {
        cfg.tracking = cfg.tracking || {};
        cfg.tracking.provider = provider;
      }
      if (trackingUrl) {
        cfg.tracking = cfg.tracking || {};
        cfg.tracking.url = trackingUrl;
      }
    } catch {
      // ignore
    }
    return cfg;
  }

  async function run() {
    const err = $('errorBox');
    try {
      const cfg = applyQueryParamOverrides(await loadConfig());
      renderDetails(cfg);
      renderTracking(cfg);
      if (err) err.style.display = 'none';

      // If we ended up on the static fallback, make the reason obvious.
      const sourceEl = $('dataSource');
      const src = safeText(sourceEl ? sourceEl.textContent : '');
      if (src === FALLBACK_JSON_URL && err) {
        err.style.display = 'block';
        err.textContent = 'Using fallback data. The API endpoint is likely not routed to the Worker (or the Worker has not been deployed). Check /pages/status.html.';
      }
    } catch (e) {
      if (err) {
        err.style.display = 'block';
        err.textContent = 'Could not load current flight data. Please try again later.';
      }
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    const hamburger = document.getElementById('hamburger');
    const navLinks = document.getElementById('nav-links');
    hamburger?.addEventListener('click', () => {
      hamburger.classList.toggle('active');
      navLinks.classList.toggle('active');
    });

    // Re-render embed after consent changes.
    window.addEventListener('fwj:consent:granted', () => run());
    run();
  });
})();

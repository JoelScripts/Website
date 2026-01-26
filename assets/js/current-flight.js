(function () {
  const FALLBACK_JSON_URL = '/assets/data/current-flight.json';
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
    const candidates = [override, '/api/schedule/current-flight', '/api/current-flight', FALLBACK_JSON_URL].filter(Boolean);
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

  function providerLabel(provider) {
    const p = safeText(provider).toLowerCase();
    if (p === 'volanta') return 'Volanta';
    if (p === 'elevatex') return 'ElevateX';
    if (p) return p;
    return 'Tracking';
  }

  function setStatusPill(status) {
    const pill = $('statusPill');
    if (!pill) return;

    const raw = safeText(status).toLowerCase();
    const normalized = raw === 'live' ? 'en_route' : raw;
    const map = {
      offline: { cls: 'pill warn', label: 'OFFLINE' },
      on_time: { cls: 'pill ok', label: 'ON TIME' },
      delayed: { cls: 'pill warn', label: 'DELAYED' },
      boarding: { cls: 'pill ok', label: 'BOARDING' },
      en_route: { cls: 'pill ok', label: 'EN ROUTE' },
      arrived: { cls: 'pill ok', label: 'ARRIVED' },
      cancelled: { cls: 'pill bad', label: 'CANCELLED' },
      diverted: { cls: 'pill warn', label: 'DIVERTED' },
    };

    const entry = map[normalized] || map.offline;
    pill.className = entry.cls;
    pill.textContent = entry.label;
  }

  function renderDetails(cfg) {
    const title = $('flightTitle');
    const meta = $('flightMeta');

    const flightNumberEl = $('flightNumber');
    const callsignEl = $('callsign');
    const departureEl = $('departure');
    const arrivalEl = $('arrival');
    const etaEl = $('eta');
    const delayEl = $('delay');

    const status = safeText(cfg.status) || 'offline';
    setStatusPill(status);

    const flightNumber = safeText(cfg.flightNumber);
    const callsign = safeText(cfg.callsign);
    const aircraft = safeText(cfg.aircraft);
    const departure = safeText(cfg.departure);
    const arrival = safeText(cfg.arrival);

    const eta = safeText(cfg.eta);
    const delayMinutesRaw = cfg && Number.isFinite(cfg.delayMinutes) ? cfg.delayMinutes : null;
    const delayMinutes = Number.isFinite(delayMinutesRaw) ? Math.max(0, Math.trunc(delayMinutesRaw)) : null;
    const statusNorm = safeText(cfg.status).toLowerCase();
    const isDelayed = statusNorm === 'delayed' || (delayMinutes !== null && delayMinutes > 0);

    if (flightNumberEl) flightNumberEl.textContent = flightNumber || '—';
    if (callsignEl) callsignEl.textContent = callsign || '—';
    if (departureEl) departureEl.textContent = departure || '—';
    if (arrivalEl) arrivalEl.textContent = arrival || '—';
    if (etaEl) etaEl.textContent = eta || '—';
    if (delayEl) {
      if (!isDelayed) {
        delayEl.textContent = 'No';
      } else if (Number.isFinite(delayMinutes) && delayMinutes > 0) {
        delayEl.textContent = `Yes (+${delayMinutes} min)`;
      } else {
        delayEl.textContent = 'Yes';
      }
    }

    const titleBits = [];
    if (flightNumber) titleBits.push(flightNumber);
    if (callsign) titleBits.push(callsign);
    if (departure || arrival) titleBits.push(`${departure || '—'} → ${arrival || '—'}`);
    const fallbackTitle = status.toLowerCase() === 'offline' ? 'Not flying right now' : 'Current flight';
    const prettyTitle = safeText(cfg.title) || (titleBits.length ? titleBits.join(' • ') : fallbackTitle);
    if (title) title.textContent = prettyTitle;

    const bits = [];
    if (aircraft) bits.push(`Aircraft: ${aircraft}`);

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
      meta.textContent = bits.length ? bits.join(' • ') : ' ';
    }
  }

  function renderTracking(cfg) {
    const trackingUrl = safeText(cfg?.tracking?.url);
    const trackingProvider = safeText(cfg?.tracking?.provider);

    const linkWrap = $('trackingLinkWrap');
    const link = $('trackingLink');

    if (!looksLikeUrl(trackingUrl)) {
      if (linkWrap) linkWrap.style.display = 'none';
      return;
    }

    if (linkWrap) linkWrap.style.display = 'block';
    if (link) {
      link.href = trackingUrl;
      link.textContent = `Open ${providerLabel(trackingProvider)} tracking`;
    }
  }

  async function loadConfig() {
    const result = await fetchFirstOkJson(getApiCandidates());
    if (!result) throw new Error('Failed to load current flight config.');
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

    run();
  });
})();

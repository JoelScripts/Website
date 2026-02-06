document.querySelectorAll('.tab-btn').forEach(button => {
    button.addEventListener('click', () => {
        const tabName = button.getAttribute('data-tab');
        
        // Remove active class from all buttons and content
        document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
        
        // Add active class to clicked button and corresponding content
        button.classList.add('active');
        document.getElementById(tabName).classList.add('active');
    });
});

// ===== Privacy / Consent (GDPR-style) =====
// Notes:
// - We store consent locally (localStorage) and do not send it to a server.
// - Rejecting non-essential items must NOT block access to the site.
const GDPR_CONSENT_KEY = 'gdpr-consent-accepted';

function hasGdprConsent() {
    return localStorage.getItem(GDPR_CONSENT_KEY) === 'true';
}

function loadGoogleFonts() {
    if (document.getElementById('google-fonts-poppins')) return;
    const link = document.createElement('link');
    link.id = 'google-fonts-poppins';
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap';
    document.head.appendChild(link);
}

function unloadGoogleFonts() {
    const link = document.getElementById('google-fonts-poppins');
    if (link && link.parentNode) link.parentNode.removeChild(link);
}

function showCookieBanner(bannerEl) {
    if (!bannerEl) return;
    bannerEl.classList.add('show');
    // Fallback for banners that are not using the .show CSS
    bannerEl.style.display = 'flex';
}

function hideCookieBanner(bannerEl) {
    if (!bannerEl) return;
    bannerEl.classList.remove('show');
    bannerEl.style.display = 'none';
}

// ===== Security Incident Notice Banner =====
// - Reads incident config from /api/incident-notice (Worker) with a FastHosts fallback.
// - Shows a banner near the top of the page when enabled.
// - Dismissal is stored locally and keyed to updatedAtUtc so new updates re-appear.
const INCIDENT_DISMISS_KEY = 'fwj_incident_notice_dismissed_for';

function withTimeout(ms) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ms);
    return { controller, clear: () => clearTimeout(timer) };
}

async function fetchFirstOkJson(urls, init) {
    for (const url of urls) {
        if (!url) continue;
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

function getIncidentNoticeApiCandidates() {
    return [
        '/api/incident-notice',
        'https://api.flyingwithjoel.co.uk/api/incident_notice.php',
    ];
}

function wasIncidentDismissedFor(updatedAtUtc) {
    try {
        const key = (updatedAtUtc || '').toString().trim();
        if (!key) return false;
        return localStorage.getItem(INCIDENT_DISMISS_KEY) === key;
    } catch {
        return false;
    }
}

function setIncidentDismissedFor(updatedAtUtc) {
    try {
        const key = (updatedAtUtc || '').toString().trim();
        if (!key) return;
        localStorage.setItem(INCIDENT_DISMISS_KEY, key);
    } catch {
        // ignore
    }
}

function injectSecurityIncidentBanner(config) {
    const enabled = Boolean(config && config.enabled);
    if (!enabled) return;

    const title = (config && typeof config.title === 'string' ? config.title : '').trim();
    const message = (config && typeof config.message === 'string' ? config.message : '').trim();
    const updatedAtUtc = (config && typeof config.updatedAtUtc === 'string' ? config.updatedAtUtc : '').trim();

    if (!title || !message) return;
    if (updatedAtUtc && wasIncidentDismissedFor(updatedAtUtc)) return;
    if (document.getElementById('security-incident-banner')) return;

    const banner = document.createElement('div');
    banner.id = 'security-incident-banner';
    banner.className = 'security-incident-banner';
    banner.setAttribute('role', 'status');
    banner.setAttribute('aria-live', 'polite');

    const when = updatedAtUtc ? `Last updated: ${updatedAtUtc}` : '';
    banner.innerHTML = `
      <div class="sib-inner">
        <div class="sib-badge">Security incident</div>

        <div class="sib-main">
          <div class="sib-title"></div>
          <p class="sib-text"></p>
          <div class="sib-links">
            <a href="/pages/status.html">View status / incident updates</a>
            <a href="/pages/security.html">Security page</a>
                        <details class="sib-data" id="sib-data">
                            <summary>Request my data / deletion</summary>
                            <div class="sib-data-body">
                                <label class="sib-data-label" for="sib-data-email">Email address</label>
                                <div class="sib-data-row">
                                    <input class="sib-data-email" id="sib-data-email" type="email" inputmode="email" autocomplete="email" placeholder="you@example.com" />
                                    <button type="button" class="sib-data-btn" data-action="access">Email my data</button>
                                    <button type="button" class="sib-data-btn sib-data-danger" data-action="delete">Delete my data</button>
                                </div>
                                <div class="sib-data-hint">We’ll email a confirmation link first (to verify you control the address).</div>
                                <div class="sib-data-status" id="sib-data-status" aria-live="polite"></div>
                            </div>
                        </details>
          </div>
        </div>

        <div class="sib-actions">
          <button type="button" class="sib-dismiss" id="sib-dismiss">Dismiss</button>
        </div>
      </div>
    `;

    const titleEl = banner.querySelector('.sib-title');
    const textEl = banner.querySelector('.sib-text');
    if (titleEl) titleEl.textContent = title;
    if (textEl) {
        textEl.textContent = message;
        if (when) {
            const meta = document.createElement('span');
            meta.className = 'sib-meta';
            meta.textContent = ` ${when}`;
            textEl.appendChild(meta);
        }
    }

    const dismissBtn = banner.querySelector('#sib-dismiss');
    dismissBtn?.addEventListener('click', () => {
        if (updatedAtUtc) setIncidentDismissedFor(updatedAtUtc);
        banner.style.display = 'none';
    });

    const statusEl = banner.querySelector('#sib-data-status');
    const emailEl = banner.querySelector('#sib-data-email');

    async function submitDataRequest(action) {
        const email = (emailEl && typeof emailEl.value === 'string' ? emailEl.value : '').trim();
        if (statusEl) statusEl.textContent = '';
        if (!email) {
            if (statusEl) statusEl.textContent = 'Enter your email address first.';
            return;
        }

        const btns = banner.querySelectorAll('.sib-data-btn');
        btns.forEach((b) => { try { b.disabled = true; } catch {} });

        function disableFor(seconds) {
            const s = Number.isFinite(seconds) ? Math.max(1, Math.min(600, Math.trunc(seconds))) : null;
            if (!s) return;
            let remaining = s;
            if (statusEl) statusEl.textContent = `Too many requests. Please wait ${remaining}s.`;
            const timer = setInterval(() => {
                remaining -= 1;
                if (remaining <= 0) {
                    clearInterval(timer);
                    btns.forEach((b) => { try { b.disabled = false; } catch {} });
                    if (statusEl) statusEl.textContent = '';
                    return;
                }
                if (statusEl) statusEl.textContent = `Too many requests. Please wait ${remaining}s.`;
            }, 1000);
        }

        try {
            const resp = await fetch('/api/data-requests', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ email, action }),
            });
            const json = await resp.json().catch(() => null);
            if (resp.ok) {
                if (statusEl) statusEl.textContent = (json && json.message) ? json.message : 'Check your inbox for the confirmation link.';
            } else if (resp.status === 429) {
                const hdr = resp.headers ? resp.headers.get('retry-after') : null;
                const fromHdr = hdr ? parseInt(hdr, 10) : NaN;
                const fromJson = (json && typeof json.retryAfterSeconds === 'number') ? json.retryAfterSeconds : NaN;
                const seconds = Number.isFinite(fromJson) ? fromJson : (Number.isFinite(fromHdr) ? fromHdr : 120);
                disableFor(seconds);
                return;
            } else {
                if (statusEl) statusEl.textContent = (json && json.error) ? json.error : 'Request failed. Please try again.';
            }
        } catch {
            if (statusEl) statusEl.textContent = 'Request failed. Please try again.';
        } finally {
            // Buttons are re-enabled here unless we hit rate-limit (handled above).
            btns.forEach((b) => { try { b.disabled = false; } catch {} });
        }
    }

    banner.querySelectorAll('.sib-data-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
            const action = (btn.getAttribute('data-action') || '').toLowerCase();
            if (action !== 'access' && action !== 'delete') return;
            submitDataRequest(action);
        });
    });

    const nav = document.querySelector('.navbar');
    if (nav && nav.parentNode) {
        // Place right under the main nav so it stays visible.
        nav.insertAdjacentElement('afterend', banner);
    } else {
        document.body.insertBefore(banner, document.body.firstChild);
    }
}

async function loadSecurityIncidentBanner() {
    const timeout = withTimeout(1200);
    try {
        const config = await fetchFirstOkJson(getIncidentNoticeApiCandidates(), {
            cache: 'no-store',
            signal: timeout.controller.signal,
        });
        if (!config) return;
        injectSecurityIncidentBanner(config);
    } catch {
        // Best-effort only; ignore.
    } finally {
        timeout.clear();
    }
}

document.addEventListener('DOMContentLoaded', () => {
    // Security: prevent reverse-tabnabbing on external links opened in a new tab.
    document.querySelectorAll('a[target="_blank"]').forEach((a) => {
        const rel = (a.getAttribute('rel') || '').toLowerCase();
        if (!rel.includes('noopener')) {
            a.setAttribute('rel', 'noopener noreferrer');
        }
    });

    const banner = document.getElementById('cookie-consent-banner');
    if (!banner) return;

    // Support multiple ID variants used across pages.
    const acceptBtn = document.getElementById('cookie-accept-btn') || document.getElementById('cookie-accept');
    const rejectBtn = document.getElementById('cookie-reject-btn') || document.getElementById('cookie-decline');

    const consentChoice = localStorage.getItem(GDPR_CONSENT_KEY);
    if (consentChoice === null) {
        showCookieBanner(banner);
    } else {
        hideCookieBanner(banner);
    }

    if (acceptBtn) {
        acceptBtn.addEventListener('click', () => {
            localStorage.setItem(GDPR_CONSENT_KEY, 'true');
            hideCookieBanner(banner);
            loadGoogleFonts();
            window.dispatchEvent(new CustomEvent('fwj:consent:granted'));
        });
    }

    if (rejectBtn) {
        rejectBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            localStorage.setItem(GDPR_CONSENT_KEY, 'false');
            hideCookieBanner(banner);
            unloadGoogleFonts();
            window.dispatchEvent(new CustomEvent('fwj:consent:rejected'));
        });
    }

    // Optional link used on some pages to reopen consent.
    const cookieSettingsLink = document.getElementById('cookie-settings-link');
    if (cookieSettingsLink) {
        cookieSettingsLink.addEventListener('click', (e) => {
            e.preventDefault();
            localStorage.removeItem(GDPR_CONSENT_KEY);
            showCookieBanner(banner);
        });
    }

    // If consent was already granted, we can load non-essential cosmetics (fonts).
    if (hasGdprConsent()) {
        loadGoogleFonts();
    }

    // Best-effort: load incident banner for all pages that include main.js
    loadSecurityIncidentBanner();

    // If consent is withdrawn elsewhere (e.g., user reopens banner via Cookie Settings),
    // ensure optional resources can be disabled without a full reload.
    window.addEventListener('fwj:consent:rejected', () => {
        unloadGoogleFonts();
    });
});


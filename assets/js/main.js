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

document.addEventListener('DOMContentLoaded', () => {
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
});


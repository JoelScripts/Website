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

// Terms of Service Enforcement - Redirect new users to terms page
document.addEventListener('DOMContentLoaded', () => {
    // Pages that don't require terms acceptance
    const whitelistedPages = ['index.html', 'terms.html', 'access_denied.html', 'privacy.html', 'cookies.html', 'security.html'];
    
    // Get current page filename
    const currentPage = window.location.pathname.split('/').pop() || 'index.html';
    
    // Check if current page is whitelisted
    const isWhitelisted = whitelistedPages.some(page => currentPage.includes(page));
    
    // Check if user has accepted terms
    const termsAccepted = localStorage.getItem('termsAccepted');
    
    // If not accepted and not on whitelisted page, redirect to terms
    if (!termsAccepted && !isWhitelisted) {
        window.location.href = 'terms.html';
    }
});

// Cookie Consent Banner
document.addEventListener('DOMContentLoaded', () => {
    const cookieBanner = document.getElementById('cookie-consent-banner');
    const acceptBtn = document.getElementById('cookie-accept-btn');
    const declineBtn = document.getElementById('cookie-reject-btn');
    
    if (!cookieBanner) return;

    // Check if user has already made a choice
    const cookieConsent = localStorage.getItem('cookieConsent');
    
    if (!cookieConsent) {
        // Show banner if no consent decision has been made
        cookieBanner.style.display = 'block';
    }

    // Handle Accept Button
    if (acceptBtn) {
        acceptBtn.addEventListener('click', () => {
            localStorage.setItem('cookieConsent', 'accepted');
            cookieBanner.style.display = 'none';
            // Enable any tracking or non-essential features here if needed
        });
    }

    // Handle Decline Button
    if (declineBtn) {
        declineBtn.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            localStorage.setItem('cookieConsent', 'declined');
            localStorage.setItem('termsDeclined', 'true');
            localStorage.removeItem('termsAccepted');
            setTimeout(function() {
                window.location.href = 'pages/access_denied.html';
            }, 100);
        });
    }
});


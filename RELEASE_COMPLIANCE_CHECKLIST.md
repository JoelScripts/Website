# Release Compliance Checklist (UK/EU, Practical)

Use this **before every deploy** (or when you change embeds, scripts, forms, or policies). This is a best‑effort operational checklist, not legal advice.

## A) Changes & data map (5 minutes)
- [ ] List what changed in this release (pages, scripts, embeds, third parties).
- [ ] If you added/removed any third party (YouTube/Twitch/Giphy/fonts/analytics): update relevant policy text to match reality.

## B) Consent + PECR/ePrivacy checks (10 minutes)
**Goal:** no non-essential third-party requests before consent.
- [ ] Hard refresh with DevTools open (Incognito/Private window).
- [ ] In **Network**, confirm no optional third-party domains load before consent.
- [ ] Click **Reject**: confirm optional embeds stay blocked and optional preferences are cleared.
- [ ] Click **Accept**: confirm optional embeds load only after acceptance.
- [ ] Confirm there is an easy “change mind later” path (cookie/privacy settings link).

## C) Privacy/Cookies/Terms accuracy (10 minutes)
- [ ] Policies describe what you actually collect and where it lives (static site: mostly email + Discord + third parties).
- [ ] Policies do not make absolute promises you can’t verify (e.g., “100% compliant”, “we never collect…”, “no tracking ever”).
- [ ] Contact method is correct (email/handle) and response wording is “aim to” rather than guaranteed deadlines unless you can meet them.

## D) Third parties & international transfers (5 minutes)
- [ ] Third-party list is current (embeds, CDNs, suggestions proxy, hosting).
- [ ] Any transfer language is accurate and provider-dependent (don’t promise adequacy/certification unless verified).

## E) Security hygiene (5 minutes)
- [ ] No secrets in the repo (search for “webhook”, “token”, “secret”, “api_key”).
- [ ] Suggestions submissions do not expose a Discord webhook in client code.
- [ ] Worker/proxy secrets are stored only in the platform secret store.
- [ ] Admin accounts (email/Discord/Cloudflare/GitHub) have 2FA enabled.

## F) DSAR readiness (quarterly + when processes change)
- [ ] You can run the DSAR packet script and produce a complete folder.
- [ ] You know where to search for user data (email + Discord are primary).
- [ ] You can redact third-party personal data in threads where needed.
- [ ] You have a secure delivery method (password-protected ZIP; password sent separately).

## G) Final quick regression (2 minutes)
- [ ] Open homepage + key pages (privacy, cookies, terms, suggestions, security) and confirm no broken links.
- [ ] Confirm Suggestions form still submits successfully (via proxy endpoint).

---

### References (internal)
- docs/UK_EU_COMPLIANCE_PLAYBOOK.md
- docs/DATA_ACCESS_REQUEST_PROCEDURE.md

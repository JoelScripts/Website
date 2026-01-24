# UK/EU Compliance Playbook (Practical, Best‑Effort)
**Last Updated:** January 24, 2026

This is an operational checklist for a small, mostly-UK website that sometimes serves EU and rarely global visitors.
It is **not legal advice**. Treat it as a repeatable process to reduce risk and stay accurate.

---

## 1) Know your footprint (do this first)
Create a simple inventory table (even in a text file):
- **Data source**: email, Discord (Suggestions), hosting/CDN logs, contact forms, embeds (YouTube/Twitch/Giphy), fonts/CDNs
- **What data**: name/handle/email/message content/metadata
- **Purpose**: support, suggestions, moderation, site functionality
- **Recipients**: which third parties receive data
- **Location/transfers**: UK/EU/US etc (provider-dependent)
- **Retention**: how long you keep it and why

This is your mini **RoPA** (record of processing). Even if you’re not strictly required to keep a formal RoPA, it’s the foundation for everything else.

---

## 2) UK GDPR / EU GDPR (personal data rules)
For each purpose, set a lawful basis:
- **Consent**: typically for non-essential cookies/trackers and optional third-party embeds
- **Legitimate interests**: typical for basic site ops and handling inbound messages (document your balancing reasoning briefly)
- **Legal obligation**: only if you actually have one (e.g., accounting)

Also ensure you cover:
- **Transparency**: privacy notice matches reality (no absolutes you can’t prove)
- **Rights**: access/erasure/objection etc with a procedure you can run
- **Security**: 2FA on email/Discord; keep secrets out of the repo; least privilege
- **Retention**: defined, written down, followed

---

## 3) PECR / ePrivacy (cookies + similar tech)
UK’s PECR (and EU ePrivacy rules) are where most small sites get tripped up.

Checklist:
- Block **non-essential** scripts/requests until consent (analytics/ads/optional embeds)
- Offer **Accept** and **Reject** with equal prominence
- Make it easy to change mind later (“Cookie settings” / “Privacy settings”)
- Don’t describe localStorage as if you can export it server-side (you can’t)

---

## 4) Third parties (the practical risk area)
You need to know what loads and when.

Checklist:
- List every third party called by the site (including embeds/CDNs)
- Confirm each provider’s role (controller/processor) and terms
- Document international transfers and safeguards (provider-dependent)
- Keep your policies aligned with the current list

---

## 5) DSAR (data access) procedure (runbook)
You already have DSAR tooling and a procedure; make it operational:
- Verify identity (reasonable steps; don’t over-collect)
- Search all your real sources (email + Discord are the big ones)
- Redact other people’s personal data where needed
- Deliver securely (password-protected ZIP; password via separate channel)
- Log what you did (dates, scope, what you included/excluded)

Recommended practice: run a quarterly “dry run” using the example packet folder.

---

## 6) Ongoing schedule (what to do and when)
**Every release (when code/content changes):**
- Re-check Network tab on a fresh visit: no optional third parties load pre-consent
- Update privacy/cookies pages if third parties changed
- Confirm no secrets/keys are in the repo

**Monthly:**
- Review vendor list and any new embeds/integrations
- Review Suggestions proxy/worker config and rate limits

**Quarterly:**
- Do a DSAR dry run (time yourself)
- Spot-check retention: delete old suggestions/emails per your policy

**Annually:**
- Full policy review (language accuracy, contacts, rights)
- Re-check international transfer language (provider terms change)

---

## 7) If you sometimes serve the EU
Add these habits:
- Keep your notices general enough to cover UK+EU without contradictions
- Avoid claiming a single regulator; you can mention **ICO (UK)** while acknowledging EU visitors may have their local authority
- Be conservative with optional embeds/trackers (consent gating matters)

---

## 8) If you rarely serve global visitors
Don’t promise compliance with every country’s laws. Instead:
- Keep practices privacy-minimizing and transparent
- Avoid targeted advertising/complex profiling unless you’re ready for heavier compliance
- Keep a clear contact route for requests/complaints

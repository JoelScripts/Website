# Data Access Request Procedure
**Flying With Joel Website**  
**Last Updated:** January 23, 2026

---

## Quick Overview

When someone requests their personal data (GDPR Article 15 / CCPA §1798.100), you must:
1. Verify their identity
2. Locate their data
3. Compile it in a portable format
4. Send it to them securely
5. Complete within **30 days** (GDPR) or **45 days** (CCPA)

---

## Step-by-Step Process

### STEP 1: Receive & Verify the Request ✅

**How requests come in:**
- Email to flywithjoeluk@gmail.com
- Contact form on website
- Direct message

**What to do:**
```
1. Confirm receipt within 24 hours
2. Ask for their full name and email address used
3. Verify they own the email address (ask them to reply from it)
4. Document the request date (start of 30-day clock)
```

**Template Response:**
```
Subject: Data Access Request Received

Hello [Name],

Thank you for your data access request. We're committed to honoring your rights.

To proceed, please confirm:
1. Your full name
2. The email address associated with any contact form submissions
3. Approximate date(s) you may have submitted information

We'll compile and send your data within 30 days.

Best regards,
Joel
Flying With Joel
```

---

### STEP 2: Locate Their Data 📍

**Check these locations:**

#### A. Email (Contact Form Submissions)
```
Location: flywithjoeluk@gmail.com inbox
Search: Use email search function
  - Search by sender email address
  - Search by name they provided
  - Check "Spam" and "Archive" folders
```

#### B. Server Logs
```
Location: GitHub Pages (3rd party)
Note: You have limited control here
Action: Document that server logs exist but are:
  - Automatically purged after 30-90 days
  - Not personally identifiable
  - IP addresses only (not linked to name)
```

#### C. Browser Storage
```
Location: Their device only (localStorage)
Note: You cannot access this
Action: Include note that consent preference stored on their device is within their control
```

#### D. No Other Storage
```
✓ No databases
✓ No analytics profiles
✓ No marketing lists
✓ No payment information
✓ No cookies with personal data
```

---

### STEP 3: Compile the Data 📋

**Create a document with all their information:**

**Format:** Use a simple table or list format

**Template:**

```
DATA ACCESS REPORT
==================
Requested By: [Their Name]
Request Date: [Date]
Data Compiled: [Today's Date]

1. CONTACT FORM SUBMISSIONS
---------------------------
Number of submissions: [X]

Submission #1:
  Date: [MM/DD/YYYY HH:MM]
  Name: [As provided]
  Email: [As provided]
  Message: [Full text]
  Status: [Pending response / Responded on XX/XX/XXXX]

Submission #2:
  [Repeat format]

2. BROWSER DATA
---------------
Consent Preference: [Stored in their browser]
  Storage: localStorage (client-side only)
  Control: User can delete anytime via browser settings
  Note: This data is on YOUR device, not our servers

3. SERVER LOGS
--------------
Existence: Yes
Contents: IP addresses, browser type, timestamps
Duration: Automatically deleted after 30-90 days
Personal Identifier: Not linked to your name
Accessibility: Limited - managed by GitHub Pages

4. THIRD-PARTY DATA
-------------------
Google Fonts:
  - IP address and browser type may be collected
  - Review Google's privacy policy: https://policies.google.com/privacy

Twitch Integration:
  - Interaction data with embedded streams
  - Review Twitch privacy policy: https://www.twitch.tv/p/legal/privacy-notice/

5. DATA NOT COLLECTED
---------------------
✓ No analytics profiles
✓ No behavioral tracking
✓ No marketing data
✓ No payment information
✓ No cookies with personal data
✓ No cross-site tracking

6. YOUR RIGHTS
--------------
You can:
- Request corrections to inaccurate data
- Request deletion of your data (Right to Erasure)
- Withdraw consent at any time
- File a complaint with your data protection authority

Contact: flywithjoeluk@gmail.com
```

---

### STEP 4: Send the Data Securely 🔒

**Best Methods (in order of preference):**

#### Option A: Email (Simple Cases)
```
✓ Use HTTPS (Gmail, Outlook, etc. have it)
✓ Subject: "Your Data Access Request - [Their Name]"
✓ Attach the data document
✓ Keep it as plain text or PDF (not executable files)

Security tip: Don't use fancy formatting that might
trigger spam filters. Use plain text when possible.
```

#### Option B: Password-Protected ZIP (Sensitive Cases)
```
1. Create a ZIP file with the data
2. Encrypt it with a strong password
3. Email the ZIP separately with password in different email
   Example:
   - Email 1: Contains ZIP file
   - Email 2 (5 minutes later): Contains password

This prevents interception of both together.
```

#### Option C: Secure File Transfer Service
```
Services like:
- ProtonMail (encrypted email)
- Firefox Send (temporary secure file sharing)
- Sync.com (encrypted file transfer)

Less necessary for non-sensitive data, but adds
extra protection for multiple submissions.
```

**Sample Email to Send:**

```
Subject: Your Data Access Request - Complete

Hello [Name],

Attached is your complete personal data as requested.

WHAT'S INCLUDED:
- Contact form submissions: [X] found
- Browser preferences: Listed (stored on your device)
- Server logs: Referenced (not personally identifiable)
- Third-party data: Information on how to access

WHAT'S NOT INCLUDED:
- Analytics data (we don't collect it)
- Behavioral tracking (we don't do it)
- Marketing profiles (we don't maintain them)

YOUR NEXT STEPS:
If you want to:
- Correct information: Reply to this email
- Delete your data: Send a deletion request
- Withdraw consent: Let us know anytime

We appreciate your visit and respect your privacy.

Questions? Reply to this email.

Best regards,
Joel
Flying With Joel
flywithjoeluk@gmail.com
```

---

### STEP 5: Document Everything 📝

**Keep a record:**

```
Date Request Received: ________________
Requester Name: ________________
Requester Email: ________________
Verification Method: ________________
Data Compiled By: ________________ Date: ________
Data Sent Date: ________________
Sent Via: __________ (email/service/method)
Confirmation of Receipt: Yes / No / Awaiting
Additional Notes:
_________________________________________________
_________________________________________________
```

---

## Important Legal Notes ⚖️

### Timeline Requirements
- **GDPR:** Must respond within 30 days (extendable to 90 days for complex cases)
- **CCPA:** Must respond within 45 days
- **Your situation:** Easy (minimal data = quick response)

### Verification
- Must verify the person is who they claim to be
- Email reply from associated address is usually sufficient
- Can ask for additional proof (ID) if needed

### Fees
- **GDPR:** Free (must not charge)
- **CCPA:** Can charge reasonable fee if requests excessive/frivolous
- **Your approach:** Keep it free (easier and more ethical)

### Burden of Proof
- You don't need to find data you don't have
- Be honest: "We don't collect that"
- Reference your privacy policy

---

## Special Cases

### Case 1: They Provide Wrong Email
```
Person: "I used a different email address"
Action: Ask them what email they actually used
Ask: "What email was visible when you filled out the form?"
Search: Try variations (Gmail aliases, different address, etc.)
If not found: Document the search attempt
Respond: "We searched but found no data from this email"
```

### Case 2: Data Older Than 2 Years
```
Your policy: 2-year retention
Person: "I submitted something 3 years ago"
Action: Explain 2-year limit in privacy policy
Respond: "We delete contact data after 2 years.
         Your data was deleted on [approximate date]."
Document: When you believe it was deleted
```

### Case 3: Multiple Submissions
```
Action: List each submission separately with dates
Include: All metadata (timestamp, IP not needed if not
         personally identifiable)
Format: Chronological order
Note: How many total submissions you found
```

### Case 4: Legal Representative
```
Person: "I'm requesting data for someone else"
Verification: Request
  1. Written authorization from the person
  2. Proof of legal authority (Power of Attorney, etc.)
  3. Copy of ID of the requester
Action: Only then provide the data
```

---

## Checklist for Each Request

```
☐ Request received and logged
☐ Identity verified (email confirmed)
☐ 30-day countdown started
☐ Email searched for submissions
☐ All submissions found and compiled
☐ Server logs documented
☐ Browser data noted
☐ Third-party policies referenced
☐ Data compiled in clear format
☐ Document created and reviewed
☐ Sent via secure method
☐ Receipt confirmed (if possible)
☐ All documentation filed
☐ Timeline checked: ___/30 days used
```

---

## What They Can't Request (You Don't Have)

```
❌ Purchase history (no store)
❌ Payment information (no payments collected)
❌ Browsing history (no analytics)
❌ Profile data (no accounts/profiles)
❌ Behavioral tracking (no trackers)
❌ Marketing preferences (no lists)
❌ Health data (not applicable)
❌ Biometric data (not applicable)
```

---

## Common Questions They'll Ask

### Q: "Can I get my data in a machine-readable format?"
```
A: Absolutely. You have a "Right to Data Portability"

What to do:
- Provide data as CSV, JSON, or plain text
- Structure it clearly with column headers
- Make it easy to import elsewhere
- No special software needed to open it
```

### Q: "Can I delete my data?"
```
A: Yes, you have the "Right to Erasure"

What to do:
1. Confirm deletion request in writing
2. Delete from your email
3. Confirm deletion completed
4. Send confirmation email

Exception: May retain for legal obligations
(e.g., if they received customer service)
```

### Q: "How do I know you deleted it?"
```
A: Send a confirmation email:

"Your data has been permanently deleted from our
systems as of [date]. We retain no copies or backups.
Your deletion cannot be undone."
```

### Q: "What about backups?"
```
A: Be honest about your backup situation

If you use backups:
"Contact data may be retained in backups for
[timeframe], after which it is purged."

GitHub Pages: They handle backups (not your control)
```

---

## Record Keeping

**Keep for 3 years:**
- Date of request
- Identity verification documents
- Data provided
- Date of response
- Confirmation of receipt
- Any follow-up communications

**Why:** In case of disputes or audits

---

## If They're Not Happy

### If They Say You Missed Data
```
Action: 
1. Search again thoroughly
2. Check all locations again
3. If truly missing, apologize and provide it
4. If truly doesn't exist, explain why
5. Offer to set reminder for deletion date
```

### If They Say Response Too Slow
```
Note: 30 days is the legal requirement
If within 30 days: You're compliant
If past 30 days: Apologize, provide immediately, explain delay
```

### If They Want to Escalate
```
Their right: File complaint with data protection authority
Examples:
- EU: National Data Protection Authority
- UK: Information Commissioner's Office (ICO)
- CA: California Attorney General
- US: Federal Trade Commission (FTC)

You: Cooperate fully with any investigation
```

---

## Your Advantages

**Why this is easy for you:**

1. **Minimal data** = Quick to compile
2. **No analytics** = No complex tracking data
3. **Email storage** = Easy to search
4. **No databases** = Nothing to query
5. **Clear retention** = Easy to explain
6. **Transparent practices** = Nothing to hide

**Estimated time per request:** 30 minutes to 1 hour

---

## Sample Email Responses (Copy & Paste)

### Response to Request (Day 1)
```
Subject: Data Access Request Received - We'll Help

Hello [Name],

Thank you for requesting your personal data. We take 
your privacy rights seriously and will have everything 
compiled for you within 30 days.

Please reply to this email confirming:
1. Your full name
2. The email address you used
3. Approximate date(s) of submission

We'll be in touch very soon.

Best,
Joel
Flying With Joel
```

### Response with Data (Within 30 days)
```
Subject: Your Personal Data - Data Access Request Complete

Hello [Name],

Attached is your complete personal data as of today's date.

SUMMARY:
- Contact form submissions: [X] found
- Submission dates: [List]
- Data compilation date: [Today]

NEXT STEPS:
You have the right to:
☐ Correct inaccurate data
☐ Request permanent deletion
☐ Receive data in portable format
☐ Withdraw consent anytime

Reply to this email with any questions or requests.

Best regards,
Joel
Flying With Joel
```

### Deletion Confirmation
```
Subject: Data Deletion Confirmation

Hello [Name],

Your personal data has been permanently deleted from 
our systems as of [date].

WHAT WAS DELETED:
- [List each item]

WHAT REMAINS:
- Server logs (auto-purged by GitHub Pages)
- Consent preference data (in your browser, not our servers)

This deletion is permanent and cannot be undone.

Best regards,
Joel
Flying With Joel
```

---

## Final Checklist

Before responding to ANY data request:

- ✅ Verify identity
- ✅ Log the request
- ✅ Search all locations
- ✅ Compile completely
- ✅ Use secure delivery
- ✅ Keep documentation
- ✅ Stay within 30 days
- ✅ Be thorough and honest

---

**Questions?** Refer to your Privacy Policy or consult with a privacy professional.

**Legal Note:** This is guidance, not legal advice. Consult a lawyer for complex cases.

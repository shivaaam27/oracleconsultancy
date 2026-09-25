# Email "send as the director/manager, not admin" — status (Sept 2026)

**Owner-named pick-up point: "emailwork" (2026-06-17).**

## The problem
Portal director/manager reminder emails go out as e.g. `OC Director's Office
<admin@oracle.co.tz>` with Reply-To = the sender's own email. The owner wants the
mail to genuinely come **from the director's/manager's own `@oracle.co.tz`
address**, not admin.

## Why it's not just a code edit
Sending runs through **Gmail SMTP** (the single `admin@oracle.co.tz` Google
Workspace mailbox — `GMAIL_USER` + `GMAIL_APP_PASSWORD` in env; `getEmailConfig()`
in `src/lib/settings.ts` prefers SMTP whenever those exist). Gmail will
**rewrite/reject** a From that isn't the authenticated mailbox, so you cannot send
"as jane@oracle.co.tz" through admin's login. Directors/managers DO have real
`@oracle.co.tz` mailboxes.

## What is on master: the `fromAddress` override (inert on Gmail)
An optional per-send `fromAddress` is plumbed end to end and **honoured only on
the Resend provider** (ignored on Gmail SMTP, so nothing changes today):
- `src/lib/email/send.ts` — `SendEmailInput.fromAddress`; `sendViaResend` uses
  `input.fromAddress?.trim() || cfg.fromAddress`. The SMTP path keeps the admin
  address.
- `src/lib/reminders.ts` — `ReminderSender.fromAddress` passed into `sendEmail`.
- `src/app/portal/actions.ts` — `portalSendReminderEmail` passes
  `sender: { replyTo: me.email, fromAddress: me.email, … }`.
- Display name stays the office label (e.g. "OC Director's Office"); only the
  ADDRESS would become the sender's. Reply-To unchanged.

### To make it live via Resend (owner's one-time setup, NOT done)
1. Resend account → API key (`re_…`).
2. Resend → Domains → add `oracle.co.tz` → add the DNS records (sending TXT/MX +
   DKIM + DMARC) → Verify.
3. Vercel env: **add** `RESEND_API_KEY`; **remove** `GMAIL_USER` +
   `GMAIL_APP_PASSWORD` (code prefers Gmail while they exist). Redeploy.
4. Test via Settings → Email send-test or a director portal reminder.
- This moves ALL outgoing Oracle mail (report, renewals, reminders) to Resend.

**The owner then decided to STAY on Gmail (2026-06-17)**, so the override stays
inert. It is harmless; keep it or remove it later.

---

## Unbuilt idea: per-director "send as myself" (own mailbox, no Resend)

**Status: PLANNED ONLY — nothing below exists in the code** (no `people.mail_*`
columns, no `src/lib/secrets.ts`). It needs the owner's go-ahead: a migration, a
crypto helper and storing a real credential.

A single Gmail login cannot put another person's address in From, so to send
genuinely AS the director Oracle would log into HIS OWN mailbox with HIS OWN
Google **app password** — per-director SMTP credentials.

**Storage** (new `people` columns):
- `mail_app_password_enc` — his app password, encrypted (AES-256-GCM, key derived
  from `PORTAL_SESSION_SECRET`, via a new `src/lib/secrets.ts`). Never plaintext,
  never logged.
- `mail_send_as_self` boolean default true — his personal on/off.
- `mail_connected_at` timestamptz. From/login address = `people.email`.

**Send path**: `getEmailConfig(forPersonId?)` — when a mailbox is connected AND
`mail_send_as_self` AND an administrator master switch is on, build SMTP from
{user: person.email, pass: decrypt(enc)}; else fall back to admin. On SMTP auth
failure (rotated/expired app password) fall back to admin so mail still goes, and
show him a "reconnect your mailbox" notice.

**UI**: a "Send email from my own address" section on the director/manager
portal Profile (app password + how-to, Connected state, on/off, Disconnect); a
Settings master switch "Allow staff to send from their own mailbox" (a governance
kill switch, like `outreachPaused`) with a list of who is connected.

**Lifecycle rules** (owner's questions):
- **Revoke portal access** (`revokePortalAccess` in `src/lib/portal-access.ts`):
  also clear the credential and reset `mail_send_as_self`.
- **Delete then re-add**: revoke wiped the credential, so he must reconnect.
  Deleting the person row removes everything.
- **Portal password reset** is separate from the Gmail app password — it does not
  touch mail sending. Label it clearly.
- **Email change** (`people.email`): auto-clear the credential and require a
  reconnect (it is bound to the old mailbox).
- **He rotates the app password in Google**: auth fails → fall back to admin +
  "reconnect" prompt.

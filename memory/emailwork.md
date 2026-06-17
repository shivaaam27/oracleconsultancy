# Email "send as the director/manager, not admin" — plan + status

**Owner-named pick-up point: "emailwork" (2026-06-17).**

## The problem
Portal director/manager emails go out as `OC Director's Office <admin@oracle.co.tz>`
with Reply-To = the sender's own email. The owner wants the mail to genuinely come
**from the director's/manager's own `@oracle.co.tz` address**, not admin.

## Why it's not just a code edit
Sending runs through **Gmail SMTP** (the single `admin@oracle.co.tz` Google Workspace
mailbox — `GMAIL_USER` + `GMAIL_APP_PASSWORD` in env; `getEmailConfig` prefers SMTP
whenever those exist). Gmail will **rewrite/reject** a From that isn't the
authenticated mailbox, so you cannot send "as jane@oracle.co.tz" through admin's login.
Confirmed: directors/managers DO have real `@oracle.co.tz` mailboxes.

## Chosen path: A — switch sending to Resend
Resend can send-as any address on a **DNS-verified domain**. Verify `oracle.co.tz`
once, then From = the director's own address works for everyone, no per-person setup.

## Code change — DONE (local, NOT committed yet, tsc clean)
Plumbed an optional `fromAddress` override end-to-end, **honoured only on the Resend
provider** (ignored on Gmail SMTP, so nothing breaks before the switch):
- `src/lib/email/send.ts` — `SendEmailInput.fromAddress`; `sendViaResend` uses
  `input.fromAddress || cfg.fromAddress`. `sendViaSmtp` untouched (keeps admin addr).
- `src/lib/reminders.ts` — `ReminderSender.fromAddress` passed into `sendEmail`.
- `src/app/portal/actions.ts` (`portalSendReminderEmail` ~line 361) — passes
  `fromAddress: me.email`.
- Display name stays the office label (e.g. "OC Director's Office") — only the
  ADDRESS becomes the sender's, which is the ask. Reply-To unchanged.

## Owner's one-time setup to activate
1. Resend account → API key (`re_…`).
2. Resend → Domains → add `oracle.co.tz` → add the ~3 DNS records (sending TXT/MX +
   DKIM + DMARC) at the registrar/DNS host → Verify (goes green in minutes).
3. Vercel env: **add** `RESEND_API_KEY`; **remove** `GMAIL_USER` +
   `GMAIL_APP_PASSWORD` (code prefers Gmail while they exist). Redeploy.
4. Test via Settings → Email send-test or a director portal reminder.
- NOTE: this moves ALL outgoing COS mail (brief, renewals, reminders) to Resend.

## Open idea (2026-06-17): per-director "send as myself" toggle
Owner asked for a setting in the director portal to choose send-as-self vs
send-as-admin-office. Design: a stored per-person preference (or per-send choice);
when off, fall back to office/admin From. Only meaningful once Resend is live.

---

# PLAN A (chosen 2026-06-17): per-director own-mailbox send, NO Resend

Owner decided to STAY on Gmail (no Resend). Hard limit: a single Gmail login
(`admin@`) cannot put another person's address in From — Google rewrites/rejects.
So to send genuinely AS the director we log into HIS OWN `@oracle.co.tz` mailbox
using HIS OWN Google **app password**. Per-director SMTP credentials.

## Storage (migration needed — back up DB first)
New cols on `people`:
- `mail_app_password_enc` text — his Gmail **app password**, encrypted (AES-256-GCM,
  key derived from `PORTAL_SESSION_SECRET`; reuse/extend a small `src/lib/secrets.ts`
  crypto helper — NONE exists yet, must add). Never stored plaintext, never logged.
- `mail_send_as_self` boolean default true — his personal on/off.
- `mail_connected_at` timestamptz — when he linked it (UI "connected" state).
- From/login address = `people.email` (no separate column; see lifecycle Q3).

## Send path
`getEmailConfig(forPersonId?)`: when a personal mailbox is connected AND
`mail_send_as_self` AND the **command-centre master switch** is ON, build an SMTP
config from {user: person.email, pass: decrypt(enc)} instead of the global admin
creds → mail is truly From him. Else fall back to admin (current behaviour).
- `portalSendReminderEmail` passes `me.id` through to the send path.
- On SMTP **auth failure** with personal creds (rotated/expired app password):
  fall back to admin send so mail still goes out, and flag him to reconnect
  (don't silently drop). Surface a "reconnect your mailbox" notice in his portal.

## UI
1. Director/manager **portal profile**: "Send email from my own address" section —
   enter Google app password (with a short how-to), Connected/Not-connected state,
   personal on/off Switch, Disconnect button.
2. **Command centre (Settings)** master switch "Allow staff to send from their own
   mailbox" (governance kill switch, like `director.outreachPaused`) + a small list
   of who's connected with an admin Disconnect. "For safe keeping" = owner can kill
   the whole feature instantly regardless of personal toggles.

## Lifecycle rules (owner's questions, 2026-06-17)
- **Revoke portal access** (`revokePortalAccess`): ALSO clear
  `mail_app_password_enc` + reset `mail_send_as_self` → credential not kept for
  someone who can't sign in; future mail falls back to admin. (Extend the action.)
- **Delete then re-add**: revoke wiped the credential, so on re-grant he must
  RECONNECT his mailbox (re-enter app password). Deleting the whole person row
  removes everything incl. the encrypted credential. Secure by design.
- **Edit COS portal password** (`setPortalAccess` reset): SEPARATE from the Gmail
  app password — resetting login does NOT touch mail sending. Label clearly.
- **Edit his email** (`people.email`): the app password is bound to the old mailbox,
  so on email change AUTO-CLEAR `mail_app_password_enc` + require reconnect (else
  sends would auth-fail). Wire into the person-edit save path.
- **He rotates the app password in Google**: COS keeps the old one → auth fails →
  graceful fall back to admin + "reconnect" prompt.

## Status: PLANNED ONLY — not built. Awaiting owner go-ahead (migration + crypto
## helper + storing a real credential = confirm before building).
## The earlier Resend `fromAddress` plumbing (send.ts/reminders.ts/actions.ts) stays
## — it's inert on Gmail and harmless; can keep or revert later.

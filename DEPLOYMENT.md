# Deployment & portability guide

Plain-language reference for running Oracle and moving it between hosts.
**This file lists variable _names_ and what they do — never the values.** The
real values live only in your local `.env.local` and your host's settings, and
must never be committed.

---

## The big picture

| Thing | Where it lives | Affected by changing host? |
|---|---|---|
| All your data (tasks, people, companies, files, notes, settings) | **Supabase** (a separate service) | ❌ No |
| The app code | This repository (GitHub) | ✅ Re-deploy on the new host |
| Configuration (the variables below) | Host settings + your `.env.local` | ✅ Re-enter on the new host |
| Scheduled jobs | `vercel.json` (Vercel-specific) | ✅ Re-wire (see below) |
| Domain | Your DNS provider | ✅ Re-point to the new host |

Oracle is a standard **Next.js** app. Nothing ties it to Vercel except the
scheduled-jobs file.

## How a deploy happens

**Push to `master`. That is the only deploy.** `vercel.json` switches deploys
off for every other branch (`"**": false, "master": true`), so do not also push
a working branch — that just builds the same code twice.

On Vercel the build command is `vercel-build`: it runs the database migrations
first, then `next build`. A failed migration is logged and the build carries on
(set `MIGRATE_STRICT=1` to make it fail the build instead).

---

## Environment variables

Set these in the host's settings, with matching copies in `.env.local`.

### Required

| Name | What it is |
|---|---|
| `DATABASE_URL` | Supabase Postgres connection string — the pooler on port `6543`. |
| `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase project URL. |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-side database key. **Secret.** The database is locked to this key. |
| `PORTAL_SESSION_SECRET` | Signs every sign-in cookie (owner and staff). **Secret.** Without it, cookies are signed with a key derived from `DATABASE_URL` — never acceptable in production. |
| `CRON_SECRET` | Protects the scheduled jobs (`/api/cron/*`). Vercel Cron sends it for you. **Secret.** |

### Strongly recommended

| Name | What it is |
|---|---|
| `DIRECT_DATABASE_URL` | Session pooler or direct connection (port 5432) used by migrations, backups and the security check. Falls back to `DATABASE_URL`. |
| `GEMINI_API_KEY` | Powers all the AI (Ask ORI, polish, drafting, reading documents and tickets). Can instead be pasted in Settings → AI & Voice, which wins over the variable. Without either, AI switches off and everything else works. **Secret.** |
| `GROQ_API_KEY` | Voice transcription only (Whisper). Can also be set in Settings. Without it the microphone falls back to the browser's own speech recognition. **Secret.** |
| `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN` | Error alerts. If unset, nothing is reported. |

### Features

| Name | What it is |
|---|---|
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google Calendar and Meet sync. **Secret.** |
| `GMAIL_USER` / `GMAIL_APP_PASSWORD` | Sends email through the Gmail mailbox. Optional `SMTP_HOST` / `SMTP_PORT` for another SMTP server. **Secret.** |
| `RESEND_API_KEY` | Alternative email sender (needs a verified domain). **Secret.** |
| `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` / `TWILIO_WHATSAPP_FROM` | WhatsApp sending. Optional `TWILIO_DEFAULT_CONTENT_SID` / `TWILIO_DEFAULT_LANG`. **Secret.** |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Public key browsers use to subscribe to notifications. Public by design. |
| `VAPID_PRIVATE_KEY` | Signs push notifications. **Secret.** |
| `VAPID_SUBJECT` | A contact, e.g. `mailto:you@example.com`. Must be a real domain — Apple rejects `.local`. |
| `NEXT_PUBLIC_APP_URL` | The public address, used in links. Falls back to Vercel's own URL. |
| `CSP_ENFORCE` | Set to `1` to enforce the Content-Security-Policy (otherwise it only reports). Read at build time, so redeploy after changing it. |
| `TELEGRAM_BOT_TOKEN` / `TELEGRAM_WEBHOOK_SECRET` | The Telegram → ORI bridge. Dormant; leave unset. |

No longer used — safe to delete from old env files: `INBOX_SECRET`,
`APP_PASSPHRASE`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `OCRSPACE_API_KEY`.

---

## Scheduled jobs

Defined in `vercel.json` (always the authoritative list). Each is an address that
does its work when called with `Authorization: Bearer <CRON_SECRET>`.

| Job | When (UTC) | What it does |
|---|---|---|
| `/api/cron/snapshots` | 02:00 | Daily health snapshot per company (for trends). |
| `/api/cron/cleanup` | 03:00 | Removes expired undo tokens. |
| `/api/cron/reindex` | 05:00 | Search freshness sweep (no-op when semantic search is off). |
| `/api/cron/event-reminders` | 05:00 | Delivers calendar reminders that have fallen due. |
| `/api/cron/morning-run` | 05:30 | The owner's morning job: chases dates, runs the date automations, self-heals, flushes the held notification digest, sends one morning brief. |
| `/api/cron/email` | 06:00 | Runs the enabled email automations. |
| `/api/cron/ori-automations` | 06:00 | Fires ORI's standing rules (remind, nudge, escalate). |
| `/api/cron/reminders` | 07:00 | Pushes every "remind me" whose time has passed. |

**Deliberately unscheduled** — do not add them: `/api/cron/automations` (the
morning-run does it), `/api/cron/notify` (the morning-run flushes the digest),
and `/api/cron/tick` (a heartbeat for an optional external scheduler, e.g. every
15 minutes, for time-of-day ORI rules).

**On another host:** use its scheduler or a free external cron service to call
each address on the same timetable with the `Authorization` header.

⚠️ When you delete a cron route, delete its entry in `vercel.json` too, or Vercel
fires a daily 404 at it.

---

## Moving to a new host — checklist

1. **Leave Supabase alone.** Your data stays put.
2. Create the project on the new host, pointing at this repository.
3. Copy every variable above into the new host's settings.
4. Deploy. Confirm the site loads and shows your data.
5. Re-create the scheduled jobs.
6. Re-point your domain's DNS.
7. Test: sign in, ask ORI a question, send a test notification
   (Settings → Notifications), and open Settings → Security & Access →
   **Security check** — every line should be green.

---

## Build notes

- `npm run build` already raises the memory limit (8 GB); the default dies after
  "Compiled successfully".
- `unpdf`, `@napi-rs/canvas` (a prebuilt native module) and
  `@react-pdf/renderer` are in `serverExternalPackages`; `npm install` fetches
  the right binary for the host.
- Uploads ride server actions, so `serverActions.bodySizeLimit` is `25mb`.
- The Director Brief PDF is rendered on the server by `@react-pdf/renderer`
  (`src/lib/brief-pdf.tsx`).

## Database migrations

- Schema in `src/db/schema.ts`, migrations in `drizzle/`. Latest: **0172**.
- Vercel applies them on every deploy (see above). A fresh host on a fresh
  database gets them all from the same step, or run `npm run db:migrate`.
- After any schema change, run `npm run db:check-security`.

# Deployment & Portability Guide

Plain-language reference for running the COS system and for moving it between
hosts. **This file lists variable _names_ and what they do — never the secret
values.** The real values live only in your local `.env.local` and in your
host's settings, and must never be committed to the repository.

---

## The big picture (what lives where)

| Thing | Where it lives | Affected by changing host? |
|---|---|---|
| All your data (tasks, meetings, notes, inbox, settings) | **Supabase** (separate service) | ❌ No — completely independent |
| The app code | This repository | ✅ Re-deploy on the new host |
| Configuration (the variables below) | Host settings + your `.env.local` | ✅ Re-enter on the new host |
| Scheduled jobs | `vercel.json` (Vercel-specific) | ✅ Must be re-wired (see below) |
| Domain | Your DNS provider | ✅ Re-point to the new host |

The app is a standard **Next.js** app, so it runs on Vercel, Netlify, Render,
Railway, Fly.io, Cloudflare, or your own server. Nothing locks you to Vercel
except the scheduled-jobs file, which is easy to replace.

---

## Environment variables

Set these in your host's environment settings (and keep matching copies in
`.env.local` for local development).

### Required — the app will not work without these

| Name | What it is |
|---|---|
| `DATABASE_URL` | Supabase Postgres connection string (the pooler on port `6543`). Used by the app and by database migrations. |
| `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase project URL. Used by newer write paths. |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service-role key for server-side database writes. **Secret.** |

### AI features

| Name | What it is |
|---|---|
| `GROQ_API_KEY` | Groq Cloud key powering Ask COS, dictation polish, meeting intelligence, etc. If absent, AI features degrade gracefully and the rest of the app still works. **Secret.** |

### Push notifications (phone alerts)

| Name | What it is |
|---|---|
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Public key the browser uses to subscribe to notifications. Safe to expose (it's public by design). |
| `VAPID_PRIVATE_KEY` | Private key the server signs notifications with. **Secret.** |
| `VAPID_SUBJECT` | A contact address, e.g. `mailto:you@example.com`. Must be a real domain — **not** `.local` (Apple rejects those). |

### Secrets that protect endpoints

| Name | What it is |
|---|---|
| `CRON_SECRET` | Shared password protecting the scheduled-job endpoints (`/api/cron/*`). The scheduler must send it as `Authorization: Bearer <CRON_SECRET>`. **Secret.** |
| `INBOX_SECRET` | Shared password protecting the inbound capture endpoint (`/api/inbox`). The email/WhatsApp bridges send it to post items. **Secret.** |

### Optional

| Name | What it is |
|---|---|
| `SENTRY_DSN` | Error-reporting endpoint. Optional — if unset, error reporting is skipped. |
| `XLSX_PATH` | Only used by the one-off `scripts/import.ts` data-import script. Not needed in production. |
| `APP_PASSPHRASE` | Present in env files but **not currently read by any code** (reserved for a future login feature). Safe to leave or remove for now. |

---

## Scheduled jobs (the one host-specific piece)

These run automatically on a timer. On Vercel they're defined in `vercel.json`.
Each is a web address that does its work when visited with the `CRON_SECRET`.

| Job | When (UTC) | What it does |
|---|---|---|
| `/api/cron/snapshots` | 02:00 daily | Records a daily health snapshot per company (for trends). |
| `/api/cron/cleanup` | 03:00 daily | Removes expired "undo" tokens. |
| `/api/cron/email` | 06:00 daily | Runs the enabled email-automation categories. |
| `/api/cron/reindex` | 05:00 daily | Re-indexes changed rows for search. |
| `/api/cron/reminders` | 07:00 daily | Fires due per-person reminder pushes. |
| `/api/cron/auto-sort` | 08:00 daily | Sorts the inbox (files docs to owners/categories). |
| `/api/cron/morning-run` | 05:30 daily | The consolidated owner job: chases dates, self-heals, watches model/key health, flushes the held notification digest, and sends ONE morning brief. (Replaced the old standalone `/api/cron/notify` schedule.) |

> `/api/cron/notify` still exists (the same consolidated alert + digest flush) for
> manual or legacy triggers, but it is **not** scheduled — the morning-run above is
> the one in `vercel.json`. If you enable "Batch routine alerts into a digest" or
> quiet hours, the held pushes are flushed by the morning-run, so they are never
> lost. Authoritative list is always `vercel.json`.

**On Vercel:** these work automatically as long as `CRON_SECRET` is set in
Vercel — Vercel Cron sends the secret for you.

**On another host:** use that host's scheduler, or a free external cron service
(e.g. cron-job.org), to visit each address on the same timetable. Add an
`Authorization: Bearer <CRON_SECRET>` header so the request is accepted.

---

## Moving to a new host — checklist

1. **Leave Supabase alone.** Your data stays put; don't touch it.
2. Create the project on the new host, pointing at this Git repository.
3. Copy every environment variable above into the new host's settings
   (values from your `.env.local`).
4. Deploy. Confirm the site loads and shows your existing data.
5. **Re-create the scheduled jobs** on the new host (see above).
6. Re-point your domain's DNS to the new host.
7. Test: open the app, run an Ask COS query, send a test notification
   (Settings → Notifications), and POST a test item to `/api/inbox`.

That's the whole move. The app, data, and logic travel with you; only config
and the timer jobs need re-entering.

---

## Build & native dependencies (V2)

- **`@napi-rs/canvas`** is a prebuilt native module used to rasterise scanned
  PDFs for the document vision reader. It ships platform binaries (works on
  Linux/Vercel and Windows) and is listed alongside `unpdf` in
  `serverExternalPackages` (`next.config.ts`) so Turbopack doesn't try to bundle
  it. `npm install` pulls the right binary for the host; no extra setup needed.
- Document uploads ride server actions, so `next.config.ts` sets
  `serverActions.bodySizeLimit: "25mb"` (the documents bucket allows up to 20 MB).
- The **Director Brief PDF** uses the browser's print-to-PDF (no server PDF
  library, nothing to deploy).

## Database migrations (for reference)

- Schema is defined in `src/db/schema.ts`; migrations live in `drizzle/`.
- The baseline (`0000`), the documents tables, and some others were applied by
  hand, so the Drizzle snapshot can lag behind the live database. Generate with
  `npm run db:generate`, then **review the SQL** before applying — if it tries
  to recreate tables that already exist, trim it to only the new changes (as was
  done for the HRMS stock migration and the `inbox` table). Latest feature
  migrations: `0017_yummy_mad_thinker` (stock), `0018_glamorous_lady_vermin`
  (cleaning).

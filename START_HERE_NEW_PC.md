# START HERE — moving Oracle to a new PC

**On the new PC, tell Claude: _"Read `START_HERE_NEW_PC.md` and get me set up."_
Claude will walk through every step below and check each one.**

Written in plain English, so that **nothing breaks** when you change computer.

---

## The one thing to understand

Your system lives in **three places**. Only one of them is your PC.

| Where | What's there | Safe if the PC dies? |
|-------|--------------|------------------|
| **The cloud (Supabase + Vercel)** | All your real data — tasks, people, companies, files, notes. The live site at `oracleconsultancy.vercel.app`. | ✅ **Yes.** Not on your PC at all. |
| **GitHub** (`github.com/shivaaam27/oracleconsultancy`) | All the code, plus `CLAUDE.md`, the `memory/` notes and every guide. There is one branch: `master`. | ✅ **Yes.** One `git clone` brings it back. |
| **Your PC only** | (1) your **secret keys** file (`.env.local`), and (2) **Claude's own memory folder**. | ❌ **No — carry these by hand.** |

So moving PCs is: **download the code from GitHub, then put back the two
local-only things.**

---

## Before you leave the OLD PC

1. **Make sure everything is on GitHub.** Ask Claude: _"is everything committed
   and pushed to master?"_ Anything not pushed exists only on the old PC.
2. **Copy these to a USB stick or cloud drive:**
   - `.env.local` (and `.env` if there is one) from the project folder — your
     secret keys.
   - Claude's memory folder:
     `C:\Users\<you>\.claude\projects\<project-key>\memory\`
     (the project key is the project's path with `\`, `:` and spaces turned
     into `-`, e.g. `C--Users-Shivam-Parmar-Documents-cos-system`).

---

## On the NEW PC

### 1. Install the tools
- **Node.js** 20 or newer (built on Node 24) — nodejs.org.
- **Git** — git-scm.com.
- **Claude Code**.

### 2. Get the code
Use the **same folder path** as before if you can — Claude's memory folder is
keyed to it.
```bash
cd C:\Users\<you>\Documents
git clone https://github.com/shivaaam27/oracleconsultancy.git cos-system
```

### 3. Put back the secret keys
Copy `.env.local` (and `.env`) into the project folder
(`C:\Users\<you>\Documents\cos-system\`).
**Without `.env.local` nothing works** — no database, no sign-in, no AI. It is
kept out of GitHub on purpose.

### 4. Put back Claude's memory
Copy the memory folder into `C:\Users\<you>\.claude\projects\<project-key>\memory\`
(create the folders if needed). If the project path is different on the new PC,
the key is different too — work it out from the new path as above.

### 5. Install and run
```bash
cd C:\Users\<you>\Documents\cos-system
npm install
npm run dev
```
Open `http://localhost:3000`. If it loads and you can sign in, the move worked.

### 6. Final check (Claude does this)
- `npm exec tsc -- --noEmit` — the code type-checks.
- `npm test` — the safety tests pass.
- `npm run db:check-security` — the database is still locked.
- Sign in on the local site.

---

## What each secret key is for
*(If one is missing, this is what stops working. The template is `.env.example`.)*

| Key | Powers | If missing… |
|-----|--------|-------------|
| `DATABASE_URL` | The cloud database (Supabase pooler, port 6543) | **Nothing loads** |
| `DIRECT_DATABASE_URL` | Migrations, backups, the security check (port 5432) | They fall back to `DATABASE_URL` |
| `NEXT_PUBLIC_SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | Server database access, search indexing, files | Pages and saves fail |
| `PORTAL_SESSION_SECRET` | Signs every sign-in (owner and staff) | Works locally, but must be set on the live site |
| `CRON_SECRET` | Protects the background jobs | Jobs refuse to run |
| `GEMINI_API_KEY` | All the AI — Ask ORI, polish, drafting, reading documents | AI switches off (the key can also live in Settings) |
| `GROQ_API_KEY` | Voice transcription | Microphone uses the browser's own speech (can also live in Settings) |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google Calendar & Meet sync | Calendar sync off |
| `GMAIL_USER` / `GMAIL_APP_PASSWORD` | Sending email | Emails don't send |
| `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` / `TWILIO_WHATSAPP_FROM` | WhatsApp sending | WhatsApp off |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` | Phone push notifications | Push off |
| `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN` | Error alerts | You won't hear about crashes |
| `COS_MCP_KEY` | Lets Claude Code on this PC reach Oracle | Run `npm run mcp:key` to mint a new one |

The owner password is **not** a key in this file — it is stored (as a hash) in
the database, so it travels with the cloud. Keys pasted into Settings (Gemini,
Groq) travel the same way. `APP_PASSPHRASE`, `INBOX_SECRET` and
`NEXT_PUBLIC_SUPABASE_ANON_KEY` are no longer used; leave them out.

---

## Where the knowledge lives

1. **`CLAUDE.md`** — the master brief: product, stack, pages, rules. Claude reads
   it automatically.
2. **`memory/studio_redesign.md`** — the Studio design every rebuilt page uses;
   **`DESIGN_SYSTEM.md`** — Desk, for pages not yet rebuilt.
3. **`memory/README.md`** — the index of the project's deeper notes.
4. **Claude's own memory** (step 4) — preferences and running notes.

To bring Claude up to speed, say:
> _"Read CLAUDE.md and memory/README.md, and tell me where we left off."_

---

## Please don't break these
*(Also in `CLAUDE.md` — this is the short list.)*

- **Database connection** (`src/db/index.ts`): keep `prepare: false` and
  `max: 1`, and `DATABASE_URL` on the **pooler, port 6543**.
- **Sign-in**: the secret derivation must stay identical in `src/proxy.ts`,
  `src/lib/admin-auth.ts` and `src/lib/portal-auth.ts`.
- **Back up once, at the end of a session** (`npm run db:backup`, ~15 minutes) —
  and first, before anything that drops or rewrites data.
- **Never delete `.next` while the dev server is running** — stop it first.
- **Times are stored in UTC** and shown in Dar es Salaam time.
- **Migrations**: latest is **0172**. Vercel runs them on every deploy.
- **Deploy = push to `master`.** Nothing else deploys.

---

## If something breaks
- **"SUPABASE… is not set" / the site won't start** → `.env.local` is missing or
  in the wrong folder (step 3).
- **Can't sign in** → the password lives in the database, so check
  `DATABASE_URL` first; staff sign-in also needs the same `PORTAL_SESSION_SECRET`
  as before or old cookies stop working (just sign in again).
- **Claude seems to have forgotten everything** → the memory folder wasn't
  restored, or the project path changed (step 4).
- **Type errors after cloning** → `npm install` again, then
  `npm exec tsc -- --noEmit` and hand the errors to Claude.
- **Your data looks gone** → it isn't; it's in the cloud. Check `DATABASE_URL`
  points at the right Supabase project.

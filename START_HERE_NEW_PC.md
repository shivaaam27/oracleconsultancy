# START HERE — Moving the COS System to a New PC

**Read this first. On the new PC, tell Claude: _"Read `START_HERE_NEW_PC.md` and get me
set up."_ Claude will then walk through every step below and verify each one.**

This document is written in plain English for a non-technical owner. It exists so that
**nothing breaks** when you move to a new computer.

---

## The one thing to understand

Your system lives in **three places**. Only one of them is your PC.

| Where | What's there | Safe if PC dies? |
|-------|--------------|------------------|
| **The cloud (Supabase + Vercel)** | All your real data — tasks, people, documents, companies, everything you've typed in. The live website at `oracleconsultancy.vercel.app`. | ✅ **Yes.** Not on your PC at all. |
| **GitHub** (`github.com/shivaaam27/oracleconsultancy`) | All the code, plus the project's own `memory/` notes, `CLAUDE.md`, `DESIGN_SYSTEM.md` and every guide. | ✅ **Yes.** One `git clone` brings it all back. |
| **Your PC only** | Two things: (1) your **secret keys** file (`.env.local`), and (2) **Claude's memory folder**. | ❌ **No — these must be hand-carried.** |

So moving PCs is really just: **re-download the code from GitHub, then put back the two
local-only things.** That's what the transfer folder is for.

---

## Before you leave the OLD PC

Everything you need is already packed into this folder:

```
C:\Users\User\Documents\COS-NEW-PC-TRANSFER\
```

Copy that **entire folder** to a USB stick or your cloud drive (Google Drive/Dropbox/OneDrive).
It contains:

- `secrets/.env.local` and `secrets/.env` — your 22 secret keys (database, AI, login, email, WhatsApp).
- `claude-memory/` — Claude's full memory (53 notes + the index) so the new PC's Claude knows the whole history.
- `README-FIRST.md` — the same steps as here, but standalone.

**Also make sure your work is pushed to GitHub.** Ask Claude: _"is everything committed and
pushed?"_ Anything uncommitted only exists on the old PC.

> 💡 The transfer folder is a **snapshot**. If you keep working on the old PC after making it,
> re-run the packing (ask Claude to "refresh the transfer folder") so it stays current.

---

## On the NEW PC — the setup checklist

Claude will do most of this for you when you point it at this file. Steps in order:

### 1. Install the basic tools
- **Node.js** (version 20 or newer — this project was built on Node 24). From nodejs.org.
- **Git**. From git-scm.com.
- **Claude Code** (so I can help you again on the new PC).
- *(Optional)* VS Code as an editor.

### 2. Get the code back from GitHub
Put the project in the **same location** as before so paths line up:
```
C:\Users\User\Documents\cos-system
```
Command:
```bash
cd C:\Users\User\Documents
git clone https://github.com/shivaaam27/oracleconsultancy.git cos-system
```
> Using the exact same folder path matters — Claude's memory folder is keyed to it (see step 4).

### 3. Put back your secret keys
Copy the two files from your transfer folder into the project root:
- `COS-NEW-PC-TRANSFER\secrets\.env.local`  →  `C:\Users\User\Documents\cos-system\.env.local`
- `COS-NEW-PC-TRANSFER\secrets\.env`  →  `C:\Users\User\Documents\cos-system\.env`

**Without `.env.local` nothing works** — no database, no login, no AI. This is the single most
important file to restore. (It is deliberately kept out of GitHub so your passwords never leak.)

### 4. Put back Claude's memory
Copy everything from `COS-NEW-PC-TRANSFER\claude-memory\` into:
```
C:\Users\User\.claude\projects\C--Users-User-Documents-cos-system\memory\
```
(Create those folders if they don't exist. If the project path in step 2 is identical, this path
will be identical too.) This is what lets the new Claude remember the whole build history instead
of starting blind.

### 5. Install and run
```bash
cd C:\Users\User\Documents\cos-system
npm install
npm run dev
```
Then open `http://localhost:3000`. If the site loads and you can log in, the move worked.

### 6. Final check (Claude does this)
- `npm exec tsc -- --noEmit` — confirms the code still type-checks (no errors).
- `npm test` — runs the safety tests (should be ~272 passing).
- Load the live preview and log in.

---

## What each secret key is for
*(So if one is ever missing, you know what stops working. Full template with blanks is in `.env.example`.)*

| Key | Powers | If missing… |
|-----|--------|-------------|
| `DATABASE_URL` | The cloud database (Supabase pooler, port 6543) | **Nothing loads at all** |
| `APP_PASSPHRASE` | The owner login password | Can't log in as owner |
| `PORTAL_SESSION_SECRET` | Staff portal logins | Staff can't sign in |
| `CRON_SECRET` | Protects the automated background jobs | Automations won't run |
| `INBOX_SECRET` | Document intake endpoint | Inbox intake breaks |
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Search + realtime chat | Search/chat degrade |
| `SUPABASE_SERVICE_ROLE_KEY` | Server database access, embeddings/indexing | Indexing & some writes fail |
| `GROQ_API_KEY` | Voice transcription + fallback AI | Voice/AI degrade (key can also be set in-app Settings) |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google Calendar & Meet sync | Calendar sync off |
| `GMAIL_USER` / `GMAIL_APP_PASSWORD` | Sending email | Emails won't send |
| `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` / `TWILIO_WHATSAPP_FROM` | WhatsApp sending (sandbox) | WhatsApp off |
| `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN` | Error monitoring | You won't get error alerts |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` | Phone push notifications | Push notifications off |
| `VERCEL_TOKEN` | Deploying to the live site | Can't deploy from CLI |

> **Note:** Some AI keys (e.g. the Gemini vision key) may be stored **inside the app's Settings
> page**, which lives in the cloud database — so they travel automatically and don't need to be in
> `.env.local`. If document reading (OCR) works on the new PC, that key is fine.

---

## Where the knowledge lives (so Claude can "sort everything out")

Once the code is cloned, everything Claude needs to understand the system is already inside it:

1. **`CLAUDE.md`** — the master brief: product, stack, every page, every rule. Claude reads this automatically.
2. **`DESIGN_SYSTEM.md`** — the "Aurora" look-and-feel rules for any new screen.
3. **`memory/MEMORY.md`** — the index of the project's deep notes; **`memory/session_handover_jul8_2026.md`** is the most recent "start here" pickup point.
4. **The restored Claude memory** (step 4) — the richer running index + feedback/preferences.
5. This file (`START_HERE_NEW_PC.md`) — the move guide.

**To bring Claude fully up to speed on the new PC, say:**
> _"Read CLAUDE.md, then memory/MEMORY.md and memory/session_handover_jul8_2026.md, and give me a summary of where we left off."_

---

## The "please don't break these" rules
*(These are the fragile spots. They're also in `CLAUDE.md` — this is the short list.)*

- **Database connection** (`src/db/index.ts`): must keep `prepare: false` and `max: 1`, and
  `DATABASE_URL` must use the Supabase **pooler on port 6543**. Changing these breaks all data access.
- **Login gate** (`src/proxy.ts`): the secret derivation must stay identical across `src/proxy.ts`,
  `src/lib/admin-auth.ts`, and `src/lib/portal-auth.ts`. If they drift, logins fail.
- **Always take a database backup before any schema change**: `npm run db:backup`.
- **Never delete the `.next` folder while the dev server is running** — stop it first.
- **Times are stored in UTC** and shown in Dar es Salaam time; don't change the timestamp columns.
- **Migrations**: latest is **0111**. Vercel runs them on deploy (needs `DIRECT_DATABASE_URL`, port 5432).

---

## If something does break
- **Site won't start / "SUPABASE... is not set"** → `.env.local` is missing or in the wrong folder (step 3).
- **Can't log in** → `APP_PASSPHRASE` (owner) or `PORTAL_SESSION_SECRET` (staff) missing.
- **Claude seems to have forgotten everything** → the memory folder wasn't restored (step 4).
- **Type errors after clone** → run `npm install` again; then `npm exec tsc -- --noEmit` and hand the errors to Claude.
- **Your data looks gone** → it isn't; it's in the cloud. Check `DATABASE_URL` points at the right Supabase project.

Your real data is always safe in the cloud. The worst a bad PC move can do is stop the *code* from
running locally — and that's fully recoverable from GitHub + this transfer folder.

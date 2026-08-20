# COS as a real Windows app + a security pass

Written 20 Aug 2026. The owner asked for two things: a downloadable app people
can install, and the whole system made safer. Read the security half FIRST — one
finding there outranks everything else in this file.

---

# PART 1 — ⚠️ THE DATABASE IS OPEN TO THE INTERNET. FIX THIS FIRST

## What I found

COS ships a key called the **anon key** into every page of the website. That is
normal and by design — it is meant to be public. What is NOT normal is what it
can currently do.

I tested it live against the Supabase project on 20 Aug 2026:

| Test | Result |
|---|---|
| Read `people` (names, phones, emails, ID numbers) | ✅ worked |
| Read `tasks`, `documents`, `settings` | ✅ worked |
| Read `settings → v2.adminPasswordHash` (**the owner password hash**) | ✅ worked |
| Read `people.portal_password_hash` (**every staff password hash**) | ✅ worked |
| Read `mcp_keys` (Claude access key hashes) | ✅ worked |
| Read `webauthn_credentials` (passkeys) | ✅ worked |
| **Write** — `PATCH /settings` | ✅ **HTTP 204 — allowed** |
| **Write** — `DELETE /tasks` | ✅ **HTTP 204 — allowed** |

Plain English: **anyone who opens the COS website, presses F12 and copies one
line out of the page source can read every record in the system — and can also
change or delete all of it.** That includes the ledger, the audit log, staff
personal data and the document library. No password needed.

The reason is that the tables were all created by migrations, which leaves
Supabase's Row Level Security switched **off**, and the `anon` role keeps its
default grants. The app itself never uses that key for data (it uses the
service-role key on the server), so **locking it down breaks nothing** — with one
small exception noted below.

## ✅ DONE — 20 Aug 2026, migration `0139_lock_public_schema`

Steps 1–4 below are applied and verified. Row Level Security is on for all 128
tables, every anon/authenticated grant is revoked, and future tables are locked
by default. Re-tested afterwards: every read and every write with the public key
now returns **401** (`42501 permission denied`), while the service-role key still
returns 200 and the app's own queries are unaffected (tasks 108, people 44,
documents 197). 684 tests pass, type-check clean.

- `npm run db:check-security` re-runs the whole check on demand and exits 1 on a
  finding. Run it after any schema work.
- The `postgres_changes` listener in `cockpit-live.tsx` is gone (it was already
  inert — the `supabase_realtime` publication is empty).
- **A follow-up audit caught a gap in the first fix, closed by migration 0140.**
  Revoking from `anon` does not close a *function*: Postgres grants them to
  "PUBLIC" and `anon` inherits that, so all 156 stayed callable while the grants
  read clean. Nothing was actually exposed — they all run as the caller, who now
  has no table rights — but the first one written the normal Supabase way would
  have been wide open. Now: 0 of ours callable, all still working for the app.
- Re-tested after both: reads, writes, file downloads, the search functions and
  chat's live updates. Chat is unaffected; files return "not found" to the public
  key; the search function returns "permission denied" to it and real answers to
  the app.
- One thing could not be done: the default privileges owned by `supabase_admin`
  cannot be revoked from our role. That only matters for tables created in the
  **Supabase dashboard** rather than by a migration, and the check script catches
  it. Create tables via migrations.

**⚠️ STEP 5 IS STILL OUTSTANDING AND IS YOURS TO DO** — the credential rotation.
The hashes were public for a long time; locking the door does not un-copy them.

## The fix (half a day, no data migration)

1. **Turn on Row Level Security on every table** in `public`, and add **no
   policies**. The server's service-role key ignores RLS, so COS keeps working.
2. **Revoke the grants** as well, belt and braces:
   `REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;` plus the
   same for sequences and functions, and `ALTER DEFAULT PRIVILEGES` so new tables
   are locked from birth.
3. **One code change**: `src/components/cockpit-live.tsx` also listens to
   `postgres_changes` on `task_updates`, which will stop working once RLS is on.
   Delete that listener — the `cos-pulse` broadcast next to it already does the
   job. Chat is broadcast-only and is unaffected.
4. **Re-run the same tests** afterwards. Every one must come back `401` or `403`.
5. **Assume it was read.** It has been open for a long time and there is no way to
   know. So, after steps 1–3:
   - change the owner password;
   - reset **every** staff portal password;
   - revoke and re-mint every MCP key;
   - if a Gemini/Groq key was ever saved in Settings, rotate it at the provider;
   - skim `audit_log` and `system_events` for anything unrecognised.
6. Take a `db:backup` **before** step 5, not before step 1 (step 1 changes no data).

**Do not skip step 5 because it is tedious.** The password hashes were readable,
and a hash that has been copied can be attacked offline at leisure.

---

# PART 2 — the rest of the security pass, in order of how much it matters

**P1 — Security headers. ✅ DONE 20 Aug 2026.** `next.config.ts` now sets them on
every route. Enforced immediately: `X-Frame-Options: DENY` (a fake login page can
no longer frame the site), `nosniff`, `Referrer-Policy`, `Permissions-Policy`,
`Cross-Origin-Opener-Policy`, and HSTS in production.

The **Content-Security-Policy is report-only for now**, on purpose — it is the
one header that can white-screen the app if an origin was missed. Violations go
to `/api/csp-report` and land in `system_events`. The allowlist was built by
reading the client code, not guessing: Supabase (REST, storage, websocket),
Sentry, and `api.open-meteo.com` for the weather chip.

**To finish it in a week:** open Settings → Security & Access → Security check.
If "Content rules" still says *watching only* and nothing real has been recorded,
set **`CSP_ENFORCE=1`** in Vercel and redeploy. That is the whole job.

**P1b — The app now reports on its own safety.** Settings → Security & Access →
**Security check** shows four lines in plain English: database lock, sign-in
cookie key, error alerts, content rules. It reads the live environment, so it
tells the truth about *production* rather than about a laptop. It changes
nothing.

**P2 — Password hashing is weaker than it should be.** `scryptSync(password,
salt, 32)` uses Node's defaults (N=16384). Given the hashes were public, raise the
cost (N=2^17) or move to argon2, with a version tag on the stored string so old
hashes still verify and re-hash on next login.

**P3 — The brute-force guard does not really work in production.**
`src/lib/login-throttle.ts` keeps its counters in memory, and Vercel runs many
short-lived instances — an attacker rarely hits the same one twice. Move the
counters into a small database table. The file already says this; now it matters
more.

**P4 — Cookie signing key.** `PORTAL_SESSION_SECRET` is set locally. **Confirm it
is set in Vercel too.** If it is missing there, cookies are signed with a value
derived from `DATABASE_URL`, and anyone holding that string can forge an owner
session. Also make sure it is exposed to the **edge** runtime, not just Node.
→ The Security check card now answers this from production; no need to go
digging in Vercel. (The `VERCEL_TOKEN` in `.env.local` is expired, so it could
not be checked remotely — worth deleting or replacing while you are in there.)

**P5 — The admin gate fails open.** `src/proxy.ts` trusts a valid signature when
it cannot reach the settings table. That is a deliberate "never lock the owner
out" choice and I would keep it — but it means a Supabase outage disables the
"sign out all devices" feature. Worth knowing, not worth changing.

**P6 — Audit the routes that skip the gate.** The proxy matcher excludes
`api/cron`, `api/calendar`, `api/notifications`, `api/push`, `api/wa-card`,
`api/og-banner`, `e/`, `r/`, `api/mcp`, `api/portal`. Each is supposed to check
itself. `src/app/api/push/test/route.ts` appears to have no check at all. Go
through the list once and confirm each one.

**P7 — Sessions last 60 days and slide.** Convenient, and fine on a personal
laptop. For staff on shared phones, consider 14 days.

**P8 — Make passkeys the normal way in.** They already work for the owner and for
staff. A passkey cannot be phished or guessed, and it removes the value of a
stolen hash. Push everyone onto one.

**P9 — Turn Sentry on.** It is wired but inert without a DSN. Set it, so a
break-in attempt or a crash is visible.

**P10 — `npm audit --omit=dev` is clean.** Keep the monthly habit.

---

# PART 3 — the Windows app

## The one decision that shapes everything

COS is a **server** application. It renders pages on Vercel, talks to Supabase,
calls Gemini. It cannot be turned into a self-contained .exe, and you would not
want it to be — that would mean shipping the database keys onto every staff
laptop. **That is the trap to avoid, and it is the same shape as the mistake
described before (picking a packaging route that cannot carry the real app).**

So the app is a **thin native shell around the live site**. A real window with the
Oracle icon, a real installer, a real Start-menu entry, no browser bar — but the
contents come from the site that is already deployed.

**This is what gives the seamless updates asked for:** push to `master`, Vercel
builds, and the app is already new when it is next opened. There is no installer
to reissue and nothing for staff to do. The shell itself — the window, the tray
icon, the menus — changes maybe twice a year, and that is what the auto-updater
handles.

## The options, and the pick

| | What it is | Size | Effort | Verdict |
|---|---|---|---|---|
| **A. PWA install** | Edge's "Install this site as an app" | 0 MB | **already 90% built** — `manifest.json`, `sw.js`, `offline.html` all exist | ✅ **Do this today**, free. But there is no file to share. |
| **B. Electron shell** | Real `.exe` installer, auto-updating | ~90 MB | ~2 days | ✅ **The recommendation.** |
| C. Tauri v2 shell | Same idea, tiny binary | ~6 MB | ~3–4 days | ❌ Not for this. See below. |
| D. MSIX / Microsoft Store | PWABuilder makes a Store package | ~1 MB | ~2 days + Store review | 🤔 Good later, if free signing is wanted. |
| E. Bundle the server into the app | The whole of Next.js inside the .exe | huge | weeks | ❌ **Never.** Ships the database keys to every laptop. |

**Why Electron and not Tauri**, given the explicit ask to guard against a dead end:

- Tauri is genuinely leaner and its updater is better. But Tauri is *built for*
  bundling a local frontend; loading a **remote** site is its less-travelled path,
  and giving that remote page any native access needs fiddly capability config.
  Fewer people have done it, so fewer answers exist when you are stuck.
- Tauri needs Rust. That is a second language in a repo that is pure TypeScript.
- Electron is what Slack, Teams, Notion, VS Code and 1Password use. Tray icons,
  notifications, badge counts, downloads, printing, deep links, launch-at-startup
  and single-instance are one documented line each.
- **The insurance:** because the shell is thin (~300 lines), swapping it for Tauri
  later is a weekend, not a rewrite. The thin-shell decision is what keeps the
  options open; the framework choice is reversible.

The one real cost is size and memory: ~90 MB to download, ~200 MB of RAM while
open. That is one more Chrome tab's worth. If it ever becomes the problem, see the
insurance above.

## How it will work

**Shell (`cos-desktop`, a small separate repo):**
- Loads `https://<the COS domain>` in a locked-down window.
- Security settings, non-negotiable: `nodeIntegration: false`,
  `contextIsolation: true`, `sandbox: true`, `webSecurity: true`.
- **Blocks navigation to anywhere that is not the COS domain** — a stray link
  opens in the real browser instead.
- Denies every permission request by default; allows only notifications.
- Contains **no keys of any kind**. It is a window and nothing more.
- Offline screen with a Retry button when there is no internet.
- Tray icon, launch at startup (optional), single instance, save-file dialog for
  document downloads, print support.
- Windows Hello / passkey sign-in works, because it is Chromium underneath.

**Updates — two speeds:**
1. *The app's contents* — instantly, on every push to `master`. Nothing to do.
2. *The shell itself* — `electron-updater` checks on launch and silently
   downloads; installs on next restart. Rare.

**Where updates come from:** a **public** `cos-desktop` repo, using GitHub
Releases. The shell has no secrets, so publishing it publicly costs nothing, and
it avoids a real trap: a *private* repo needs a GitHub token on every staff laptop
for updates to work. If nothing at all should be public, the alternative is a
Supabase Storage bucket with electron-builder's "generic" provider. Either works;
the public repo is simpler.

**Release flow:** tag the shell repo → GitHub Actions builds (and signs) the
installer → publishes the release → every installed app updates itself. No build
machine to touch.

## ⚠️ The one thing to decide early: signing

An unsigned Windows installer shows **"Windows protected your PC"** to everyone
who downloads it, until it builds a download reputation. Auto-updates still work
unsigned — this is about trust, not function.

- **Microsoft's Azure Trusted Signing is $9.99/month** and the nicest option, but
  organisations must be based in the **US, Canada, EU or UK**. None of the
  thirteen companies obviously qualifies — **check this before budgeting for it.**
  A UK entity, if one exists, would unlock it.
- **A standard OV certificate** from Sectigo/DigiCert or a reseller is roughly
  **$200–400 a year**, sold worldwide, and now requires the key to live on a
  hardware token or cloud HSM. Works from GitHub Actions with the cloud option.
- **Microsoft Store** signs for free, but means a Store listing and a review round
  for what is an internal business tool.
- **Or ship unsigned** and tell staff to click "More info → Run anyway" once.

**Recommendation:** ship unsigned for internal staff now; buy an OV certificate
only if the installer starts going to people outside the group. Nothing about the
build changes when it is added later — it is one step in the CI file.

## What it will not do

- **No offline working.** No internet, no COS — same as the website today. If
  offline task capture is ever wanted, the answer is to improve the service worker
  in the web app, which helps the browser *and* the app. The shell choice does not
  block it.
- **No second copy of the data.** There is one database. That is the point.

---

# PART 4 — the order to do it in

| # | Work | Time | Why here |
|---|---|---|---|
| 1 | **RLS + revoke grants + re-test** | half a day | Everything else is decoration while the database is open. |
| 2 | Rotate passwords, MCP keys; skim the audit log | 1 hour | The hashes were public. |
| 3 | Security headers, `PORTAL_SESSION_SECRET` in Vercel, Sentry DSN | half a day | Cheap, high value. |
| 4 | Install the PWA | 5 minutes | An app today, free, while the rest is built. |
| 5 | Electron shell + installer + auto-update + GitHub Actions | 2 days | The real deliverable. |
| 6 | Hashing cost, throttle in the database, route audit | 1 day | Follow-ups, not emergencies. |
| 7 | Signing, if a certificate is bought | half a day | Bolt-on. |

Steps 1–3 are worth doing this week whatever is decided about the app.

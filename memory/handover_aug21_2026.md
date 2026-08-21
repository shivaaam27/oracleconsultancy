# Handover — 20–21 August 2026

Everything below is on `master` and deployed. Read this first, then the plan file
for whichever thread you are picking up.

---

## 1. What was done, shortest version

| | |
|---|---|
| **The database was open to the internet** | Closed. Migrations 0139 + 0140. |
| **Security headers** | Added. CSP is watching, not yet blocking. |
| **A Windows app** | Built. C# + WebView2, 2 MB installer, updates itself. |
| **Notes offline** | Stage 1 built — you can write with no connection. |

---

## 2. ⚠️ Two things waiting on the OWNER, not on code

**Ask about these before treating COS as secure.**

1. **Rotate the credentials** — COS to-do **#420**. The public browser key could
   read every table for a long time, including the owner password hash and every
   staff portal password hash. Locking the door does not un-copy them. Change the
   owner password, reset every staff portal password, re-mint the MCP keys, skim
   `audit_log`.

2. **Set `CSP_ENFORCE=1` in Vercel and redeploy.** The policy has been in
   report-only mode for days with nothing real recorded, so it is ready.
   ⚠️ `next.config` is read at BUILD time — the env var alone does nothing.

---

## 3. The security work (`memory/desktop_app_and_security_plan.md`)

**The big one:** every table had Row Level Security off and full grants to `anon`,
and that key ships inside every page. It could read `people`, `settings` (the
owner password hash), `people.portal_password_hash`, `mcp_keys`,
`webauthn_credentials` — and PATCH/DELETE returned 204. Closed by **0139**
(RLS + revoke) and **0140**.

⚠️ **0139 alone was not enough, and the reason is worth knowing.** `REVOKE …
FROM anon` does not close a FUNCTION: Postgres grants EXECUTE to the pseudo-role
**PUBLIC** and `anon` inherits it, so all 156 stayed callable while the grant
table read clean. Check with `has_function_privilege('anon', …)`, never with the
grants. 0140 fixed it.

Also done: security headers (`next.config.ts`), `/api/csp-report`, a **Security
check** card in Settings → Security & Access, `npm run db:check-security`, and
`/api/push/test` — which had **no authentication at all** and could fire a
notification at every device in the company.

Still open, and cheap: stronger password hashing, and a login throttle that works
across serverless instances (the current one resets constantly).

---

## 4. The Windows app (`desktop-win/README.md` — read before touching)

C# (WPF + WebView2) window around the live site. Holds no keys and no data.
Contents update on every push; only the window needs an installer.

**Four traps, all measured:**

1. **Never `PublishSingleFile`.** Smart App Control blocks it outright — a packed
   self-extracting exe is the shape of a malware dropper. **Not a signing
   problem:** the owner's own unsigned ORI shell has always run, because it ships
   as ordinary files. Do not buy a certificate to fix this.
2. **Never `--self-contained true`.** It ships the whole Windows runtime (51 MB
   installer) and will not fit the 50 MB storage ceiling, which breaks one-click
   updates. Framework-dependent is 2 MB and needs .NET 8 Desktop Runtime; the
   installer checks and says so.
3. **Batch files must be plain ASCII.** `cmd.exe` treated an em-dash in a comment
   as a command and the build died.
4. **WiX 5 via `dotnet wix`,** never the global `wix.exe` (Smart App Control
   blocked it) and never WiX 7 (paid licence).

**Releasing:** bump the version in `OracleConsultancy.csproj` AND
`src/lib/desktop-release.ts` — a test fails if they disagree, because the failure
is otherwise silent and company-wide. Then `build-installer.cmd`, upload to the
private `desktop` bucket, `npm run desktop:hash`, paste the checksum.

⚠️ **The checksum is a security control.** The app downloads that file and RUNS
it. A mismatch is deleted and never run; no checksum means no Download button.

**Known gap:** a *pushed* task reminder does not appear as a Windows toast.
WebView2 hands over non-persistent notifications only, and this SDK has no event
for service-worker ones. Reminders still show inside COS.

---

## 5. Offline Notes (`memory/notes_offline_plan.md`)

**Stage 1 built.** `/notes/offline` is a plain-text writing surface that works
with no connection; drafts live in IndexedDB and sync when the connection
returns.

Two rules hold it up:
- **The device is a postbox, never the record** — a draft is deleted only once the
  server confirms that exact note.
- **`/notes/offline` must never load server data.** It is the only app page the
  service worker caches, and a cached page carrying records would be a copy of
  the owner's records on the device.

Sending is exactly-once: `notes.client_key` + a partial unique index (**0141**).

**Stage 2** (read offline) and **Stage 3** (edit offline) are not built. Stage 3
needs three decisions first — they are listed in the plan file. The main one:
what happens when the same note is edited on two offline devices. Recommendation
on record: **keep both, never lose writing.**

⚠️ The owner must **visit `/notes/offline` once while signed in** to put it in the
cache. It was not driven end to end in testing, because `/notes` is behind his
sign-in.

---

## 6. Habits that earned their keep

- **Measure, do not assume.** Nearly every wrong turn here came from a plausible
  belief: that WebView2 was lighter on memory (it is not), that signing was the
  blocker (it was not), that removing a WinForms reference would shrink a
  self-contained build (it does not).
- **Prove a migration by its effect.** A hand-written migration needs a `when`
  later than the newest APPLIED one or drizzle skips it **and still prints
  "Migrations applied"**. That cost real time on 0139.
- **Run the thing.** The two worst bugs in the desktop app — a window that never
  appeared, and a navigation lock that cancelled its own offline screen — were
  invisible in the code and obvious the moment the built `.exe` was launched.

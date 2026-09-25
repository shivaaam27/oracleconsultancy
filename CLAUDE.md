# COS System - Project Instructions

**⚠️ THE STUDIO REDESIGN IS UNDER WAY (branch `studiotask`, Sept 2026) — read
`memory/studio_redesign.md` before touching any page.** The mockup in
`design/studio-mockup/` is the specification. **The per-page switches are GONE
(25 Sept 2026, owner: "make it a default thing… delete the old design")**: every
rebuilt page (Tasks, task record, Home, Recurring, Calendar, People, Companies,
Files, Settings, the footer) is Studio only, its old version deleted, and
`src/lib/studio.ts` / `ui.studioPages` no longer exist. Pages not yet rebuilt
keep their old look until their turn. **Directors use the same Home and Tasks as
the owner, over their companies — always, no switch.** **Staff (26 Sept 2026)
have Studio Home, Tasks, a task page and Profile under `/portal/*` — NOT via
`getViewer` (read the "Staff on Studio" section of `memory/studio_redesign.md`;
the frame is picked client-side by `PortalFrame` + `isStaffStudioPath`).** Read
`memory/portal_unification_plan.md` and `src/lib/viewer.ts` before touching a
server action: every one is guarded (`guardOwner` / `guardViewer`).

**⚠️ COS IS A TASK-MANAGEMENT SYSTEM AGAIN (21 Sept 2026).** It was split into
six modules behind an `/apps` launcher in Aug 2026 — CocoZuri Operations, the
general ledger, Orders & Imports, Capital projects, Marketing and Recruitment.
**The owner asked for all five of the others to be removed, and for their
tables to be DROPPED rather than kept unreachable.** He was shown the row
counts first and reaffirmed. Migration **0167** dropped **72 tables**; ~440
files and ~888 tests went with them.

⚠️ **THE DATA IS GONE, NOT ARCHIVED.** Orders & Imports held **4,183 rows** of
real PES trading history (2,600 enquiries, 791 PO lines, 347 invoices, 262
payments) and Capital projects **779**. No local backup was taken — he asked
for none. Supabase's own point-in-time backups are the only route back.
**`git revert` returns the screens, never the rows.**

⚠️ **WHAT SURVIVED, AND WHY IT WAS SAFE:** nothing kept imported anything from
those modules except one MCP tool, and **not one foreign key ran from a kept
table into any of the 72** — checked against the live database before dropping,
not assumed. `vendors` is deliberately untouched: it is the shared supplier
register Assets & Vendors owns, which CocoZuri only read from.

⚠️ **THE LAUNCHER AND THE SWITCHER ARE GONE TOO.** `/apps`, the sidebar's
module switcher and the palette's "Modules" section were all removed: a
switcher with one destination is a control that cannot do anything. `MODULES`
in `src/lib/nav.ts` still exists with one entry, because `moduleForPath` is
what draws the rail and a module is cheap to add back.

⚠️ **THE NEW MENU IS A SHORTLIST OF SEVEN, NOT EVERYTHING CREATABLE** — Task,
Note, Event, Person, Document, Company, Announcement. `CREATE_ORDER` in
`entity-view.ts` is the list, and `creatables()` FILTERS to it, so giving an
entity a `create` no longer puts it in the menu on its own. Vendor, Asset,
Commitment and Application are still created on their own pages. All seven were
clicked through and land on a working form.


Start with `memory/v2_plan.md`. The owner is non-technical; explain in plain language and use British English.

## Product

Chief-of-Staff administrator for Oracle Consultancy's portfolio companies (the
parent brand was renamed from "Oracle Group" in V2; note "Oracle Consultancy" is
also one of the companies).

**⚠️ Do not hard-code the company list — read it from the `companies` table.** It
started as seven and is now **thirteen**, and two of the originals were renamed
(the `code_prefix` stayed, which is why task codes still look familiar). Verified
against the live database Aug 2026:

| Prefix | Name | Note |
|---|---|---|
| DS | DSC Ltd | was "Dar Spices" |
| CC | Furaha Innovation Ltd | was "Cocozuri Chocolat" |
| TG | Terra Green Ltd | |
| OC | Oracle Consultancy Ltd | |
| PE | PES Ltd | |
| ME | MES Ltd | |
| PP | Pamoja Plus | |
| V1 | Akasaki Middle East LLC | added later |
| VI | V1 Intertrade Limited | added later |
| PA | Urban Trade Solutions | added later |
| VA | Venture Advisory FZCO | added later |
| RU | Rugantino | added later |
| TA | Tanam Advisory PVT. Ltd | added later |

Single operator. **Auth (V3)**: the whole admin side sits behind one owner password (`/login`, edge gate in `src/proxy.ts` — the Next-16 `proxy` convention, renamed from `src/middleware.ts` in June 2026; cookie `cos_admin`); staff get per-person portal logins at `/portal/login` (cookie `cos_portal`). **`/login` is now one tabbed screen** (June 2026): **Staff Login** (default, identifier+password) | **Administrator** (owner). Optional **owner identity** (name/email in Settings) becomes a required 2nd factor on the Administrator tab when set (blank = password-only, no lockout). **Passkeys (Face ID/Touch ID/Windows Hello/fingerprint)** via WebAuthn for owner AND staff — register in Settings (owner) / portal profile (staff); the login screen offers passkey + conditional-UI autofill. See `memory/auth_login.md`. `createdBy` is normally `"web-ui"`; AI command mutations use `"ai-command"`; staff-portal posts use `"portal:<Name>"`.

The system replaces an Excel workbook with:

- task capture and tracking;
- per-task timeline and audit history, plus a portfolio-wide activity feed (hub Timeline view);
- company and portfolio risk views;
- saved meeting notes and minutes;
- AI-assisted meeting intelligence;
- COS-native voice intelligence;
- per-person reminder drafts;
- Ask COS assistant.

## Stack

- Next.js 16 App Router, React 19, TypeScript 5
- Drizzle ORM 0.45 plus postgres.js
- Supabase Postgres through the pooler on port `6543`
- Tailwind v4 tokens from `globals.css`
- **AI runs on GEMINI. One pair for every lane (Aug 2026): `gemini-3.1-flash-lite` primary → `gemini-3.5-flash-lite` fallback** — fast, smart, vision and the chat picker all use it. The work is indexing and backend chores (high volume, no need for a top model) and the Flash Lites carry the largest daily allowance; both are multimodal, so the same pair reads documents. Env-overridable ladders in `src/lib/ai-models.ts` (`GEMINI_FAST_MODELS`/`GEMINI_SMART_MODELS`/`GEMINI_VISION_MODELS`). Groq is retained ONLY for voice (`whisper-large-v3-turbo`); its `openai/gpt-oss-*` text ladder is dormant unless the provider is switched back.
- next-themes, framer-motion, lucide-react, cmdk, Radix primitives

## Critical Config

- Do not break `src/db/index.ts`: `prepare: false` and `max: 1` are required for PgBouncer transaction mode.
- `DATABASE_URL` must use the Supabase pooler on port `6543`.
- Baseline migration `0000_flaky_amphibian.sql` was applied manually; `scripts/baseline-migrations.ts` marks it applied.
- **⚠️ THE DATABASE IS LOCKED TO THE SERVICE-ROLE KEY. Never GRANT to `anon`.**
  Until 20 Aug 2026 every one of the 128 tables had Row Level Security OFF and full
  grants to `anon` — and `NEXT_PUBLIC_SUPABASE_ANON_KEY` ships inside every page.
  Verified live: that key could read `people`, `settings` (owner password hash),
  `people.portal_password_hash`, `mcp_keys`, `webauthn_credentials` — and PATCH/
  DELETE returned 204. **Migrations 0139 + 0140 turned RLS on for every table (no
  policies) and revoked every anon/authenticated grant, on tables AND functions.** It breaks nothing: COS
  reads and writes only through `sb` (service role) and postgres.js as `postgres`,
  and both carry `rolbypassrls`. The anon key is used ONLY for Realtime
  **broadcast**, which is pub/sub over the socket and touches no table.
  - **Run `npm run db:check-security` after any schema work.** It re-tests RLS,
    anon grants, views, SECURITY DEFINER functions and public storage buckets, and
    exits 1 on a finding.
  - **⚠️ 0139 MISSED THE FUNCTIONS; 0140 fixed them.** `REVOKE … FROM anon` does
    NOT close a function: Postgres grants EXECUTE to the pseudo-role **PUBLIC**
    and `anon` inherits it, so all 156 were still callable while the grants read
    clean. Check with `has_function_privilege('anon', …)`, never with the grant
    table. 0140 revokes from PUBLIC, grants service_role explicitly, and sets the
    default privileges so the next function is closed from birth. **A SECURITY
    DEFINER function is the dangerous case** — it runs with the owner's rights,
    so an open one is a full bypass. There are none; keep it that way.
  - The pg_trgm/pgvector functions stay anon-executable: they belong to
    `supabase_admin`, cannot be revoked from our role, and are pure maths.
  - The other way it reopens: a table created in the **Supabase dashboard** is
    owned by `supabase_admin`, whose default privileges still grant everything to
    `anon` (we are not permitted to revoke those). Create tables via migrations.
  - `postgres_changes` no longer works anywhere (RLS silences it for `anon`). The
    `supabase_realtime` publication is empty, so nothing depended on it; the one
    listener in `cockpit-live.tsx` was removed with 0139. Use broadcast.
- Newer write paths often use `src/db/supabase.ts` and helpers in `src/lib/db-helpers.ts`.
- All wall-clock columns are `timestamptz` (migration `0014`); writes use `.toISOString()` (UTC) and times render in the viewer's local zone (Dar es Salaam, UTC+3). Do not revert to plain `timestamp`.
- **Navigation is TWO things now (Aug 2026, ERPNext redesign).** From `lg` up a **persistent left sidebar** (`desk-sidebar.tsx`) is the navigation — 208px, collapsible to 56px, grouped Work/Records/Operations/System, built from `NAV_ROUTES`. Below `lg` it is the bottom-floating pill (`top-pill.tsx`), which still carries the page action `+`. The pill's vertical `SidePill` variant is RETIRED at `lg`+ (the sidebar replaces it). The sidebar publishes `--desk-sidebar` on `<html>`; `main`'s left gutter follows that variable.
- Admin edge auth gate lives in `src/proxy.ts` (Next-16 `proxy` convention; renamed from `middleware.ts`). The `secret()` derivation here MUST stay identical to `src/lib/admin-auth.ts` and `src/lib/portal-auth.ts`.
- **Security headers** live in `next.config.ts` (`securityHeaders`, applied to
  `/:path*`). Enforced from the start: `X-Frame-Options: DENY`, `nosniff`,
  `Referrer-Policy`, `Permissions-Policy` (camera/microphone/geolocation are
  `self` — the app really uses all three), `Cross-Origin-Opener-Policy:
  same-origin-allow-popups`, and HSTS in production only.
  - **The CSP starts as `Content-Security-Policy-Report-Only`.** Set
    **`CSP_ENFORCE=1`** in Vercel to enforce it — and note `next.config` is read
    at BUILD time, so it needs a redeploy, not just an env change.
  - `connect-src` is an allowlist built from env: Supabase (https + wss), the
    Sentry ingest host from the DSN, and `api.open-meteo.com` for the weather
    chip. **Add an origin the browser calls and you must add it here**, or the
    call dies the day the CSP is enforced.
  - Violations post to **`/api/csp-report`** → `system_events` (kind
    `csp.violation`, filtered out of the activity feed as noise). That route is
    **public on purpose** — browsers send reports without cookies — so it is in
    the `src/proxy.ts` exclusion list and rate-limits itself. It records the
    directive, the blocked ORIGIN and the page path only; `/e/` and `/r/` paths
    are truncated because their token is IN the path.
- **Settings → Security & Access → "Security check"** reports the live state of
  all of this (`src/lib/security-status.ts`): database lock, cookie signing key,
  error alerts, CSP mode. It exists because the important ones are Vercel env
  vars, and a `console.warn` nobody reads is not a warning. It only READS.
- **The Windows app is TWO things, both pointing at the live site** (Aug 2026):
  1. **Install as an app (PWA)** — the primary route. `manifest.json` + `sw.js` +
     `ServiceWorkerRegister` were already there; what was missing was anyone
     telling people. **`InstallApp`** (`src/components/install-app.tsx`) is on
     Settings → General → "Install as an app" AND the staff portal profile.
     Nothing is downloaded, so nothing can be blocked by SmartScreen, antivirus
     or IT policy, and nothing needs signing.
     - **⚠️ `beforeinstallprompt` fires BEFORE React hydrates and never fires
       again.** A `useEffect` listener misses it and the button silently never
       appears — verified happening on production. So **`InstallPromptScript`**
       (same file) is an inline `<head>` script that parks the event on
       `window.__cosInstallPrompt` and relays `cos:installable`. Mount it once in
       the root layout head, beside `PortalPrefsScript`. Do not "simplify" it
       into the component.
     - The service worker is **production-only** (`NODE_ENV !== "production"`
       returns early), so installability cannot be tested on the dev server.
  2. **`desktop-win/` — a C# (WPF + WebView2) app**, a window around the same live
     site, shipped as one self-contained 63 MB .exe (`build.cmd`) or a per-user
     installer (`build-installer.cmd` → MSI wrapped in a bootstrapper .exe, WiX 5
     — **not WiX 7, which demands a paid licence**). It holds no keys and no data.
     **Read `desktop-win/README.md` before touching it.**
     - ⚠️ **A DOWNLOAD IS REPORTED AS A FAILED NAVIGATION, AND THAT IS NOT AN
       ERROR.** WebView2 turns a navigation to a `Content-Disposition:
       attachment` response into a download, then raises `NavigationCompleted`
       with `IsSuccess = false` — correctly, since no page loaded. Reading that
       literally put the app's **offline screen** over a working connection and
       a file that had just saved, and **this window has no back button**, so
       the only way out was restarting the app. `OnNavigationCompleted` now
       ignores a failure that follows `DownloadStarting`, and the offline screen
       carries a **"Go to the home page instead"** escape so no dead end ever
       needs a restart. **Any new dead-end screen needs the same escape.**
     - The web side guards it too, so the fix does not wait on a reinstall:
       `BriefPdfButton` detects the shell via **`window.chrome.webview`** (present
       only in WebView2 — not in a browser, not in the PWA) and fetches the bytes
       instead of navigating. ⚠️ **Browsers and the phone keep the same-tab
       navigation** — the blob + `<a download>` route is silently ignored by iOS
       Safari, and that button is used on a phone.
     - **⚠️ NEVER BUILD IT AS A SINGLE FILE.** Windows **Smart App Control is
       ON and enforced** on the owner's machine and blocks a
       `PublishSingleFile` build outright (CodeIntegrity 3077) — a compressed
       self-extracting exe is the shape of a malware dropper. **It is not about
       signing.** Measured 20 Aug 2026, all unsigned: packed = blocked (portable
       AND installed); unpacked self-contained = runs; framework-dependent =
       runs; installed-as-a-folder = runs. The proof was on the same machine all
       along — the original ORI shell (`Documents/TeachMeAI/shell`) is unsigned
       C# + WebView2 with 13 files beside it and has always run.
       So **signing is NOT required** to hand staff a working app, and SAC must
       never be turned off (one-way — it cannot be re-enabled). The Microsoft
       Store remains a nice-to-have, not the unblocker.
     - `build.cmd` → `publish-folder\` (self-contained, unpacked).
       `build-installer.cmd` → one 53 MB `Setup.exe` (WiX 5 — **not 7, which
       demands a paid licence**) that installs that FOLDER per-user: no admin
       rights, Start-menu + desktop shortcuts, one Add/Remove entry, clean
       uninstall. All verified end to end, unsigned, under SAC.
     - An Electron shell was built first and removed (see history). WebView2 is
       **not** lighter on RAM — measured 592 MB vs Electron's 499 MB; both are
       Chromium.
- **Error monitoring**: Sentry is wired (`src/instrumentation*.ts`, `src/sentry.*.config.ts`, `src/app/global-error.tsx`, `src/lib/sentry.ts`). Inert unless `SENTRY_DSN`/`NEXT_PUBLIC_SENTRY_DSN` are set (in `.env.local` + Vercel). Errors-only (no perf tracing).
- **Backups**: `npm run db:backup` writes a portable per-table JSON snapshot to `backups/` (git-ignored); `npm run db:restore -- <folder>` restores. Supabase cloud backups are the primary safety net (see `BACKUP.md`). **⚠️ ONE backup at the END of a session, not before every migration** (owner, 18 Aug 2026): it takes ~15 minutes on this link, and three of them in a session is an hour of waiting for nothing. Additive migrations (new table/column) go straight in. Back up FIRST only when something drops, rewrites or bulk-deletes existing data.
- **Deploys: ONLY `master`, and push ONLY to `master`** (Aug 2026). `vercel.json` carries
  `git.deploymentEnabled: { "**": false, "master": true }` — `**` not `*`, because minimatch
  does not cross `/` and the branch names have slashes (`claude/…`, `dependabot/npm_and_yarn/…`);
  with `*` it would match only `master` and change nothing. Vercel deploys a branch if ANY
  matching rule is true, so listing `master: true` after the catch-all keeps production live.
  **Do not also push the working branch** — pushing both `HEAD:master` and the branch is what
  produced two builds of identical code (one production, one preview) and wasted a deploy.
- **Dependency security**: `package.json` `overrides` pin patched `postcss`/`esbuild`/`sharp`/`fast-uri`/`nanoid`/`brace-expansion` (keeps `npm audit` clean without breaking downgrades — do not remove without re-checking audit). Dependabot config in `.github/dependabot.yml`.
  - **`npm audit --omit=dev` was clean on 17 Aug 2026 and drifted to 43 findings
    by 17 Sep** — a month of new advisories on packages already installed, not a
    regression anyone introduced. **A clean audit does not stay clean; re-check
    it, do not assume it.** Patched back to 34 on 17 Sep (see below), and every
    one of those 34 is the single deferred tiptap advisory counted per package.
  - ⚠️ **TIPTAP IS PINNED AT 3.30.1 ON PURPOSE.** The fix needs the whole
    `@tiptap/*` set on 3.31.3 together, because `extension-drag-handle-react`
    peer-depends on an **exact** sibling version while `extension-drag-handle`
    is only transitive — so the lockfile pins the old one and npm cannot
    resolve. Every route out is `--force` / `--legacy-peer-deps`, which npm
    itself calls "an incorrect (and potentially broken) dependency resolution".
    The flaw is quadratic-time markdown parsing, it needs hostile input, and
    Notes is owner-only. **Revisit when tiptap's own tree untangles; do not
    force it.**
  - **RESOLVED (17 Aug 2026): the long-standing `brace-expansion` exception is gone.**
    The old note here said "there is no patched 2.x, do NOT add a `brace-expansion`
    override" — that was true when written and is **no longer true**: upstream shipped
    **2.1.4**, which fixes GHSA-mh99-v99m-4gvg while keeping the 2.x default export that
    `minimatch` needs. The fix is a NESTED override so `minimatch` gets the patched 2.x
    while anything else may use 5.x:
    `"brace-expansion": "^5.0.9", "minimatch": { "brace-expansion": "^2.1.4" }`.
    Everything deduped to 2.1.4 in practice. **Verified, not assumed:** a direct
    minimatch smoke test expanded `{a,b}` and `{1..3}` patterns correctly (the exact
    `brace_expansion_1.default is not a function` failure the old note warned about),
    `googleapis` still builds a Calendar client (that RUNTIME chain —
    `googleapis` → `googleapis-common` → `gaxios` → `rimraf` → `glob` → `minimatch` — is
    why it mattered), 323 tests pass and the build is clean.
    ⚠️ If a future advisory hits the 2.x line again, check for a patched 2.x FIRST
    before assuming the only way out is 5.x.

## Current Schema Areas

Core:

- companies (now also letterhead/branding cols: `legal_name`/`address`/`phone`/`email`/`registration_no`/`tin`/`logo_path`/`signatory_name`/`signatory_title`/`letterhead_mode`/`header_image_path`/`footer_image_path`/`background_image_path`/`content_top_mm`/`content_bottom_mm`), departments, person_companies
- **Reference data** (June 2026, managed on the **Companies hub** tabs): `sites` (shared locations — where staff live/work, NOT company branches; seeded from site_tools/asset locations), `job_titles` (managed role list; `people.role` stays free text, rename/merge re-points it), `departments`, `department_heads` (per-company head of a department), `reporting_lines` (secondary/"also reports to" managers; primary stays `people.manager_id`).
- people (now also HR profile cols: `department_id`/`start_date`/`date_of_birth`/`nationality`/`national_id`/`passport_no`/`address`/`emergency_contact_name`/`emergency_contact_phone`/`probation_end_date`; **`work_site_id`/`residence_site_id`** → `sites`; portal auth cols inc. `portal_role`; `previous_staff_ids`; `staff_category`). **Staff IDs** (`<prefix>-<roleLetter><NN>`, e.g. `CZ-E04`/`OC-AH01`/`OC-D02`) are computed live in `src/lib/staff-id.ts` — not stored. See `memory/task_management_2.md`.
- tasks, task_assignees, task_updates
- **webauthn_credentials** — passkeys (Face ID/fingerprint sign-in); `person_id` null = owner, else staff; stores only the PUBLIC key. See `memory/auth_login.md`.

Meetings: meetings, meeting_tasks

Fact ledger (transfer-pack): **facts** — append-only, source-linked facts (salary/shareholding/directors/bank/passport/contract); current = latest `effective_date`, older = history; never overwrite. `factStatus` verified/unverified/stale>180d/incomplete. See `memory/localsystemautomationtooracle.md`.

Governance & Risk (board-level, transfer-pack; kept out of daily/weekly): **cap_table**, **beneficial_owners**, **key_persons**, **signatories**, **resolutions**, **risks** (L×I band), **decisions** (+ companies.`authorised_shares`/`issued_shares`). Surfaced on the company profile (the standalone `/brief/board` board pack was removed June 2026).

In-flight + commitments: **pipeline** (bureaucracy stages To Apply→Issued), **commitments** (leases/insurance/contracts; notice-by = end − notice_days). Both link a supporting `document_id`.

Governance audit: audit_log, corrections

To-dos:

- todos (now also `kind` ["onboarding"/"offboarding"] + `sort_order` — onboarding/offboarding journey steps live here as person-tagged todos; see `memory/todos.md`)

HRMS — Assets & Vendors:

- assets, asset_assignments (durable equipment assigned to a person, or shared to a company+custodian; auto-returned on offboarding)
- vendors (suppliers/contractors/landlords; their contracts are `documents` rows via `documents.vendor_id`)

HRMS — Leave & Attendance (grounded in Tanzania ELR Act 2004):

- leave_types (`default_days`/`cycle_months`/`half_pay_days` — e.g. Sick 126/36mo = 63 full+63 half), public_holidays, leave_requests, **attendance** (one row per person/day; status Present/Absent/On leave/Holiday/Remote/Half-day/Sick — **now writable**: admin register grid + staff portal self-check-in, June 2026; see `memory/hrms.md`)

Documents (manual filing only — Aug 2026):

- documents (`title`/`company_id`/`person_id`/`vendor_id`/`category`/`doc_type`/`issuer`/
  `reference_no`/`issue_date`/`expiry_date`/`reminder_lead_days`/`file_url`/`storage_path`/
  `file_name`/`notes`/`archived`), document_links. Every intake column — quarantine state,
  confidence, dedup hash, renewal lineage, OCR body — was DROPPED in migration 0114.
- inbox (rows kept, unreachable — the intake page and its ingest route were removed)

Letters:

- letters (Draft→Issued lifecycle, frozen `letterhead_snapshot` on issue; per-company branding)

Stock (Supplies): stock_items, stock_purchases, stock_issues
Cleaning (OCR): cleaning_areas, cleaning_days, cleaning_checks

Outreach: reminders, outbox (persisted drafts: `source`/`person_id`/`todo_id`/`scheduled_for`)

Chat: chat_threads (`dm`/`group`; `dm_key` dedup), chat_participants (`last_read_at`/`muted_at`), chat_messages (soft-delete, `attachments` JSON, `task_code`), chat_message_mentions. `notifications.thread_id` deep-links chat. See `memory/chat_system.md`.

Analytics/config/system: daily_snapshots, settings, system_events, undo_tokens

Search/AI (V3 — Jun 2026): **embeddings** (+ `lifecycle` active|history col, migration 0094; lifecycle-aware `hybrid_search`/`replace_embeddings` RPCs) — the semantic index, driven by `src/lib/entity-registry.ts`. **Documents are NOT indexed** (Aug 2026): they are found by plain SQL/full-text matching on what the owner typed. **ai_memory** (migration 0095 — ORI memory: qa/preference/fact); **ai_usage** (migration 0096 — AI spend ledger). Latest migration: **0170** (`task_subtasks` — a to-do list inside a task: `src/app/task/subtask-actions.ts`, `components/studio/subtasks.tsx`; on the task page tab, the side panel and the new-task form). Before it **0169** (Files Management: `folders` + `documents.folder_id/deleted_at/starred/file_size`; see memory/file_manager_plan.md). Before it **0168** (drops `cz_events`, the one CocoZuri table 0167 missed — empty, and the only table left without RLS). Before it **0167** (five modules removed — 72 tables DROPPED; see the
banner at the top of this file. ⚠️ The data is gone, not archived).
Before it, **0166** (`tasks.recurring_rule`).
⚠️ **The 0145–0165 range was CocoZuri, marketing and the ledger** — those
migrations still sit in `drizzle/` because the journal is append-only and
rewriting history would break `db:migrate` for anybody on an older database.
They create tables that 0167 then drops. **Do not delete them.**

See `memory/database_schema.md`.

## MCP — Claude reaches into COS (`/api/mcp`)

Owner asks Claude a question in plain English; Claude answers from the live
system — and, since stage 2, can raise the task too. **Stage 1 (read-only) is
DEPLOYED and in use** (Aug 2026, commit 28d3e6c); **stage 2 (safe writes) is
BUILT**. Stages 3–5 are planned and not started.

**Read `memory/mcp_plan.md` first** — it holds the architecture and links a file
per stage: `mcp_stage1_read_only` → `mcp_stage2_safe_writes` → `mcp_stage3_sign_in`
→ `mcp_stage5_director_portal` (all ✅ done, Aug 2026) → `mcp_stage4_automatic`
(⬜ the only one left). `memory/mcp_extending.md` covers **what happens to MCP when
COS grows** — read it before adding a feature.

**⚠️ FORWARD RULE — ask the MCP question.** Nothing new reaches Claude by itself:
a new page, module or table is invisible until a registry entry exists. That's the
safe default, but it fails *silently*. So when you ship a feature, ask: **should
the owner be able to ask Claude to do this?** "No" is a fine and common answer
(admin plumbing, settings, anything dangerous → do nothing). "Yes" → add ONE entry
to `src/lib/mcp/registry.ts`. Group by SUBJECT, not per button (one tool with an
`action` argument, like `bulk_task_action`) — every description sits in every
conversation's prompt, so **30 (as of Aug 2026)** is fine and 150 would wreck tool-picking.
Three things already flow automatically and need no work: **new rows** in existing
tables, **permission changes** in Settings (re-resolved per request), and a new
`EntityDef` in `entity-registry.ts` (makes it searchable via `search_cos` free).

- **⚠️ MCP NEVER DELETES, AND NEVER SENDS A MESSAGE** (owner's line, Aug 2026).
  "Delete it" → **archive** it. Person-to-person WhatsApp/email becomes an Outbox
  **draft**. **The ONE exception: creating a meeting/event DOES email the
  invitation** (`sendInvitations: false` holds it back). Everything reversible IS
  allowed — complete/close, archive, bulk (≤25). Write tools live in
  `src/lib/mcp/writes.ts` (read its header before adding one); each registers an
  undo token except bulk (`undo_last_change` reverses the caller's OWN write for
  10 min; `mcp.*` handlers in `src/lib/undo-handlers/mcp.ts`). Names resolve to
  **existing** people only — an assistant must never create a member of staff.
  **A staff key never exceeds its portal ceiling** (staff stay on open statuses).
- Endpoint `src/app/api/mcp/route.ts` (Streamable HTTP, `mcp-handler` +
  `@modelcontextprotocol/server`); tools in `src/lib/mcp/registry.ts` — **add ONE
  registry entry to add a tool** (set `write: true` if it changes anything);
  identity in `src/lib/mcp/auth.ts`.
- **Two ways in, ONE caller shape** (stage 3): a bearer key from `mcp_keys` (Claude
  Code, cron) and an OAuth token from `mcp_oauth_tokens` (claude.ai, phone). Both
  resolve to the same `McpCaller`, so tools/scope never branch on the route. OAuth
  server = `src/lib/mcp/oauth.ts` + `src/app/api/mcp/oauth/*` + the consent screen
  `src/app/mcp/connect/`; discovery documents are served through **rewrites in
  `next.config.ts`** (they must sit at the domain root). `src/proxy.ts` must keep
  excluding BOTH `api/mcp` and `mcp/connect`.
- **Task writes go through `src/lib/task-write.ts`** (`createTaskCore` /
  **`updateTaskCore`** / `addTaskUpdateCore`). The web actions in
  `src/app/task/actions.ts` are thin wrappers over them — FormData, undo cookie,
  redirect. **Any new task write path calls the cores**; a second insert would
  drift out of audit.
  - ⚠️ **`updateTaskCore` is a PATCH; the web form is a full REPLACE.**
    `undefined` = leave it alone, `null` = clear it — an assistant asked to move
    a deadline must not wipe the risk rating it never mentioned. The web wrapper
    therefore passes a concrete value for every field its form owns, nulls
    included, which is what keeps its behaviour identical. Do not "tidy" those
    into optional spreads.
  - ⚠️ **`bustTag`, NEVER `updateTag`, anywhere in `src/app/task/actions.ts`.**
    `updateTag` throws outside a Server Action — and it throws AFTER the write
    has committed, so an MCP tool reports a failure for a change that really
    happened. Half that file is reachable from `/api/mcp` now, so all of it uses
    `bustTag`, which tries `updateTag` first and is identical on the web.
- **MCP has the whole of task management** (Aug 2026): `create_task` takes every
  field the form does (department, risk, escalation, meeting date, comments,
  accountability, a standing **repeat** rule, and the portal-only **proof gate**
  `requiresAttachment`), **`get_task`** reads one in
  full with its conversation and each update's id, **`update_task`** patches any
  field, and **`manage_task`** carries the controls that are not fields —
  block/unblock, part done/reopened, and correcting, pinning or taking down an
  update. ⚠️ **`remove_update` is still not a delete** (`deleted_at`, restorable),
  **`assignees` REPLACES the list**, **moving a company re-issues the task code**,
  and **a department is resolved, never created**. A staff caller's tasks are
  stamped `created_by_person_id` so they can still complete their own work on the
  portal. ⚠️ **`creator_close_only` is NOT exposed: the column is written and
  selected but never actually read**, so it restricts nothing. See
  `memory/mcp_stage2_safe_writes.md` § "the task half finished".
- **Permissions are NOT reimplemented.** A caller resolves to the same
  `PortalPerson` the portal builds (`portalPersonById`), so `portal-permissions`
  capabilities and `companyScope()` govern MCP unchanged. Every tool is checked
  twice: the advertised list is filtered, AND each handler re-checks. Keep both.
- `src/proxy.ts` **must** keep excluding `api/mcp` — inside the admin gate every
  request redirects to `/login` and nothing can connect.
- Keys: `mcp_keys` (SHA-256, unsalted on purpose). Mint/revoke in Settings →
  Security & Access. `npm run mcp:key` writes `COS_MCP_KEY` to `.env.local`;
  `.mcp.json` reads it via `scripts/mcp-auth-header.mjs` so no committed file
  ever carries the key.

## Current Pages

- `/` - administrator: Overview, Companies, Tasks. **The Tasks tab opens on the LIST view** (columns, filter rail, sorting, bulk edit); Cards/Board/Calendar/Timeline are one click away in the switcher.
- `/task/new`
- `/task/[code]` - **the task record, as a real page** (Aug 2026). A record is a page with its own URL, as in ERPNext. Everything links here via `taskHref()` in `src/lib/task-href.ts` — never `?task=`. The old drawer still opens for legacy `?task=CODE` links.
- `/registry` - redirects to hub Tasks table
- `/brief` - **⚠️ NOW THE REPORT PANEL (26 Sept 2026)**: `/brief` redirects to `/?report=1` with its filters and `components/studio/report-sheet.tsx` opens (from Home's hero, a company band, a person's ⋯ menu, or `openReport()`); server side `src/app/report/actions.ts` (owner = everything, director = `resolvePortalBriefFilters` scope). Buttons: Download PDF · Email (PDF ATTACHED, `emailReport`) · WhatsApp · Copy · Outbox draft; owner-only notes (`brief_notes`). The old page and its filter/share components were deleted. What follows describes the PDF, which is unchanged. **Director Brief** (V2): glanceable portfolio report incl. completed/closed this month; WhatsApp/Email/Copy share + a **server-rendered PDF** (`src/lib/brief-pdf.tsx`, @react-pdf/renderer; two routes, ONE renderer — `/brief/pdf` and `/api/portal/brief-pdf`). See `memory/outbox_and_reminders.md`.
  - **The PDF wears the ERP skin** (Aug 2026, owner's ask): number cards first,
    then dense panels — ERPNext's ORGANISATION — kept modern, **not** flat grey
    (see the memory note; he rejected flattening once already). Letterhead is a
    soft banded block, the four counts sit on tone-tinted cards, each company
    gets a rounded tinted panel head with its risk as a pill, status is a pill
    rather than a dot and a word, and a company with no logo gets `initialsOf()`
    on the accent. **Content did not change** — same sections, same order, same
    six columns.
  - ⚠️ **@react-pdf/renderer PRINTS NEITHER A SHADOW NOR A GRADIENT, AND FAILS
    SILENTLY.** All depth is a flat fill plus a hairline. `TONE_BG`/`TONE_LINE`
    map a tone to its wash and border; reach for anything else and it renders as
    nothing at all.
  - ⚠️ **A `wrap={false}` BLOCK TALLER THAN THE PAGE IS CLIPPED, NOT MOVED.**
    Rows are unbreakable so they never split mid-cell — which silently cut the
    end off a long "Latest update". `textHeightPt()` estimates the height and
    `rowMustBreak()` lets a page-tall row split instead; the generic `Table`
    rows carry the same guard. **Never clamp prose to a character count to dodge
    this** — that is what printed "…and forwarded" at a director.
  - ⚠️ **A COMPANY'S TABLE FLOWS UNDER ITS PANEL HEAD, NOT INSIDE A BOX.** A
    bordered box that breaks across a page has its border redrawn on both
    fragments, and a company's table is exactly the thing that breaks.
  - The download name is `briefPdfFilename()` — `Director Brief` + person, else
    company, else brand + the period's own label. **No day stamp**, so two
    briefs run a fortnight apart share a name (the owner was asked and said to
    leave it).
- `/hrms` - redirects to `/hrms/command-centre`. **`/hrms/command-centre` is labelled "Tax & Legal"** in the UI (launcher + page header; route path unchanged) — recurring tax/statutory/legal obligations. See `memory/hrms.md`.
- `/hrms/supplies` - **Supplies** — office consumables (items, purchases, issues). Renamed Aug 2026 from `/hrms/oecr` "OECR" (it never held equipment — that is Assets); the old path redirects.
- `/hrms/assets` - **Asset & Vendor Register** — durable equipment (assign to person/team, auto-return on offboarding) + vendor/supplier register; segmented Assets/Vendors toggle
- `/hrms/leave` - **Attendance** — segmented **Register | Holidays** tabs. Month grid, brush-to-paint status, company filter, "mark all Present today"; Holiday auto-filled from `public_holidays` (editable on the Holidays tab). The wider Leave module (types/requests/approvals/balances) was REMOVED Jul 2026 — mark "On leave" directly on the register. See `memory/hrms.md`.
- `/hrms/cleaning` - **Cleaning** — daily cleaning checklist. Renamed Aug 2026 from `/hrms/ocr` "OCR", which collided with OCR the document-reading sense; the old path redirects.
- `/hrms/pipeline` - **Applications in progress** (transfer-pack) — kanban of in-flight bureaucracy (permits/visas/licences): To Apply → Applied → Control No. Issued → Paid → Receipt Received → Issued; attach a supporting document. See `memory/localsystemautomationtooracle.md`.
- `/hrms/commitments` - **Commitments** (transfer-pack; renamed Aug 2026 from `/hrms/registers`, old path redirects) — leases/insurance/commercial contracts with **notice-by = end − notice_days** (flagged when notice is due soon); attach a supporting document.
- `/companies` - **Companies hub = reference-data centre**: tabs **Companies · Departments · Sites · Roles** (`companies-hub-tabs.tsx`); each ref list has add/rename/**merge**/delete. `/companies/[id]` = company detail (Overview/Profile/Tasks/Timeline/Org).
- `/people` - person record now has HR profile fields inc. **Work site + Residence** (shared `sites` list, combobox), a glanceable drawer (hero tiles + accordion sections), manager + N-direct-reports on cards, a **Direct reports** list + an **All Locations** directory filter. Bulk "also reports to" in the select bar.
- `/files` - **Files Management** (24 Sept 2026, replaces `/documents`, which redirects): folders (migration 0169), Dropbox-style list/grid, animated folders, drag-drop upload, preview, Deleted kept 30 days. **Read `memory/file_manager_plan.md` first.** ⚠️ Links use `?co=` / `?pe=` / `?open=`, never `?company=` (that opens the global drawer).
- `/portal`, `/portal/login`, `/portal/board`, `/portal/meetings` (**Briefings**), `/portal/task/[code]`, `/portal/profile` - **Staff portal**: per-person sign-in (password set in Settings → Staff portal access; scrypt hash on `people.portal_password_hash`, signed cookie session), staff see only their own tasks, post updates (`created_by: "portal:<Name>"`), limited status moves (never Completed/Closed). Profile carries: Your documents, **Your attendance** (self check-in + week strip), onboarding, equipment, **passkeys** ("Sign in faster"). A minimal **attendance check-in pop-up** auto-opens once/day on landing. Admin chrome hidden on portal routes. See `memory/portal.md` + `memory/portal_scope_and_event_cascade_jul2026.md`.
  - **Home vs board (Jul 2026):** `/portal` **home is staff + HR only** — hero unified with the board hero (`portal-home-hero.tsx`, slim stats pill), tasks in a **scroll housing**, full-width To-Do List, Raise-a-request below it, announcements as a dismissible header banner (`announcement-banner.tsx`). **Directors AND managers are board-first** (`/portal/board`, redirected from `/portal`); managers' team tools fold onto the board (team-attendance glance moved to the Directory's **Attendance** tab, leave-to-approve, personal To-Do List).
  - `/portal/meetings` = **Briefings** (nav label "Briefings", `portal-briefings.tsx`): tabbed **Meetings** (agenda, badge = starts within 3 days) + **Announcements** (feed, badge = unacknowledged). Announcements no longer inline on home/board — banner + this tab.
  - **Board** (`director-board-client.tsx`, managers + directors): greeting hero · task composer (managers Task-only, directors Task/Event/Message) · Outbox link · Next meeting · then two **scroll-housed** columns — **Needs you** (overdue-first cards, tap opens the task, swipe = remind) + **Company health** (heat tiles, worst-overdue-first, "No open tasks" when a company is empty). List ordering = worst-first everywhere (DESIGN_SYSTEM.md §12). Managers with <6 companies get the To-Do List in the right column instead of a footer.
  - **Portal roles** (`people.portal_role`): staff | manager | hr | director. **Company-scoped director** ("Company Director", `people.director_company_id` set, migration 0097): full director board + powers but STRICT to ONE company — set it in Settings → Staff portal access. Scope is enforced through ONE place: the helpers in `src/lib/portal-auth.ts` (`seesAllCompanies`/`companyScope`/`isScopedDirector`) — the data-side twin of `src/lib/portal-capabilities.ts` (UI). **FORWARD RULE:** route every new data-visibility decision through those scope helpers (not a raw `=== "director"`). **Portal permissions are owner-configurable** (Settings → Portals → "Roles & permissions"): per-role capabilities + data-scope (own/companies/all) in `src/lib/portal-permissions.ts` (pure; defaults = old behaviour), stored as one settings row, resolved ONCE onto `PortalPerson` as `scopeLevel` + `caps`. Scope helpers read `p.scopeLevel`; every portal action gate + UI affordance reads `me.caps.<key>`; `canManageTask` takes `viewer.canManageAny`. **To gate a new portal ability by config, add a `CapabilityKey` + default and read `me.caps.<key>` — don't hard-code the role.** See `memory/portal_permissions_engine.md`. **⚠️ PORTAL ACCESS HAS ONE DOOR (29 Aug 2026):
    `src/lib/portal-access.ts` — `grantPortalAccess` / `changePortalRole` /
    `revokePortalAccess` / `writeDirectorScope`. Settings' forms and the People
    drawer's quick actions are thin wrappers. **Nothing else may write
    `portal_role`, `director_companies` or `director_company_id`** — there were
    three writers offering three different role lists, and only one of them
    cleared a demoted director's scope in BOTH places it is stored, so promoting
    them again silently restored the old companies. Settings → **Portals** now
    holds access, permissions and nudges together (it left Security & Access);
    the list is grouped by level and the company picker shows **only on a
    Director**, because it is the director scope and the server ignores it for
    every other role. The person form's reporting and company fields are in ONE
    section, **Role & companies**. See
    `memory/portal_access_unification_aug2026.md`. ⚠️ **`menuStyle()` in
    `use-anchored-menu.ts` now sets `pointerEvents: "auto"`** — a Radix modal
    puts `pointer-events: none` on `<body>`, and a menu portalled INTO body
    inherits it, so it drew above everything and ignored every click. That is the
    THIRD bug in the same family as the clipping and the z-index. Directors: NO Directory Attendance tab. Shared task list = `portal-tasks-command.tsx` (Home inlines it via its `houseList` scroll-housing prop). Nav pill (`portal-pill.tsx`): frosted for legibility, hover shows a floating name label + icon bounce, create `+` sits after the divider next to the theme toggle, Board/Home tabs use layout-preview icons. Full reference: `memory/company_scoped_roles.md`. **⚠️ adding a 2nd FK from a table to `companies` breaks PostgREST `companies(name)` embeds on that table — disambiguate with `companies!company_id(name)`.**
- `/chat`, `/chat/[threadId]` - **Chat**: free-standing messaging (DMs + ad-hoc groups), separate from task updates. Portal twin at `/portal/chat`. WhatsApp-style messenger UI: full-screen app on mobile (page header + nav pill hidden on chat routes), two-pane glass card on desktop; optimistic send, read receipts, typing indicator, inline image previews. Supabase Realtime broadcast (anon key set) with polling fallback. Primary tab on both nav pills. Plus per-person **read-only `kind="system"` channels** (Jun 2026): **Task reminders** (daily 9am cron + pushes) and **Announcements** (published announcements mirror in, silent). See `memory/chat_system.md` + `memory/reminders_outbox_chat_jun2026.md`.
- `/outbox` - **live, per-person** (Jun 2026): generated fresh from open tasks each load (one card per person, full task list + WhatsApp/Email send); reminders are NOT stored as drafts anymore. Per-task vs all-tasks toggle under each task. See `memory/reminders_outbox_chat_jun2026.md`.
- `/insights`
- `/settings`

**⚠️ NAVIGATION IS ONE MODULE AGAIN (21 Sept 2026).** The six-module split and
the `/apps` launcher were removed with the modules themselves. The sidebar
(`desk-sidebar.tsx`) shows Task Management's groups — **Work · Records ·
Operations** — with **System (Insights/Activity/ORI/Settings) pinned at the
foot**, and the module name at the top is a label, not a door.
- **`src/lib/nav.ts` still holds `MODULES`**, with one entry. `moduleForPath()`
  is what draws the rail and falls back to Task Management, so a page filed
  nowhere still gets a sidebar. **Add a route, add its id to a group**, or
  `nav.test.ts` fails.
- ⚠️ **THE ACTIVE LINK IS LONGEST-MATCH.** "Exact or a prefix" made a section's
  front door light up on every page inside it. The page renders perfectly, so
  only looking at the rail on a sub-page finds this.
- ⌘K lists **every individual page**. That is what made the split safe to undo:
  nothing became harder to reach in either direction.
Navigation (V2): one bottom-floating pill on all breakpoints. Tabs: **Home · Director Brief · Task Management · HRMS** + page-action `+` · Search · Theme. The **HRMS icon opens a single centred "Go to" launcher** (Radix Dialog) listing every secondary destination (**Tax & Legal** [=command-centre], Supplies, **Assets & Vendors, Attendance**, Cleaning, Companies, People, Documents, Outbox, Insights, Settings). Departments/Sites/Roles are managed on the **Companies hub** (no separate launcher entry). Companies/People/Documents are reached via HRMS (and carry a smart `?from=task:CODE` breadcrumb). `src/components/top-pill.tsx`.

Removed standalone routes: `/capture`, `/task`, `/digest`, `/escalations`, `/audit`, `/system-map`, the `/hrms` hub page, and the standalone `/hrms/departments` (departments now a Companies-hub tab). **Removed Jul 2026 (slim-down to pure task management):** `/workbook` (+ Meetings/Notes/To-do tabs), `/meeting`, `/hrms/org` (Organogram — the per-company Org tab on `/companies/[id]` survives), `/letters` + `/letterheads`, `/requests` + `/portal/requests`, `/people/form`, and the Leave half of `/hrms/leave`. Their DB tables were KEPT (data intact, simply unreachable) — nothing was dropped. The desktop sidebar and the dedicated Companies nav tab were removed. **Removed Aug 2026 (documents back to manual):** `/inbox` + `/api/inbox`, `/suggestions`, `/api/dropbox/*`, `/api/cron/auto-sort`, `/api/ask-doc`, `/api/doc-passages`, `/api/company-requirements`, `/api/person-requirements`, `/api/requirement-templates`, and the Registrations tab on Tax & Legal. Their tables WERE dropped (migration 0114) — see "Documents — manual filing".

**Renamed Aug 2026 (one word, one meaning):** `/hrms/ocr` → **`/hrms/cleaning`**
("OCR" also means reading text off a scan), `/hrms/oecr` → **`/hrms/supplies`**
(it holds consumables, never equipment), `/hrms/registers` → **`/hrms/commitments`**,
and the sidebar group **"Registers" → "Operations"** ("register" had meant the
group, that page AND the legacy `/registry` task list). All three old paths are
redirect stubs that carry the query string across, so old links and bookmarks
still work. **⚠️ Nav ids changed too** (`ocr`→`cleaning`, `oecr`→`supplies`,
`registers`→`commitments`); pinned shortcuts are stored as ids and unknown ones
are DROPPED on load, so `LEGACY_ROUTE_IDS` + `resolveRouteId()` in `src/lib/nav.ts`
map old → new. **Rename an id, add a line there.**

**⚠️ When you delete a route, delete its cron entry in `vercel.json` too.** `auto-sort`
was removed in Aug 2026 but stayed scheduled, so Vercel fired a daily 404 at 08:00 for
weeks. Cleared Aug 2026; all 10 remaining `crons` entries were verified to point at a
real `route.ts`. `/api/cron/automations`, `/notify` and `/tick` are unscheduled ON
PURPOSE (morning-run does the first, digests flush the second, `tick` is for an
external scheduler) — don't "fix" them by adding schedules.

## ⚠️ The redesign is under way — Stages 0–3 are built. Read before any UI work

The owner uses ERPNext, loves it, and has asked for COS to be rebuilt in that
shape: flat/grey/dense, one uniform list + record screen everywhere, saved views
and bulk edit. He chose the **full structural rebuild** with the cheaper options
put to him first, so it is a settled decision — roughly 6–9 weeks, staged.

**Read `memory/erpnext_redesign_plan.md` before touching any UI.** It holds the
stages, the decisions, the measurements (already taken — don't repeat them), the
palette, what is deliberately out of scope, and the mockup link.

The key insight in one line: ERPNext's uniformity comes from **metadata**, and
COS already has the seed of it in `src/lib/entity-registry.ts` — extend that with
list columns and form sections and generate the screens, rather than hand-copying
a layout across 58 pages.

**Stage 0** (the preview switch) was built and then **superseded by Stage 1** —
its component and scoped token block are gone.

**Stage 1 is BUILT and LIVE EVERYWHERE** (Aug 2026). The tokens in
`src/app/globals.css` now hold ERPNext's palette, radii and type scale; the glass
materials were rewritten as one flat surface; `rounded-full` is squared globally;
decorative glows and backdrop blur are switched off. **No component was rebuilt**
— the old class names (`.glass`, `.elevated`, `.vibrancy`, `.nav-frost`) survive
and simply resolve to the flat surface, which is why ~94 files needed no edit.
This reaches the staff portal too, by design (shared `globals.css`).

**Aurora is gone. The design language is now "Desk" — read `DESIGN_SYSTEM.md`.**
Its seven rules in one line: flat · grey page / white content · crisp corners ·
dense · hairlines separate · one blue · every screen the same.

**Reverting is one commit** (`git revert`) — no data, settings or migrations are
involved.

**Stage 2 is BUILT too** — the two shells. **Every list is `RecordList`
(`src/components/record-list.tsx`) and every record is `RecordPage`
(`src/components/record-page.tsx`) — do not hand-build either.** The list gives
you a filter rail with counts, URL-driven column sorting, tickable rows and an
"N of M shown" footer; the record gives you header → tabs → 2-column field
sections → right sidebar → activity (with `RecordBody` for records that live in a
drawer). Both are proven on Tasks. Sorting/filtering are **URLs, never component
state**. Their props are shaped to be fed from `EntityDef` in Stage 3.

**Stage 3 is BUILT** — the metadata layer, which is what makes this ERPNext
rather than a lookalike. **`src/lib/entity-view.ts`** (client-safe, declarative,
NO functions) defines each entity's `listColumns` / `filters` / `formSections`;
`src/components/entity-cells.tsx` turns them into shell props via one renderer
per `CellFormat`, with an `overrides` escape hatch for interactive cells.
**FORWARD RULE: to give a new record type a screen, add ONE `ENTITY_VIEWS` entry**
— it inherits the list, rail, sorting, field grid and density. Sort keys in a
page's `SORTERS` must equal the metadata's column keys.

**A record is a PAGE with its own URL** (`/task/CODE`, owner's decision Aug 2026),
reached through `taskHref()` — never `?task=`. The drawer survives only for legacy
links. **Compact is the default density** on the admin side; the portal stays
Comfortable. The working area uses the full screen width (capped 1600px).

**Stages 4 and 5 are BUILT too**, and so is the **persistent left sidebar**
(`src/components/desk-sidebar.tsx` — 208px, collapsible to 56px, grouped from
`NAV_ROUTES`, `lg`+ only; it publishes `--desk-sidebar` and `main`'s gutter
follows it). Converted lists: Tasks, People, Documents, Assets, Vendors,
Commitments. `RecordList` also owns the **column chooser** (`listKey`) and
**bulk edit** (`bulkActions`). Saved views are generalised in
`src/lib/saved-views.ts` (`<listKey>.savedViews` in `settings`).

**Every list FILLS THE WORKING AREA** (Aug 2026). A three-row list used to leave
600–700px of bare grey under it — the owner's "dead space" — on every list in COS.
`src/lib/use-fill-viewport.ts` is now the ONE place that decides how tall a panel
should be; `RecordList` uses it (`fillViewport`, on by default, off for `bare`)
and so does the note sheet. ⚠️ It measures the element's top in DOCUMENT space and
subtracts what follows **by walking the following siblings** — `main.bottom −
el.bottom` is wrong here, because the filter rail sits BESIDE the card and is
usually taller. **Do not reintroduce a `calc(100dvh − 11rem)` guess anywhere.**

⚠️ **`RecordPage`'s `children` render FULL WIDTH UNDER the body.** A record with a
`sidebar` and no `sections` therefore put its form BELOW the sidebar, leaving the
top half of a wide screen blank. Content that belongs BESIDE the sidebar goes in
the **`main`** prop. `children` stays as it was for the task drawer's conversation.

⚠️ **A LIST'S FIXED COLUMNS MUST FIT THE CARD AT `lg`, OR THE NAME COLUMN
VANISHES.** At `lg` two things go wrong at once: the desk sidebar appears and
takes 208px, AND every `hideBelow` column un-hides — so the card gets narrower
exactly as it needs to be widest. Measured on `/cocozuri/products` at 1024px:
card 547px, fixed columns + gaps 548px, and `minmax(0,1fr)` resolved PRODUCT to
**0px** — 127 chocolates listed with no names. `hideBelow` CANNOT fix this; it
folds columns away on small screens and this breaks on the first large one.
- **`gridFor()` in `record-list.tsx` now rewrites every track**: a flexible one
  gets a floor (`minmax(7.5rem,1fr)`) so it can never vanish, and a fixed one
  becomes `minmax(0,Npx)` so the shortfall comes out of columns that can afford
  it. Lists degrade to an ellipsis instead of losing their subject.
- **Still add up your fixed widths.** Past ~450px at `lg`, drop a column or mark
  it **`defaultHidden`** — off by default, still offered in the Columns chooser.
- ⚠️ **A hand-built grid gets none of this.** The stock day book's own
  `grid-cols-[minmax(0,1fr)_…]` collapsed its ITEM column to 0px on a phone. A
  spreadsheet-shaped grid belongs in its own `overflow-x-auto` housing with a
  `min-w-[…]` floor, the way both `/cocozuri/stock` pages now are.

⚠️ **GOING BACK FROM A RECORD PICKS UP WHERE YOU LEFT OFF** (20 Sept 2026,
owner's report on the director portal). A record is a PAGE, which is right — but
the way back was a `<Link>` to ONE fixed address, so opening a task threw away
the filter, the search and the place in the list, and pushed a fresh history
entry on top. Measured live as Pulin: left `/portal/tasks?f=done&q=tra` at 758px,
came back to a bare `/portal/tasks` at 0px with 61 rows instead of 18 — and from
his BOARD he was returned to a Tasks page he had never opened. Three separate
faults, three separate fixes, and they are independent:

- ⚠️ **`html, body { height: 100% }` WAS BREAKING SCROLL RESTORATION EVERYWHERE**
  — the administrator too, and every page, for as long as it has been there. A
  fixed-height `html` plus the `overflow-x: hidden` beside it makes **`body`**
  the scrolling box, so `document.scrollingElement` never moves and
  **`window.scrollY` reads 0 however far down you are**. Next's restoration and
  the browser's own both save and restore that number, so both saved 0. `body`
  now takes `min-height`, and the document scrolls. **Do not put a fixed height
  back on `html`** — and if scroll ever misbehaves again, check
  `document.scrollingElement` before anything else.
- **The address is carried, not guessed** (`lib/return-to.ts`). `RecordList`
  appends `?back=<the list you were on, filters and all>` to every `rowHref`, so
  **every converted list in COS gets this without asking** — that is why it lives
  there and not in each page. `BackLink` (`components/back-link.tsx`) reads it
  and names it, so the link says **"‹ Board"** when you came from the board.
  ⚠️ **`safeReturn` is the gate** — a query parameter is attacker-supplied, and a
  back button that can be pointed off-site is an open redirect. Everything that
  reads the parameter goes through it. ⚠️ **It REPLACES, never pushes**, or the
  browser's own Back walks forward into the record you just left.
  Non-list openers (a feed, a board card, a search result) use **`ReturnLink`**.
- **Your place in the list** (`lib/use-list-place.ts`) — it remembers the ROW,
  never a pixel offset, and scrolls it back into view. ⚠️ **A SCROLL HOUSING IS
  BEYOND THE BROWSER AND NEXT**: the board's columns and the staff home list are
  their own `overflow-y:auto` panels, and no restoration anywhere touches a div's
  scrollTop. `scrollIntoView` moves every scrolling ancestor, which is the whole
  reason a row beats an offset.
  - ⚠️ **IT WATCHES, IT DOES NOT ASSUME — AND THAT IS NOT THE OBVIOUS DESIGN.**
    The shortcut ("after a real history step, trust the browser") worked on
    `/portal/tasks` and did NOTHING on `/hrms/assets`, because
    `history.scrollRestoration` is **"auto"** here and the browser restores
    alongside Next: on one page they agree exactly, on the other the list
    arrived carrying the RECORD's scroll. So one rule everywhere — look every
    100ms from 400ms (restoration lands first, or you nudge a page that was
    about to be right), move ONLY a row that is out of view, stop after three
    still checks, and stop instantly on any scroll, touch or key.
  - ⚠️ **AN ATTEMPT ONLY COUNTS ONCE THE ROW HAS STOPPED MOVING.** A long list
    is still drawing for the first half second and the row's position shifts
    with it; counting those spent the whole budget on a page that had not
    finished, and the safety net put it back at the top.
  - ⚠️ **HOLD A REF TO THE ROW, NOT THE NODE** — React replaces a row's element
    as the list re-renders, and a watcher holding the first one saw
    `isConnected` go false and gave up in silence. The key it is hunting for
    lives in a ref too: the state is cleared as soon as watching starts (the
    mark has to clear), so an `attach` testing the STATE stopped matching on
    the very next render.
  - ⚠️ **ONE LIST PLACES THE PAGE, AND A `listKey` DOES NOT MEAN ONE LIST.**
    `/hrms/assets` renders the Assets list TWICE under the same key, and both
    copies moved the window to their own row in turn — measured 2,944px out.
    The claim is a **module-level lock**, because the thing being fought over
    is page-level; a copy that is not being rendered never takes it. Same fault
    in a different shape on the board, where two lists set NO key and both
    fell back to the pathname — hence the column signature in the fallback.
  - ⚠️ **IT ONLY REACHES `RecordList` LISTS.** A hand-built list in a housing —
    the administrator Overview's "Needs you" — gets the right page and the
    right label, but its panel returns to the top. The fix is to convert it,
    not to bolt a second mechanism beside this one.

⚠️ **A LIST FILTERS AS YOU TYPE — INCLUDING THE ADMINISTRATOR'S TASK SEARCH**
(owner, 21 Sept 2026: *"searching tasks should be responsive and not when i
just type and press enter"*). Every list on `useUrlFilters` had filtered live
for months; the task bar's own box (`task-filter-bar.tsx`) still committed only
on **Enter**, so it was the one search in COS that sat there while you typed.
It now settles 300ms after the keyboard goes quiet. Enter still works, it just
skips the wait.
- ⚠️ **IT REPLACES, NEVER PUSHES.** One history entry per keystroke makes the
  browser's Back button walk backwards through your own typing, letter by
  letter, instead of leaving the page.
- ⚠️ **A `typing` REF IS WHAT STOPS THE URL CLOBBERING THE BOX.** The address
  lands a beat behind the keyboard, so syncing `setText(q)` on every `q` change
  rewrites "reco" back to the "rec" that is only now arriving — the caret jumps
  and letters disappear. While somebody is typing the box is the truth; the
  moment they stop, the address is. Verified by typing a 14-letter word at
  220ms per key, straddling the debounce throughout: nothing lost.
- ⚠️ **⌘K WAS THE ONE OPENER CARRYING NO RETURN ADDRESS.** `go()` in
  `command-palette.tsx` pushed a bare record href, so a task found through the
  palette had a back button pointing at an unfiltered list and whatever you
  typed to find it was gone. It goes through `withReturn`/`markPush` now, like
  every other opener.

⚠️ **A LIST CAN LEND ITS FILTERS TO A SIDEBAR** (`lib/filter-rail-slot.tsx`,
28 Aug 2026). Measured in a director's portal at 1440px: the portal rail took
208px and `RecordList` drew its OWN 184px filter column beside it, so **448px —
31% of the screen — went by before the task list began**. Both are groups of
labelled, counted links; there was never a reason for two columns. The list now
publishes its filters and skips its own column **at `lg` only**, giving the list
925px → **1125px**.
- ⚠️ **NO PROVIDER MEANS NOTHING CHANGES** — `useContext` returns null on the
  whole administrator. The provider is in ONE file, the portal layout. The
  administrator could take the same loan with one line; it was not asked for.
- ⚠️ **`lg:hidden`, NEVER `md:hidden`.** The rail appears at 1024px and the
  filter column at 768px — hide it at `md` and every width from 768 to 1023 has
  no filters at all.
- ⚠️ **Published by CONTENT SIGNATURE, not array identity**, or publish →
  re-render → publish loops for ever.
- ⚠️ **THEY HANG OFF THE TAB THEY BELONG TO — a dropdown from Tasks, not a block
  above the menu.** Put at the head of the rail first; the owner rejected it,
  rightly: opening Tasks pushed Work, People and More down and leaving it pulled
  them back up, **the whole menu moving under your hand on every change of page**.
  Work/Board/Tasks now sit at identical positions on both pages. A page that is
  in no tab (a company's document library) drops its filters at the FOOT of the
  rail, never the head. ⚠️ The chevron is a **separate button** — inside the link
  every attempt to fold would navigate.

⚠️ **A LIST RUNS TO BOTH EDGES ON A PHONE** (`RecordList`'s `bleed`, on by
default, 28 Aug 2026). A list on a phone IS the page, so a border round it is a
frame round the whole display. Measured at 375px: `main`'s 16px gutters left the
card 343px, and every row gave up another 12px each side — **56px of a 375px
screen spent on the fact that the list is "a card"**. It now bleeds through the
gutters below `sm`, drops its side borders and corners, and rows carry 16px
instead of 12px. **From `sm` up nothing changes** — it is a card again. Pass
`bleed={false}` for a list inside somebody else's padded housing; a `bare` list
never bleeds because it has no card to bleed.
- ⚠️ **`border-y` plus a conditional `border-x`, NEVER `border` with `border-x-0`
  over it.** Both set a border WIDTH, so which wins depends on the order Tailwind
  happens to emit them in — a coin toss to build a layout on.

⚠️ **A TAB STRIP SCROLLS SIDEWAYS; IT DOES NOT WRAP.** `ledger-tabs`, `ops-tabs`
and `project-tabs` were plain flex rows: measured at 375px the ledger's is
**499px wide, so the WHOLE PAGE scrolled sideways** and every screen under it
could be dragged off-centre. All three are `overflow-x-auto` with `shrink-0
whitespace-nowrap` links now — the same treatment the note toolbar and the AI bar
already had. **A row of destinations is not a block of text.**

⚠️ **`FluidSelect`'S OUTER SPAN IS `inline-block`**, so the button's own
`w-full` resolves against a shrink-wrapped parent and the control comes out the
width of its longest option — ragged beside full-width text fields.
**`src/components/select-field.tsx`** is the reusable fix, and is also how you
get a FluidSelect into a server-action form: COS uses no native `<select>`, and
a FluidSelect on its own submits nothing.

⚠️ **`gridFor()` FLATTENS AN fr MULTIPLIER.** A column written `minmax(0,1.6fr)`
competes with a `0.9fr` one as an EQUAL, so the first column — the record's
identity — can resolve to its 7.5rem floor and truncate every row. Measured on
`/marketing/posts`: the card is **590px at `lg`** (the sidebar appears AND every
`hideBelow` column un-hides at the same breakpoint), and the title got 120px.
Fix by removing a competing column, not by raising the multiplier.

⚠️ **`Input` in `ui.tsx` IS STILL THE OLD `h-9 rounded-lg` SHAPE** while every
dropdown is `h-8 rounded-md`. Use **`FIELD`**, as that constant's own comment
instructs — a form with two control heights in one column is what it exists to
prevent.

⚠️ **A column marked `sortable` in `ENTITY_VIEWS` must be given a sort href**, or
the header looks clickable and does nothing. `src/lib/use-list-sort.ts` does it
client-side (key and direction in the URL, empties pinned last outside the
direction flip); the tasks table does the same thing server-side.

**Saved views now work on every converted list** (Aug 2026). Assets, Vendors,
Documents and Commitments filter through the URL, not `useState`, via
**`src/lib/use-url-filters.ts`** — give it the defaults, it hands back
`values` / `set` / `dirty` / `query`, keeps anything at its default OUT of the
address, and debounces free-text so typing isn't one navigation per keystroke.
**FORWARD RULE: a new list's filters go through that hook** — a list filtered
with component state has nothing for a saved view to save. Watch for param
collisions when two lists share a page: Assets and Vendors both live on
`/hrms/assets`, so Vendors namespaces its params `vq`/`vcategory`. Saved views
are served by the generic **`/api/prefs/list-views?list=<key>`** (the task-only
`task-views` route and `lib/task-views.ts` were removed; the settings key
`<key>.savedViews` is unchanged, so views saved on Tasks still load).
Commitments had NO filters at all — it gained company/kind/urgency.

## What's next — read `memory/next_features_aug2026.md`

The ERPNext programme is done. The agreed next slice, in the owner's order:
**export any list → a global New menu → MCP Stage 4 → keyboard navigation**,
then a pass over the staff portal (which has had none of this work). That file
holds the design for each, the traps, the other candidates, and what is
deliberately not being done. **`RecordList` is the lever for three of the four**
— build export and keyboard nav there once and every converted list gets them.

**⚠️ MCP Stage 4 is the risky one** and should go last: it is the lane where COS
wakes Claude on a schedule instead of the owner asking. Set a real
`aiMonthlySpendCap` before enabling it — the default is 0 = unlimited.

## Notes — **ALL EIGHT PHASES BUILT** (`memory/notes_module_plan.md`)

`/notes` (the shelf) and `/notes/[id]` (one note, one sheet) are live and in use,
owner-only, behind the admin gate. **Read `memory/notes_module_plan.md` before
touching any of it** — it holds the eight phases, every decision with its reason, and
the traps that cost real time.

- **Editor: Tiptap 3.x** (MIT). `note-editor.tsx` is the sheet;
  `note-editor-mount.tsx` is a one-line client wrapper that exists because **Next 16
  refuses `next/dynamic` with `ssr: false` inside a Server Component**. `immediatelyRender:
  false` is mandatory. The editor is ~122 kB gzip in its own lazy chunk.
- **Tables**: `notes`, `note_folders` (migration **0118**), `note_tags` (**0119**),
  `note_links` (**0120**), plus `todos.note_id` (**0121**). `body_json` (Tiptap JSON)
  is canonical; **`body_text`, `#tags` and `note_links` are all DERIVED and written in
  the SAME save** — if they drift, search, AI and backlinks rot. Legacy notes: the 4
  old `meetings.kind='note'` rows were imported; the originals are untouched.
- **To-dos (Phase 4) are ONE nullable column, `todos.note_id`.** A note's to-do is an
  ORDINARY `todos` row, so it inherits the reminder cron, push, morning digest and
  Home card for nothing. **Do not build a note-only to-do store or a second reminder
  engine.** A tick-box line promotes via `NoteTaskItem`'s `todoId` attribute — which
  is a POINTER, not the truth: the editor re-checks live ids on load, because the
  to-do list can delete a row and knows nothing about notes.
- **Attachments**: the browser uploads STRAIGHT TO STORAGE on a signed URL and the
  server only sees the path (a server action body caps at a few MB — a phone photo is
  bigger). A file becomes an ordinary `documents` row (category "Attachment"); an
  image renders inline, any other file becomes a document `@` chip. ⚠️ **An image's
  `src` is the permanent `/api/notes/file/<id>` route, NEVER a signed URL** — signed
  URLs expire and a note is read years later.
- **Unlinked mentions** offer names typed without an `@`; **accepting rewrites the
  text into a real mention** rather than inserting a link row, so links stay derived.
- **AI (Phase 5)**: Tidy · Summarise · Find the jobs · Name it, plus **Ask your
  notes** on the shelf. ⚠️ **Every action is a PROPOSAL — none of them writes.**
  Accepting a rewrite snapshots a version first. A whole-note polish returns plain
  prose, so the panel warns when the note holds a table/picture/callout.
- **Search (Phase 6)**: notes are a first-class indexed type. ⚠️ Besides the
  `EntityDef`, **`SearchResultType` in `search.ts` is a separate hand-maintained
  union** that also needs the type. Re-index on a **20s idle and on close, never on
  save** — autosave is ~1s and embedding at that rate is money on fire.
- **Versions** (`note_revisions`, migration **0122**) are taken before an AI rewrite,
  before a template, and on "Save a version" — never per autosave. Restore snapshots
  the current text first. ⚠️ Restore and apply-template **reload the page**: the open
  editor holds body + `updated_at` in refs a re-render does not reset.
- **Templates** are notes with `kind='template'` — no new table, no new screen.
- **MCP (Phase 7)**: `notes` (list|get|search) + `note_write` (create|append|archive).
  ⚠️ **Owner-only, enforced twice** (no capability AND a `caller.kind` refusal) — a
  note may hold what the owner thinks about a member of staff. **`append` never
  replaces; there is no delete.**
- **Client/server split**: `lib/notes.ts` and `lib/note-links.ts` are server-only
  (they import `sb`); **`lib/notes-shared.ts`** and **`lib/note-links-shared.ts`** are
  what client components import. Getting this wrong kills every page with
  "SUPABASE_SERVICE_ROLE_KEY is not set".
- **Done**: shelf (RecordList + `ENTITY_VIEWS.note`, two-line rows), autosave with an
  `updated_at` staleness guard, pin/folder/archive, Quick Note, the **`/` menu**
  (`note-slash-menu.tsx` — add a command = one entry in `ITEMS`), tables, `#tags` +
  tag rail, **daily notes** ("Today", EAT-based, partial unique index), and **Phase 3:
  `@` mentions of task/person/company/document, `[[note]]` links, a Links + Backlinks
  rail, and a Notes tab on the task, person and company records**.
- **Offline notes — ALL THREE STAGES BUILT (21 Aug 2026).** `/notes/offline` has
  two halves: **Write** (a new note) and **Your notes** (read every note, and write
  into one). ⚠️ **The page must never load server data** — it is the ONLY app page
  the service worker keeps (v13), and a cached page carrying records would be a
  copy of the owner's records on the device. Everything it shows comes from
  IndexedDB after it mounts. **The page must be visited once while signed in** to
  enter the cache (the service worker is production-only, so this cannot be tested
  on the dev server).
  - **Stage 1 — a new note.** Drafts in IndexedDB (`src/lib/offline-notes.ts`),
    deleted **only** once the server confirms them. `notes.client_key` + a partial
    unique index (**0141**) makes sending exactly-once.
  - **Stage 2 — read everything.** `GET /api/notes/offline-cache` hands over the
    whole collection (it is ~10 KB); the device replaces its copy wholesale, which
    is the only way a deleted note also disappears here. Rendered by a hand-written
    reader (`offline-note-body.tsx`), NOT Tiptap — the editor is a lazy 122 kB
    chunk and reading must not depend on it being cached. ⚠️ **The copy is cleared
    when the session ends**: on the sign-in screen (`forget-offline-notes.tsx`),
    and on any 401/redirect from the cache route. It never clears unsent writing.
  - ⚠️ **OFFLINE LOOKS LIKE COS, and that is the point** (owner, 21 Aug 2026).
    `/notes/offline` renders the REAL shelf (`RecordList` + `ENTITY_VIEWS.note`)
    and the REAL note page — same rail, same columns, same sheet measured to the
    bottom of the window — fed from IndexedDB. One bar says you are offline and
    what is waiting; things that need the server (Pin/Archive/template/to-dos/
    links/versions) are shown and held back WITH A REASON, never removed. Filters
    and rows use `onSelect`/`onRowClick` rather than links, because following a
    link with no connection asks the server for a page it cannot answer. The
    service worker (v14) redirects `/notes/123` → `/notes/offline?note=123`.
  - **Stage 3 — write into an existing note.** **Add to this note** (always; goes
    on the end, so it cannot destroy formatting and cannot conflict) or **Rewrite
    it** (only when `docIsPlain`, or a table/picture/mention would be thrown away).
    ⚠️ **Conflicts keep BOTH** — if the note moved on at the server, the device's
    version becomes its own note *"(also edited offline)"* and the original is
    untouched. Never lose writing.
  - ⚠️ **Migration 0144 `note_offline_edits`** is what stops a retry appending the
    same paragraph twice (`client_key` only covers new notes). **Apply then record**
    — the reverse loses writing when it fails; `note_id` is ON DELETE SET NULL so
    the receipt outlives the note.
  - ⚠️ **A CACHED PAGE MUST BE CACHED WITH ITS OWN JAVASCRIPT.** Assets are cached
    as they are requested, but the first visit's requests happen while the worker
    is still installing and nothing is controlling the page — so one visit cached
    the HTML and **zero chunks**, and going offline gave a white screen. The
    worker (v15) now reads the page's `/_next/static/…` URLs out of its HTML and
    caches them with it, on install and on every later visit (a deploy renames
    every chunk). Measured: 0 chunks before, 46 after, from a single visit.
  - ⚠️ **`navigator.onLine` IS NOT "can I reach COS".** It is true whenever any
    network exists — a hotel portal, a dropped VPN, a bar of signal carrying
    nothing, the site being down. It printed "Connected" over a page that could
    reach nothing. `refreshNoteCache()` reports `reachable`, false only when a
    request gets no answer (a 401 counts as reached). Use that, not `onLine`.
  - ⚠️ **`open()` in `offline-notes.ts` asks for NO IndexedDB version** and repairs
    a missing store by reopening one higher. Naming a version the browser is
    already AT never fires `onupgradeneeded` again; naming one it is PAST throws
    `VersionError` forever. Both were hit for real. Do not reintroduce `DB_VERSION`.
- ⚠️ **ON A PHONE THE SHEET IS THE SCREEN** (Phase 8, 28 Aug 2026). Measured at
  375×812, the writing had **277px of an 812px screen** — a 343px bordered card
  with a control row above and three panels below. Now **734px (90%)**:
  `fixed inset-x-0 top-0 h-[100dvh]` below `lg`, edge to edge, no border.
  ⚠️ **`top-0 h-[100dvh]`, never `inset-0`** — `bottom-0` resolves against the
  LARGE viewport on iOS, putting the last line under Safari's address bar; `dvh`
  follows the bar and the soft keyboard. ⚠️ **z-50 covers the nav pill (z-40), so
  `top-pill.tsx` needed no change** — but covering it means **the way out must be
  in the toolbar** (a back arrow), because the browser's own back often goes
  somewhere else entirely. Folder/pin/archive/to-dos/links/versions moved behind
  **"⋯"** into a `BottomSheet` (`note-extras.tsx`, via a `cos:note-extras`
  event) — **nothing removed, only moved**, and the trigger sits among the tools
  rather than floating over the writing. ⚠️ **Room under the last line
  (`pb-[40vh]`) is the whole of "immersive"**, and it is NOT paired with the
  typewriter scrolling `full` uses — mobile browsers already scroll the caret
  into view and a second script fights them. ⚠️ **No `opacity-40` dimming on
  touch**: it promises that hovering brings the toolbar back, and a finger cannot
  hover. Desktop is untouched.
- ⚠️ **`src/lib/use-media-query.ts` is the shared one — do not hand-roll an
  eleventh `matchMedia`.** Its initial value is read SYNCHRONOUSLY where there is
  a window, because a hook that starts `false` renders one frame of the wrong
  layout. **Prefer a Tailwind variant**: it is for BEHAVIOUR (a scroll lock, an
  effect that must not run, a component that must not be in the tree), never for
  layout CSS can express.
- **Writing fills the screen** (19 Aug 2026). The sheet MEASURES its own top and
  takes the rest of the window — the old `calc(100dvh - 11rem)` guess left a band of
  dead grey under the paper. ⚠️ It only reclaims `<main>`'s bottom padding from
  `xl` up; below that the padding is holding the floating nav pill off the content.
  Plus **full screen** ("just the writing" — toolbar button, ⌘⇧F, Esc): the sheet
  goes `fixed inset-0 z-50`, which COVERS the rail/pill/bell rather than hiding
  them, with typewriter scrolling holding the live line in the middle band. Esc is
  guarded on `!e.defaultPrevented` so it never closes out from under an open `/`,
  `@` or `[[` menu. See `memory/notes_module_plan.md`.
- **Also built 21 Aug 2026**: **smart folders** (saved views on the shelf,
  `note.savedViews`), **"Write a note about this"** on a task/person/company —
  which writes an `@`-mention into the BODY, never a `note_links` row, so the rule
  below still holds — **daily-note templates** (one setting, `notes.dailyTemplateId`,
  seeded on CREATE only), **long-press drag on touch** (`note-touch-drag.tsx`; the
  index maths is the pure, tested `blockMovePlan`), and **AI "suggest links"**
  (the model picks from NUMBERED candidates and its quoted phrase is checked
  against the note before it is offered, because accepting rewrites those words).
  **Voice into a note is the one thing on §13's list still not built.**
- **A link is DERIVED FROM THE WRITING.** `note_links` is rewritten from the document
  on every save, so the only way to make one is to `@`-mention it in the note. There is
  deliberately **no "attach a note" button** on a task — a link made away from the
  writing is one the writing does not know about, and the two would drift.
- ⚠️ **Owner-only is structural**: no `visibility` column, no portal twin. `/notes`,
  `/api/notes/linked` and `/api/note-mentions` must stay OUT of the proxy matcher's
  exclusion list (verified: all three redirect without the admin cookie). A note linked
  to a task is still invisible to staff.
- ⚠️ **A Tiptap document MUST be JSON-cloned before it crosses a server action**
  (`plainDoc()` in `note-editor.tsx`). ProseMirror builds `attrs` with
  `Object.create(null)` and React's Server Action serialiser drops null-prototype
  objects **silently** — mentions arrived stripped of every attribute and nothing
  errored anywhere.
- ⚠️ **Every `Suggestion()` in one editor needs its own `pluginKey`** — they all
  default to `suggestion$`, and a collision takes the whole note page down. Three are
  live (`/`, `@`, `[[`). Add a trigger, add a key.
- ⚠️ **Caret-anchored menus position through `lib/suggestion-position.ts`**
  (`createMenuPositioner()`), shared by all three. It **caps the menu to the room on
  the side it opens into**, so it cannot run off the screen, and re-places on update,
  scroll (capture) and resize. Each menu used to carry its own copy of the maths and
  the `/` menu hung 189px below the fold at the foot of a long note. Do not hand-roll
  it again.
- ⚠️ **ONE ROW, ONE WRITER.** The note's whole safety model is a single `updated_at`
  precondition, so the title travels with the body in `saveNoteBody`. The old
  `renameNote` was a second writer and it made the body **stop saving** the moment you
  typed a title. Do not add another update path.
- **"Where am I?" on the page**: the caret is the **accent blue**, and a soft band
  sits behind the block you are writing in (`note-active-line.tsx`), shown only while
  the editor is focused and never on a selection, a table or a code block. Both exist
  because Phase 1.5 deliberately removed the focus ring from the writing surface, which
  left a 1px hairline caret as the only "you are here". CSS cannot thicken a caret, so
  the fix is a bigger target for the eye, not a bigger caret. Gated on
  **`.ProseMirror-focused`, not `:focus`** — `:focus` stops matching when the window
  loses focus and the band would flicker on every app switch.
- ⚠️ **No native `<select>`/`<datalist>`** anywhere (use `FluidSelect`/`Combobox`), and
  **`outline-none` cannot beat `*:focus-visible`** — the writing surface needed a
  scoped override. Tailwind v4's Lightning CSS also **silently drops** modern CSS
  properties from `globals.css`; set those inline.

⚠️ **`useFillViewport` counts a following sibling only if it starts BELOW the
element's midpoint.** "After in the markup" is not "below on the screen": a note's
links rail comes after the paper in the DOM but sits BESIDE it from `xl` up, and
subtracting it left the note sheet 443px tall in a 1080px window with a field of
grey under it. Do not go back to counting every following sibling.

⚠️ **A `?new=1` flag that CREATES a record must be consumed before the record is
made.** `/notes?new=1` redirected to the new note and left the flag in the history,
so pressing Back re-fired it and made another empty note — every time, with no way
back to the shelf. `notes-shelf.tsx` now `history.replaceState`s to `/notes` first.
The other `?new=1` pages open a FORM rather than creating immediately, so they are
not affected — keep it that way.

**People can now be permanently deleted** (Danger zone on the person record).
Deactivate is still the normal answer. ⚠️ Four FKs to `people` are ON DELETE NO
ACTION (`tasks.owner_id`, `tasks.created_by_person_id`,
`tasks.blocked_on_person_id`, `department_heads.head_person_id`) — the action
clears them in-transaction first, and **any new NO ACTION FK to `people` must be
added there** or deleting will start failing.

## Design language — "Desk" (DEFAULT for everything, Aug 2026)

The visual + interaction system is named **Desk** (ERPNext's own word for its
working interface — which is what it borrows). It replaced **Aurora**, the
liquid-glass language, in Stage 1 above. **Every new page, dialog, pop-up, search
surface, panel, drawer or feature uses Desk by default — do not invent a new
look, and do not reintroduce glass, blur, glows or pills.**

Desk = **flat** (one solid surface + a hairline; no glass, blur, glow or
gradient) · **grey page `#f4f5f6`, white content** · **crisp corners** (4px chips,
6px controls, 8px cards — nothing is a pill) · **dense** (13px body, 9px rows,
4px on Compact) · **ONE CONTROL BOX everywhere** (`h-8` · `rounded-md` ·
`text-sm`, declared as `CONTROL_BOX`/`FIELD` in `ui.tsx`) · **never
`text-[Npx]` for body text** — `text-xs`/`text-sm`/`text-base` are wired to the
density tokens and a pixel literal opts out of them · **hairlines separate, shadows only float** · **one blue
`#2490ef`** with semantic colour kept separate · status as small dots/text, never
blocks · glanceable, every-number-a-door · calm 120–240ms motion (`Reveal`,
`lib/motion.ts`), reduced-motion safe · **every screen works the same way**.

Reuse the kit (`Card`, `Panel`, `CockpitModule`, `Switch`, `TONE`, `Badge`/`Pill`,
`EntityDrawer`, `BottomSheet`, `FluidSelect`/`Combobox`) — never a one-off when a
kit piece exists. New page? `data-page-header`. New list? `data-list-row` /
`data-list-head`. **Full reference + "how to apply Desk to a new
page/popup/search/feature": `DESIGN_SYSTEM.md` — keep it updated.**

## Onboarding tours (PLANNED — see `memory/onboarding_tours.md`)

Guided first-run walkthroughs + ongoing feature spotlights for the portals/admin
(in-house Aurora component, `tours`/`tour_completions` tables; not built yet).
**Forward rule:** when you add a user-facing button/panel, give it a stable
`data-tour="<name>"` tag. If the feature is notable, add one `spotlight` row to
the `tours` table (new `version`, today's `active_from`) so it self-guides once
per person. Adding a guide = inserting a DB row, no engine change.

## Reusable UI (June 2026)

- **`components/combobox.tsx`** — typeable, app-anchored dropdown that also accepts new values; **replaced all native `<datalist>`** (their popup mis-rendered). Used for person Department/Work site/Residence/Role, bulk Set-department, asset Category, note Folder.
- **`components/settings-card.tsx` + `settings-sections.tsx`** — Settings is **sectioned** (June 2026): a left rail (desktop) / chips (mobile) picks ONE group and only that group's cards show — `SETTINGS_GROUPS` in `settings/page.tsx` is the order (General · AI & Voice · Automation · Email & Integrations · Security & Access · Notifications & More). The old single mega-`saveSettings` form was split into per-section forms; each carries a hidden `__keys` (the setting keys it owns — `saveSettings` keeps only those, so one section's save can't wipe another's absent toggles) + `__section` (reopens that group after the round-trip). Deep link `#card-id` opens its group; the active group also persists in sessionStorage. A **search box sits above the rail** — typing filters cards across ALL groups by `data-search` (title + each card's `keywords` prop) and hides save-bars while filtering. Cards are slim Aurora `elevated` tiles (trimmed one-line `desc`); boolean toggles use **`components/form-switch.tsx`** (`FormSwitch` — the iPhone `Switch` + a hidden `on`/`off` input so it submits inside the server-action form). (Replaced the old `settings-nav.tsx` scroll-spy.)
- **`components/reference-admin.tsx`** — generic add/rename/merge/delete list manager (Sites, Roles; Departments has its own `departments-admin.tsx`).
- **`components/passkey-manager.tsx`** — add/list/remove passkeys (owner Settings + staff portal profile).
- **`components/bottom-sheet.tsx`** — `BottomSheet` / `SheetButton`: the canonical iPhone action sheet (grabber + drag-to-dismiss spring, glass, safe-area, sticky footer CTA; **centred glass dialog from `sm` up**; reduced-motion safe; portals to `document.body`, Esc + background scroll-lock). Use for any portal action form/pop-up. Adopters: director task/message/event forms.
- **`SwitchRow`** (in `components/ui.tsx`) — full-width tappable settings row with the iPhone `Switch` on the right ("toggle as a slider"); owns the click + `role="switch"`. Use for sheet options + settings lists.
- **`CaretInput` / `CaretTextarea`** (in `components/ui.tsx`) — transparent compose fields with a blinking-caret + placeholder overlay while empty; the bordered ROW owns the ring. Use the `.bare-field` class (in `globals.css`) on any field that should drop the global inset well + focus chrome. **Name must NOT start with `caret-`** — `cn()`/tailwind-merge folds `caret-*` together and drops it.
- **`lib/use-swipe-row.ts`** — `useSwipeRow({ leftWidth, rightWidth })` → `{ swiped, offset, dragging, bind, reset }`: the one swipe gesture for action rows. Axis-locked (a vertical scroll never engages), finger-following, settles past ~40% else snaps back. Put `{...bind}` + Tailwind `touch-pan-y` on the moving element. Adopters: board `AttentionCard`, `PortalTaskCard`, tasks-command `TaskRow`. **Reuse it — never hand-roll touch handlers.**

## Voice Intelligence

Voice is now a shared product layer, not only a microphone button:

- `src/components/voice-button.tsx` accepts a language code and streams Web Speech API text.
- `src/app/voice/actions.ts` polishes rough dictation through Groq with rule/no-key fallbacks.
- Settings stores `v2.voiceLanguage` and `v2.voiceDictionary`.
- Supported starting languages: English (`en-GB`), Swahili (`sw-TZ`), Hindi (`hi-IN`), Gujarati (`gu-IN`).
- Meeting notes, Quick Capture, and task updates use "speak rough, save polished" behaviour.
- Ask COS dictation now follows the browser language instead of a hardcoded speech locale.

## HR & Admin Operating System (V3 — in progress)

Built on the principle **reuse, don't duplicate** (tasks/todos→checklists, Supplies→assets, Outbox→messages, Home/Brief→signals). Master plan in `memory/v3_plan.md`. NOTE: the document-compliance half of V3 was removed in Aug 2026 — see "Documents — manual filing".

- **Person types** (`src/lib/person-types.ts`): `local_staff` | `expat` | `outsider` | `candidate` (+ legacy normalisation).
- **Onboarding/Offboarding journeys**: a checklist of `todos` tagged `kind`; auto-created for new staff (and offboarding on archive); shown in the person drawer.
- **Assets & Vendors** (`src/lib/assets.ts`, `src/lib/vendors.ts`): durable assets assigned to person or team+custodian; vendor register with contracts reusing documents.
- **Leave & Attendance** (`src/lib/leave.ts`, `src/lib/attendance.ts`): ELR-Act-accurate leave (Mon–Sat working days minus holidays; Annual 28/12mo, Sick 126/36mo = 63 full+63 half, Maternity 84, Paternity 3, Compassionate 4). Director Brief has an HR section. **Attendance now fully wired** (June 2026): admin register grid + staff self-check-in (trusted, manager can override; status-per-day, no clock in/out).
- **People locations** (`src/lib/sites.ts`): a shared `sites` list (work site / residence per person) — places staff live or work, not company branches. Managed on the Companies hub Sites tab.
- **Reporting structure** (`src/lib/org-chart.ts`, `src/lib/org-actions.ts`): manager / "also reports to" / department heads, surfaced on the company Org tab and across People (cards, drawer Direct-reports, bulk also-reports-to). The standalone Organogram page was removed Jul 2026.
- **ELR Act 2004** grounding: see `memory/v3_plan.md` for the calc rules (overtime 1.5×, night +5%, Sunday/holiday ×2, severance 7 days/yr, notice 28 days, wage table s.26). NOTE: wage fields, the pay/final-pay/severance calculator, and all money figures (leave liability, sick-leave cost) were removed June 2026 along with the board pack — leave day-tracking remains; the ELR rules are kept here for reference only.

## Documents — manual filing (Aug 2026)

The document intelligence layer was **removed** at the owner's request: it was getting in the
way of the work. What went: Dropbox sync + the auto-sort cron, the sorting desk / quarantine /
Trash queues, automatic naming, AI owner-guessing and its learning loops, duplicate detection,
renewal chaining, self-heal, re-scan, split-document, OCR/vision reading, RAG passages, document
embeddings, and the whole required-document compliance engine (per-person and per-company
checklists, scores, the Needs-attention panel, CSV export). Migration **0114** dropped nine
tables and fifteen `documents` columns.

What the Documents page is now: you add a document, choose the company **or** person, pick a
category and type, and type the dates. Expiry tracking survives (status, countdown, the daily
renewal reminder, the "Renew" task) because you type the date yourself — nothing is inferred.
Chat and task attachments still land in the library automatically, under the file's own name
and the "Attachment" category, with no owner until you edit them.

### Bulk add + AI read (Aug 2026, the assistive half back)

The owner asked for the *reading* back, not the deciding. `/documents` → **Add several**:

1. Pick the **company (or person) and category for the whole batch** — before anything is read.
2. Drop the files.
3. Each is read in turn (`src/lib/doc-read.ts` → `readDocumentFileAction`) and the form arrives
   pre-filled with **title, type, issuer, reference no., issue/expiry dates and notes**.
4. You check it and press **Save & next**, or **Skip**.

`doc-read.ts` ONLY reads. It never touches the database, never picks an owner (it isn't even
told who the companies are, so it cannot misfile), never renames, de-duplicates, archives or
learns. Word/Excel/PowerPoint/text read their embedded text; a typed PDF uses its text layer;
scans, photos and HEIC go to Gemini vision (`providerVisionModels`), with scanner-watermark
detection so a CamScanner layer doesn't defeat OCR. Dates are accepted only as real ISO dates
in a sane year range, and a payment due-date is explicitly NOT an expiry.

**Forward rule:** intelligence may READ and SUGGEST. It must never move, rename, archive, hide
or file a document on its own. Anything that writes needs the owner to press a button.

### Papers that travel with an event (Aug 2026)

Attach a document to a calendar event and it goes WITH it — the airline-ticket case: the owner
books the director's travel, so the ticket reaches the OWNER's inbox, not his. Full notes in
`memory/event_attachments_aug2026.md`.

- **`event_documents`** (migration **0117 — APPLIED**, as is 0116; verified live 16 Aug 2026).
  Same shape as `document_links`: a file is always
  a `documents` row, a link row says where it is used. `send_with_invite` = "guests may have this"
  and governs the email AND the public link together.
- **`event-read.ts` / `event-read-core.ts`** — the sibling of `doc-read.ts`. Reads a ticket/booking
  into the EVENT form (title, times, place, description, flight details, and alarms derived from the
  printed boarding time). Shares **`file-extract.ts`** with `doc-read` — one extractor, two readers.
- **⚠️ Time zones: a time is NEVER accepted without its IANA zone.** The model returns the wall clock
  exactly as printed plus the zone of the place it belongs to, and is told NOT to convert; a zone the
  runtime doesn't recognise is rejected AND the time dropped with it. The owner confirms
  "02:15 (EAT) → 08:40 (Dubai time)" before saving. Do not "simplify" this to a single zone.
- **Delivery**: real bytes on the invitation email (budget 15 MB, `EVENT_ATTACH_MAX_BYTES`; over it
  the file goes as a link and the email, the toast and the Outbox row all SAY SO), `ATTACH` lines in
  the .ics, and Google `attachments[]`. Every link is the permanent `/e/<token>/doc/<id>` route — a
  signed URL expires, a calendar entry does not.
- **⚠️ UNVERIFIED**: whether Google accepts a non-Drive `fileUrl`. Both Google writers retry WITHOUT
  attachments if it objects, so a refused paperclip can never cost the calendar entry. Settle it with
  one live create.
- **⚠️ A server action bypasses the `src/proxy.ts` admin gate** when a PORTAL page imports it (the
  POST goes to the portal URL). `calendar/attachment-actions.ts` therefore checks auth itself:
  reading is restricted to `uploads/` staged paths — so it can only ever read the file you just
  uploaded, **which is why the form reads BEFORE filing** — and anything reaching into the library is
  owner-only. The form's `documentIds` is a second door, gated in `portal/actions.ts`
  (`attachableDocumentIds`, keeps only documents that person uploaded).
- **Not built**: live flight status (needs a paid flight-data API + key). A return or connection
  reads as the FIRST departing leg, with the rest in the summary.

## ORI Search Brain — universal search / find / trace (V3 — Jun 2026, LIVE)

ORI is the brain of the system: everything from a task to a board-level shareholding can be
searched, found and **traced** from one place. Built across 7 verified waves (full log:
`memory/ori_brain.md`); DEPLOYED to master (commit 415ef46); migrations 0094/0095/0096 applied.

- **Entity registry = single source of truth** (`src/lib/entity-registry.ts`): one `EntityDef`
  per the indexable types (task/person/company/vendor/asset/governance/risk/pipeline/
  commitment; documents are searched but NOT embedded) — table, columns, indexable text, lifecycle rule, search
  mapping, trace mode. **FORWARD RULE: to make a new entity (incl. future ERP modules)
  searchable/traceable/answerable, add ONE `EntityDef`** — indexing, deep search, the command
  palette and trace all derive from it automatically.
- **Client/server boundary (HARD RULE):** the registry imports the server-only `sb`. Client
  components must import labels/order from the client-safe `src/lib/entity-meta.ts`, NEVER the
  registry directly — a client value-import of the registry drags `@/db/supabase` into the browser
  bundle and crashes every page ("SUPABASE_SERVICE_ROLE_KEY is not set"). `import type` is fine
  (erased). This regressed once; always load the live preview after import refactors.
- **Continuous indexing**: per-write hooks (`src/lib/index-hooks.ts` `reindexEntity`/
  `removeEntityIndex`) re-index on every create/update/archive across all 12 types, on top of the
  nightly `/api/cron/reindex` catch-all. History is KEPT + labelled (`embeddings.lifecycle`
  active|history), never deleted. Coverage self-audit `src/lib/coverage-audit.ts` flags
  under-indexed entities on the System status card (inert until the `semanticSearch` toggle is on).
- **Deep search** (`src/lib/search.ts` → command palette): all 12 types, typo-tolerant, "Include
  history" toggle, conversational synonyms (`src/lib/synonyms.ts`). Opens with **Ctrl+Space** or
  ⌘K/Ctrl+K.
- **ORI Ask** (`/api/ask`): governance/ownership + every entity in context; passage citations;
  knowledge-graph traversal (multi-hop); ORI memory (`src/lib/ai-memory.ts`, `ai_memory` table —
  "remember that…"); provenance line ("8 tasks · 2 documents · 1 governance record").
- **Trace** (`/api/trace` + `src/components/trace-panel.tsx`): any entity → its full timeline
  (updates, person/company events, facts history, renewal chains, automation events). Triggered by
  the "Trace history" button on search results (window `cos:trace` event).
- **Surfaces**: `/approvals` = cockpit (+ the automations feed); home = CONTROLS HELD levers;
  Settings = in-app Groq key + spend cap + quiet hours + digest.

## Autonomy & safety tiers (V3 — Jun 2026)

Spine = Propose → auto-if-safe → log → undo, with 3 tiers (**Tier 3 = send/spend/delete → NEVER
auto without explicit opt-in**).

- **Guardrails** (`src/lib/guardrails.ts`): `canAutoSend(channel)` gates every automated external
  send; automated paths archive, never hard-delete (`AUTO_HARD_DELETE_FORBIDDEN`).
- **AI spend ledger** (`src/lib/ai-spend.ts`, `ai_usage` table): records usage; `aiMonthlySpendCap`
  (default 0 = UNLIMITED, FAILS OPEN) gates AI only when a cap is set.
- **Reaction chains** (`src/lib/automation-reactions.ts`): cross-process cascades with a recursion
  guard + dedup; auto/suggest per `getAutomationMode`; all undoable.
- **Self-repairing health** (`src/lib/system-health.ts` + `system-repair.ts`): re-runs a
  failed/stale job once before alerting; calm green "all N jobs healthy" status.
- **Recurring obligations auto-spawn** tasks when due (Tax & Legal grid, `automation-time.ts`).
- **Notifications** (`src/lib/push.ts`): quiet hours + smart digest (flushed by morning-run, NOT
  the unscheduled `/api/cron/notify`) + actionable push (open/done/snooze, `/api/notifications/act`,
  `sw.js` cache `cos-v8`).

## AI Conventions

- Use `getGroqKey()` so the AI master switch works. **Precedence (Jun 2026):** in-app Settings key
  (`groqApiKey`) → `GROQ_API_KEY` env → (`aiEnabled` + spend cap). The owner can rotate the key
  in-app (Settings → AI key) without a redeploy; it's stored in the shared settings table so prod
  picks it up too. `GROQ_FAST` (`openai/gpt-oss-20b`) / `GROQ_SMART` (`openai/gpt-oss-120b`) have env
  ladders (`GROQ_FAST_MODELS`/`GROQ_SMART_MODELS`); text calls fall through a decommissioned model like
  the vision ladder. **Model migration (Jun 2026):** Groq deprecated `llama-3.1-8b-instant` +
  `llama-3.3-70b-versatile` (shutdown 2026-08-16) → moved to the `openai/gpt-oss-*` models; the old
  llama names remain as last-resort ladder entries until shutdown. **Vision now runs on GEMINI**
  (`getActiveProvider()` is hardcoded `"gemini"`): document reading/OCR uses `GEMINI_VISION_MODELS`
  (native multimodal) via `providerVisionModels()`, and every vision call the harness receives is
  remapped through `providerLadder(gemini, …)`. The retired Groq vision model (`llama-4-scout`,
  shutdown **2026-07-17**) has been REMOVED from `AI_VISION_MODELS` — its shutdown is a **non-event**;
  OCR does NOT fall back to "rules" as long as the Gemini key is set. `model-watch` self-silences the
  Groq-deprecation check while the provider is Gemini. (Groq is retained only for `/api/transcribe`
  voice.)
- AI-off must degrade gracefully unless the endpoint explicitly documents 503.
- Preserve `source` discriminators where routes/components rely on them.
- British English in prompts.
- Do not invent data. Cite task codes and meeting title/date when relevant.

## Staff Portal Parity

The staff portal (`/portal`) is a **first-class surface**, not an afterthought — it must keep pace with the admin side's look and feel. The portal deliberately drops anything that exposes admin data (the ⌘K command surface, Ask COS, drawers, capture wizard), but it should share everything that doesn't require those permissions: design kit, global styles, entrance motion, micro-interactions, accessibility.

- **When you change shared visuals** (global CSS in `globals.css`, `surface-kit.tsx`, `reveal.tsx`/`motion.ts`), they flow to the portal automatically — keep it that way; prefer changing shared files over page-level styling.
- **When you restyle an admin component that has a portal twin, update the twin in the same change.** Current twins (admin ↔ portal):
  - nav pill `top-pill.tsx` ↔ `portal-pill.tsx`
  - update / timeline (`timeline-entry.tsx`) ↔ `portal-conversation.tsx` (the standalone `update-box.tsx` was removed — the shared conversation view serves both)
  - admin home `_hub/cos-home.tsx` / `home-mission-control.tsx` ↔ portal home `portal/(app)/page.tsx`
  - attendance admin register `attendance-register.tsx` ↔ portal `portal-attendance.tsx` + `attendance-checkin.tsx` (self check-in)
  - passkey manager `passkey-manager.tsx` is shared by both (owner Settings ↔ staff portal profile)
  - login shell `auth-shell.tsx` + forms are shared by `/login` (tabs) and `/portal/login`
- **Motion is reduced-motion safe both ways**: the portal's manual toggle sets `data-motion="reduced"` on `<html>` (CSS-only), which framer's JS animations ignore — so `Reveal` checks that attribute itself. Any new portal motion must honour it (reuse `Reveal`, don't hand-roll `motion.*`).
- **When shipping a new admin feature, make the explicit "portal question"**: does it have a safe staff-facing half (like the notification bell), or must it stay admin-only (anything touching other people's data)? Decide per feature.

See `memory/portal.md` for the full twin map.

## Domain Rules

- Statuses: Not Started, In Progress, Under Review, Blocked, Waiting External, Escalated, Completed, Closed.
- Open means anything except Completed/Closed.
- Priorities/Risk: Critical, High, Medium, Low.
- Task codes: `<PREFIX>-NNN`, where PREFIX is the company's two-letter `code_prefix` (e.g. `DS-001` for Dar Spices). Legacy `COxx-NNN` codes are kept in `tasks.legacy_code` so old links redirect.
- Categories: Finance, Operations, Marketing, HR, Legal, Technology, Sales, Admin, Meetings, Strategy, Other.
- Channels: WHATSAPP, EMAIL, SMS.

## Token discipline (READ FIRST — owner watches 5-hour usage closely)

The owner's #1 complaint is wasted usage, and the waste is TOOL-OUTPUT VOLUME, not thinking. Every session must:
- **No preview screenshots** unless explicitly asked. Verify with a small targeted `eval`/`grep`, never images.
- **Never dump full `next build` / full `tsc` / full test output.** Run these ONCE at the very end; pipe to a temp file and read only the tail / error lines (`grep -E "error|EXIT"`).
- **Read files with `offset`/`limit`** after a `grep` for the exact lines — never read whole large files.
- **Batch shell commands** into one call; don't re-verify what already passed.
- **No live UI walkthroughs** unless the owner asks. Code + one final check is enough.
- Terse replies: what changed + what matters. No narration between tool calls.

## Workflow

- Verify code with `npm exec tsc -- --noEmit`. A full type-check needs a bigger heap locally: `NODE_OPTIONS=--max-old-space-size=4096 npm exec tsc -- --noEmit`.
- **`npm run build` also needs a bigger heap** (Aug 2026): the default dies with `Ineffective mark-compacts near heap limit` AFTER "Compiled successfully" — the crash is page-data collection, not your code. Use `NODE_OPTIONS=--max-old-space-size=8192 npm run build`.
- Run unit tests with `npm test` (Vitest). Pure-logic tests live next to the module as `src/lib/*.test.ts` (pay, leave, derive, staff-id). Add tests when you change money/leave/status maths.
- For schema work: edit `schema.ts`, generate/review migration, apply with `npm run db:migrate`. **Take `npm run db:backup` first.** drizzle-kit diffs the `drizzle/meta` snapshot, NOT the live DB — if the live DB has drift, generated `CREATE`s can collide; use `IF NOT EXISTS` or reconcile.
- **⚠️ A HAND-WRITTEN migration needs a `when` LATER THAN THE NEWEST APPLIED ONE,
  or the migrator SKIPS IT AND STILL SAYS "Migrations applied."** drizzle only
  runs journal entries whose `when` is greater than the newest `created_at` in
  `drizzle.__drizzle_migrations`, and those recorded values are real apply times,
  which run AHEAD of the journal's `when` values. Copying `last.when + 60000` from
  the previous entry therefore produces a timestamp in the past and a silent
  no-op. Use `Date.now()`, and **prove the migration ran by checking its effect**,
  never by trusting the success message. (Cost real time on 0139.) `drizzle-kit
  generate` gets this right on its own — this only bites hand-written SQL.
- Do NOT clear `.next` while the dev server is running (it corrupts the live build cache → ENOENT 500s). Stop the server first, then `rm -rf .next`, then restart.
- Update `memory/*.md` after meaningful changes.
- Do not auto-push unless asked.
- Do not surprise-fix known gaps listed in `memory/open_issues.md`.

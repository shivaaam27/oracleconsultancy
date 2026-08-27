# COS System - Project Instructions

**⚠️ THE COCOZURI MANUFACTURING PROGRAMME IS FINISHED — ALL NINE STAGES ARE
BUILT, AND SO IS THE COUNTER** (migrations **0149–0157**, each applied and proved
by effect; Stage 7 needed no table at all) — the stock ledger, buying with landed
cost, recipes that cost themselves, production with the owner's "inter check",
kitchen-to-shop transfers, returns/repairs/damage, profit per batch, the rest of
the accounts, and **expiry and food traceability**. **Every one of the 52 lines
in his notes is built.** Proved live end to end: buy → lot → cost → make (FEFO)
→ check → move → sell → take back → write off → cost of sales → pay the
supplier → depreciate → reconcile → trace → reverse. Read
`memory/cocozuri_manufacturing_plan.md` §6a–§6j, and **§5b for the owner's
answers of 22 Aug evening** — they settle four of the six open questions.

**⚠️ START HERE: `memory/handover_aug27_2026_evening.md`** — the most recent
session, **CocoZuri only**, and a big one: the recall chain closed at both ends
(a counter sale carried the WRONG lot, and a sales invoice now records which
lots it despatched), then **Set up / Buy / Make rebuilt in five stages** — item
**kinds** and managed **lists**, **real delete** on ERPNext's own rule,
**suppliers** inside the module, the order form reshaped into a **production
plan** ("what to make today"), **recipe snapshots** so a batch is judged against
the recipe it was MADE FROM, and a **timeline with comments** on every record.
Migrations **0161–0165**, each applied and proved by effect. Its §4 lists the
bug each stage's audit found — **they are all the same shape: a second way of
working out something that already had one.** §5 is what is left, and it is all
the owner's.

Before it: `memory/handover_aug27_2026.md` — the most recent session,
and it is **CocoZuri only**: the chef's costing workbook audited cell by cell and
a **recipe importer** built for it, the whole module swept for UI consistency
(**four date formats collapsed onto one — `czDate`**), **six flow gaps built**
(the order form raises a purchase; an off-recipe material can be added at close;
a material running over must say why; what open batches have promised is shown;
a batch and a receipt can be corrected; recipe → make it, batch → send it), and
**the transfer lot fix that finally closes the recall thread**.
**Committed and pushed to master (`d5e3c5c7`)**, and **no migration was written**.
Its §5 is the list of what is left to build, and its §6 the demo data left in the
live database.

Before it: `memory/handover_aug25_2026.md` — the session before:
the Director Brief PDF's cut-off update fixed and the whole thing restyled in
the ERP skin, the Windows app taught to update itself (1.0.1 and 1.0.2 shipped)
and its title bar taught about dark mode, the CocoZuri guide written out as a
17-page PDF, and **a new MARKETING module built through Phase 3** (see
`memory/marketing_module_plan.md`). All committed, pushed and deployed.

Before it: `memory/handover_aug23_2026.md` — the session that finished
the programme (Stages 6, 7, 8, 9 and the counter; migrations 0154–0157; four
bugs, two of them pre-existing; the sidebar reordered). **And
`memory/cocozuri_how_it_works.md` is the plain-English walkthrough** written for
the owner: every screen in the order the work happens, and what each one refuses.
⚠️ **NOTHING FROM THAT SESSION IS COMMITTED** — it is all in the working tree.

**⚠️ STAGE 6 TURNS ON ONE PIECE OF ACCOUNTING, AND IT IS THE THING TO
REMEMBER:** a sales return reverses the SALE (a credit note, which already
exists) but **must NOT put the COST back** — nothing has ever taken the cost of
a sale out of the stock account, so 1150 already carries it and putting it back
would count the same chocolate twice. That half waits for Stage 7's cost of
goods sold. **Writing damaged stock OFF is different and IS posted**:
Dr **6930 Stock written off** · Cr **1150 Stock**, at what it COST, never at
what it would have sold for.

**⚠️ THE OWNER SETTLED THE ITEM-IDENTITY QUESTION (22 Aug 2026):** the shop's
`AMBER RABDI` and the kitchen's ARE the same chocolate — but still two rows, so
a transfer moves between two item rows joined by **`product_id`, never by name**
(64 of 75 already pair). **A transfer has TWO MOMENTS** — sent and received —
and the gap between them is stock lost in transit, which is what made the shop's
opening figure a mystery. ⚠️ `transferStock` from Stage 1 is SUPERSEDED.

**⚠️ AN ANCHORED MENU IS PORTALLED, ALWAYS** — `useAnchoredMenu()` in
`lib/use-anchored-menu.ts`. An `absolute` menu is CLIPPED by any scrolling
ancestor (a bottom sheet, a drawer, a card), and portalling it then puts it
BEHIND that overlay unless it carries `zIndex: MENU_Z` (1000). Both halves were
photographed by the owner in turn. Six components had written it by hand; they
all use the hook now. **Do not write a seventh.**

**⚠️ AND THE DESIGN WAS MADE UNIFORM ACROSS THE WHOLE SYSTEM** (owner's ask):
ONE control box everywhere, and **2,619 hard-coded `text-[Npx]` sizes in
fourteen variants collapsed onto the density-aware scale**. Two of the faults
were outright bugs of the same shape — `Combobox` and `RecordList`'s row set no
type size, so everything inside them fell back to the browser's **16px**. Read
`DESIGN_SYSTEM.md` — the rule is now "never `text-[Npx]` for body text".
**Orders & Imports (`/ops`) became a module of its own** at the same time.

Read `memory/handover_aug22_2026_evening.md` for the full account of that
session. ⚠️ **Its "what is next" is SUPERSEDED** — Stages 6–9 are built; see
`memory/handover_aug23_2026.md`.

Before that: `memory/handover_aug22_2026.md` — CocoZuri
Phases 3-5 built and DEPLOYED, the module swept for bugs (three lists were losing
their subject column; `Combobox` was overflowing every grid cell in 24 files),
and the MANUFACTURING half planned in 9 stages with Stage 1 (the stock ledger)
built. Migrations 0147-0149 applied.

Before that: `memory/handover_aug21_2026_evening.md` —
offline Notes finished and deployed, the app split into ERP modules, and CocoZuri
Operations built through Phase 2. All of it is deployed, with migrations 0144-0146 applied.
Before that: `memory/handover_aug21_2026.md` — the database lock and the Windows
app, plus two jobs still waiting on the owner (rotating the leaked credentials,
and switching the CSP to enforcing).

Start with `memory/v2_plan.md`. The owner is non-technical; explain in plain language and use British English.

## Product

Chief-of-Staff command centre for Oracle Consultancy's portfolio companies (the
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

Single operator. **Auth (V3)**: the whole admin side sits behind one owner password (`/login`, edge gate in `src/proxy.ts` — the Next-16 `proxy` convention, renamed from `src/middleware.ts` in June 2026; cookie `cos_admin`); staff get per-person portal logins at `/portal/login` (cookie `cos_portal`). **`/login` is now one tabbed screen** (June 2026): **Staff Login** (default, identifier+password) | **Command Centre** (owner). Optional **owner identity** (name/email in Settings) becomes a required 2nd factor on the Command Centre tab when set (blank = password-only, no lockout). **Passkeys (Face ID/Touch ID/Windows Hello/fingerprint)** via WebAuthn for owner AND staff — register in Settings (owner) / portal profile (staff); the login screen offers passkey + conditional-UI autofill. See `memory/auth_login.md`. `createdBy` is normally `"web-ui"`; AI command mutations use `"ai-command"`; staff-portal posts use `"portal:<Name>"`.

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
  - **`npm audit --omit=dev` is CLEAN as of 17 Aug 2026 — 0 vulnerabilities.** Keep it that way.
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

General ledger (ERP Phase 1): **gl_accounts** (the chart, a tree, one per
company) · **gl_entries** (**the books — APPEND-ONLY**; no `archived` column, no
update path, no delete path; a mistake is corrected by a reversal) ·
**journal_entries** + **journal_entry_lines** (the manual voucher).
⚠️ **No `balance` column anywhere, and there must never be one** — every balance
is worked out on read. See `memory/ledger.md`.

Recruitment (migrations 0139–0140): **rec_clients** (the Tanzanian employer;
`terms_signed_on`/`dsa_signed_on` are the gate on starting work) · **rec_candidates**
(the Indian professional — ⚠️ **no fee/bond/balance column, ever**) ·
**rec_job_orders** (one role; `client_id` NULL = Oracle hiring for itself) ·
**rec_shortlist** (candidate × order; `match_note` is the written reasoning the
client is promised) · **rec_interviews** · **rec_placements** (⚠️ `accepted_on` =
fee earned, `started_on` = guarantee clock) · **rec_checkins** (a conversation
that happened; `note` NOT NULL). See `memory/recruitment_module_plan.md`.

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

Search/AI (V3 — Jun 2026): **embeddings** (+ `lifecycle` active|history col, migration 0094; lifecycle-aware `hybrid_search`/`replace_embeddings` RPCs) — the semantic index, driven by `src/lib/entity-registry.ts`. **Documents are NOT indexed** (Aug 2026): they are found by plain SQL/full-text matching on what the owner typed. **ai_memory** (migration 0095 — ORI memory: qa/preference/fact); **ai_usage** (migration 0096 — AI spend ledger). Latest migration: **0165** (`cz_events` — what happened, when and who did it;
⚠️ append-only, and a COMMENT is one of the kinds).
Before it, **0164** (`cz_batches.recipe_snapshot` — the recipe a batch
was MADE FROM, frozen at open; a correctness fix, not a feature).
Before it, **0163** (`cz_production_plans` · `cz_production_plan_lines`
— what to MAKE today; plus `cz_stock_items.reorder_level`).
Before it, **0162** (`cz_stock_items.kind` — raw material / packaging /
finished, ⚠️ nullable because NULL means nobody has said, which is NOT "other";
plus `cz_lists`, the managed category / brand / count-unit / pack-unit lists).
Before it, **0161**
(`cz_invoice_line_lots` — which lots a CocoZuri invoice despatched; ⚠️ a
despatch RECORD, not a ledger — it moves no stock, because the day sheet does).
Before it, **0160** (`mkt_results` · `mkt_spend` — marketing results and
ad spend). Before it, **0159** (`mkt_shoots` · `mkt_assets` · `mkt_post_assets`
— photography and the picture library). Before it, **0158** (`mkt_clients` ·
`mkt_accounts` · `mkt_campaigns` · `mkt_posts` · `mkt_publications` — the
marketing record). Before them, **0157** (`cz_counter_sales` · `cz_counter_sale_lines` — the
counter, Stage 5b).
Before it, **0156** (shelf life, purchase-line expiry, and lots — Stage 9).
Before it, **0155** (`cz_payments` · `fixed_assets` · `bank_recs` ·
`bank_rec_lines` — Stage 8).
Before it, **0154** (`cz_returns` · `cz_return_lines` — returns, repairs
and damage).
Before it, **0153** (`cz_transfers` · `cz_transfer_lines` — kitchen to shop).
Before it, **0152** (production — nine columns on `cz_batches`).
Before it, **0151** (`cz_recipes` · `cz_recipe_lines` — CocoZuri recipes).
Before it, **0150** (`cz_budgets` · `cz_purchases` · `cz_purchase_lines` — CocoZuri buying).
Before it, **0149** (`cz_stock_moves` + `cz_batches`, the stock ledger). Before it, **0148** (`cz_stock_*`, the CocoZuri stock book). Before it, **0147** (`cz_receipts` + `cz_invoices.applies_to_invoice_id`, CocoZuri money in). Before it, **0146** (`cz_invoices`, CocoZuri invoicing). Before it, **0145** (`cz_*`, the CocoZuri catalogue). Before it, **0144** (`note_offline_edits`, offline note editing). Before it, **0138** (the general ledger — see that section; 0137 is the
four tables, 0138 an index predicate. Both applied). **0116–0122 are all APPLIED** (0116/0117 verified 16 Aug 2026; 0118–0122 applied 17 Aug 2026, each after a `db:backup`).

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
conversation's prompt, so **27 (as of Aug 2026)** is fine and 150 would wreck tool-picking.
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
  `addTaskUpdateCore`). The web actions in `src/app/task/actions.ts` are thin
  wrappers over them — FormData, undo cookie, redirect. **Any new task write path
  calls the cores**; a second insert would drift out of audit.
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

- `/` - command centre: Overview, Companies, Tasks. **The Tasks tab opens on the LIST view** (columns, filter rail, sorting, bulk edit); Cards/Board/Calendar/Timeline are one click away in the switcher.
- `/task/new`
- `/task/[code]` - **the task record, as a real page** (Aug 2026). A record is a page with its own URL, as in ERPNext. Everything links here via `taskHref()` in `src/lib/task-href.ts` — never `?task=`. The old drawer still opens for legacy `?task=CODE` links.
- `/registry` - redirects to hub Tasks table
- `/brief` - **Director Brief** (V2): glanceable portfolio report incl. completed/closed this month; WhatsApp/Email/Copy share + a **server-rendered PDF** (`src/lib/brief-pdf.tsx`, @react-pdf/renderer; two routes, ONE renderer — `/brief/pdf` and `/api/portal/brief-pdf`). See `memory/outbox_and_reminders.md`.
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
- `/documents` - **the document library — one view, filed by hand** (Aug 2026). Search + company/category/status filters, grouped by company then category, row actions Edit · Open file · Archive · Delete. Nothing is read, named, classified or de-duplicated for you.
- `/portal`, `/portal/login`, `/portal/board`, `/portal/meetings` (**Briefings**), `/portal/task/[code]`, `/portal/profile` - **Staff portal**: per-person sign-in (password set in Settings → Staff portal access; scrypt hash on `people.portal_password_hash`, signed cookie session), staff see only their own tasks, post updates (`created_by: "portal:<Name>"`), limited status moves (never Completed/Closed). Profile carries: Your documents, **Your attendance** (self check-in + week strip), onboarding, equipment, **passkeys** ("Sign in faster"). A minimal **attendance check-in pop-up** auto-opens once/day on landing. Admin chrome hidden on portal routes. See `memory/portal.md` + `memory/portal_scope_and_event_cascade_jul2026.md`.
  - **Home vs board (Jul 2026):** `/portal` **home is staff + HR only** — hero unified with the board hero (`portal-home-hero.tsx`, slim stats pill), tasks in a **scroll housing**, full-width To-Do List, Raise-a-request below it, announcements as a dismissible header banner (`announcement-banner.tsx`). **Directors AND managers are board-first** (`/portal/board`, redirected from `/portal`); managers' team tools fold onto the board (team-attendance glance moved to the Directory's **Attendance** tab, leave-to-approve, personal To-Do List).
  - `/portal/meetings` = **Briefings** (nav label "Briefings", `portal-briefings.tsx`): tabbed **Meetings** (agenda, badge = starts within 3 days) + **Announcements** (feed, badge = unacknowledged). Announcements no longer inline on home/board — banner + this tab.
  - **Board** (`director-board-client.tsx`, managers + directors): greeting hero · task composer (managers Task-only, directors Task/Event/Message) · Outbox link · Next meeting · then two **scroll-housed** columns — **Needs you** (overdue-first cards, tap opens the task, swipe = remind) + **Company health** (heat tiles, worst-overdue-first, "No open tasks" when a company is empty). List ordering = worst-first everywhere (DESIGN_SYSTEM.md §12). Managers with <6 companies get the To-Do List in the right column instead of a footer.
  - **Portal roles** (`people.portal_role`): staff | manager | hr | director. **Company-scoped director** ("Company Director", `people.director_company_id` set, migration 0097): full director board + powers but STRICT to ONE company — set it in Settings → Staff portal access. Scope is enforced through ONE place: the helpers in `src/lib/portal-auth.ts` (`seesAllCompanies`/`companyScope`/`isScopedDirector`) — the data-side twin of `src/lib/portal-capabilities.ts` (UI). **FORWARD RULE:** route every new data-visibility decision through those scope helpers (not a raw `=== "director"`). **Portal permissions are owner-configurable** (Settings → Portals → "Roles & permissions"): per-role capabilities + data-scope (own/companies/all) in `src/lib/portal-permissions.ts` (pure; defaults = old behaviour), stored as one settings row, resolved ONCE onto `PortalPerson` as `scopeLevel` + `caps`. Scope helpers read `p.scopeLevel`; every portal action gate + UI affordance reads `me.caps.<key>`; `canManageTask` takes `viewer.canManageAny`. **To gate a new portal ability by config, add a `CapabilityKey` + default and read `me.caps.<key>` — don't hard-code the role.** See `memory/portal_permissions_engine.md`. Directors: NO Directory Attendance tab. Shared task list = `portal-tasks-command.tsx` (Home inlines it via its `houseList` scroll-housing prop). Nav pill (`portal-pill.tsx`): frosted for legibility, hover shows a floating name label + icon bounce, create `+` sits after the divider next to the theme toggle, Board/Home tabs use layout-preview icons. Full reference: `memory/company_scoped_roles.md`. **⚠️ adding a 2nd FK from a table to `companies` breaks PostgREST `companies(name)` embeds on that table — disambiguate with `companies!company_id(name)`.**
- `/chat`, `/chat/[threadId]` - **Chat**: free-standing messaging (DMs + ad-hoc groups), separate from task updates. Portal twin at `/portal/chat`. WhatsApp-style messenger UI: full-screen app on mobile (page header + nav pill hidden on chat routes), two-pane glass card on desktop; optimistic send, read receipts, typing indicator, inline image previews. Supabase Realtime broadcast (anon key set) with polling fallback. Primary tab on both nav pills. Plus per-person **read-only `kind="system"` channels** (Jun 2026): **Task reminders** (daily 9am cron + pushes) and **Announcements** (published announcements mirror in, silent). See `memory/chat_system.md` + `memory/reminders_outbox_chat_jun2026.md`.
- `/outbox` - **live, per-person** (Jun 2026): generated fresh from open tasks each load (one card per person, full task list + WhatsApp/Email send); reminders are NOT stored as drafts anymore. Per-task vs all-tasks toggle under each task. See `memory/reminders_outbox_chat_jun2026.md`.
- `/ops` - **Orders & Imports** — the PES trading and import business, rebuilt from
  `PES OPS EXECUTIVE REPORT.xlsx`. Tabs: **Orders** (one row per PO line, the
  POS STATUS spine) · **Funnel** (enquiry → quote → order → invoice, with the
  conversion measured against the enquiry's OWN month — never one month's orders
  over another month's quotes, which is what has the workbook reading 132%) ·
  **Imports** (a bill of lading and what customs does to it) · **Delivery &
  billing** (what went out, what was billed, and each PO's balance — the invoice
  is its own record, so one covering 24 lines is typed once) · **Report**
  (PENDING, purchase analysis and the payments forecast, all worked out — no new
  table, nothing typed on it) · **Payments** (money OUT: one purchase takes many
  payments, so a 40% advance and the balance are two rows; ageing in the
  workbook's own bands) · **Setup** (eight master lists). Tenders sit on the
  Funnel tab. Migrations 0130–0136. Searchable via four `EntityDef`s (`ops_order`/`ops_shipment`/
  `ops_enquiry`/`ops_invoice`) and ONE read-only MCP tool, `pes_trading`. **Read
  `memory/pes_ops_module.md` before touching any of it** — it holds the workbook
  analysis, the owner's decisions, and the stages still to come (the funnel,
  delivery and invoicing, the executive report).
  ⚠️ **A company in the address is `?co=`, never `?company=`** — the latter is
  watched globally by `CompanyDrawer` and slides a preview open over any page.
- `/ledger` - **the general ledger** (ERP Phases 1-2): **Chart of accounts**
  (a tree per company, seeded from one shared template, balances rolled up and
  never stored) · **Journals** (Draft → Posted → Reversed) · **Entries** (the
  books, raw) · **Reports** (`/ledger/reports/<report>` — trial balance, P&L,
  balance sheet, general ledger, statements, **VAT return, withholding**;
  `?group=1` consolidates all thirteen companies) · **Tax rates** (`/ledger/tax`
  — VAT and withholding as editable rows, each flagged confirmed or not) ·
  **Assets** (`/ledger/assets` — the fixed-asset register and monthly
  depreciation) · **Reconcile** (`/ledger/reconcile` — a bank statement ticked
  off against the books; ⚠️ it never edits a posted entry).
  Company picked with `?co=`, never `?company=`.
- `/cocozuri` - **CocoZuri Operations** (Furaha Innovation Ltd, prefix CC):
  products · customers · invoices · money in · owed · statements · the stock book
  and the month-end stock-take · the order form, and posting to the general
  ledger · **purchases and budgets** (Stage 2) · **recipes** (Stage 3) ·
  **production** (Stage 4) · **transfers** (Stage 5) · **returns and damage**
  (Stage 6) · **profit** (Stage 7) · **money out** (Stage 8) · **trace** (Stage 9)
  · **the counter** (Stage 5b — ⚠️ a record, not a till)
  · **stock items** (`/cocozuri/items`) · **shelves** (`/cocozuri/shelves`)
  · **prices** (`/cocozuri/prices`)
  · **the lists you pick from** (`/cocozuri/lists`)
  · **suppliers** (`/cocozuri/suppliers`)
  · **what to make today** (`/cocozuri/order`) and **what to buy**
  (`/cocozuri/order/materials`) · **what happened** (`/cocozuri/history`).
  See the CocoZuri section above.
- `/marketing` - **Marketing** — social media and photography for our own
  companies and for the clients **Pamoja Plus** advertises for. Overview ·
  Campaigns · Calendar · Shoots · Pictures · Posts · Results · Accounts ·
  Clients. Migrations **0158–0160**, ten tables. **Read
  `memory/marketing_module_plan.md` before touching any of it.**
  - ⚠️ **NOTHING TALKS TO A PLATFORM, AND THAT IS THE DESIGN.** Instagram,
    TikTok and LinkedIn each need an application taking **weeks** that can be
    refused (LinkedIn wants partner status small agencies often do not get). So
    every figure is typed, and each reading already carries `source` — the later
    phase that reads Instagram adds rows saying "platform" and changes nothing
    else. ⚠️ **Instagram tokens last 60 days and do not renew**, so when that
    lands the module must SAY a connection has gone stale.
  - ⚠️ **A RESULT IS A READING ON A DATE, NEVER A COLUMN.** Reach on day one and
    reach a month later are different facts and both are true — the gap between
    them is the only thing showing whether a post kept working. Same rule as a
    CocoZuri price. **Typed and platform figures are never blended.**
  - ⚠️ **A MISSING FIGURE IS NOT A ZERO** — sums return null, and follower
    growth SKIPS readings with no follower count.
  - ⚠️ **THE FREE THREE MONTHS STARTS ON THE FIRST POST**, not the handshake —
    the owner had no start date because posting had not begun, so it is derived.
    ⚠️ **No cap agreed is not a cap of zero.**
  - ⚠️ **CONSENT ON A SHOOT AND `professional` ON AN ACCOUNT ARE THREE-STATE.**
    A photograph of an identifiable person is personal information under
    Tanzania's rules; a personal account can never hand over its numbers however
    this is built. "Nobody has said" is not "no".
  - ⚠️ **THE BYTES NEVER PASS THROUGH THE SERVER.** The browser uploads straight
    to the private `marketing` bucket on a one-shot signed URL — a serverless
    body caps at 4.5 MB and a phone photo is bigger. **The PATH is stored, never
    a URL**; links are minted on read.
  - ⚠️ **A PUBLICATION IS NEVER DELETED** (a post taken down still happened) and
    **a picture a post was made from cannot be deleted** — the database refuses.
  - **ONE PERSON POSTS, so there is no approval gate.** `created_by` records
    who. The day somebody else posts it becomes a real gate with no table change.
  - Client/server split as everywhere: **`marketing-shared.ts` and
    `marketing-results-shared.ts` are what client components import**;
    `marketing.ts`, `marketing-assets.ts`, `marketing-results.ts` are
    server-only and are the ONE DOOR for writes.
  - **No `EntityDef` and no MCP tool yet**, on purpose.
- `/recruitment` - **the recruitment desk**: job orders, candidates and clients for
  Oracle Consultancy's agency, plus `/shortlists` (what is with a client, longest
  wait first), `/interviews` (the diary, in both Dar and India time) and
  `/placements` (the guarantee and the six check-ins). A role's record is routed by
  its reference (`/recruitment/orders/JO-2608-01`) and carries the assignment on
  tabs. See the Recruitment section above.
- `/insights`
- `/settings`

**⚠️ NAVIGATION IS MODULES NOW (Aug 2026).** COS is divided the way the
BUSINESSES are: **Task Management · Recruitment · Ledger · Projects · Orders &
Imports · CocoZuri Operations**. `/apps` is the launcher; the
sidebar shows **only the module you are in**, with a switcher under the brand and
**System (Insights/Activity/ORI/Settings) pinned at the foot of every rail**.
- ⚠️ **A MODULE'S RAIL FOLLOWS THE WORK, NOT THE SCREEN TYPE** (owner's ask,
  23 Aug 2026). CocoZuri's groups are **Start · 1 Set up · 2 Buy · 3 Make ·
  4 Keep · 5 Sell · 6 Get paid · 7 Pay out · 8 Put right · 9 Know** — the order
  the chocolate actually moves in. A rail grouped by "what sort of screen is
  this" makes somebody learn a map; grouped by the work it reads like the day.
  **Adding a page? Put it where it happens in the day, not at the end.**
- **`src/lib/nav.ts` holds `MODULES`** — one entry per module, listing existing
  route ids. ⚠️ **Orders & Imports (`/ops`) became a module of its own** (Aug
  2026): it was ONE nav id filed under Task Management's "Operations" group while
  actually being seven pages and a whole business. It now has a route per tab, so
  the rail lists its pages the way every other module's does and ⌘K can reach
  each by name. The in-page tab strip (`ops-tabs.tsx`) stays — both are lists of
  the same seven addresses. **A route filed in two modules fails `nav.test.ts`.** ⚠️ **`NAV_ROUTES` IS NOT TOUCHED BY THE SPLIT, and that is the whole
  trick**: pins are stored as ids and silently drop unknown ones, and ⌘K, recents
  and the mobile launcher all read that list. A module only ARRANGES routes.
- **`moduleForPath()` falls back to Task Management**, so a page in no module
  still gets a rail. `NAV_GROUPS` is now DERIVED from `MODULES` so the mobile
  launcher can never drift from the sidebar.
- **`src/lib/nav.test.ts` is the guard** — every route filed exactly once, every
  module home real, System never inside a module. **Add a route, add its id to a
  module, or the test fails.**
- ⌘K still lists **every individual page**, whichever module it lives in. That is
  what makes the split safe: nothing became harder to reach.
- `/` did NOT move — it is still the command centre and Task Management's home.
- Plan and the full break-audit: `memory/erp_navigation_plan.md`.

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

## The general ledger — ⚠️ PHASES 1, 2 AND 3 ARE BUILT. Read `memory/ledger.md` FIRST

**Decided by the owner, Aug 2026: COS becomes the accounting system.** Asked
whether COS should hold the accounts or whether an accountant owns them
elsewhere, he chose COS — *"build the ledger since we want to transition to
using erp now and nothing else."*

Until Aug 2026 COS had **no ledger, no chart of accounts and no journal**. It
worked every figure out by scanning documents, which is why nothing in it can go
stale — and also why it could say what was still to bill on a PO but not what a
company earned last quarter. ERPNext, by contrast, has **18 document types that
post to a General Ledger** (verified in `Documents/OCERP/reference/erpnext`).
**The spine now exists** (below); the documents start posting into it at Phase 5.

`memory/erp_gap_plan.md` holds the seven phases, starting with the spine. **Five
rules the ledger code must enforce**, and they are not negotiable:

1. **Every voucher balances** — debits equal credits, checked before writing.
2. **A posted entry is never edited** — you post a reversal. (Which is also
   COS's never-delete habit.)
3. **Balances are DERIVED, never stored** — the entries are the fact; trial
   balance, P&L and balance sheet are worked out on read. Do NOT add a `balance`
   column.
4. **Base currency TZS, rate frozen on the entry**, like every other rate here.
5. **Posting is explicit and reversible** — nothing lands in the books silently.

**⚠️ Phases 1, 2 and 3 are BUILT and LIVE** — `/ledger` with **Chart of accounts ·
Journals · Entries · Reports · Tax rates**, migrations **0137/0138/0139
applied**, **142 tests** on the arithmetic. `memory/ledger.md` holds the decisions and the traps.

**Phase 2 = the five reports** at `/ledger/reports/<report>`: trial balance ·
profit and loss · balance sheet · general ledger · customer and supplier
statements — per company **and consolidated across all thirteen**, which is what
the owner could not get anywhere before. One page serves all five; every report
is a LINK (report in the path, period and scope in the query string), so it can
be bookmarked and sent to an accountant.

**⚠️ THE BALANCE-SHEET TRAP, and it is the one to remember:** assets do not equal
liabilities plus equity on their own, because the year's profit is still sitting
in the income and expense accounts. The balance sheet **derives** it and adds it
into equity — **no journal creates it, and none should**. It needs
`ledgerFyStartMonth` (Settings, default **January**); get that wrong and the
balance sheet is wrong by whatever was earned in the mis-attributed months.
**Confirm it with whoever files the returns — it is a default, not a fact.**

**⚠️ Consolidation adds the companies up but does NOT eliminate inter-company
balances.** If one owes another it shows as both a debtor and a creditor. The
screen says so. Doing it properly is Phase 7's work.

**Phase 3 = VAT and withholding** (migration 0139). `tax_rates` is a per-company
list — **the rules are DATA, not code** — plus VAT columns on the ops invoice,
the purchase line and the payment, an **EFD (fiscal receipt) number** at last,
and two more reports: **VAT return** and **Withholding**.

**⚠️ THE RULES ARE NOT GUESSED, and must not be.** Only the statutory standard
VAT rate is seeded `confirmed`; zero-rated, exempt and the four withholding rates
arrive **unconfirmed**, and the screens say **"not ready to file"** until somebody
who files the returns ticks them off.

**⚠️ Three traps worth knowing:** `tax_inclusive` is **three-state** (true/false/
**null = nobody has said**) — the same 1,180,000 is either +VAT or includes-VAT,
so an unset invoice is reported **unknown, never nil**. **Zero-rated is NOT
exempt** — both carry no tax, but zero-rated counts in taxable turnover and
exempt does not. And **`asFraction()` is the only place 18 becomes 0.18**
(`tax_rates.percent` stores 18; `projects.vat_rate` stores 0.18).

**⚠️ The VAT return reads the DOCUMENTS, not `gl_entries`** — nothing posts until
Phase 5. `vatReturn()` takes a list and does not care where it came from, so
Phase 5 adds ONE adapter reading the ledger and every figure is unchanged. Do not
grow a second way of totting up VAT.

**⚠️ THE ONE RULE: everything that reaches `gl_entries` goes through
`postVoucher()` in `src/lib/ledger-post.ts`.** When Phase 5 wires the sales
invoice, the ops payment and the project stages into the books, each calls that
function with its own `voucherType` — **none of them inserts a `gl_entries` row
itself.** A second write path is a second set of books. (Same shape as
`createTaskCore` being the one door for task writes.)

Client/server split, as everywhere else here: **`lib/ledger-shared.ts` is what
client components import** (pure, no `sb`); `ledger-accounts` / `ledger-post` /
`ledger-journal` are server-only. Getting this wrong kills every page with
"SUPABASE_SERVICE_ROLE_KEY is not set".

**⚠️ No MCP tool and no `EntityDef`, on purpose** (the forward rules say to ask,
so: asked and answered). Reading a trial balance through Claude is worth having
once Phase 2's reports exist; **a ledger WRITE tool should never exist.**

**Chart of accounts: ONE PER COMPANY, all seeded from one template** — separate
rows so the books can diverge, identical numbers so consolidating thirteen
companies is a group-by. This settles one of the plan's three open questions,
and either answer still works later with no migration.

⚠️ **The financial year starts 1 JULY** (owner, 20 Aug 2026) — `ledgerFyStartMonth`
is 7. **Two questions remain UNANSWERED and must be asked, not assumed:** is stock
actually held; and what date should the books open from (the system already holds
791 imported order lines, 347 invoices and 262 payments — see Phase 6). A third —
**the VAT rules themselves** — is now visible in the app: six seeded rates are
flagged unconfirmed and the reports refuse to call themselves ready to file.

## CocoZuri Operations — ⚠️ ALL FIVE PHASES BUILT. Read `memory/cocozuri_ops_plan.md` FIRST

`/cocozuri` — **Furaha Innovation Ltd** (prefix **CC**, was "Cocozuri Chocolat"):
chocolate made, sold to 14 supermarkets, plus a shop. Rebuilt from 18 spreadsheets.
⚠️ **Look the company up by `code_prefix = 'CC'`, never hard-code it.**

- **Phase 1 (built):** `/cocozuri` · `/cocozuri/products` · `/cocozuri/customers`.
  Migration **0145**: `cz_products` · `cz_customers` · `cz_branches` · `cz_prices`.
  Seeded from the workbooks by `scripts/seed-cocozuri.ts` (idempotent, and it
  REPORTS what it skipped rather than guessing).
- ⚠️ **A PRICE IS A ROW WITH A DATE, never a column on the product.** The one in
  force is the newest whose date has arrived, worked out on read — which is what
  stops a price rise rewriting what was charged last month. `customer_id` NULL is
  the standard list price; a customer's own price beats it.
- ⚠️ **`vatOf()` is VAT CONTAINED in a VAT-inclusive amount** (`gross × rate ÷
  (100+rate)`). The spreadsheets computed it as a percentage OF the gross and
  **overstated VAT by TZS 532,296 across 129 of 140 invoices**. Never copy that.
- ⚠️ **The VAT rate is DATA, not code** — a column on the customer, falling back
  to `settings['cocozuri.vatRate']`. Whether 7% is right at all (Tanzania's rate
  is 18) is an OPEN QUESTION the owner has parked; the maths works at any rate.
- ⚠️ **The catalogue has real duplicates** — one bar imported as five rows because
  it is typed five ways in the sheets. Deliberate: merging is a business decision,
  not a string comparison. A merge tool is the first job of Phase 2.
- **Phase 2 (built):** `/cocozuri/invoices` + `/cocozuri/invoices/[number]`,
  migration **0146** (`cz_invoices`, `cz_invoice_lines`). Pick a customer and the
  VAT rate, terms and currency resolve; pick a product and the price fills itself
  in. **The amount in words is generated**, not typed. A **credit note is the same
  record** with its own series. Plus the **product merge tool** — the duplicates
  came across on import deliberately, and only a person can say which rows are one
  product.
- ⚠️ **FOUR THINGS ARE FROZEN when an invoice is raised**: the customer details,
  the VAT rate, the terms, and each line's description. An invoice prints what was
  true the day it was raised.
- ⚠️ **NO TOTAL COLUMN** on the invoice or the line — `invoiceTotals()` derives it.
- ⚠️ **An ISSUED invoice is never edited**, only answered with a credit note.
- ⚠️ **`settings['cocozuri.seriesFloor']` carries the numbering on** from the
  spreadsheets (`{"CZ-": 236}`). Without it the first invoice raised in COS was
  CZ-1 and would have collided with a real one.
- ⚠️ **A price is resolved when the CUSTOMER changes too, not only when a product
  is picked.** Filling the invoice form products-first (the natural order, off an
  order form) used to keep the standard list price instead of that customer's
  agreed one — silently, and wrong on the paper that went out.
- ⚠️ **A Supabase select list must be ONE string literal** — split it across a `+`
  and the client can no longer read it at type level, every row degrades to an
  error type, and the file stops compiling for a reason that looks unrelated.
- **Phase 3 (built):** `/cocozuri/receipts` (money in) · `/cocozuri/owed` (what is
  outstanding, worst first) · `/cocozuri/statements` + `/statements/[id]` (the
  statement of account, printable, period in the URL). Migration **0147**:
  `cz_receipts` + `cz_invoices.applies_to_invoice_id`.
- ⚠️ **THE AGEING HAS FIVE BANDS AND MUST KEEP THEM.** The spreadsheet's `Sheet2`
  jumps 31–60 straight to 91+, so everything **61–90 days late is reported a month
  young** — TZS 1,567,000 of it on the day the books were read. A test asserts
  every day from −10 to 200 lands in exactly one band. Do not drop one to fit a
  screen.
- ⚠️ **ONLY ISSUED DOCUMENTS ARE OWED.** A draft has not been sent to anybody; a
  cancelled one never was. The payment sheet will not even offer a draft.
- ⚠️ **THE CUSTOMER COMES OFF THE INVOICE, NEVER THE FORM.** A receipt for one
  customer against another's invoice is not a thing that should be typeable.
- ⚠️ **ONE CHEQUE, SEVERAL INVOICES = ONE ROW EACH**, sharing a date and a
  reference, **all or nothing** — so nothing ever sits "on account" waiting to be
  allocated. An overpayment is recorded as it stands and shown negative.
- ⚠️ **`cz_invoices.applies_to_invoice_id` IS WHAT MAKES A PER-INVOICE BALANCE
  POSSIBLE.** An unapplied credit note reduces the customer's account but is
  attached to no invoice, so it **cannot be aged** and is shown apart, never
  netted into a band.
- ⚠️ **`deleteReceipt` IS A REAL DELETE AND MUST BECOME A REVERSAL AT PHASE 5** —
  once a payment reaches `gl_entries` the ledger's second rule applies.
- ⚠️ **`cz_receipts` HAS TWO FKs TO `companies`** (who invoiced, and whose account
  took the money — the "received in DSC" fact). A bare `companies(name)` embed is
  ambiguous and PostgREST refuses the WHOLE query, which showed on screen as "no
  payments recorded yet" over rows that existed. Use
  `companies!received_into_company_id(name)`.
- ⚠️ **A `?new=1` DEEP LINK MUST CONSUME ITS OWN FLAG.** `revalidatePath("/x")`
  does not invalidate the cached entry for `/x?new=1` — they are different keys —
  so the payment saved and the list did not move, which on a money form is how
  somebody gets credited twice. `history.replaceState` on mount, as `/notes` does.
- ⚠️ **A SERIES FLOOR MAY BE A STRING, AND ITS LENGTH IS THE PADDING.**
  `{"CZ-CN/": "01"}` = carry on from 1, pad to two digits. Width is otherwise
  taken from the numbers already used, and the first document in a series has
  none — so the first credit note came out `CZ-CN/1` against the paper `CZ-CN/01`.
- **Phase 4 (built):** `/cocozuri/stock` (the day book) · `/cocozuri/stock/month`
  (the month-end block and the stock-take). Migration **0148**:
  `cz_stock_locations` · `cz_stock_items` · `cz_stock_days` · `cz_stock_counts`.
  Seeded by `npm run seed:cz-stock` — 3 locations, 323 items, 529 day rows.
- ⚠️ **THERE ARE FOUR STOCK SHEETS, NOT THREE**, and each heads its third movement
  column with a DIFFERENT WORD: the shop **RETURN**, the kitchen **DA/SA/ TA**,
  raw materials **DAMAGE**. That is why `cz_stock_locations.third_label` is a
  column. Nobody has said what DA/SA/TA means — it is recorded under its own name,
  never translated into a guess.
- ⚠️ **A STOCK ITEM IS A THING YOU COUNT; A PRODUCT IS A THING YOU SELL.**
  `cz_stock_items.product_id` is nullable — raw materials are 171 rows of coffee
  and almond powder that are never invoiced. The link being an **id** is the fix
  for fault #4 (the workbook's sales sheet matches BY NAME, so stock says 1,014
  units left the shop in August and sales says 814). **Never match by name.**
- ⚠️ **AN OPENING STOCK IS A COUNT**, dated the day BEFORE the book starts —
  because **a count is the position at the END of its date**. Movements on a
  count's own date are already inside it and are never added again. Out by a day
  here and every figure after a stock-take is wrong by that day's trade.
- ⚠️ **A COUNT BECOMES THE NEW TRUTH** — everything after it carries forward from
  what was counted, not from what the book said.
- ⚠️ **A VARIANCE MUST BE EXPLAINED**, enforced twice (the button AND
  `recordCount`). A count that agrees needs no reason.
- ⚠️ **`on_date`/`counted_on` ARE `date`, NOT `timestamptz`** — the one deliberate
  exception to migration 0014. A stock day is a calendar day. Use `todayInDar()`,
  never `toISOString().slice(0,10)`, which is the UTC day (yesterday until 3am).
- ⚠️ **A ROW OF THREE ZEROS IS DELETED, NOT STORED** — "nothing moved" and "nobody
  wrote anything down" are different claims. A negative MOVEMENT is refused; a
  negative closing is allowed but warned about.
- ⚠️ **EVERY PRICE IN THE CATALOGUE IS DATED 21 AUG 2026 — the day it was
  IMPORTED, not the day it came into force** (all 159; the list is headed
  FEB-2026). So nothing before that date can be valued and the sales column reads
  nil for August. The arithmetic is right and the data is wrong; it is left
  uncorrected because the rows come from two sources with two real dates, and the
  month page names the cause. **Ask the owner what date each set starts from.**
- **Phase 5 (built, no migration):** posting to the general ledger, and
  **`/cocozuri/order`** — the order form.
- ⚠️ **EVERYTHING REACHING `gl_entries` GOES THROUGH `postVoucher()`/`unpostVoucher()`.**
  Invoice = Dr debtors *gross* · Cr Sales *net* · Cr VAT payable. A credit note is
  the same voucher **with the sides swapped**, never a negative. A receipt is
  Dr Bank/Cash · Cr debtors and touches neither sales nor VAT.
- ⚠️ **VAT IS NEVER INCOME** — the sales line is the NET, and `net = gross − vat`
  so the voucher balances to the cent. Proved live: 250,000 at 7% → Sales
  233,644.86, VAT 16,355.14 (the VAT *contained*, not 17,500).
- ⚠️ **POSTING IS EXPLICIT** (the ledger's fifth rule). Issuing an invoice does
  NOT post it; somebody presses Post. The desk says how many are waiting.
- ⚠️ **A PAYMENT RECEIVED INTO ANOTHER COMPANY IS REFUSED.** The "in DSC" question
  (§4.4) is unanswered; posting it to Cocozuri's bank would be a lie and inventing
  an inter-company account would answer the owner's question for him.
- ⚠️ **`deleteReceipt` REFUSES A POSTED PAYMENT** — reverse it first.
- ⚠️ **The sales account is 4100, overridable with `cocozuri.salesAccount`** —
  the shared chart has roles for receivable/bank/cash/VAT but **none for income**.
  `resolveAccounts` refuses and names what is missing rather than guessing.
- ⚠️ **Furaha's chart was seeded (70 accounts)** — it had none, so nothing could
  post. All test entries were removed INCLUDING the reversals (permanent by
  design); `gl_entries` for Furaha is back to 0. **Ask whether the books should
  be open, and from what date.**
- ⚠️ **The order form measures demand over days ACTUALLY COUNTED, not the
  calendar** — the kitchen skips 7-10 August, and dividing by 30 would halve
  every kitchen figure. Fewer than two days of history gets no figure at all.
- Still **no MCP tool and no `EntityDef`**, on purpose. **A ledger WRITE tool must
  never exist.**
- ⚠️ **THE OWNER ANSWERED FOUR OF THE SIX OPEN QUESTIONS (22 Aug, evening):**
  **"finish" means FINISHED GOODS, after production** — so note #31's "raw
  material + finish + packaging" is the cost OF the finished good, not three
  kinds of input; **everything has an expiry and a shelf life**, so **Stage 9 is
  NOT optional** any more; **VAT is 7% but keep it flexible** (it already lives
  in data); and **DA/SA/TA is still a mystery to him too** — keep storing it as
  written. Still open: whether the shop is a real till (he asked for the question
  again), and the pilot-stage decisions he has parked until every stage is built
  (the books opening, money "in DSC", the price dates). See §5b.
- ⚠️ **THE MANUFACTURING HALF IS COMPLETE — ALL NINE STAGES —
  read `memory/cocozuri_manufacturing_plan.md` before touching stock.** Nine
  stages from the owner's own notes (22 Aug 2026): purchasing, recipes,
  production batches, transfers, POS, returns, batch costing, the rest of the
  accounts, and food traceability. §5 is a line-by-line audit of all 52 points in
  those notes so nothing is lost; **§5a holds the owner's answers and they change
  the design**, and **§5b his answers of that evening**. §6a–§6g record what
  was built.
- ⚠️ **PRODUCTION (Stage 4) IS SHAPED ENTIRELY BY §5a — "we don't use batch
  numbers, but we are introducing them".** It does not fail by being wrong, it
  fails by NOT BEING USED. So: the number is **allocated, never typed**; a batch
  **opens in ONE action** and lands `running`; the **recipe is optional**; and
  **every question is asked at CLOSE**, when somebody has finished.
- ⚠️ **MATERIALS ARE CONSUMED AT CLOSE, NOT AT START.** The kitchen's shelf
  reads true all day, and — the real reason — **abandoning a batch costs
  nothing**, so nobody avoids opening one "just in case". Closing writes every
  `consume` and the one `produce` in ONE voucher, all carrying the `batch_id`,
  which is the whole traceability story.
- ⚠️ **A BATCH DOES NOT NET** — `postStockMove` is called WITHOUT `mustNet`.
  Two kilos of cocoa become 108 bars; a transfer nets, production does not.
- ⚠️ **THE INTER CHECK READS THE MOVEMENTS, NOT THE RECIPE** (note #37). The
  recipe is what was MEANT to go in. Reading it back as fact would make every
  batch agree with itself. **A shortfall must say where it went** — in the
  making, or the materials (note #12) — and naming the kind is not enough, it
  has to say why. The expectation is measured AFTER the recipe's expected loss.
- ⚠️ **A RECIPE SOMETHING HAS BEEN MADE FROM CANNOT BE DELETED**, and reopening
  a batch REVERSES its movements rather than erasing them.
- ⚠️ **TRANSFERS (Stage 5): TWO ITEM ROWS, JOINED BY `product_id`, NEVER BY
  NAME.** The owner settled it — same chocolate, two rows. 64 of the kitchen's
  75 pair with a shop row; the rest are REPORTED with a reason, never dropped
  and never auto-created.
- ⚠️ **A TRANSFER HAS TWO MOMENTS AND DOES NOT ALWAYS NET.** Sending writes the
  OUT movements (it is now in transit — on neither shelf); receiving writes the
  IN movements for **what actually arrived**. A shortfall must be explained;
  MORE arriving than was sent is refused outright. **The missing units get no
  movement of their own** — they belong to neither shelf, and both sides carry
  the transfer's voucher so the loss is always answerable. ⚠️ `postStockMove` is
  therefore called WITHOUT `mustNet`, and Stage 1's `transferStock` is
  SUPERSEDED — do not build on it.
- ⚠️ **RETURNS (Stage 6): ONE DOCUMENT, TWO DOORS, AND ONLY ONE MOVES STOCK
  INWARDS.** `cz_returns` · `cz_return_lines` (migration **0154**);
  `cocozuri-return-shared.ts` is CLIENT-SAFE, `cocozuri-return.ts` is SERVER-ONLY
  and the ONE DOOR. A **customer's** return left the books the day it was sold so
  booking it writes `return` movements ONTO the shelf; **breakage found here**
  never went anywhere, so booking it writes NOTHING. Both leave the same way —
  what is thrown writes `damage` OUT.
- ⚠️ **"REPAIRING" IS THE GAP BETWEEN BOOKING IN AND SORTING** — `qty − good −
  scrap`, the exact twin of a transfer's "in transit". So `good_qty`/`scrap_qty`
  are **nullable and cumulative**, never a verdict column: five bars repacked
  today and five thrown next week is the real case, and `settleReturn` may be
  called again until nothing is outstanding.
- ⚠️ **THE MONEY HALF IS A LINK, NOT A SECOND DOCUMENT.** `raiseCreditNote`
  prepares the credit note that already exists and stores its id.
  **Priced off the ORIGINAL invoice, never today's list**, and matched by
  **`product_id`, never by name**. It credits **what came back**, not what was
  repacked, and lands as a **draft**.
- ⚠️ **A SALES RETURN DOES NOT PUT THE COST BACK, AND MUST NOT UNTIL STAGE 7** —
  nothing has ever relieved 1150 for a sale, so the cost is already sitting
  there. The record page says so out loud.
- ⚠️ **`postWriteOff` IS Dr 6930 · Cr 1150, AT COST** — what a bar SELLS for has
  nothing to do with what throwing it away cost. **Only a SETTLED return posts**
  (what is on the bench might yet be sold), and a loss that **cannot be valued in
  full is refused with the item NAMED**, never posted short.
- ⚠️ **6930 "Stock written off" AND 6940 "Stock gains and losses" ARE NEW IN THE
  SHARED CHART, AND BOTH SIT UNDER 6900 *Other*, NOT UNDER COST OF SALES** — breakage is not part of
  what a bar costs to make, and burying it there would make gross profit read
  better the more stock gets damaged. Furaha's chart was re-seeded to add
  them (70 → 72). `resolveWriteOffAccounts` refuses rather than guesses.
- ⚠️ **`itemCostFromMoves` NOW READS `produce` AS WELL AS `receipt`.** A bar was
  never bought, so receipts alone gave every finished chocolate no cost — which
  made a crate of them thrown away look free.
- ⚠️ **THE LOSS REASONS: TWO ARE HIS WORDS, THREE ARE PROPOSED.** "In the making"
  and "the materials" are note #12; handling, too old and came-back-spoiled were
  added because a bar crushed in a crate is neither. **Say so when it next comes
  up.** A scrap must name the kind AND say what happened.
- ⚠️ **PROFIT (Stage 7): NO TABLE AND NO MIGRATION.** `cocozuri-profit-shared.ts`
  is CLIENT-SAFE, `cocozuri-profit.ts` is SERVER-ONLY; the screen is
  **`/cocozuri/profit`** with the view and month in the URL. Everything is
  derived on read.
- ⚠️ **WHAT A BATCH EARNED CANNOT BE KNOWN, AND THE PAGE SAYS SO.** An invoice
  line names a PRODUCT, not a batch. It shows what the batch **cost** (measured
  from its own `consume` movements, never the recipe) and what its bars are
  **worth** at the price they sell for. Tracing a sale to a batch is Stage 9.
- ⚠️ **COST PER UNIT DIVIDES BY WHAT CAME OUT**, not by the recipe's expected
  good units — `costRecipe()` is a plan, this is a measurement.
- ⚠️ **THE YIELD IS NOT RECOMPUTED** — it calls Stage 4's `batchCheck`, so two
  screens can never quote different yields for one batch.
- ⚠️ **THE MARGIN IS TAKEN NET OF VAT.** Costs are ex-VAT and a CocoZuri invoice
  is VAT-INCLUSIVE; comparing them straight inflates every margin by the rate.
  The price prefers **what was actually charged** over the list.
- ⚠️ **`postCostOfSales(year, month)` IS WHAT MAKES THE P&L REAL** — Dr 5100 ·
  Cr 1150, one voucher a month under a derived id (`202608`) so it can never post
  twice. **And it resolves note #11's "cost value" with NO special case:** goods
  coming back are a positive movement, so a return reduces the month's cost of
  sales by itself (proved: 10 sold = 10,384.62; four back = 6,230.77).
- ⚠️ **WHAT COUNTS, AND EVERY EXCLUSION IS DELIBERATE:** `day_out`/`sale` in,
  `return` subtracted, **`damage` OUT** (Stage 6 charges it to 6930 — counting it
  here would charge it twice), `consume`/`produce`/`transfer`/`receipt` out. **A
  stock-take difference is reported but NOT posted** — that is Stage 8's work.
- ⚠️ **IT REFUSES A MONTH IT CANNOT VALUE IN FULL**, by name. Understating the
  cost overstates the profit, which is the one direction of error nobody notices.
  Live today: August has 113 chocolates nobody has ever costed.
- ⚠️ **AN INCOMPLETE COST MAKES PROFIT A CEILING, NOT A FLOOR** — the inverse of
  everywhere else here. Profit and margin show **"≤"**; a cost still shows "≥".
- ⚠️ **MONEY OUT (Stage 8): ONLY `credit` AND `own_money` LEAVE ANYTHING OWED.**
  `cz_payments` (migration **0155**); `cocozuri-pay-shared.ts` is CLIENT-SAFE,
  `cocozuri-pay.ts` is SERVER-ONLY and the one door. A purchase paid from the
  bank or the cash box was settled the day it was bought — paying it again would
  credit the bank twice. **The party is the one Stage 2 credited**: a purchase
  bought with somebody's own money is owed to a PERSON, not a supplier.
- ⚠️ **FIXED ASSETS AND BANK RECONCILIATION ARE COMPANY-WIDE, NOT COCOZURI'S** —
  `fixed_assets` · `bank_recs` · `bank_rec_lines`, screens `/ledger/assets` and
  `/ledger/reconcile`. Every one of the thirteen has assets to write down and a
  statement to tick off.
- ⚠️ **NO `accumulated` OR `book value` COLUMN.** Straight line over MONTHS, the
  **last month trimmed** so the total lands exactly, nothing charged after the
  life ends or after disposal, and **a disposal measured against what it STOOD
  at** — selling for 300,000 something standing at 900,000 is a loss of 600,000.
- ⚠️ **RECONCILING NEVER TOUCHES A POSTED ENTRY.** A `cleared` column on
  `gl_entries` would break the ledger's second rule; the clearance lives in its
  own table pointing at the entry. **A unique index means an entry clears once,
  anywhere**, and a reconciliation **only closes when it agrees**.
- ⚠️ **6940 "Stock gains and losses" IS NEW AND IS APART FROM 6930.** Breakage
  somebody saw and wrote down is a different fact from stock that simply is not
  there. `postStocktake` swaps the sides when a count finds MORE than the book
  said — that is a gain, not an error.
- ⚠️ **TRACEABILITY (Stage 9): A LOT AND A BATCH ARE THE SAME TABLE.** Migration
  **0156** adds `cz_stock_items.shelf_life_days`, `cz_purchase_lines.expires_on`
  and `cz_batches.source` + `purchase_line_id`. A dated delivery line becomes a
  `LOT-2609-01` row on approval; a line with no date gets no lot, because a form
  that insists on a date nobody has does not get filled in.
- ⚠️ **THE `batch_id` ON A `consume` MOVEMENT IS THE MATERIAL'S LOT, NOT THE
  BATCH BEING MADE.** Which batch it belongs to is already on the voucher, and
  using the column for the lot is what carries the thread from a bar back to the
  bag and the supplier. **What went IN reads the voucher; what went OUT reads the
  batch id.** ⚠️ Batches closed before this put their own id on their consumes,
  so `batchesUsing` skips the batch itself.
- ⚠️ **FIRST EXPIRED, FIRST OUT — not first in.** `closeBatch` allocates each
  material across its lots soonest-expiring first. An undated lot goes LAST and
  is reported; a shortfall is recorded with no lot rather than invented.
- ⚠️ **EVERY DOCUMENT THAT TAKES STOCK OFF A SHELF ALLOCATES THROUGH
  `pickFefoMany()`** — a batch close, a transfer's send and a counter sale. It
  reads the ledger ONCE for the whole document (`pickFefo` reads all of it per
  call; the counter was scanning it 75 times to open a form) and **decrements as
  it goes**, so two lines wanting the same lot can no longer each be told the
  whole lot is theirs. The sharing-out is the pure, tested `allocateFefoMany` in
  `cocozuri-trace-shared.ts`. ⚠️ **Key the per-line split by LINE, never by
  item** — two lines may name the same chocolate, and keying by item makes both
  post the second line's movements.
- ⚠️ **A COUNTER SALE CARRIES ITS LOT (27 Aug 2026), AND THE OLD FAULT WAS NOT
  A MISSING ONE — IT WAS A WRONG ONE.** The form was given a FEFO allocation for
  **one piece** and sent it back as the lot for the whole line, so thirty bars
  off a lot with five left were all filed against it: on a recall, a confident
  wrong answer where a missing one would have made somebody go and look. It is
  allocated against the quantity actually SOLD now, at the moment of recording,
  one movement per lot. **The form's lot number is a LABEL, not a choice**, and
  the LINE names a lot only when the sale lands on exactly one — the movements
  carry the split.
- ⚠️ **`cz_events` IS THE MODULE'S MEMORY, AND IT IS APPEND-ONLY** (Stage E,
  migration **0165**; screen `/cocozuri/history`, timelines on the batch,
  invoice, plan, **recipe, supplier, transfer and return** records — Stage F,
  27 Aug 2026, no migration).
  ⚠️ **A TIMELINE ON A RECORD WHOSE DOORS WRITE NOTHING IS NOT A TIMELINE.**
  Stage E named sixteen subject types and only five had a door recording
  anything; the rest read as "nothing has happened here" rather than "nothing is
  being written down". Stage F added the doors for **recipe · supplier ·
  transfer · return · purchase** (create/update/cancel/delete, and each
  document's own moments) before putting the widget on any screen. **Adding a
  subject means adding its doors, not its widget.**
  ⚠️ **Purchases and counter sales still have NO record page**, so they carry
  no timeline; their events are read on `/cocozuri/history`. Payments and money
  in record no events at all yet. No update path and no delete path, the same rule
  `gl_entries` follows. ⚠️ **A COMMENT IS ONE OF THE KINDS**, not a second
  table — two lists would have to be merged and kept in date order on every
  screen. ⚠️ **THE REFERENCE IS FROZEN ON THE EVENT, NEVER JOINED**, because
  Stage A gave the module real deletes and "PP-2608-01 was deleted" has to go
  on reading afterwards. ⚠️ **NO FK ON `subject_id`** — it points at a dozen
  tables and a cascade would delete the record of a deletion. ⚠️
  **`recordEvent` NEVER FAILS THE THING IT DESCRIBES** (the `reindexEntity`
  stance): a door that had to check its own timeline entry landed would
  eventually refuse real work. ⚠️ **Days are DAR days** — `dayLog` bounds with
  `+03:00` and its "to" is the END of the day, or asking for today returns
  nothing that happened today.
- ⚠️ **NO SCREEN BUILDS ITS OWN BATCH PLAN.** `batchDetail` returns the plan it
  used. The batch page rebuilt one from the LIVE recipe while the check used
  the frozen one — the close form and the difference above it would have
  disagreed the moment a recipe was edited. Same fault in `updateBatch`, which
  recomputed the expectation from today's recipe when only the quantity moved.
- ⚠️ **A BATCH IS JUDGED AGAINST THE RECIPE IT WAS MADE FROM** —
  `cz_batches.recipe_snapshot`, frozen at open (Stage D, migration **0164**).
  A closed batch used to be compared against whatever the recipe says TODAY, so
  correcting a recipe next month silently changed the reported difference on
  every batch ever made from it, including ones already read and signed off.
  ⚠️ **`batchPlan` TAKES `CzRecipePlannable`, NOT `CzRecipe`**, so a snapshot
  goes through the SAME function as a live recipe — two batches can never be
  scaled by two rules. NULL falls back to today's recipe and **the screen says
  which it is showing**. Changing the recipe on a running batch **re-freezes**
  the snapshot. ⚠️ **"The recipe has moved on" is SAID, never acted on** — it
  may have been corrected, or changed for next time, and only the chef knows;
  `rereadRecipe` is a RUNNING batch only.
- ⚠️ **A PICKER NARROWS, IT DOES NOT GATEKEEP.** Recipe lines now offer items
  matching the line's kind (Stage A's payoff), but an UNCLASSIFIED item is still
  offered, sorted after the likely ones — hiding it would make the gap invisible
  and block work on a row whose only fault is that nobody got to it yet.
- ⚠️ **THE BATCH BUTTONS WERE RENAMED** because the chef could not read them:
  "Fetch materials" → **Take materials from store**, "Some of it is done" →
  **Record finished pieces**. ⚠️ **Editing a running batch stores the MULTIPLE,
  not the piece count** — 200 from a 108-yield recipe is 1.852 batches, and
  sending the count alone leaves the materials scaled to the old figure.
- ⚠️ **"WHAT CAN I MAKE TODAY" TAKES THE SMALLEST NUMBER OF BATCHES ANY ONE
  MATERIAL ALLOWS**, and names the one that runs out first. An average, or
  ignoring the binding material, says a recipe is possible when it is not — a
  batch abandoned halfway through a morning.
- ⚠️ **THE ORDER FORM IS A PRODUCTION PLAN — WHAT TO MAKE TODAY** (owner,
  27 Aug 2026; Stage C, migration **0163**). `/cocozuri/order` is the plans;
  the BUYING half moved to `/cocozuri/order/materials` ("What to buy").
  ⚠️ **A PLAN MOVES NO STOCK AND CREATES NOTHING** — nothing in
  `cocozuri-plan.ts` calls `postStockMove`. Starting a line goes through
  **`openBatch`**, never a second door. ⚠️ **A FUTURE DATE IS ALLOWED HERE AND
  ONLY HERE** — a plan records nothing, so writing tomorrow's tonight is normal.
  ⚠️ **"Done" is DERIVED** from the lines' batches, never a status column, and
  **a RUNNING batch has made nothing** (that is settled at close).
- ⚠️ **AN ABANDONED BATCH FREES ITS PLAN LINE**, and `cancelPlan`/`deletePlan`
  agree: a cancelled batch is not real work any more. Blocking on one would
  leave a plan that only ever produced abandoned batches stuck for ever. A
  RUNNING or CLOSED batch still blocks — starting twice puts the same chocolate
  on the shelf twice.
- ⚠️ **`planMaterials` SCALES BY THE RECIPE'S GOOD UNITS**, using the same
  `batchPlan` the batch form uses — so the plan and the batch can never quote
  different material figures. **A line with no recipe contributes nothing and
  the screen says the list is short by that much.** Materials come off
  whichever shelf they sit on, not off the kitchen the plan is for.
- ⚠️ **`reorder_level` IS NULLABLE AND NULL IS NOT NOUGHT** — an item with no
  level is never reported low. It sits beside the consumption rate because it
  needs NO history, and the rate needs a week.
- ⚠️ **DELETING A SUPPLIER MUST CHECK `documents` AND `assets` TOO** — both are
  ON DELETE **SET NULL**, so a check that only looked at purchases would have
  quietly detached their contract and their equipment rather than refusing.
- ⚠️ **SUPPLIERS ARE THE SHARED `vendors` REGISTER, REACHED FROM INSIDE
  COCOZURI** (`/cocozuri/suppliers`, Stage B). ⚠️ **The register was found EMPTY
  across the whole system** while every purchase carried a typed name — so it
  was never "the register lives elsewhere", it was that nobody had ever used it,
  and sending them to another module is why. Adding, editing and deleting now
  happen here, writing to the same table. **One list, two doors** — a second
  supplier table would drift within a month. **Only APPROVED purchases count**
  towards spend, and **"still owed" is CREDIT only** (bank and cash were settled
  that day; own money is owed to a PERSON). A supplier stays **optional** on a
  purchase, and a typed name is REPORTED, never warned about.
- ⚠️ **A LIST VALUE TYPED INTO A FORM MUST JOIN ITS LIST** (`ensureListValue`).
  The item and product forms let a category or unit be typed as well as picked —
  a unit nobody has added yet must not stop somebody adding an item. But a typed
  value that never reached the list would put every typo back into the data
  while staying invisible on the screen built to catch it. **And the form must
  offer the managed list FIRST**, then anything already in use — building the
  options from existing products alone meant a new category could not be set up,
  only old ones tidied.
- ⚠️ **STAGE A IS BUILT (27 Aug 2026) — `kind`, the LISTS, and REAL DELETE.**
  A stock item now knows whether it is a `raw_material`, `packaging`, `finished`
  or `other`; **NULL means nobody has said and is NOT the same as `other`** (one
  is a job on a list, the other a decision). ⚠️ **A picker must never HIDE an
  unclassified item** — `byKindRelevance` sorts it into the middle, never out,
  or the gap becomes invisible and blocks real work. The backfill filled in only
  what it could be confident of and left 3 of 323 for a person.
- ⚠️ **`cz_lists` IS THE LIST YOU PICK FROM, NOT A FOREIGN KEY.** The value
  stays as TEXT on the product and the item because an invoice has frozen its
  own wording and must never be re-pointed by somebody tidying a list. So a
  **rename REWRITES the word everywhere it is used** (`rewriteValue`, matching
  exactly as stored — case-insensitively would silently merge things nobody
  asked to merge). Duplicates are **suggested, never merged**; a value in use
  cannot be deleted and the refusal says how many use it. The seed found **five
  count units where there are three** (`GM`/`GRM`, `PKT`/`PKTS`).
- ⚠️ **DELETE FOLLOWS ERPNEXT'S OWN RULE:** a draft goes; something acted on is
  cancelled first; anything still pointed at **NAMES what points at it**
  (`deleteVerdict`). **Not everything blocks** — a price goes with its product,
  an invoice line does not. **A stock movement always blocks, and that is why
  archive still exists.**
- ⚠️ **`CocozuriHelp` IS WHERE EXPLANATIONS GO NOW.** A working screen says what
  a field IS; anything explaining WHY goes in the Help panel, one click away.
  Do not write another paragraph into a form. **Every screen in the CocoZuri rail
  carries one except the desk** (Stage F — nineteen added 27 Aug 2026), and a
  **record page gets its OWN panel**, covering what that record's buttons do,
  rather than a copy of its list's.
- ⚠️ **THE ORDER FORM IS WHAT TO MAKE TODAY, NOT WHAT TO BUY** (owner, 27 Aug
  2026). It is currently built as a buying screen; Stage C reshapes it into a
  dated, numbered production plan. Do not build a purchase order.
- ⚠️ **A `Field` LABEL THAT WRAPS PUSHES ITS OWN CONTROL DOWN** while a
  one-line label leaves its control at the top — a row of four boxes at two
  heights. Every copy is `flex h-full flex-col justify-end`. Keep it.
- ⚠️ **A SALES INVOICE NOW SAYS WHICH LOTS WENT OUT, AND IT MOVES NO STOCK**
  (`cz_invoice_line_lots`, migration **0161**). The day sheet's `day_out` is what
  takes finished goods off the shelf; an invoice writing movements too would take
  the same chocolate off TWICE. It is a **despatch record** answering the half of
  a recall the stock ledger cannot — not "where did this lot go" but **WHO GOT
  IT** — because an invoice line names a PRODUCT. A ROW PER LOT, never a column:
  a supermarket order spanning two lots is exactly the case a recall cares about.
  Written at ISSUE, FEFO, **against what other invoices have already claimed of
  each lot** (a lot's on-hand does not fall when it is invoiced, so without that
  two invoices are each told the whole lot is theirs). A credit note despatches
  nothing. **Correctable after issue** — the one place the module bends its own
  rule, because which lots went in the van is not money.
- ⚠️ **A BATCH CAN FETCH MATERIALS WHILE IT RUNS AND FINISH IN MORE THAN ONE
  GO** (`drawMaterials` / `recordOutput`, no table — the movements are the
  record, under the batch's own voucher). A three-day batch no longer leaves the
  raw-material shelf reading high; "two hundred bars Monday and the rest
  Wednesday" is ONE batch with one lot and one date. **Closing NETS against
  both** — the totals are what the inter check uses, only the remainder moves,
  and a negative remainder puts material back. The expiry reads the drawn lots
  too. **Abandoning still costs nothing where nothing was fetched**, and puts
  back what was.
- ⚠️ **A REVERSAL IS FILED UNDER ITS OWN VOUCHER TYPE** — `batch:reversal`,
  never `batch` — so asking the ledger for a document's movements returns the
  ORIGINALS whether or not they have already been answered. Reversing on the
  strength of that reverses a SECOND time: reopening a closed batch and then
  abandoning it put coffee back on a shelf it had never left and took bars off
  one they had already returned to. **`outstandingOf()` nets the two sides per
  item, shelf, LOT and reason** — keying by item alone lets one lot's reversal
  cancel another lot's draw.
- ⚠️ **A DRAFT INVOICE CAN BE EDITED; AN ISSUED ONE STILL CANNOT.** Cancelling
  and retyping was never a rule, only a missing screen. The lines are REPLACED,
  the number never moves, and changing the customer **re-freezes** the VAT rate,
  terms, currency and details.
- ⚠️ **`/cocozuri/items` IS WHERE STOCK ITEMS ARE MANAGED, `/cocozuri/shelves`
  THE SHELVES** (1 · Set up; the shelves screen was a bottom sheet inside items
  until 27 Aug 2026, and a shelf is set up BEFORE the items on it). An item's
  SHELF cannot change once it exists (its movements are filed against it) and a
  shelf is never deleted, only taken out of use.
- ⚠️ **THE ITEMS RAIL FILTERS BY `kind`, AND THE SHELF IS NOT THE KIND.** "Where
  do I add a raw material" had no answer: the rail grouped by SHELF, and the
  shelf NAMED "Raw materials" is a different field that agrees with `kind` only
  because the backfill used one to guess the other. **Packaging reads 0** — said
  plainly rather than left invisible.
- ⚠️ **SET UP IS ORDERED BY THE ORDER YOU FILL IT IN, and it is a real
  dependency chain — nothing in it needs anything BELOW it:** Lists (the words
  the forms pick from) → Products → Customers → Prices (needs a product, and a
  customer for an agreed price) → Shelves → Stock items (**cannot be added
  without a shelf**, and links to a product) → Suppliers, which hands over to
  2 · Buy. It was arranged by screen type before, which told a new starter to
  begin at Products — the one thing that leaves them unable to add an item.
- ⚠️ **THE MODULE WAS EMPTIED ON 27 AUG 2026 AT THE OWNER'S WORD** — all 2,149
  rows across 30 `cz_*` tables, `RESTART IDENTITY`, so he could enter everything
  himself. Backup first (`backups/2026-08-27T19-33-50Z`, 172 tables / 31,154
  rows). **`scripts/cz-reset.ts --yes` is the tool**, and it REFUSES if anything
  outside the module points into it — `TRUNCATE … CASCADE` empties whatever
  holds a reference. **The chart of accounts (72) was KEPT** (it is the ledger's
  template, not CocoZuri's data), and so was
  `settings["cocozuri.seriesFloor"]`, which stops the first invoice colliding
  with a real one on paper. `scripts/cz-audit-size.ts` counts rows and sizes and
  writes nothing.
- ⚠️ **AN EMPTY STATE IS A SCREEN, AND IT IS ONLY EVER SEEN IN THE STATE NOBODY
  TESTS IN.** With the module emptied, the Stock book told the owner to run
  `npm run seed:cz-stock` — which would have re-imported the 323 items he had
  just cleared. Both stock screens point at **Shelves** and **Stock items** now.
  Never put a terminal command in an empty state.
- ⚠️ **A MOVED PAGE MUST BE FOLLOWED BY EVERY ADDRESS POINTING INTO IT, ITS OWN
  INCLUDED.** Stage C moved the buying half to `/cocozuri/order/materials` and
  left one `router.push("/cocozuri/order")` behind, so every shelf and cover
  button on **What to buy** threw you onto the production plan — the screen was
  unusable from the split until 27 Aug. `tsc`, 1,299 tests and a sweep that
  LOADED all 22 screens all passed, because the page renders perfectly. **Only
  pressing the button finds this.**
- ⚠️ **`/cocozuri/prices` EXISTS BECAUSE THREE THINGS WERE UNREACHABLE.** The
  product form's one price box could only ever add a **standard list price dated
  today**, so: a customer's own agreed price could not be set (while **85 of 159
  prices already ARE customer prices**, imported and unmaintainable);
  `effectiveFrom` was never passed, which is why every price is stamped the
  import day and **nothing could correct it**; and `deletePrice` had been written
  with no caller. The product form stays as a shortcut and says so — both go
  through the same `setPrice`.
- ⚠️ **`unpricedProductIds()` IS THE ONE TEST FOR "IT CANNOT BE INVOICED".** The
  desk counted distinct ids in `cz_prices` and said 46; the products rail counted
  products with no list price in force and said 53. Both were labelled "no price"
  and both were wrong about a real case — a price starting next month is not a
  price today, and a customer's agreed price IS enough to raise an invoice.
- ⚠️ **`reorder_level` HAS A FORM NOW, AND `belowReorder()` IS FINALLY CALLED.**
  The column, the write path and a tested pure function had all existed since
  Stage C with **nothing able to set a level**, so nothing was ever reported low.
  It fills in the suggestion on What to buy only **where the rate cannot give
  one** — a rate knows how fast the stuff actually goes.
- ⚠️ **A LINKED ITEM DISAGREEING WITH ITS PRODUCT IS SAID, NEVER SWAPPED.** The
  schema claimed the product's name "wins"; nothing ever made that true. Renaming
  rows under the people who count from those sheets would be worse — so a rail
  check counts them and the form offers the product's wording in one press.
  ⚠️ **A blank on one side is not a disagreement.**
- ⚠️ **A `useMemo` CALLBACK RUNS DURING THE RENDER THAT DECLARES IT.** A `const`
  arrow function defined BELOW it is still in its temporal dead zone: What to buy
  came down entirely with "Cannot access 'suggestionFor' before initialization"
  while `tsc` was clean and 1,299 tests passed. **Only the browser finds this.**
- ⚠️ **THE ORDER FORM NEEDS `MIN_DAYS_MEASURED` (7) BEFORE IT QUOTES A RATE.**
  It was two, and consumption is LUMPY — a batch takes five kilos in a morning
  and none for a fortnight — so two days suggested ordering 195,000 g of milk
  chocolate. A row now says WHY it cannot be judged rather than printing dashes
  that read as "this never sells".
- ⚠️ **`revalidatePath` NEEDS `"layout"` FOR ANY LIST WITH A RECORD PAGE.**
  `/cocozuri/invoices` and `/cocozuri/invoices/CZ-237` are DIFFERENT cache keys,
  so the invoice list was revalidated and every invoice RECORD left stale — a
  lot correction saved to the database while the page went on saying "no lot
  recorded".
- ⚠️ **EXPIRY = THE EARLIER OF "made on + shelf life" AND THE SOONEST INGREDIENT,
  AND IT IS FROZEN** onto the batch at close. A shelf life changed next year must
  not move the date on chocolate already in a shop. **It returns nothing rather
  than guessing** when neither is known.
- ⚠️ **`/cocozuri/trace` ANSWERS BOTH RECALL QUESTIONS ON ONE SCREEN** — what
  went into a batch, and what was made from a lot. Plus what is going off, with
  **what carries no date counted separately**. The despatch check and the expiry
  bands are **defaults nobody has agreed**: they warn, never refuse.
- ⚠️ **THE COUNTER (Stage 5b) IS A RECORD OF A SALE, NOT A TILL.** The owner
  settled it: *"cash taken and kept in drawer and informed via WhatsApp and there
  is some data sheets, some cash collected via online modes... **for now we won't
  integrate a payment system here, just reports get digital**."* `cz_counter_sales`
  · `cz_counter_sale_lines` (migration **0157**); `cocozuri-counter-shared.ts` is
  CLIENT-SAFE, `cocozuri-counter.ts` is SERVER-ONLY and the one door. Screen
  **`/cocozuri/counter`**. **Nothing takes payment** — `paid_by` splits the day's
  takings and picks cash box vs bank, and settles nothing.
- ⚠️ **THE KITCHEN IS THE MAIN COUNTER, NOT THE SHOP** (his words). Both sell —
  the kitchen takes the bulk and custom orders, the shop the rare walk-in. The
  form defaults to the kitchen, and the counter is also the shelf stock comes off.
- ⚠️ **RECORDING IT LATE IS NORMAL** — "informed via WhatsApp" means the person
  who sold it and the person who types it are different, and later. `sold_by` and
  `recorded_by` are both kept. **But a FUTURE date is refused**: it would leave
  the sale out of today's takings and the shelf unchanged until that date arrived.
- ⚠️ **Dr cash or bank · Cr sales · Cr VAT — and NO DEBTOR.** It was paid there
  and then; trade debtors would leave a balance nobody will ever collect. Cash
  with no cash account in the chart is refused rather than quietly banked.
- ⚠️ **IT PLUGS INTO EVERYTHING FOR NOTHING** because the movement is
  `reason: "sale"` — already understood as demand by the order form, already
  valued by the monthly cost of sales, already followed by the trace. That is
  what Stage 1's one-ledger decision bought.
- ⚠️ **A walk-in needs no account**, the price is resolved like an invoice's and
  then **typeable** (bulk and custom orders are agreed on the spot), the VAT rate
  is frozen, a NIL price is allowed and a missing one is not, and **a negative is
  refused — something coming back is a RETURN**.
- ⚠️ **STOCK NOW HAS A LEDGER (migration 0149).** `cz_stock_moves` +
  **`postStockMove()`** are the twin of `gl_entries` + `postVoucher()`: ONE
  ledger, MANY doors, and nothing else may insert. `qty` is SIGNED, so a transfer
  is two rows sharing a voucher that must cancel to nothing.
- ⚠️ **`cz_stock_days` STAYS AS THE DOCUMENT** — the sheet as somebody typed it —
  and the moves are what it did to stock. Same split the reference system makes
  between a Stock Entry and a Stock Ledger Entry. **A day sheet may be REWRITTEN
  (people miscount); every other voucher is REVERSED, never erased.**
- ⚠️ **THE READ PATH IS THE LEDGER NOW (Stage 2), AND MUST STAY THERE.** Every
  CocoZuri stock screen reads `ledgerBalanceAt`; `stockBook()` returns `moves`,
  and `dayRows`/`monthRows`/`varianceOf`/`salesRows`/`orderSuggestions` all take
  a location and the movements. `balanceAt` survives as the day book's OWN
  reading — it is what proved the Stage 1 backfill — but **nothing new is built
  on it**. Proved live: before a delivery both read 406; after it the ledger
  reads 446 and the day book still 406.
- ⚠️ **THE SHEET AND THE LEDGER ARE READ SEPARATELY, FOR DIFFERENT THINGS.**
  `cz_stock_days` stays the DOCUMENT: it is what says whether anybody wrote
  anything down, it carries the note, and it is what `daysWritten` /
  `daysMeasured` count. The movements are the truth about quantity. Take
  `daysMeasured` off the ledger and a day whose only movement was a delivery
  counts as a day of trading — which halves the order form's rate.
- ⚠️ **THE DAY SHEET HAS AN "OTHER" COLUMN, AND IT IS READ-ONLY.**
  `closing = opening + IN − OUT − third` holds only while the sheet is the sole
  writer. `CzDayRow.other` is the net of movements recorded on a document, shown
  rather than hidden — otherwise the grid would print a closing figure that
  appears not to add up. It cannot be typed into: a delivery belongs to the
  purchase that recorded it, and retyping it would move the same stock twice.
- ⚠️ **BUYING (Stage 2): `cocozuri-buy-shared.ts` IS CLIENT-SAFE,
  `cocozuri-buy.ts` IS SERVER-ONLY AND IS THE ONE DOOR FOR WRITES.** Tables
  `cz_budgets` · `cz_purchases` · `cz_purchase_lines` (migration **0150**).
  ⚠️ **NO TOTAL COLUMN AND NO `spent` COLUMN, ever** — goods, VAT, the freight
  share, the landed unit cost and what a budget has left are all derived.
- ⚠️ **THE SUPPLIER ON A PURCHASE IS OPTIONAL AND MUST STAY OPTIONAL** (the
  owner, 22 Aug 2026). Raw materials are often bought at random or self-bought;
  a form demanding a supplier will not be filled in, and a purchase nobody
  records never reaches the books at all. "Not named" is shown as a plain fact,
  never as a warning.
- ⚠️ **`paid_from` IS FOUR CASES, AND `own_money` MEANS SOMEBODY IS OWED IT
  BACK.** That voucher credits **creditors with the PERSON as the party**, never
  the bank — the money never left it. Approving refuses a self-bought purchase
  with nobody named.
- ⚠️ **APPROVAL IS WHAT MAKES A PURCHASE COUNT** (note #47). A draft moves no
  stock and posts nothing, which is what makes it safe to type while the delivery
  is still coming through the door. Approving writes `receipt` movements through
  `postStockMove()` at the LANDED cost; cancelling REVERSES them and is refused
  while the general ledger still holds it. ⚠️ The movements are written BEFORE
  the status and rolled back if it fails — there is no transaction to fall back on.
- ⚠️ **FREIGHT IS SPREAD BY VALUE, LAST LINE TAKES THE REMAINDER, AND IT GOES
  INTO THE STOCK — NOT INTO AN EXPENSE.** Booking it to carriage makes the
  almonds look cheaper than they were and every batch costed from them wrong the
  same way. Where the goods are worth nothing it falls back to quantity; where
  there is no quantity either, `unitCost` is **null** rather than invented.
  ⚠️ Freight carries **no VAT split** — nobody has said whether the transit
  charge is itself rated.
- ⚠️ **`cz_purchases.tax_inclusive` IS THREE-STATE, AND AN UNANSWERED RATED
  PURCHASE CANNOT BE APPROVED OR POSTED.** The same 1,180,000 is either +VAT or
  includes-VAT.
- ⚠️ **AN OVERRUN BUDGET IS REFUSED UNTIL SOMEBODY SAYS SO** (`acknowledgeOver
  Budget`), and a budget nobody has approved cannot be charged to. The approval
  is a **person and a moment**, with the NAME stored beside the id because a
  person may leave and the decision still happened. An approved budget is not
  edited — reopen it, which clears the approval.
- ⚠️ **A BUDGET IS MEASURED AGAINST WHAT LEAVES THE BANK** — payable, VAT and
  freight included. Said on both screens; changeable on a word from the owner.
- ⚠️ **THERE IS NO `stock` ROLE IN THE CHART.** `resolveBuyAccounts` finds 1150
  by account TYPE, then by number, then by `settings["cocozuri.stockAccount"]`,
  and **refuses rather than guesses**. `postingOverview` checks BOTH sides of the
  chart — selling can be ready while buying is not.
- ⚠️ **RECIPES (Stage 3): `cocozuri-recipe-shared.ts` IS CLIENT-SAFE,
  `cocozuri-recipe.ts` IS SERVER-ONLY AND IS THE ONE DOOR FOR WRITES.** Tables
  `cz_recipes` · `cz_recipe_lines` (migration **0151**). ⚠️ **NO COST COLUMN,
  EVER** — a recipe costs itself on read from `cz_stock_moves.unit_cost`, which
  is the LANDED figure Stage 2 wrote.
- ⚠️ **A MATERIAL NOBODY HAS BOUGHT HAS NO COST — said, never shown as nil.**
  Every screen renders an incomplete costing as **"≥"** with the material NAMED.
  A total with a silent zero in it reads as cheap.
- ⚠️ **THE MATERIAL COST IS A WEIGHTED AVERAGE OF THE RECEIPTS**, not the latest
  price (one emergency bag would rewrite every recipe), and movements with **no**
  `unit_cost` are IGNORED rather than averaged in as free — every day-sheet
  movement is one of those.
- ⚠️ **QUANTITIES ARE PER BATCH; COST PER UNIT DIVIDES BY THE **GOOD** UNITS.**
  A 10% expected loss on 120 gives 108 good units — the survivors carry the cost
  of all 120. Dividing by the yield understates every bar by exactly the loss.
- ⚠️ **A RECIPE LINE CARRIES THE OWNER'S THREE HEADINGS** (raw material ·
  packaging · **finishing**) because note #31 names three. **"Finish" is his word
  and nobody has said what it covers** — stored as written, like DA/SA/TA.
  `other_cost` (gas, labour) **must carry a note**.
- ⚠️ **A RECIPE LANDS AS A DRAFT and activating RE-CHECKS the rules.** Several
  ACTIVE recipes per item is correct; **ONE default**, enforced in the library.
  An active recipe MAY be edited — it is a live instruction, not a document
  somebody acted on.
- ⚠️ **A STOCK ITEM BELONGS TO A LOCATION, SO ITS NAME DOES NOT IDENTIFY IT.**
  `AMBER RABDI` is a different row on the shop's sheet and the kitchen's, and
  matching by name filed the first live recipe as making the SHOP's — fault #4
  creeping back in through a form. Every picker now shows `NAME · Location`.
  **⚠️ THE SAME TENSION IS UNRESOLVED IN THE LEDGER:** `transferMoves()` moves
  ONE `item_id` between two locations while `cz_stock_items.location_id` says an
  item belongs to one. Stage 5 cannot build "kitchen → shop" until somebody
  decides whether the two sheets' rows are one thing or two.
- ⚠️ **`day_in`/`day_out`/`day_third` MEAN ONLY "written in that column"** — on
  the shop's sheet IN is a transfer from the kitchen, on raw materials it is a
  delivery. Nobody has said which, so the reason claims nothing more.
- ⚠️ **BATCH NUMBERS ARE BEING INTRODUCED, NOT COPIED** — nobody uses them today.
  Stage 4 must be low-friction (system-allocated number, openable in one action,
  recordable after the fact) or it will not be used. **The supplier on a purchase
  is OPTIONAL and must stay so** — raw materials are often bought at random or
  self-bought, and a form demanding a supplier simply will not be filled in.
- Client/server split as everywhere, and it is now TWO PAIRS:
  **`cocozuri-shared.ts` and `cocozuri-stock-shared.ts` are what client components
  import**; `cocozuri.ts` and `cocozuri-stock.ts` are server-only and are the ONE
  DOOR for writes. The stock half is its own pair because it is its own subject.

## Recruitment — ⚠️ PHASES 1–2 ARE BUILT. Read `memory/recruitment_module_plan.md` FIRST

Oracle Consultancy runs a **recruitment agency**: it sources Indian professionals
for Tanzanian employers. The owner had built a separate half-finished Next.js app
for it in `Documents\HR Recruitment`; on 19 Aug 2026 he asked for it to come into
COS **on Desk, not on its own design**. Nothing of that app's code, CSS or
components was carried over — only its thinking.

**The business rules the software ENFORCES** (not merely displays):

- The fee is **ONE MONTH of the placed candidate's gross monthly salary, plus 18%
  VAT**, payable **in full on offer acceptance**. That is the entire income.
- **The candidate never pays anything, ever.** ⚠️ There is deliberately **no fee,
  bond, balance or deduction column** in any `rec_*` table, and none is to be
  added. `CANDIDATE_PAYS_TZS = 0` is a constant so it is greppable and testable.
- **Free replacement inside one month. No refunds, ever.**
- **Oracle never touches permits, visas, flights or relocation**, and never takes a
  margin on anything paid to a third party.
- **VAT is never revenue** — shown separately everywhere.
- Gone in the Aug 2026 restructure and **never to be reintroduced**: service plans,
  the assistance menu, service fees, the engagement fee, the staged 50/50 fee,
  rebates and refunds.

**Built:** `/recruitment` (the desk) · `/recruitment/orders` + `/orders/[ref]`
(tabs: Brief · Shortlist · The first month) · `/recruitment/candidates` +
`/candidates/[id]` · `/recruitment/clients` + `/clients/[id]` ·
`/recruitment/shortlists` · `/recruitment/interviews` · `/recruitment/placements`.
Migrations **0139 + 0140 applied**. Tables `rec_clients` · `rec_candidates` ·
`rec_job_orders` · `rec_shortlist` · `rec_interviews` · `rec_placements` ·
`rec_checkins`. **Live and EMPTY** — the owner's instruction is that nothing
fabricated goes in.

- **The fee lives in ONE file**, `src/lib/recruitment-money.ts`, with tests beside
  it (`recruitment-money.test.ts`, 18 cases from the owner's own workbook: USD
  1,550 → TZS 4,185,000 fee + 753,300 VAT). Change money maths, add a test.
- Client/server split as everywhere: **`recruitment-shared.ts` and
  `recruitment-fields.ts` are what client components import** (pure, no `sb`);
  `recruitment.ts` is server-only. Getting this wrong kills every page with
  "SUPABASE_SERVICE_ROLE_KEY is not set".
- **ONE DOOR FOR WRITES:** the `create*`/`update*`/`archive*` functions in
  `lib/recruitment.ts`. The actions in `app/recruitment/actions.ts` are thin
  wrappers. Same discipline as `createTaskCore` and `postVoucher()`.
- **Nothing derived is stored** — no fee column, no progress column. All computed
  on read.
- **A job order with NO client means Oracle is hiring for itself** (`client_id` is
  nullable): same brief, same shortlist, **no fee, no invoice, no guarantee**.
- ⚠️ **`accepted_on` and `started_on` are DIFFERENT DATES.** The fee is earned when
  the offer is ACCEPTED; the one-month guarantee and the day 7/14/30 check-ins run
  from the day the person STARTS. Never collapse them.
- ⚠️ **A check-in row is a record of a conversation, never a placeholder.** The six
  expected ones (day 7/14/30 × client and candidate) are computed from
  `started_on`; an outstanding one is the ABSENCE of a row, and `note` is NOT NULL.
- **The match score is DERIVED, never stored** (unlike the owner's own app) —
  seniority 35 · sector 25 · title 25 · salary 15, tested.
- **`recordAcceptance()` is the one door for "they took the job"**: it freezes the
  gross, declines everyone else still live, and moves the order. ⚠️ Phase 3's
  invoice and its `postVoucher()` posting go INSIDE that function.
- Three database CHECK constraints carry contract rules: a Declined shortlist row
  must have a reason; a placement's fault is candidate|client|neither; a check-in
  is day 7/14/30 and client|candidate.
- **Everything is editable and deletable** (owner's ask, Aug 2026 — he wants to
  stop using the spreadsheet). Records carry a `DangerZone`; the database refuses
  a delete that would take history with it (a client with orders, a candidate on a
  shortlist, an order somebody was placed on) and `deleteBlocked()` says so in
  English. **Archive stays the normal answer**, and every list rail has an
  **Archived** entry — hiding a record with no way back to it is losing it.
- ⚠️ **Typing the "sent to the client" date moves a Sourced/Screened candidate to
  Shortlisted.** Without it the chase list would count a wait on a row it does not
  list. Same reasoning as booking an interview moving somebody to Interviewing.
- ⚠️ **An `<input type="datetime-local">` must be filled with the LOCAL wall
  clock** (`localInput()` in the shortlist panel). A naive `.slice()` of the ISO
  string puts UTC in the box and moves every interview back three hours on save.
- Reference `JO-2608-01` = year, month, sequence that month. Allocated in
  `lib/recruitment.ts` against a unique index, formatted in the shared half. The
  ORDER RECORD IS ROUTED BY REF, not by id.
- The desk finds its company by `code_prefix = "OC"` — **never hard-coded**; it
  says so plainly on screen if Oracle Consultancy is missing.
- ⚠️ **`USD_TZS = 2700` is a constant and should not stay one.** Phase 3 moves it
  to Settings and freezes it onto each invoice, as the ledger already does.
- **Phases 3–8 are NOT built**: the invoice and its ledger posting, compliance +
  the launch registrations, the content calendar (`/content`, all thirteen
  companies — NOT a recruitment feature), the client's private link, portal access
  for the HR Officer, then search + one read-only MCP tool. **No MCP tool and no
  `EntityDef` yet, on purpose.**
- ⚠️ **Before real candidate data goes in:** the launch checklist requires **PDPC
  registration before any candidate data is collected** and a **cross-border data
  transfer permit before the first Indian CV is handled**. Neither is done.

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

## Notes — BUILT through Phase 7. **Only Phase 8 (mobile) is left** (`memory/notes_module_plan.md`)

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

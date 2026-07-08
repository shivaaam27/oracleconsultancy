# COS System - Project Instructions

Start with `memory/v2_plan.md`. The owner is non-technical; explain in plain language and use British English.

## Product

Chief-of-Staff command centre for Oracle Consultancy's 7 portfolio companies (the parent brand was renamed from "Oracle Group" in V2; note "Oracle Consultancy" is also one of the 7 companies):

- CO01 Dar Spices
- CO02 Cocozuri Chocolat
- CO03 Terra Green
- CO04 Oracle Consultancy
- CO05 PES Ltd
- CO06 MES Ltd
- CO07 Pamoja Plus

Single operator. **Auth (V3)**: the whole admin side sits behind one owner password (`/login`, edge gate in `src/proxy.ts` — the Next-16 `proxy` convention, renamed from `src/middleware.ts` in June 2026; cookie `cos_admin`); staff get per-person portal logins at `/portal/login` (cookie `cos_portal`). **`/login` is now one tabbed screen** (June 2026): **Staff Login** (default, identifier+password) | **Command Centre** (owner). Optional **owner identity** (name/email in Settings) becomes a required 2nd factor on the Command Centre tab when set (blank = password-only, no lockout). **Passkeys (Face ID/Touch ID/Windows Hello/fingerprint)** via WebAuthn for owner AND staff — register in Settings (owner) / portal profile (staff); the login screen offers passkey + conditional-UI autofill. See `memory/auth_login.md`. `createdBy` is normally `"web-ui"`; AI command mutations use `"ai-command"`; Meeting Workspace task creation uses `"meeting-mode"`; staff-portal posts use `"portal:<Name>"`.

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
- Groq Cloud `openai/gpt-oss-20b` (fast) / `openai/gpt-oss-120b` (smart) — migrated from `llama-3.1-8b-instant` + `llama-3.3-70b-versatile`, which Groq deprecated 2026-06-17 (shutdown 2026-08-16). Models are env-overridable ladders in `src/lib/ai-models.ts`.
- next-themes, framer-motion, lucide-react, cmdk, Radix primitives

## Critical Config

- Do not break `src/db/index.ts`: `prepare: false` and `max: 1` are required for PgBouncer transaction mode.
- `DATABASE_URL` must use the Supabase pooler on port `6543`.
- Baseline migration `0000_flaky_amphibian.sql` was applied manually; `scripts/baseline-migrations.ts` marks it applied.
- Newer write paths often use `src/db/supabase.ts` and helpers in `src/lib/db-helpers.ts`.
- All wall-clock columns are `timestamptz` (migration `0014`); writes use `.toISOString()` (UTC) and times render in the viewer's local zone (Dar es Salaam, UTC+3). Do not revert to plain `timestamp`.
- Navigation is one bottom-floating pill on **all** breakpoints (`top-pill.tsx`); the desktop sidebar was removed. The pill carries the page action `+` and a draggable liquid-glass lens.
- Admin edge auth gate lives in `src/proxy.ts` (Next-16 `proxy` convention; renamed from `middleware.ts`). The `secret()` derivation here MUST stay identical to `src/lib/admin-auth.ts` and `src/lib/portal-auth.ts`.
- **Error monitoring**: Sentry is wired (`src/instrumentation*.ts`, `src/sentry.*.config.ts`, `src/app/global-error.tsx`, `src/lib/sentry.ts`). Inert unless `SENTRY_DSN`/`NEXT_PUBLIC_SENTRY_DSN` are set (in `.env.local` + Vercel). Errors-only (no perf tracing).
- **Backups**: `npm run db:backup` writes a portable per-table JSON snapshot to `backups/` (git-ignored); `npm run db:restore -- <folder>` restores. Supabase cloud backups are the primary safety net (see `BACKUP.md`). Run a backup before any migration/bulk DB change.
- **Dependency security**: `package.json` `overrides` pin patched `postcss`/`esbuild` (keeps `npm audit` clean without breaking downgrades — do not remove without re-checking audit). Dependabot config in `.github/dependabot.yml`.

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

HR compliance (per-person required documents):

- requirement_profiles, requirement_items, person_requirements (auto checklist per person type; see `memory/hrms.md`)

HRMS — Assets & Vendors:

- assets, asset_assignments (durable equipment assigned to a person, or shared to a company+custodian; auto-returned on offboarding)
- vendors (suppliers/contractors/landlords; their contracts are `documents` rows via `documents.vendor_id`)

HRMS — Leave & Attendance (grounded in Tanzania ELR Act 2004):

- leave_types (`default_days`/`cycle_months`/`half_pay_days` — e.g. Sick 126/36mo = 63 full+63 half), public_holidays, leave_requests, **attendance** (one row per person/day; status Present/Absent/On leave/Holiday/Remote/Half-day/Sick — **now writable**: admin register grid + staff portal self-check-in, June 2026; see `memory/hrms.md`)

Documents & intake:

- documents (now also `vendor_id`, plus intake-rewire cols `review_status` ["ok"/"needs_review"] + `needs_original` [`_NEEDORIG`]), document_links
- inbox (manual bundles too: pasted text + uploaded files stored in `attachments` JSON under `inbox/` storage prefix)

Letters:

- letters (Draft→Issued lifecycle, frozen `letterhead_snapshot` on issue; per-company branding)

Stock (OECR): stock_items, stock_purchases, stock_issues
Cleaning (OCR): cleaning_areas, cleaning_days, cleaning_checks

Outreach: reminders, outbox (persisted drafts: `source`/`person_id`/`todo_id`/`scheduled_for`)

Chat: chat_threads (`dm`/`group`; `dm_key` dedup), chat_participants (`last_read_at`/`muted_at`), chat_messages (soft-delete, `attachments` JSON, `task_code`), chat_message_mentions. `notifications.thread_id` deep-links chat. See `memory/chat_system.md`.

Analytics/config/system: daily_snapshots, settings, system_events, undo_tokens

Search/AI (V3 — Jun 2026): **embeddings** (+ `lifecycle` active|history col, migration 0094; lifecycle-aware `hybrid_search`/`replace_embeddings` RPCs) — the semantic index over all 12 entity types, driven by `src/lib/entity-registry.ts`; **ai_memory** (migration 0095 — ORI memory: qa/preference/fact); **ai_usage** (migration 0096 — AI spend ledger). Latest migration: **0096**.

See `memory/database_schema.md`.

## Current Pages

- `/` - command centre: Overview, Companies, Tasks
- `/task/new`
- `/task/[code]`
- `/registry` - redirects to hub Tasks table
- `/meeting` - Meeting Workspace
- `/workbook` - Meetings / Notes / To-do (see `memory/todos.md`)
- `/brief` - **Director Brief** (V2): glanceable portfolio report incl. completed/closed this month; WhatsApp/Email/Copy share + print-to-PDF (detailed per-company tables, print-only). See `memory/outbox_and_reminders.md`.
- `/hrms` - redirects to `/hrms/command-centre`. **`/hrms/command-centre` is labelled "Tax & Legal"** in the UI (launcher + page header; route path unchanged) — recurring tax/statutory/legal obligations. See `memory/hrms.md`.
- `/hrms/org` - **Organogram**. The **Portfolio view is an ELK layered flowchart** (`lib/org-flow.ts` + `components/org-flow.tsx`, `elkjs`): multi-parent, role/seniority tiers, primary boss = solid line, extra bosses = dashed, company as colour, shared-service roles in-flow. Per-company trees + By-department + "Everyone" web view remain. See `memory/organogram.md`.
- `/hrms/oecr` - OECR (Office Equipment Control Registry) — consumable stock control
- `/hrms/assets` - **Asset & Vendor Register** — durable equipment (assign to person/team, auto-return on offboarding) + vendor/supplier register; segmented Assets/Vendors toggle
- `/hrms/leave` - **Leave & Attendance** — segmented **Leave | Attendance** tabs. Leave: types/requests/approvals (ELR Act-accurate), balances, holidays. **Attendance register (built June 2026)**: month grid, brush-to-paint status, company filter, "mark all Present today"; On-leave/Holiday auto-filled. See `memory/hrms.md`.
- `/hrms/ocr` - OCR (Office Cleaning Registry) — daily cleaning checklist
- `/hrms/pipeline` - **Applications in progress** (transfer-pack) — kanban of in-flight bureaucracy (permits/visas/licences): To Apply → Applied → Control No. Issued → Paid → Receipt Received → Issued; attach a supporting document. See `memory/localsystemautomationtooracle.md`.
- `/hrms/registers` - **Commitments register** (transfer-pack) — leases/insurance/commercial contracts with **notice-by = end − notice_days** (flagged when notice is due soon); attach a supporting document.
- `/people/form` - **Staff data-collection form** (transfer-pack) — printable bilingual EN/Swahili form for staff with no system access; `?person=<id>` pre-fills, `?missing=1` shows only blanks, QR to the record, signature/thumbprint + on-behalf field-agent line; outsider type hides employment/payroll. Fill by hand → photograph → upload → intake builds the profile.
- `/companies` - **Companies hub = reference-data centre**: tabs **Companies · Departments · Sites · Roles** (`companies-hub-tabs.tsx`); each ref list has add/rename/**merge**/delete. `/companies/[id]` = company detail (Overview/Profile/Tasks/Timeline/Org).
- `/people` - person record now has HR profile fields inc. **Work site + Residence** (shared `sites` list, combobox), a glanceable drawer (hero tiles + accordion sections), manager + N-direct-reports on cards, a **Direct reports** list + an **All Locations** directory filter. Bulk "also reports to" in the select bar.
- `/documents` - Documents & Compliance (+ "Add several" bulk multi-file upload via the full doc form; recency-aware duplicate detection)
- `/letters`, `/letters/[id]` (editor), `/letters/[id]/print` - **system-wide PDF letters** (Draft→Issue, per-company branded; first type = Invitation). See `memory/letters.md`.
- `/letterheads` - redirects to `/letters?view=letterheads` — letterhead setup (typed / designed header+footer images / full-page background) is now a tab on `/letters`; server actions remain in `src/app/letterheads/actions.ts`
- `/portal`, `/portal/login`, `/portal/board`, `/portal/meetings` (**Briefings**), `/portal/task/[code]`, `/portal/profile` - **Staff portal**: per-person sign-in (password set in Settings → Staff portal access; scrypt hash on `people.portal_password_hash`, signed cookie session), staff see only their own tasks, post updates (`created_by: "portal:<Name>"`), limited status moves (never Completed/Closed). Profile carries: Your documents, **Your attendance** (self check-in + week strip), Your leave, onboarding, equipment, **passkeys** ("Sign in faster"). A minimal **attendance check-in pop-up** auto-opens once/day on landing. Admin chrome hidden on portal routes. See `memory/portal.md` + `memory/portal_scope_and_event_cascade_jul2026.md`.
  - **Home vs board (Jul 2026):** `/portal` **home is staff + HR only** — hero unified with the board hero (`portal-home-hero.tsx`, slim stats pill), tasks in a **scroll housing**, full-width To-Do List, Raise-a-request below it, announcements as a dismissible header banner (`announcement-banner.tsx`). **Directors AND managers are board-first** (`/portal/board`, redirected from `/portal`); managers' team tools fold onto the board (team-attendance glance moved to the Directory's **Attendance** tab, leave-to-approve, personal To-Do List).
  - `/portal/meetings` = **Briefings** (nav label "Briefings", `portal-briefings.tsx`): tabbed **Meetings** (agenda, badge = starts within 3 days) + **Announcements** (feed, badge = unacknowledged). Announcements no longer inline on home/board — banner + this tab.
  - **Board** (`director-board-client.tsx`, managers + directors): greeting hero · task composer (managers Task-only, directors Task/Event/Message) · Outbox link · Next meeting · then two **scroll-housed** columns — **Needs you** (overdue-first cards, tap opens the task, swipe = remind) + **Company health** (heat tiles, worst-overdue-first, "No open tasks" when a company is empty). List ordering = worst-first everywhere (DESIGN_SYSTEM.md §12). Managers with <6 companies get the To-Do List in the right column instead of a footer.
  - **Portal roles** (`people.portal_role`): staff | manager | hr | director. **Company-scoped director** ("Company Director", `people.director_company_id` set, migration 0097): full director board + powers but STRICT to ONE company — set it in Settings → Staff portal access. Scope is enforced through ONE place: the helpers in `src/lib/portal-auth.ts` (`seesAllCompanies`/`companyScope`/`isScopedDirector`) — the data-side twin of `src/lib/portal-capabilities.ts` (UI). **FORWARD RULE:** route every new data-visibility decision through those scope helpers (not a raw `=== "director"`). **Portal permissions are owner-configurable** (Settings → Portals → "Roles & permissions"): per-role capabilities + data-scope (own/companies/all) in `src/lib/portal-permissions.ts` (pure; defaults = old behaviour), stored as one settings row, resolved ONCE onto `PortalPerson` as `scopeLevel` + `caps`. Scope helpers read `p.scopeLevel`; every portal action gate + UI affordance reads `me.caps.<key>`; `canManageTask` takes `viewer.canManageAny`. **To gate a new portal ability by config, add a `CapabilityKey` + default and read `me.caps.<key>` — don't hard-code the role.** See `memory/portal_permissions_engine.md`. Directors: NO Directory Attendance tab. Shared task list = `portal-tasks-command.tsx` (Home inlines it via its `houseList` scroll-housing prop). Nav pill (`portal-pill.tsx`): frosted for legibility, hover shows a floating name label + icon bounce, create `+` sits after the divider next to the theme toggle, Board/Home tabs use layout-preview icons. Full reference: `memory/company_scoped_roles.md`. **⚠️ adding a 2nd FK from a table to `companies` breaks PostgREST `companies(name)` embeds on that table — disambiguate with `companies!company_id(name)`.**
- `/chat`, `/chat/[threadId]` - **Chat**: free-standing messaging (DMs + ad-hoc groups), separate from task updates. Portal twin at `/portal/chat`. WhatsApp-style messenger UI: full-screen app on mobile (page header + nav pill hidden on chat routes), two-pane glass card on desktop; optimistic send, read receipts, typing indicator, inline image previews. Supabase Realtime broadcast (anon key set) with polling fallback. Primary tab on both nav pills. Plus per-person **read-only `kind="system"` channels** (Jun 2026): **Task reminders** (daily 9am cron + pushes) and **Announcements** (published announcements mirror in, silent). See `memory/chat_system.md` + `memory/reminders_outbox_chat_jun2026.md`.
- `/outbox` - **live, per-person** (Jun 2026): generated fresh from open tasks each load (one card per person, full task list + WhatsApp/Email send); reminders are NOT stored as drafts anymore. Per-task vs all-tasks toggle under each task. See `memory/reminders_outbox_chat_jun2026.md`.
- `/inbox` - smart intake: "Add to inbox" (paste + multi-file bundle); unified "Process" → review queue files docs + enrich person profile (blanks-only)
- `/insights`
- `/settings`

Navigation (V2): one bottom-floating pill on all breakpoints. Tabs: **Home · Director Brief · Task Management · Workbook · HRMS** + page-action `+` · Search · Theme. The **HRMS icon opens a single centred "Go to" launcher** (Radix Dialog) listing every secondary destination (**Tax & Legal** [=command-centre], Organogram, OECR, **Assets & Vendors, Leave & Attendance**, OCR, Companies, People, Documents, **Letters & Letterheads**, Outbox, Inbox, Insights, Settings). Departments/Sites/Roles are managed on the **Companies hub** (no separate launcher entry). Companies/People/Documents are reached via HRMS (and carry a smart `?from=task:CODE` breadcrumb). `src/components/top-pill.tsx`.

Removed standalone routes: `/capture`, `/task`, `/digest`, `/escalations`, `/audit`, `/system-map`, the `/hrms` hub page, standalone `/letterheads`, and the standalone `/hrms/departments` (departments now a Companies-hub tab). The desktop sidebar and the dedicated Companies nav tab were removed.

## Design language — "Aurora" (DEFAULT for everything)

The visual + interaction system is named **Aurora**. **Every new page, dialog, pop-up,
search surface, panel, drawer or feature uses Aurora by default — do not invent a new
look.** When the owner says "make X Aurora" / "this popup should be Aurora," apply the
kit. Aurora = liquid-glass surfaces · one cool-blue accent · **centred, never edge-to-edge**
(`CommandWall`) · **no hard boxes** (soft `Panel`/`CockpitModule` + hairlines + whitespace) ·
iPhone-style `Switch` toggles · concentric radius · calm reduced-motion-safe motion (`Reveal`,
`lib/motion.ts`) · quietly alive (heartbeat/count-ups/world-accent tints) · status as small
dots/text not blocks · glanceable, every-number-a-door, observe + act. Reuse the kit
(`CommandWall`, `Hero`, `CockpitModule`, `Switch`, `TONE`, `Badge`/`Pill`, `EntityDrawer`,
`InsightPopover`, `FluidSelect`/`Combobox`, glass tiers) — never a one-off when a kit piece
exists. **Full reference + "how to apply Aurora to a new page/popup/search/feature":
`DESIGN_SYSTEM.md` — keep it updated.**

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

## Meeting Workspace

`/meeting` is now first-class saved business memory:

- save title, company, date, attendees, raw notes, minutes;
- voice dictation into notes;
- Clean notes;
- Generate minutes;
- Extract decisions;
- Extract risks;
- Draft follow-up;
- Extract action items;
- bulk-create tasks;
- link created tasks back to meetings;
- search/filter meeting history.
- compact mobile layout with reduced vertical drag.

Ask COS can use saved meeting minutes/raw notes in its RAG context.

## Voice Intelligence

Voice is now a shared product layer, not only a microphone button:

- `src/components/voice-button.tsx` accepts a language code and streams Web Speech API text.
- `src/app/voice/actions.ts` polishes rough dictation through Groq with rule/no-key fallbacks.
- Settings stores `v2.voiceLanguage` and `v2.voiceDictionary`.
- Supported starting languages: English (`en-GB`), Swahili (`sw-TZ`), Hindi (`hi-IN`), Gujarati (`gu-IN`).
- Meeting notes, Quick Capture, and task updates use "speak rough, save polished" behaviour.
- Meeting Workspace includes a small quality loop to teach COS names/phrases into the voice dictionary.
- Ask COS dictation now follows the browser language instead of a hardcoded speech locale.

## HR & Admin Operating System (V3 — in progress)

Built on the principle **reuse, don't duplicate** (Documents→compliance, tasks/todos→checklists, OECR→assets, Outbox→messages, Home/Brief→signals). Master plan in `memory/v3_plan.md`.

- **Person types** (`src/lib/person-types.ts`): `local_staff` | `expat` | `outsider` | `candidate` (+ legacy normalisation).
- **Document compliance**: per-type requirement profiles → per-person checklist (auto-links saved docs by category, manual verify loop, score to 100%). `src/lib/requirements.ts`.
- **Onboarding/Offboarding journeys**: a checklist of `todos` tagged `kind`; auto-created for new staff (and offboarding on archive); shown in the person drawer.
- **Assets & Vendors** (`src/lib/assets.ts`, `src/lib/vendors.ts`): durable assets assigned to person or team+custodian; vendor register with contracts reusing documents.
- **Leave & Attendance** (`src/lib/leave.ts`, `src/lib/attendance.ts`): ELR-Act-accurate leave (Mon–Sat working days minus holidays; Annual 28/12mo, Sick 126/36mo = 63 full+63 half, Maternity 84, Paternity 3, Compassionate 4). Director Brief has an HR section. **Attendance now fully wired** (June 2026): admin register grid + staff self-check-in (trusted, manager can override; status-per-day, no clock in/out).
- **People locations** (`src/lib/sites.ts`): a shared `sites` list (work site / residence per person) — places staff live or work, not company branches. Managed on the Companies hub Sites tab.
- **Organogram** (`src/lib/org-flow.ts`): portfolio = ELK multi-parent layered flowchart; reporting surfaced across People (cards, drawer Direct-reports, bulk also-reports-to).
- **ELR Act 2004** grounding: see `memory/v3_plan.md` for the calc rules (overtime 1.5×, night +5%, Sunday/holiday ×2, severance 7 days/yr, notice 28 days, wage table s.26). NOTE: wage fields, the pay/final-pay/severance calculator, and all money figures (leave liability, sick-leave cost) were removed June 2026 along with the board pack — leave day-tracking remains; the ELR rules are kept here for reference only.

## Smart Intake (V3)

One extraction brain across Inbox/People/Documents. Dropping text or files anywhere can fill the person profile (**blanks-only, always reviewed — never overwrites**), file the document(s) to the right owner (person OR company), and recompute compliance. Bulk multi-file upload on `/documents` ("Add several") reviews each file in the full doc form. Recency-aware duplicate detection (Keep both / Replace+archive). See `memory/v3_plan.md`.

## Document Intelligence (Jun 2026) — see `memory/document_intelligence.md` for the full reference

The intake is **self-learning, correlating and self-healing**, all deterministic on the free Groq models (a stronger model is an optional later upgrade behind the `aiHighQuality` toggle). Owner-resolution order in `autoFileDocumentAction` (each falls through to the next, quarantine is the LAST resort):
1. **ID match** — TIN/VRN/email-domain (`matchCompanyByIdentifiers`).
2. **AI read with RAG context** — `extractPrompt` is fed the KNOWN RECORDS (companies with aliases + legal name + TIN/VRN/code/email-domain; people with role + company) so it resolves from sparse docs and never invents an owner.
3. **Fuzzy/legal-name match** — `resolveEntity` (alias + legal_name folded in + suffix-agnostic token overlap, so "PINNACLE ENGINEERING SOLUTIONS LTD" → "PES Ltd").
4. **Learned owners** — `owner_corrections` (a manual owner assignment teaches the next similar doc; `lib/owner-corrections.ts`).
5. **Cross-document correlation** — a TIN/VRN/reference with no name inherits the owner of another filed doc/fact that shares it (`correlateOwnerByIdentifiers`).

Other intelligence: **consistent naming** `buildDocTitle` ("Owner · Type · Ref/Year") on every path + a one-time **rename sweep**; **content-based duplicate detection** (Jaccard ≥0.7 of body words, any name/format → quarantine "duplicate of #X"); **auto-expiry renewal chaining** (`findRenewalTarget`: a renewal supersedes the older same-type doc → `-EXP` to Trash for review); **CamScanner/scanner-watermark detection** (`usableTextLayer` → OCR the real scan); **self-heal** (`selfHealDocuments`, nightly via morning-run, re-reads watermark/never-read docs); **relationship inference** (`lib/relationships.ts` — directors/shareholders from facts → people); **entity knowledge graph** (`lib/entity-graph.ts`, `/graph?type=&id=`, traversable, links companies sharing a director); **learning loops** `routing_corrections` (category) + dismissal suppression. New tables: `profile_suggestions`, `routing_corrections`, `custom_shelves`, `owner_corrections` (migrations 0090–0092).

## Letters (V3)

System-wide branded PDF letters. `letters` table + `/letters` editor + `/letters/[id]/print` route. Per-company letterhead (Letterheads tab on `/letters`): typed fields, or a designed **header+footer image** (repeats each page), or a **full-page A4 background**. **Draft → Issue** freezes a letterhead snapshot + stamps a ref (`PREFIX/INV/YYYY/NNN`); reprints are identical. **Full body editing**; PDF (in-place iframe print) + optional Outbox draft; no auto-send. Letter font matches the Director Brief (system sans-serif). New types = add to `LETTER_TEMPLATES` + a `buildBody` fn in `src/lib/letters.ts`. First type = Invitation (auto-pulls invitee name/nationality/passport/DOB/role). See `memory/letters.md`.

## ORI Search Brain — universal search / find / trace (V3 — Jun 2026, LIVE)

ORI is the brain of the system: everything from a task to a board-level shareholding can be
searched, found and **traced** from one place. Built across 7 verified waves (full log:
`memory/ori_brain.md`); DEPLOYED to master (commit 415ef46); migrations 0094/0095/0096 applied.

- **Entity registry = single source of truth** (`src/lib/entity-registry.ts`): one `EntityDef`
  per the 12 indexable types (task/meeting/document/person/company/letter/vendor/asset/
  governance/risk/pipeline/commitment) — table, columns, indexable text, lifecycle rule, search
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
- **Surfaces**: `/inbox` = System status card + Intake accuracy card (`intake-metrics.ts` +
  `intake-accuracy.tsx`) + Automations feed; `/approvals` = cockpit; home = CONTROLS HELD levers;
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
- Run unit tests with `npm test` (Vitest). Pure-logic tests live next to the module as `src/lib/*.test.ts` (pay, leave, derive, requirement-match, staff-id). Add tests when you change money/leave/compliance/status maths.
- For schema work: edit `schema.ts`, generate/review migration, apply with `npm run db:migrate`. **Take `npm run db:backup` first.** drizzle-kit diffs the `drizzle/meta` snapshot, NOT the live DB — if the live DB has drift, generated `CREATE`s can collide; use `IF NOT EXISTS` or reconcile.
- Do NOT clear `.next` while the dev server is running (it corrupts the live build cache → ENOENT 500s). Stop the server first, then `rm -rf .next`, then restart.
- Update `memory/*.md` after meaningful changes.
- Do not auto-push unless asked.
- Do not surprise-fix known gaps listed in `memory/open_issues.md`.

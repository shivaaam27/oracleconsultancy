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

Single operator. **Auth (V3)**: the whole admin side sits behind one owner password (`/login`, edge gate in `src/middleware.ts`, cookie `cos_admin`); staff get per-person portal logins at `/portal/login` (cookie `cos_portal`). See `memory/portal.md`. `createdBy` is normally `"web-ui"`; AI command mutations use `"ai-command"`; Meeting Workspace task creation uses `"meeting-mode"`; staff-portal posts use `"portal:<Name>"`.

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
- Groq Cloud `llama-3.1-8b-instant`
- next-themes, framer-motion, lucide-react, cmdk, Radix primitives

## Critical Config

- Do not break `src/db/index.ts`: `prepare: false` and `max: 1` are required for PgBouncer transaction mode.
- `DATABASE_URL` must use the Supabase pooler on port `6543`.
- Baseline migration `0000_flaky_amphibian.sql` was applied manually; `scripts/baseline-migrations.ts` marks it applied.
- Newer write paths often use `src/db/supabase.ts` and helpers in `src/lib/db-helpers.ts`.
- All wall-clock columns are `timestamptz` (migration `0014`); writes use `.toISOString()` (UTC) and times render in the viewer's local zone (Dar es Salaam, UTC+3). Do not revert to plain `timestamp`.
- Navigation is one bottom-floating pill on **all** breakpoints (`top-pill.tsx`); the desktop sidebar was removed. The pill carries the page action `+` and a draggable liquid-glass lens.

## Current Schema Areas

Core:

- companies (now also letterhead/branding cols: `legal_name`/`address`/`phone`/`email`/`registration_no`/`tin`/`logo_path`/`signatory_name`/`signatory_title`/`letterhead_mode`/`header_image_path`/`footer_image_path`/`background_image_path`/`content_top_mm`/`content_bottom_mm`), departments, person_companies
- people (now also HR profile cols: `department_id`/`start_date`/`date_of_birth`/`nationality`/`national_id`/`passport_no`/`address`/`emergency_contact_name`/`emergency_contact_phone`/`probation_end_date`; portal auth cols; `previous_staff_ids`). **Staff IDs** (`<prefix>-<roleLetter><NN>`, e.g. `CZ-E04`/`OC-AH01`/`OC-D02`) are computed live in `src/lib/staff-id.ts` — not stored. See `memory/task_management_2.md`.
- tasks, task_assignees, task_updates

Meetings: meetings, meeting_tasks

Governance: audit_log, corrections

To-dos:

- todos (now also `kind` ["onboarding"/"offboarding"] + `sort_order` — onboarding/offboarding journey steps live here as person-tagged todos; see `memory/todos.md`)

HR compliance (per-person required documents):

- requirement_profiles, requirement_items, person_requirements (auto checklist per person type; see `memory/hrms.md`)

HRMS — Assets & Vendors:

- assets, asset_assignments (durable equipment assigned to a person, or shared to a company+custodian; auto-returned on offboarding)
- vendors (suppliers/contractors/landlords; their contracts are `documents` rows via `documents.vendor_id`)

HRMS — Leave & Attendance (grounded in Tanzania ELR Act 2004):

- leave_types (`default_days`/`cycle_months`/`half_pay_days` — e.g. Sick 126/36mo = 63 full+63 half), public_holidays, leave_requests, attendance

Documents & intake:

- documents (now also `vendor_id`), document_links
- inbox (manual bundles too: pasted text + uploaded files stored in `attachments` JSON under `inbox/` storage prefix)

Letters:

- letters (Draft→Issued lifecycle, frozen `letterhead_snapshot` on issue; per-company branding)

Stock (OECR): stock_items, stock_purchases, stock_issues
Cleaning (OCR): cleaning_areas, cleaning_days, cleaning_checks

Outreach: reminders, outbox (persisted drafts: `source`/`person_id`/`todo_id`/`scheduled_for`)

Analytics/config/system: daily_snapshots, settings, system_events, undo_tokens

See `memory/database_schema.md`.

## Current Pages

- `/` - command centre: Overview, Companies, Tasks
- `/task/new`
- `/task/[code]`
- `/registry` - redirects to hub Tasks table
- `/meeting` - Meeting Workspace
- `/workbook` - Meetings / Notes / To-do (see `memory/todos.md`)
- `/brief` - **Director Brief** (V2): glanceable portfolio report incl. completed/closed this month; WhatsApp/Email/Copy share + print-to-PDF (detailed per-company tables, print-only). See `memory/outbox_and_reminders.md`.
- `/hrms` - redirects to `/hrms/command-centre` (old hub page removed; the launcher covers all destinations). See `memory/hrms.md`.
- `/hrms/oecr` - OECR (Office Equipment Control Registry) — consumable stock control
- `/hrms/assets` - **Asset & Vendor Register** — durable equipment (assign to person/team, auto-return on offboarding) + vendor/supplier register; segmented Assets/Vendors toggle
- `/hrms/leave` - **Leave & Attendance** — leave types/requests/approvals (ELR Act-accurate), balances, public-holiday calendar (attendance register tab pending). See `memory/hrms.md`.
- `/hrms/ocr` - OCR (Office Cleaning Registry) — daily cleaning checklist
- `/companies`, `/companies/[id]`
- `/people` - person record now has HR profile fields + a glanceable drawer (hero tiles + accordion sections: Document compliance, Onboarding/Offboarding, Equipment held, Profile details, Documents, Tasks, Activity, Manage)
- `/documents` - Documents & Compliance (+ "Add several" bulk multi-file upload via the full doc form; recency-aware duplicate detection)
- `/letters`, `/letters/[id]` (editor), `/letters/[id]/print` - **system-wide PDF letters** (Draft→Issue, per-company branded; first type = Invitation). See `memory/letters.md`.
- `/letterheads` - redirects to `/letters?view=letterheads` — letterhead setup (typed / designed header+footer images / full-page background) is now a tab on `/letters`; server actions remain in `src/app/letterheads/actions.ts`
- `/portal`, `/portal/login`, `/portal/task/[code]` - **Staff portal**: per-person sign-in (password set in Settings → Staff portal access; scrypt hash on `people.portal_password_hash`, signed cookie session), staff see only their own tasks, post updates (`created_by: "portal:<Name>"`), limited status moves (never Completed/Closed). Admin chrome hidden on portal routes. See `memory/portal.md`.
- `/outbox`
- `/inbox` - smart intake: "Add to inbox" (paste + multi-file bundle); unified "Process" → review queue files docs + enrich person profile (blanks-only)
- `/insights`
- `/settings`

Navigation (V2): one bottom-floating pill on all breakpoints. Tabs: **Home · Director Brief · Task Management · Workbook · HRMS** + page-action `+` · Search · Theme. The **HRMS icon opens a single centred "Go to" launcher** (Radix Dialog) listing every secondary destination (Command Centre, Organogram, OECR, **Assets & Vendors, Leave & Attendance**, OCR, Companies, People, Documents, **Letters & Letterheads**, Outbox, Inbox, Insights, Settings). Companies/People/Documents are reached via HRMS (and carry a smart `?from=task:CODE` breadcrumb). `src/components/top-pill.tsx`.

Removed standalone routes: `/capture`, `/task`, `/digest`, `/escalations`, `/audit`, `/system-map`, the `/hrms` hub page, and standalone `/letterheads`. The desktop sidebar and the dedicated Companies nav tab were removed.

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
- **Leave & Attendance** (`src/lib/leave.ts`): ELR-Act-accurate leave (Mon–Sat working days minus holidays; Annual 28/12mo, Sick 126/36mo = 63 full+63 half, Maternity 84, Paternity 3, Compassionate 4). Director Brief has an HR section.
- **ELR Act 2004** grounding: see `memory/v3_plan.md` for the calc rules (overtime 1.5×, night +5%, Sunday/holiday ×2, severance 7 days/yr, notice 28 days, wage table s.26). Wage field + pay/final-pay calculators are planned phases (4.4–4.7).

## Smart Intake (V3)

One extraction brain across Inbox/People/Documents. Dropping text or files anywhere can fill the person profile (**blanks-only, always reviewed — never overwrites**), file the document(s) to the right owner (person OR company), and recompute compliance. Bulk multi-file upload on `/documents` ("Add several") reviews each file in the full doc form. Recency-aware duplicate detection (Keep both / Replace+archive). See `memory/v3_plan.md` and `memory/v3_plan.md`.

## Letters (V3)

System-wide branded PDF letters. `letters` table + `/letters` editor + `/letters/[id]/print` route. Per-company letterhead (Letterheads tab on `/letters`): typed fields, or a designed **header+footer image** (repeats each page), or a **full-page A4 background**. **Draft → Issue** freezes a letterhead snapshot + stamps a ref (`PREFIX/INV/YYYY/NNN`); reprints are identical. **Full body editing**; PDF (in-place iframe print) + optional Outbox draft; no auto-send. Letter font matches the Director Brief (system sans-serif). New types = add to `LETTER_TEMPLATES` + a `buildBody` fn in `src/lib/letters.ts`. First type = Invitation (auto-pulls invitee name/nationality/passport/DOB/role). See `memory/letters.md`.

## AI Conventions

- Use `getGroqKey()` so the AI master switch works.
- AI-off must degrade gracefully unless the endpoint explicitly documents 503.
- Preserve `source` discriminators where routes/components rely on them.
- British English in prompts.
- Do not invent data. Cite task codes and meeting title/date when relevant.

## Domain Rules

- Statuses: Not Started, In Progress, Under Review, Blocked, Waiting External, Escalated, Completed, Closed.
- Open means anything except Completed/Closed.
- Priorities/Risk: Critical, High, Medium, Low.
- Task codes: `<PREFIX>-NNN`, where PREFIX is the company's two-letter `code_prefix` (e.g. `DS-001` for Dar Spices). Legacy `COxx-NNN` codes are kept in `tasks.legacy_code` so old links redirect.
- Categories: Finance, Operations, Marketing, HR, Legal, Technology, Sales, Admin, Meetings, Strategy, Other.
- Channels: WHATSAPP, EMAIL, SMS.

## Workflow

- Verify code with `npm exec tsc -- --noEmit`.
- For schema work: edit `schema.ts`, generate/review migration, apply with `npm run db:migrate`.
- Update `memory/*.md` after meaningful changes.
- Do not auto-push unless asked.
- Do not surprise-fix known gaps listed in `memory/open_issues.md`.

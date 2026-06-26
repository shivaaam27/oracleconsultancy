# COS System - Codex Project Instructions

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

Single operator, no auth. `createdBy` is normally `"web-ui"`; AI command mutations use `"ai-command"`; Meeting Workspace task creation uses `"meeting-mode"`.

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

## Current Schema Areas

Core:

- companies, departments, people, person_companies
- tasks, task_assignees, task_updates

Meetings:

- meetings
- meeting_tasks

Governance:

- audit_log
- corrections

To-dos:

- todos (personal to-do list; see `memory/todos.md`)

Outreach:

- reminders
- outbox (now also persisted drafts: `source`/`person_id`/`todo_id`/`scheduled_for`)

Analytics/config/system:

- daily_snapshots
- settings
- system_events
- undo_tokens

See `memory/database_schema.md`.

## Current Pages

- `/` - command centre: Overview, Companies, Tasks
- `/task/new`
- `/task/[code]`
- `/registry` - redirects to hub Tasks table
- `/meeting` - Meeting Workspace
- `/workbook` - Meetings / Notes / To-do (see `memory/todos.md`)
- `/brief` - **Director Brief** (V2): glanceable portfolio report incl. completed/closed this month; WhatsApp/Email/Copy share + print-to-PDF (detailed per-company tables, print-only). See `memory/outbox_and_reminders.md`.
- `/hrms` - **HRMS hub** (V2): registry cards. See `memory/hrms.md`.
- `/hrms/oecr` - OECR (Office Equipment Control Registry) — stock control
- `/hrms/ocr` - OCR (Office Cleaning Registry) — daily cleaning checklist
- `/companies`
- `/companies/[id]`
- `/people`
- `/documents` - Documents & Compliance
- `/outbox`
- `/inbox`
- `/insights`
- `/settings`

Navigation (V2): one bottom-floating pill on all breakpoints. Tabs: **Home · Director Brief · Task Management · Workbook · HRMS** + page-action `+` · Search · Theme. The **HRMS icon opens a single centred "Go to" launcher** (Radix Dialog) listing every secondary destination (HRMS Hub, OECR, OCR, Companies, People, Documents, Outbox, Inbox, Insights, Settings) — the old "More" sheet and the per-tab popovers were removed. Companies/People/Documents are reached via HRMS (and carry a smart `?from=task:CODE` breadcrumb). `src/components/top-pill.tsx`.

Removed standalone routes: `/capture`, `/task`, `/digest`, `/escalations`, `/audit`. The desktop sidebar and the dedicated Companies nav tab were removed.

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

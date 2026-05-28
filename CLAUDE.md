# COS System — Claude Project Instructions

> **Where to start (V2):** read `memory/v2_plan.md` first — it has the phase status (1–4 + 5e done; 5a–5d pending), the core mental model, and how to work here. The owner is **non-technical**; explain in plain language and use British English.

Chief of Staff command centre for **Oracle Group** (7 portfolio companies: CO01 Dar Spices, CO02 Cocozuri Chocolat, CO03 Terra Green, CO04 Oracle Consultancy, CO05 PES Ltd, CO06 MES Ltd, CO07 Pamoja Plus). Single operator, no auth — `createdBy` is hard-coded to `"web-ui"`.

Replaces an Excel workbook (`Chief Of Staff Workflow - Live.xlsx`) with a database-backed Next.js app: capture/track action items, surface risk, generate per-person reminders, draft follow-up emails, weekly digest.

## Stack
- **Next.js 16** (App Router, server components default, server actions) + **React 19** + **TypeScript 5**
- **Drizzle ORM 0.45** + **postgres.js** → **Supabase Postgres** via pooler on **port 6543 (transaction mode)**
- **Tailwind v4** with custom tokens (`bg-bg`, `bg-bg-elev`, `text-fg`, `text-fg-muted`, `bg-accent`, `bg-danger`, `bg-warn`, `bg-success`)
- **Groq Cloud** `llama-3.1-8b-instant` for all AI features
- **next-themes**, **framer-motion**, **lucide-react**, **cmdk**, **Radix** primitives

## Critical config — do not break
- `src/db/index.ts` uses `prepare: false` and `max: 1`. **Required** for PgBouncer transaction mode. Removing these will break prod.
- `DATABASE_URL` must be the **6543** pooler URL, not 5432.
- Baseline migration `0000_flaky_amphibian.sql` already applied to prod manually — `scripts/baseline-migrations.ts` marks it as applied without re-running.

## Env vars
- `DATABASE_URL` — Supabase pooler URL (6543)
- `GROQ_API_KEY` — optional, unlocks AI features (all routes degrade gracefully when missing, except `/api/draft-email` returns 503)
- `XLSX_PATH` — optional import override

## Repo layout
```
cos-system/
├── drizzle/                  # generated SQL migrations
├── scripts/                  # import.ts, migrate.ts, baseline-migrations.ts
├── src/
│   ├── app/                  # App Router pages + /api routes + server actions
│   ├── components/           # ui.tsx primitives, top-pill, command-palette, polished-input, …
│   ├── db/                   # index.ts (postgres client), schema.ts (12 tables)
│   └── lib/                  # derive.ts, smart-parse.ts, outbox-gen.ts, queries.ts, nav.ts, constants.ts
└── memory/                   # reference copies of Claude's auto-memory (see below)
```
Path alias: `@/*` → `./src/*`.

## Database (12 tables, see `src/db/schema.ts`)
**Core:** companies, departments, people, tasks, task_assignees (M2M), task_updates.
**Governance:** audit_log (every field change), corrections (schema-only, no UI yet).
**Outreach:** reminders (idempotency ledger, unique `dedupe_key`), outbox (human-readable record).
**Analytics:** daily_snapshots (no cron writes to it yet).
**Config:** settings (also stores nav pins/recents JSON).

All timestamps are `timestamp` (no TZ), `mode: "date"`. Soft delete via `archived` on tasks, `active` on people/companies.

## Domain rules (`src/lib/derive.ts`)
- **Statuses:** Not Started, In Progress, Under Review, Blocked, Waiting External, Escalated, Completed, Closed. Open = anything except Completed/Closed.
- **Priorities/Risk:** Critical, High, Medium, Low.
- **Thresholds:** `DUE_SOON_DAYS = 3`, `AGING_CRITICAL_DAYS = 30`, `BLOCKED_STALLED_DAYS = 14`.
- **Task codes:** `<COxx>-NNN` (zero-padded), allocated by `insertTaskWithUniqueCode` (read-max-then-insert, retries up to 5x on collision).
- **Categories:** Finance, Operations, Marketing, HR, Legal, Technology, Sales, Admin, Meetings, Strategy, Other.
- **Channels:** `WHATSAPP`, `EMAIL`, `SMS` (uppercase).
- **Risk score:** `round(((overdue*3 + blocked*2 + aging) / total) * 100)`. >50 danger, >20 warn.

## Routes
**Pages:** `/` (command centre — Overview/Companies/Tasks tabs + embedded Ask/Capture), `/task/new`, `/task/[code]`, `/registry` (redirects to `/?tab=tasks&view=table`), `/meeting`, `/companies`, `/companies/[id]`, `/people`, `/outbox`, `/settings`.

> **Removed (do not recreate):** `/capture`, `/task` (list), `/digest`, `/escalations`, `/audit`. Capture lives in the hub (deep-link `/?capture=1`); the task list is the hub Tasks tab (`/?tab=tasks`); digest/escalations folded into the hub. The standalone audit page was removed but audit *data* is kept and powers the per-task Timeline. Kept actions: `capture/actions.ts` (QuickCapture), `audit/actions.ts` (timeline edits).
>
> `/companies/[id]` Overview groups open tasks **by month** (collapsible) + has a **Completed** tab. `/settings` is now a real control panel (risk thresholds, weather location, AI master switch, reminders) + Navigation reorder card + Resync. Quick Capture and the Meeting extractor support **voice dictation** (Web Speech API).

**API:** `/api/polish`, `/api/draft-email`, `/api/digest-narrative`, `/api/ask` (RAG Q&A with history), `/api/action` (NL command → confirm → execute, audits as `ai-command`), `/api/company-summary` (per-company briefing), `/api/similar-tasks` (keyword duplicate finder, no LLM), `/api/search`, `/api/prefs/nav-pins`, `/api/prefs/nav-recents`.

**Shared RAG layer:** `src/lib/ai-context.ts` — `loadContext()` (cached companies/people/recent items), `loadTaskContext(id)` (per-task with assignees + last 5 updates), `findSimilarTasks(query)` (keyword overlap, no embeddings).

All list pages use `force-dynamic`. Server actions call `revalidatePath` then `redirect`.

## Conventions to preserve
- **British English** throughout LLM prompts and UI copy.
- AI routes return a `source` discriminator (`"ai" | "rules" | "no-key" | "error" | "bad-json"`) — keep this contract; never hard-fail when a rule-based fallback exists.
- **Audit log writes happen before** the actual update where possible, so a failed update leaves a consistent log. `logChange` formats dates as local `YYYY-MM-DD` and skips no-op diffs.
- Task updates that include a `newStatus` write a status-change audit row; the update body becomes `changeReason`.
- Status transition into Completed/Closed sets `closedDate`; transition out clears it.
- `latestUpdate` on tasks is **denormalised** from the most recent `task_updates.body` — keep them in sync if you bulk-edit updates.
- Assignees are M2M; the `owner_id` column is a separate single owner.

## NPM scripts
| Script | Purpose |
|---|---|
| `npm run dev` | next dev |
| `npm run build` / `start` | next build / start |
| `npm run db:generate` | drizzle-kit generate (new migration from schema diff) |
| `npm run db:migrate` | `tsx scripts/migrate.ts` (apply pending migrations) |
| `npm run db:push` | direct schema sync — **avoid in prod** |
| `npm run db:studio` | drizzle GUI |
| `npx tsx scripts/import.ts` | ingest the xlsx (no npm alias — consider adding `db:import`) |

Migration flow: edit `schema.ts` → `db:generate` → review SQL → `db:migrate`.

## Settings (V2)
`lib/settings.ts` is the typed layer (`v2.*` keys in the `settings` table): `getAppSettings()` (cached), `saveAppSettings()`, `getGroqKey()`. LIVE controls: risk thresholds (feed `derive.ts` flag() via `queries.ts`), weather location (welcome-hero), **AI master switch** (gates the Groq key via `getGroqKey()` — off = app runs fully manually, every AI route degrades). Nav pins/recents JSON also live in the settings table.

## Known gaps / smells (don't surprise-fix unless asked)
- No real WhatsApp/Email/SMS dispatch — `markSent` only records. **Planned: Phase 5c.**
- No cron writes `daily_snapshots`. **Planned: Phase 5d.**
- Not yet installable (no PWA manifest/service worker). **Planned: Phase 5a** (groundwork already in layout meta).
- `corrections` table has no UI.
- `lucide-react@^1.16.0` constraint looks suspect — verify before any `npm install` refresh.
- `splitNames` regex `/,| & | and /i` splits names containing "and".

## Memory files (deeper context)
Detailed handover notes live in `memory/` — read these before non-trivial changes:
- `project_overview.md`, `tech_stack.md`, `repo_layout.md`
- `database_schema.md`, `domain_model.md`, `routes_and_pages.md`
- `ai_integration.md`, `outbox_and_reminders.md`, `audit_trail.md`
- `import_pipeline.md`, `dev_workflow.md`, `ui_conventions.md`
- `open_issues.md` — known rough edges and follow-ups

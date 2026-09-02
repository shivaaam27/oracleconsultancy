# COS System

A **Chief-of-Staff administrator** for Oracle Consultancy's 7 portfolio companies (the parent brand was renamed from "Oracle Group" in V2; note "Oracle Consultancy" is also one of the 7 companies):

- CO01 Dar Spices
- CO02 Cocozuri Chocolat
- CO03 Terra Green
- CO04 Oracle Consultancy
- CO05 PES Ltd
- CO06 MES Ltd
- CO07 Pamoja Plus

Single operator, no auth. It replaces the old Excel workflow with a database-backed Next.js app for tasks, timelines, risk, meetings, reminders, and AI-assisted operating memory.

Built with **Next.js 16**, **React 19**, **TypeScript**, **Drizzle ORM**, **Supabase Postgres**, **Tailwind v4**, and optional **Groq** AI.

## Current Highlights (V2)

- Administrator dashboard with Overview, Companies, and Tasks tabs; task cards/popups/pages now surface the **Description** (the standing context) alongside the Latest update.
- Task registry with per-task timeline and audit history.
- **HRMS** hub (`/hrms`): **OECR** office-equipment **stock control** (items + purchases/issues, current stock derived, TZS, negative-stock guard) and **OCR** daily **cleaning checklist** (tap-to-tick areas, comments, attendance, sign-off). Companies/People/Documents live under HRMS.
- **Director Brief** (`/brief`): glanceable portfolio report incl. completed/closed this month, with **WhatsApp/Email/Copy** share and a multi-page **print-to-PDF** detailed report.
- **Documents & Compliance** (`/documents`): track licences/contracts/visas with expiry reminders; **AI reads uploads** — text PDFs, photos, and **scanned/handwritten PDFs** (rasterised → vision model) — and folds extra detail into Notes.
- Mobile-tight Meeting Workspace with saved notes, AI minutes, decisions/risks/follow-up intelligence, history search, and linked tasks.
- Ask COS assistant over tasks, updates, companies, people, and saved meeting minutes.
- COS-native voice intelligence (English, Swahili, Hindi, Gujarati) + a COS vocabulary dictionary.
- People directory (internal/external/expat) with bulk deactivate; notes surfaced on cards.
- Outbox reminder drafts (priority + description + latest update; no code/status) and sent-record history.
- Single centred **HRMS "Go to" launcher** for all secondary destinations; settings for risk thresholds, weather, AI master switch, reminders.

## Where To Start

1. `HANDOVER.md` - **V2 handover** (what shipped, architecture, run, limits).
2. `memory/v2_plan.md` - roadmap and mental model.
3. `CLAUDE.md` / `AGENTS.md` - project instructions for coding agents.
4. `memory/hrms.md` - HRMS hub, OECR (stock) and OCR (cleaning).
5. `memory/outbox_and_reminders.md` - reminder drafts + Director Brief.
6. `memory/ai_integration.md` - Groq, Ask COS, meeting/document AI, voice.
7. `memory/database_schema.md` - current schema.
8. `memory/routes_and_pages.md` - current pages and API routes.

## Getting Started

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

Required env (`.env.local`):

- `DATABASE_URL` - Supabase pooler URL on port `6543`.
- `NEXT_PUBLIC_SUPABASE_URL` - Supabase project URL (used by the server JS client).
- `SUPABASE_SERVICE_ROLE_KEY` - service-role key for server write paths.

Optional env:

- `GROQ_API_KEY` (or the Settings AI switch) - enables AI features. The app still runs manually when missing or when AI is disabled in Settings.
- `XLSX_PATH` - optional import override.

Native dependency: `@napi-rs/canvas` (prebuilt) renders scanned PDFs to images for the document vision reader; it's listed in `serverExternalPackages` (`next.config.ts`).

## Key Scripts

| Script | Purpose |
|---|---|
| `npm run dev` | Local Next dev server |
| `npm run build` | Production build |
| `npm run start` | Production server |
| `npm run db:generate` | Generate Drizzle migration |
| `npm run db:migrate` | Apply pending migrations |
| `npm run db:push` | Direct schema sync; avoid in production |
| `npm run db:studio` | Drizzle Studio |
| `npx tsx scripts/import.ts` | Import the Excel workbook |
| `npm exec tsc -- --noEmit` | Type-check |

## Critical Notes

- `src/db/index.ts` uses `prepare: false` and `max: 1`; this is required for Supabase PgBouncer transaction mode.
- Use the Supabase pooler URL on port `6543`, not direct `5432`.
- British English throughout UI copy and AI prompts.
- Removed standalone routes should not be recreated: `/capture`, `/task`, `/digest`, `/escalations`, `/audit`.

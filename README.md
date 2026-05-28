# COS System

A **Chief-of-Staff command centre** for Oracle Group's 7 portfolio companies:

- CO01 Dar Spices
- CO02 Cocozuri Chocolat
- CO03 Terra Green
- CO04 Oracle Consultancy
- CO05 PES Ltd
- CO06 MES Ltd
- CO07 Pamoja Plus

Single operator, no auth. It replaces the old Excel workflow with a database-backed Next.js app for tasks, timelines, risk, meetings, reminders, and AI-assisted operating memory.

Built with **Next.js 16**, **React 19**, **TypeScript**, **Drizzle ORM**, **Supabase Postgres**, **Tailwind v4**, and optional **Groq** AI.

## Current Highlights

- Command centre dashboard with Overview, Companies, and Tasks tabs.
- Task registry with per-task timeline and audit history.
- Mobile-tight Meeting Workspace with saved notes, AI minutes, decisions/risks/follow-up intelligence, history search, and linked tasks.
- Ask COS assistant over tasks, updates, companies, people, and saved meeting minutes.
- COS-native voice intelligence for Quick Capture, Meeting notes, task updates, and Ask COS dictation.
- Voice settings for English, Swahili, Hindi, and Gujarati, plus a COS vocabulary dictionary.
- People directory with internal, external, and expat contact types.
- Outbox reminder drafts and sent-record history.
- Settings for risk thresholds, weather, AI master switch, reminders, and navigation.

## Where To Start

1. `memory/v2_plan.md` - current roadmap and mental model.
2. `CLAUDE.md` / `AGENTS.md` - project instructions for coding agents.
3. `memory/meeting_workspace.md` - saved meetings, minutes, linked tasks, mobile layout, and meeting intelligence.
4. `memory/ai_integration.md` - Groq, Ask COS, meeting AI, and voice intelligence.
5. `memory/database_schema.md` - current schema.
6. `memory/routes_and_pages.md` - current pages and API routes.

## Getting Started

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

Required env:

- `DATABASE_URL` - Supabase pooler URL on port `6543`.

Optional env:

- `GROQ_API_KEY` - enables AI features. The app still runs manually when missing or when AI is disabled in Settings.
- `XLSX_PATH` - optional import override.

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

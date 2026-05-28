# COS System

A **Chief-of-Staff command centre** for Oracle Group's 7 portfolio companies (CO01 Dar Spices, CO02 Cocozuri Chocolat, CO03 Terra Green, CO04 Oracle Consultancy, CO05 PES Ltd, CO06 MES Ltd, CO07 Pamoja Plus). Single operator, no auth. It replaces an Excel workbook: capture/track action items, surface risk, generate per-person reminders, draft follow-up emails.

Built with **Next.js 16** (App Router) + **React 19** + **TypeScript** + **Drizzle ORM** + **Supabase Postgres** + **Tailwind v4**, with optional **Groq** AI features.

## 👉 Where to start (handover)

1. **`memory/v2_plan.md`** — START HERE. The Version 2 direction, phase status, core mental model (task → timeline → risk view), and how to work in this repo.
2. **`CLAUDE.md`** — project instructions: stack, critical config (don't break the pooler settings), routes, domain rules, conventions.
3. **`memory/`** — deeper reference docs (database schema, AI integration, outbox, audit trail, import pipeline, dev workflow, UI conventions, open issues).

## Getting started

```bash
npm install
npm run dev      # http://localhost:3000
```

Requires a `.env.local` with at least `DATABASE_URL` (Supabase **6543** pooler URL). `GROQ_API_KEY` is optional (unlocks AI; the app runs fully manually without it via the AI master switch in Settings).

## Key scripts

| Script | Purpose |
|---|---|
| `npm run dev` / `build` / `start` | Next dev / build / start |
| `npm run db:generate` / `db:migrate` | Drizzle migration generate / apply |
| `npm run db:studio` | Drizzle GUI |
| `npx tsx scripts/import.ts` | Ingest the source xlsx |
| `npx tsc --noEmit` | Type-check (use this to verify changes) |

## Conventions

British English throughout. All list pages are `force-dynamic`. The owner is non-technical — keep explanations in plain language. See `CLAUDE.md` for the full list.

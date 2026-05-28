---
name: dev-workflow
description: "Local setup, scripts, migrations, and Supabase pooler rules"
metadata:
  node_type: memory
  type: project
---

# Dev Workflow

## Setup

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Required Environment

- `DATABASE_URL` - Supabase pooler URL on port `6543`.
- `NEXT_PUBLIC_SUPABASE_URL` - Supabase project URL for server client paths.
- `SUPABASE_SERVICE_ROLE_KEY` - service-role key for server Supabase client paths.

Optional:

- `GROQ_API_KEY` - AI features.
- `XLSX_PATH` - workbook import override.

## Scripts

| Script | Purpose |
|---|---|
| `npm run dev` | Next dev server |
| `npm run build` | Production build |
| `npm run start` | Production server |
| `npm run db:generate` | Generate Drizzle migration |
| `npm run db:migrate` | Apply migrations using `scripts/migrate.ts` |
| `npm run db:push` | Direct schema sync; avoid in production |
| `npm run db:studio` | Drizzle Studio |
| `npx tsx scripts/import.ts` | Import workbook |
| `npm exec tsc -- --noEmit` | Type-check |

## Migration Flow

1. Edit `src/db/schema.ts`.
2. Generate migration with `npm run db:generate`, or write/review SQL carefully if doing a manual migration.
3. Review SQL in `drizzle/`.
4. Apply with `npm run db:migrate`.
5. Verify with `npm exec tsc -- --noEmit`.

Latest migration: `drizzle/0008_meeting_workspace.sql`.

## Supabase Pooler

Use port `6543` transaction mode.

`src/db/index.ts` must keep:

- `prepare: false`
- `max: 1`

Direct port `5432` behaves differently and can exhaust connections in serverless environments.

## Git Notes

- Current feature branch used in recent work: `codex/cos-system`.
- Do not push unless asked.
- Untracked local helper files may exist; check `git status` before staging.

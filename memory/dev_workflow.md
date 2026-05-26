---
name: dev-workflow
description: "Local setup, scripts, migration flow, and Supabase pooler gotchas"
metadata: 
  node_type: memory
  type: project
  originSessionId: ce50e4c8-def7-4b23-a6ab-4d8b492e1b43
---

## Setup
```
cd cos-system
npm install
# .env.local:
#   DATABASE_URL=postgresql://...@aws-...pooler.supabase.com:6543/postgres
#   GROQ_API_KEY=gsk_...
npm run dev          # http://localhost:3000
```

## NPM scripts
| Script | What it does |
|--------|---|
| `npm run dev` | `next dev` |
| `npm run build` | `next build` |
| `npm run start` | `next start` (prod) |
| `npm run db:generate` | `drizzle-kit generate` — writes new migration SQL from schema diff into `./drizzle/`. |
| `npm run db:migrate` | `tsx scripts/migrate.ts` — applies pending migrations to DATABASE_URL. |
| `npm run db:push` | `drizzle-kit push` — direct schema sync (avoid in prod; bypasses migrations). |
| `npm run db:studio` | `drizzle-kit studio` — local DB GUI. |
| (no script) | `npx tsx scripts/import.ts` — load xlsx. |
| (no script) | `npx tsx scripts/baseline-migrations.ts` — one-shot baseline (already run). |

## Migration flow (going forward)
1. Edit [src/db/schema.ts](../../../OneDrive/Documents/COS%20System/cos-system/src/db/schema.ts).
2. `npm run db:generate` → new file in `drizzle/000N_*.sql`.
3. Review the SQL.
4. `npm run db:migrate` → applies to the configured DB.
The baseline migration (`0000_flaky_amphibian.sql`) was applied to the live Supabase project manually before Drizzle was wired up; `scripts/baseline-migrations.ts` inserts its hash into `drizzle.__drizzle_migrations` so it's not re-run.

## Supabase pooler caveats
Use the **pooler port 6543** URL (transaction mode), not the direct 5432 connection.
In [src/db/index.ts](../../../OneDrive/Documents/COS%20System/cos-system/src/db/index.ts) the client is configured with:
- `prepare: false` — required (PgBouncer transaction mode doesn't support prepared statements).
- `max: 1` — each serverless function instance handles one request at a time; pool concurrency happens at the pooler.
- `idle_timeout: 20, connect_timeout: 10`.

If you switch to the direct 5432 URL, you can remove `prepare: false`, but on Vercel you'll likely exhaust connections.

## Deployment
Designed for Vercel (Next.js). No `vercel.json` checked in. Required env vars: `DATABASE_URL`, `GROQ_API_KEY`.

## Type alias
`@/*` → `./src/*` (see `tsconfig.json`).

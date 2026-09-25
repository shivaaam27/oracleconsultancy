---
name: dev-workflow
description: "Local setup, scripts, migrations, verification and the Supabase pooler rules"
metadata:
  node_type: memory
  type: project
---

# Dev workflow

## Setup

```bash
npm install
npm run dev        # http://localhost:3000 (already runs with a 4 GB heap)
```

## Environment (`.env.local`)

Required:

- `DATABASE_URL` — Supabase pooler on port `6543`.
- `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` — the server client (`sb`).
- `PORTAL_SESSION_SECRET` — signs the owner and staff cookies (without it a
  `DATABASE_URL`-derived key is used; never acceptable in production).

Usually wanted:

- `GEMINI_API_KEY` — all text and vision AI (can be set in Settings instead).
- `GROQ_API_KEY` — voice transcription only (Whisper).
- `DIRECT_DATABASE_URL` — session pooler / direct (5432) for migrate, backup and
  the security check; falls back to `DATABASE_URL`.
- `COS_MCP_KEY` — written by `npm run mcp:key`, read by `.mcp.json`.

The full list with what each one does is in `tech_stack.md`.

## Scripts

| Script | Purpose |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` | Production build (8 GB heap built in) |
| `npm test` | Vitest, run once |
| `npm exec tsc -- --noEmit` | Type-check (`NODE_OPTIONS=--max-old-space-size=4096` for a full run) |
| `npm run db:generate` | Generate a Drizzle migration from `schema.ts` |
| `npm run db:migrate` | Apply migrations (`scripts/migrate.ts`) |
| `npm run db:backup` | Per-table JSON snapshot into `backups/` (git-ignored, ~15 min) |
| `npm run db:restore -- <folder>` | Restore a snapshot |
| `npm run db:check-security` | Re-test RLS, anon grants, functions, buckets; exits 1 on a finding |
| `npm run db:embed-backfill` | Fill the semantic-search index |
| `npm run mcp:key` | Mint an MCP key into `.env.local` as `COS_MCP_KEY` |
| `npm run db:studio` | Drizzle Studio |
| `npm run db:push` | Direct schema sync — never against production |

## Migrations

1. Edit `src/db/schema.ts`.
2. `npm run db:generate`, or hand-write the SQL.
3. Review the SQL in `drizzle/`. The snapshot can lag the live database, so a
   generated `CREATE` can collide — use `IF NOT EXISTS` or trim.
4. `npm run db:migrate`. On Vercel, `vercel-build` runs the migrator before
   `next build` (best effort; `MIGRATE_STRICT=1` makes a failure fail the build).
5. Run `npm run db:check-security` after any schema work.

Latest migration: **0172** (`announcements.delivered_at`).

- ⚠️ **A hand-written migration needs a journal `when` later than the newest
  APPLIED one** (use `Date.now()`), or the migrator skips it and still prints
  "Migrations applied." Prove it ran by checking its effect.
- Back up FIRST only when a migration drops, rewrites or bulk-deletes data.
  Additive migrations go straight in; otherwise one backup at the end of a
  session.
- Create tables by migration, never in the Supabase dashboard (see `security.md`).

## Supabase pooler

Port `6543`, transaction mode. `src/db/index.ts` must keep `prepare: false` and
`max: 1`. Direct `5432` can exhaust connections from serverless.

## Git

- One branch: **`master`**. Vercel deploys only `master`; push only to `master`,
  and only when asked.
- Check `git status` before staging; untracked local helpers may exist.
- Do not clear `.next` while the dev server is running.

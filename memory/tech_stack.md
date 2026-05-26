---
name: tech-stack
description: "Frameworks, libraries, infra, and the rationale for non-obvious choices"
metadata: 
  node_type: memory
  type: project
  originSessionId: ce50e4c8-def7-4b23-a6ab-4d8b492e1b43
---

## Runtime
- **Next.js 16.2.6** (App Router, Server Components default, server actions)
- **React 19.2.4**
- **TypeScript 5**
- **Node** (Windows dev box). Bash + PowerShell both available.

## Database
- **PostgreSQL** via **Supabase**.
- Connection uses the **Supabase pooler on port 6543 (transaction mode)**.
- Driver: `postgres` (postgres.js) + Drizzle ORM 0.45.
- Critical: `prepare: false` and `max: 1` are required because PgBouncer transaction mode doesn't support prepared statements. See [db/index.ts](../../../OneDrive/Documents/COS%20System/cos-system/src/db/index.ts).
- Migrations via `drizzle-kit`. Generated SQL lives in `drizzle/`. First migration `0000_flaky_amphibian.sql` was already pushed to prod manually, so `scripts/baseline-migrations.ts` marks it applied without re-running. After that, `npm run db:migrate` is clean.

## Styling
- **Tailwind v4** (`@tailwindcss/postcss`).
- Custom design tokens: `bg-bg`, `bg-bg-elev`, `bg-bg-muted`, `bg-bg-subtle`, `border-border`, `text-fg`, `text-fg-muted`, `text-fg-subtle`, `bg-accent`, `bg-danger`, `bg-warn`, `bg-success` — defined in `globals.css`.
- Dark mode via `next-themes` + `ThemeProvider`.
- Animation: `framer-motion` for page transitions.
- Icons: `lucide-react`.
- Primitives: Radix (`dialog`, `dropdown-menu`, `tooltip`), `cmdk` for command palette.

## AI
- **Groq Cloud** chat completions API (`https://api.groq.com/openai/v1/chat/completions`).
- Model: `llama-3.1-8b-instant` for all four routes (polish, extract-meeting, draft-email, digest-narrative).
- Env var: `GROQ_API_KEY`. Absent → graceful fallback to rule-based polish or empty result.

## Spreadsheet ingest
- `xlsx` (SheetJS) loaded directly from sheetjs.com tarball (not the npm tombstone).

## Env vars
- `DATABASE_URL` — Supabase pooler URL (must be the 6543 pooled one).
- `GROQ_API_KEY` — optional but unlocks AI features.
- `XLSX_PATH` — optional override for import script, default `C:/Users/User/Downloads/Chief Of Staff Workflow - Live.xlsx`.

Loaded from `.env.local` then `.env` (drizzle.config.ts, scripts/migrate.ts, scripts/import.ts all `dotenv.config()` both).

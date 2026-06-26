---
name: tech-stack
description: "Frameworks, libraries, infra, and non-obvious choices"
metadata:
  node_type: memory
  type: project
---

# Tech Stack

## Runtime

- Next.js 16.2.6, App Router.
- React 19.2.4.
- TypeScript 5.
- Windows development environment with PowerShell.

## Database

- Supabase Postgres.
- Drizzle ORM with postgres.js for schema/migrations and older query paths.
- Server-side Supabase client in `src/db/supabase.ts` for newer action/API write paths.
- Supabase pooler on port `6543`, transaction mode.

Critical pooler settings in `src/db/index.ts`:

- `prepare: false`
- `max: 1`

Do not remove these unless switching away from PgBouncer transaction mode.

## Migrations

- Generated SQL lives in `drizzle/`.
- `0000_flaky_amphibian.sql` was applied manually before Drizzle migration tracking.
- `scripts/baseline-migrations.ts` marks baseline as applied.
- Latest feature migrations: `0017_yummy_mad_thinker` (HRMS stock — hand-trimmed), `0018_glamorous_lady_vermin` (OCR cleaning). `0017_documents_compliance`/`0018_document_files` were applied manually outside the journal — see `database_schema.md`.

## Styling

- Tailwind v4 via `@tailwindcss/postcss`.
- Design tokens in `src/app/globals.css`.
- Dark mode via `next-themes`.
- Animation via `framer-motion`.
- Icons via `lucide-react`.
- Radix primitives for dialog/dropdown/tooltip.
- `cmdk` for command palette.

## Documents / PDF

- `unpdf` — serverless pdf.js: text extraction **and** page rasterising (`renderPageAsImage`).
- `@napi-rs/canvas` — prebuilt native canvas backing unpdf's renderer (scanned-PDF → image for the vision reader). Both in `serverExternalPackages` (`next.config.ts`).
- `serverActions.bodySizeLimit: "25mb"` for document uploads.
- Director Brief PDF = browser print of `/brief` via `@media print` in `globals.css` (no PDF library).

## AI

- Groq Cloud OpenAI-compatible chat completions endpoint.
- Models: `openai/gpt-oss-20b` (fast) / `openai/gpt-oss-120b` (smart), env-overridable ladders in `src/lib/ai-models.ts`. Migrated 2026-06 from `llama-3.1-8b-instant` + `llama-3.3-70b-versatile` (Groq deprecated both; shutdown 2026-08-16). Vision still `meta-llama/llama-4-scout-17b-16e-instruct` (shutdown 2026-07-17, replacement TBC).
- `GROQ_API_KEY` unlocks AI features.
- `getGroqKey()` applies the Settings AI master switch.
- AI surfaces include polish, draft email, digest narrative, Ask COS, AI commands, company summaries, Meeting Workspace intelligence, and shared voice dictation polish.
- Voice dictation uses the browser Web Speech API through `src/components/voice-button.tsx`; clean-up runs through `src/app/voice/actions.ts`.

## Spreadsheet Ingest

- `xlsx` from SheetJS tarball.
- Import script: `npx tsx scripts/import.ts`.

## Env Vars

- `DATABASE_URL` - required, Supabase pooler URL on port `6543`.
- `GROQ_API_KEY` - optional.
- `XLSX_PATH` - optional import path override.
- `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` - required for server Supabase client paths.

Env is loaded from `.env.local` then `.env` in migration/import scripts.

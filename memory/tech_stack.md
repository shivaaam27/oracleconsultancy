---
name: tech-stack
description: "Frameworks, libraries, infra, env vars and the non-obvious choices"
metadata:
  node_type: memory
  type: project
---

# Tech stack

## Runtime

- Next.js 16 App Router (`package.json` `^16.3.5`; `src/proxy.ts` is the Next-16
  edge gate), React 19.2, TypeScript 5.
- Hosted on Vercel (region `dub1`); only `master` deploys.
- Developed on Windows (PowerShell / Git Bash).

## Database

- Supabase Postgres, pooler on port `6543` in transaction mode.
- Drizzle ORM 0.45 + postgres.js for schema, migrations and older query paths.
  `src/db/index.ts` must keep `prepare: false` and `max: 1`.
- Supabase JS client (`sb`, `src/db/supabase.ts`, service role) for newer
  write paths; helpers in `src/lib/db-helpers.ts`.
- RLS ON everywhere with no policies; the app bypasses it via the service role
  (see `security.md`).
- Migrations in `drizzle/`; latest **0172**. `0000_flaky_amphibian.sql` was
  applied by hand and `scripts/baseline-migrations.ts` marks it applied.
- Semantic search: pgvector + the in-region `gte-small` model in the Supabase
  Edge Function `supabase/functions/embed` (see `SEMANTIC_SEARCH.md`).
- All wall-clock columns are `timestamptz`; write UTC, render in EAT (UTC+3).

## UI

- Tailwind v4 (`@tailwindcss/postcss`), tokens in `src/app/globals.css`.
- Design: **Studio** (`memory/studio_redesign.md`) on rebuilt pages, Desk
  (`DESIGN_SYSTEM.md`) on the rest.
- `next-themes`, `framer-motion`, `lucide-react`, Radix primitives, `cmdk` (⌘K).
- Notes editor: Tiptap 3 (pinned at 3.30.1 on purpose).

## Files, documents and PDF

- `unpdf` (PDF text + page rasterising) with `@napi-rs/canvas`; `mammoth` (Word),
  `heic-convert`, `jszip`, `xlsx` (SheetJS tarball, for the one-off import).
- `@react-pdf/renderer` for the Director Brief PDF (`src/lib/brief-pdf.tsx`).
- `unpdf`, `@napi-rs/canvas`, `@react-pdf/renderer` are in
  `serverExternalPackages`; `serverActions.bodySizeLimit` is `25mb`.

## AI

- **Gemini only** for text and vision: `gemini-3.1-flash-lite` →
  `gemini-3.5-flash-lite`, ladders in `src/lib/ai-models.ts`,
  `getActiveProvider()` hard-coded `"gemini"`, harness `src/lib/ai-json.ts`.
- **Groq only for voice**: Whisper `whisper-large-v3-turbo` at `/api/transcribe`.
- Gate: `getAiKey()` (master switch + key + optional spend cap). Full reference
  in `ai_integration.md`.

## Integrations

- Auth: signed cookies + scrypt; passkeys via `@simplewebauthn/server` +
  `/browser` v13.
- MCP: `mcp-handler` + `@modelcontextprotocol/server` at `/api/mcp`.
- Google Calendar/Meet: `googleapis` (OAuth).
- Email: `nodemailer` over Gmail SMTP, or Resend.
- WhatsApp: Twilio REST (`src/lib/whatsapp.ts`).
- Push: `web-push` (VAPID).
- Errors: `@sentry/nextjs` (errors only, inert without a DSN).
- Tests: Vitest.

## Environment variables

Verified against `process.env` reads in `src/`, `scripts/` and `next.config.ts`.

| Name | Needed for |
|---|---|
| `DATABASE_URL` | **Required.** Pooler URL, port 6543. |
| `NEXT_PUBLIC_SUPABASE_URL` | **Required.** Supabase project URL. |
| `SUPABASE_SERVICE_ROLE_KEY` | **Required.** Server database access. Secret. |
| `PORTAL_SESSION_SECRET` | Signs owner and staff cookies. Must be set in production. |
| `DIRECT_DATABASE_URL` | Migrate / backup / security check (session pooler or 5432). Falls back to `DATABASE_URL`. |
| `CRON_SECRET` | Bearer secret for `/api/cron/*`. |
| `GEMINI_API_KEY` | All AI (or set in Settings). |
| `GROQ_API_KEY` | Voice transcription only (or set in Settings). |
| `AI_MODEL_QUOTAS`, `GEMINI_FAST_MODELS`, `GEMINI_SMART_MODELS`, `GEMINI_VISION_MODELS` | Optional model overrides. |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Google Calendar/Meet sync. |
| `GMAIL_USER`, `GMAIL_APP_PASSWORD` (+ optional `SMTP_HOST`, `SMTP_PORT`) | Sending email. |
| `RESEND_API_KEY` | Alternative email sender. |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_FROM` (+ optional `TWILIO_DEFAULT_CONTENT_SID`, `TWILIO_DEFAULT_LANG`) | WhatsApp sending. |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | Push notifications. |
| `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN` | Error alerts. |
| `CSP_ENFORCE` | `1` = enforce the CSP (read at build time; redeploy). |
| `NEXT_PUBLIC_APP_URL` | Public base URL for links (falls back to Vercel's URL). |
| `EVENT_ATTACH_MAX_BYTES` | Optional cap on event-invitation attachments (default 15 MB). |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET` | The dormant Telegram → ORI bridge. |
| `COS_MCP_KEY` | Local only: the MCP key `.mcp.json` sends. |
| `MIGRATE_STRICT` | `1` = a failed migration fails the Vercel build. |

Not read by the app: `APP_PASSPHRASE` (the owner password is a hash in
`settings`, set on first sign-in), `INBOX_SECRET` (the inbox route is gone),
`NEXT_PUBLIC_SUPABASE_ANON_KEY` (no page subscribes to Realtime any more),
`OCRSPACE_API_KEY` (a settings fallback nothing calls). `AGENT_TRIGGER_SECRET`
only guards the dormant `/api/agent/trigger`.

Scripts load `.env.local`, then `.env`.

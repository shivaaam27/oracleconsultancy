# Oracle Consultancy — Chief-of-Staff Command Centre · V2 Handover

This is the handover for **V2** of the system. It captures what V2 added, the
architecture, how to run it, and where to continue. Start technical onboarding
with `CLAUDE.md`, then `memory/v2_plan.md`; the deep notes live in `memory/*.md`.

The owner is non-technical — keep explanations in plain British English.

---

## 1. What the system is

A single-operator command centre for **Oracle Consultancy** and its 7 portfolio
companies (Dar Spices, Cocozuri Chocolat, Terra Green, Oracle Consultancy, PES
Ltd, MES Ltd, Pamoja Plus). It replaces an Excel workbook with task tracking,
per-task timelines, risk views, meetings/notes, a personal to-do list, document
& compliance tracking, outreach drafts, an Ask-COS assistant, and (V2) an HRMS
area and a Director Brief report.

No auth, single operator. `createdBy` is normally `"web-ui"`.

## 2. Stack & how to run

- Next.js 16 (App Router), React 19, TypeScript 5, Tailwind v4 (tokens in
  `src/app/globals.css`), Drizzle ORM + Supabase Postgres (pooler, port 6543),
  Groq Cloud for AI, framer-motion, Radix, cmdk, lucide-react.
- **Run:** `npm run dev`. **Verify types:** `npm exec tsc -- --noEmit`.
  **Build:** `npm run build`. **Migrate DB:** `npm run db:migrate`.
- Env in `.env.local`: `DATABASE_URL` (Supabase pooler :6543, `prepare:false`,
  `max:1`), `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, Groq key.
- **Dev note:** Turbopack sometimes serves a **stale CSS cache** — `globals.css`
  edits may not appear until you stop the server, `rm -rf .next`, and restart.
  Production builds are always fresh; this is dev-only.

## 3. What V2 added (high level)

1. **HRMS area** — a hub of "registries" at `/hrms`:
   - **OECR** (Office Equipment Control Registry, `/hrms/oecr`): full stock
     control — items, purchases (in), issues (out), current stock **derived**
     (opening + purchased − issued), dashboard, negative-stock guard, TZS.
   - **OCR** (Office Cleaning Registry, `/hrms/ocr`): the paper daily cleaning
     checklist, digitised — tap-to-tick areas with timestamps, per-area comments,
     attendance (from People), tap-to-sign-off, date navigation.
   - **Companies, People, Documents** moved *into* HRMS (reached via the launcher).
2. **Director Brief** (`/brief`) — a glanceable portfolio report including
   **completed/closed work this month**, with **WhatsApp / Email / Copy** share
   and **print-to-PDF** (a detailed per-company table report, print-only).
3. **Navigation overhaul** — single centred **HRMS "Go to" launcher** replaces
   the old "More" sheet and per-tab popovers; **Director Brief** promoted to a
   primary tab; mobile overflow fixed.
4. **Surfacing descriptions** — task `comments` (Description) and people `notes`
   now show on cards, popups and pages (not just in Edit), with the Latest
   update as a separate labelled block.
5. **Outbox draft** — reminder text dropped the task code + status, kept
   priority, and added Description + Latest update.
6. **Documents AI** — reads scanned/photographed PDFs (rasterised via
   `@napi-rs/canvas` → vision model), plus overflow-to-Notes; unified capture
   (Upload · Link · Paste text).
7. **Polish** — smart breadcrumbs (`?from=task:CODE`), People bulk
   deactivate, unified `+` action icon, shared `SearchInput`, typography
   (`text-wrap: balance/pretty`).

## 4. Architecture notes (the important bits)

- **Derived, never stored:** current stock (OECR), cleaning completion % (OCR),
  task/document status — all computed at read time. Pure functions are the
  source of truth (`*-shared.ts`), Supabase helpers wrap them (`*.ts`).
- **Single source of truth for the Director Brief:** `src/lib/director-brief.ts`
  (`getBrief`, `briefShareText`, `briefEmail`). The page, share text and PDF all
  read it, so they **stay in sync** — every open re-reads live data
  (`force-dynamic`), and the PDF is a print of that live page.
- **Company KPIs:** `computeCompanyKpis` (in `queries.ts`) now includes
  `inProgress`; reused by the brief and elsewhere.
- **Print/PDF:** `@media print` in `globals.css` forces a clean white document
  even from dark mode, hides chrome (`.fixed`, `.print-hidden`), shows
  `.print-only` content, and paginates (the framer-motion page wrapper is
  flattened with `display:contents` so content can split across pages).
- **Timestamps** are all `timestamptz`; writes use `.toISOString()`.
- **DB write paths** mostly use the Supabase JS client (`src/db/supabase.ts`).

## 5. Database (V2 additions) — see `memory/database_schema.md`

- HRMS/OECR: `stock_items`, `stock_purchases`, `stock_issues`.
- HRMS/OCR: `cleaning_areas`, `cleaning_days`, `cleaning_checks`.
- Migration-numbering quirk: `0017_documents_compliance` and `0018_document_files`
  were applied manually outside the Drizzle journal; the stock migration was
  hand-trimmed (`0017_yummy_mad_thinker`), cleaning is `0018_glamorous_lady_vermin`.

## 6. Known limitations / where to continue

- **No real message dispatch** — WhatsApp/email/SMS go via deep links
  (`wa.me`/`mailto`) + manual "Mark sent". A provider hasn't been chosen.
- **Word/Excel documents** aren't read by the vision model yet (PDF + images only).
- **OCR** has Phases 3–5 outstanding (history/dashboard, area management, photos/
  reminders/export) — see `memory/hrms.md`.
- **Director Brief** Phase 5 optional (period filter, per-company brief,
  scheduled auto-send) — see `memory/outbox_and_reminders.md`.
- **Snapshots/cron** scheduling in production still needs verification.

## 7. Conventions to respect

- British English; explain to a non-technical owner.
- Use `getGroqKey()` so the AI master switch works; AI-off must degrade gracefully.
- Don't break `src/db/index.ts` (`prepare:false`, `max:1`); keep `timestamptz`.
- Update `memory/*.md` after meaningful changes. Don't auto-push unless asked.
- Verify with `npm exec tsc -- --noEmit` (and ideally `npm run build`) before pushing.

**Status: V2 complete and pushed to `master`. Production build is clean; all
primary pages return 200.**

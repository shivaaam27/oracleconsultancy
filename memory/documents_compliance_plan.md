---
name: documents-compliance-plan
description: "Phased plan for the Compliance & Documents centre (tracking, expiry reminders)"
metadata:
  node_type: memory
  type: project
---

# Compliance & Documents — Phased Plan

A new home for every important document across the 7 companies (licences, contracts,
certificates, registrations, insurance, leases, permits, immigration/visas, tax). Each
document knows its owner (company and/or person), issue date, expiry date, and lead time
for reminders. Reuses People/Companies, the reminder/notify+push engine, and Tasks.

## Owner decisions (locked, 2026-06-04)
- **Track details only** for now — metadata + expiry + optional `file_url` link to where the
  file lives. Real in-app uploads (Supabase Storage) deferred to a later phase if wanted.
- **Company + optional person** ownership — most docs belong to a company; some also to a
  person (expat passport/visa). Both links available.
- **Own top-level page `/documents`** with its own nav item (sidebar + mobile pill).

## Conventions to follow
- Supabase write paths (`src/lib/documents.ts`, mirror `db-helpers.ts`); `timestamptz` columns,
  writes via `.toISOString()`; soft-delete via `archived`; status DERIVED not stored.
- FluidSelect filters, TableView, PeekPreview + inline quick-edit, centred vibrancy drawers.
- Reminders ride the existing `/api/cron/notify` + `sendToAll` de-duped push. AI-optional with
  rule fallbacks. British English.

## Phases
1. **Foundation** — migration `0017`: `documents` table
   (`id, title, company_id?, person_id?, category, doc_type, status, issuer, reference_no,
   issue_date, expiry_date, reminder_lead_days, file_url?, notes, archived, created_at,
   updated_at, created_by`) + optional `document_links` join (`document_id, task_id`) like
   `meeting_tasks`. Helpers in `src/lib/documents.ts`. No UI yet.
2. **`/documents` page** — nav item; table-first with FluidSelect filters (company/category/
   status); colour-coded expiry countdown; long-press peek + inline quick-edit; add/edit drawer
   with company + person pickers; one-tap "Renew" → linked task.
3. **Expiry reminders** — extend cron notify to find `expiry_date - reminder_lead_days <= today`,
   fold into the daily push + COS Home attention strip; "Renew" drafts an Outbox message.
4. **File storage (optional, later)** — Supabase Storage bucket + upload, only if owner wants it.
5. **Intelligence & polish** — Groq date/reference extraction (rule fallback), Inbox "File as
   document", Ask COS RAG over expiries, per-company compliance health → /insights + snapshots.

## Suggested extras
Renewal chains (auto-roll next expiry), per-category default lead times, responsible person +
one-tap chase draft, compliance calendar (reuse CalendarView), person-drawer documents list,
per-document timeline.

## Status
- **Phase 1 — Foundation: DONE (2026-06-04).** Migration `0017_documents_compliance.sql`
  applied (via `scripts/apply-migration.ts`) — `documents` + `document_links` tables verified
  in DB, all dates `timestamptz`. Schema added to `src/db/schema.ts`. Helpers in
  `src/lib/documents.ts`: `listDocuments`, `getDocument`, `createDocument`, `updateDocument`,
  `setDocumentArchived`, `linkDocumentTask`, plus `deriveDocStatus`/`daysToExpiry`,
  `DOC_CATEGORIES`, `DEFAULT_LEAD_DAYS`, `docStatusColor`. Typecheck clean.
- **Phase 2 — `/documents` page: DONE (2026-06-04).** New nav item (`nav.ts`, FileText icon,
  between People and Outbox). `src/app/documents/page.tsx` (server: loads docs + companies +
  people, header with tracked/expired/expiring summary). `documents-table.tsx` (client):
  FluidSelect filters (company/category/status) + summary chips + show-archived toggle;
  colour-coded expiry countdown via `expiryLabel`/`daysToExpiry`; row click → edit dialog;
  long-press → PeekPreview with Edit/Renew/Open file/Archive; create + edit dialogs share
  `document-form.tsx` (category auto-suggests lead days). Server actions in
  `src/app/documents/actions.ts`: create/update/archive + `renewDocumentAction` (creates a
  linked "Renew: <title>" task in the doc's company, priority High, deadline = expiry, links
  via `document_links`). Client-safe pure helpers split into `src/lib/documents-shared.ts`
  (so client can import derive/types without `sb`). Typecheck clean; route verified HTTP 200.
- **Phase 3 — Expiry reminders: DONE (2026-06-04).** COS Home now shows an **"Documents
  needing attention"** card (`src/components/expiring-docs.tsx`, server-rendered, hidden when
  empty) listing expired + expiring docs (top 6, soonest first) — wired in `_hub/cos-home.tsx`
  via `listDocuments` + `deriveDocStatus`/`daysToExpiry`/`expiryLabel`. Daily push
  (`/api/cron/notify`) folds expired/expiring doc counts into `parts` + the de-dupe signature;
  when only documents are actionable the push deep-links to `/documents` (else tasks). Renew
  (Phase 2) already drafts the follow-up task; a dedicated Outbox chase draft to the
  responsible person is a possible Phase 5 extra. Verified: home card + docs page render with a
  seeded expiring doc (HTTP 200), then cleaned up. Typecheck clean.
- **Phase 4 — File uploads: DONE (2026-06-04).** Migration `0018` adds `documents.storage_path`
  + `file_name`. Private Supabase Storage bucket **`documents`** (20 MB limit, allowed pdf/image/
  office types) created by `scripts/create-documents-bucket.ts` (idempotent). DB helpers in
  `src/lib/documents.ts`: `uploadDocumentFile` (removes any prior file first → no orphans),
  `removeDocumentFile`, `signDocumentFile`; constant `DOCUMENTS_BUCKET`. Server actions handle a
  `file` field in create/update + `removeFile=1`; `getDocumentFileLinkAction` returns a 5-min
  signed URL; `removeDocumentFileAction`. `document-form.tsx` has a file picker (choose/replace/
  remove, shows current attachment). Table: paperclip indicator on rows; peek "Open file"
  (stored → signed URL) / "Open link" (external). `next.config.ts` raises server-action body
  limit to 25mb. Verified end-to-end (upload→DB cols→signed URL HTTP 200→remove). Typecheck clean.
  **NOTE:** existing dev server must be restarted to pick up the `next.config.ts` change.
- **Phase 5 — Intelligence & polish: DONE (2026-06-04).** All four pieces:
  1. **AI auto-fill** — `extractDocumentFields(text)` in `app/documents/actions.ts` (Groq JSON
     mode via `getGroqKey`, with a rule-based fallback `ruleExtract` that finds dates
     [ISO / dd-mm-yyyy / "12 March 2027"], category, reference no, title). Form has a "Auto-fill
     from text" panel (`document-form.tsx`) that fills fields via a form ref; verified extraction
     (5/5 fields from a sample licence).
  2. **Ask COS RAG** — `/api/ask` now retrieves documents (`listDocuments` + derive), always
     surfaces expired/expiring, includes more when the question is compliance-related; added to
     CONTEXT + a system-prompt rule. Degrades to 503 AI-off as before.
  3. **Compliance health on /insights** — new "Compliance by company" section: a stacked
     expired/expiring/valid bar per company + unassigned count (hidden when 0 docs).
  4. **Inbox "As document"** — new button in `inbox-list.tsx` → `/documents?newdoc=1&text=…`;
     `documents-table.tsx` reads the param, opens the create dialog with `initialExtractText`,
     and `document-form.tsx` auto-runs extraction once. URL params stripped after open.
  Typecheck clean; /documents, /inbox, deep-link all HTTP 200.

**Documents & Compliance feature COMPLETE (Phases 1–5).**

## Phase 6 — File reading (PDF + image OCR) & smarter extraction (2026-06-04)
Owner asked the auto-fill to read uploaded PDFs/photos and extract everything (dates,
person, company, etc.) across dynamic layouts. Researched first: confirmed Groq has a
**vision** model and `unpdf` is serverless-safe.
- **New dep `unpdf`** (pure-JS, zero native deps; in `next.config.serverExternalPackages`).
- **`extractDocumentFromFile(fd)`** in `app/documents/actions.ts`:
  - **PDF** → `unpdf` `getDocumentProxy`+`extractText` → Groq text model. If extracted text
    < 40 chars (image-only scan) → returns a note asking for a photo instead (honest boundary;
    no fragile serverless PDF→image rasterisation).
  - **Image** (png/jpg/webp/heic) → Groq **vision** `meta-llama/llama-4-scout-17b-16e-instruct`
    (base64 data URL). Client **downscales** images >3.5 MB to ≤2000px JPEG (Groq base64 limit
    is 4 MB).
  - AI-off: PDFs use rule extractor + entity scan; images return a note (can't OCR offline).
- **Entity resolution**: extraction now matches company/person names against records
  (`loadEntities`/`resolveEntity`/`scanEntities`) and returns `companyId`/`personId`, which the
  form selects auto-fill. Shared `extractPrompt` lists known company/people names so the model
  picks real entities. `coerceFields` validates + backfills from rules.
- **Form** (`document-form.tsx`): auto-fill panel gains "Upload a PDF or photo to read
  automatically" (+ existing paste-text). Uploaded file is also **attached** to the document via
  DataTransfer (no double upload). `applyFields` fills inputs + company/person selects + category.
- **New category "Passport"** (lead 180 days); rule extractor maps passport→Passport.
- Verified: generated text PDF → unpdf parsed → title "Dar Spices Trade Licence", ref, both
  dates, company id resolved. Typecheck clean.
- **NOTE:** image OCR needs the Groq key on (vision). Restart not needed beyond the earlier
  next.config change (serverExternalPackages added now → a fresh build picks it up).

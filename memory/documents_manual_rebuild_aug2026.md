# Documents — back to manual filing (Aug 2026)

The owner asked for the document intelligence to be stripped out: "it was really
messing with my work." Documents are now filed by hand. This is the record of what
went, what stayed, and what to be careful about if intelligence ever comes back.

## The decision

Four scoping answers from the owner:

| Question | Answer |
| --- | --- |
| Chat/task attachments | **Keep** auto-creating a document row (no AI naming) |
| Compliance (checklists, scores, gaps) | **Remove everywhere** |
| Expiry tracking (dates, warnings, reminders) | **Keep** — the owner types the date |
| Old code + tables | **Delete properly**, not park |

## What went

**Intake brain** — Dropbox connector (`/api/dropbox/*`, `lib/dropbox*.ts`, the Settings
card) and the `auto-sort` cron; the sorting desk, quarantine and Trash queues; confidence
badges; `buildDocTitle` automatic naming and the rename sweep; owner-guessing with its
learning loops (`owner_corrections`, `routing_corrections`); custom shelves; duplicate
detection (hash + Jaccard); renewal chaining (`-EXP` auto-archive); self-heal; re-scan;
split-document; scan capture/crop/narrate; extraction health; intake metrics; the `/inbox`
page and `/api/inbox` ingest route.

**The AI read** — Gemini OCR/vision on upload, `extractDocumentFields` /
`extractDocumentFromFile`, `doc-passages` (RAG), `doc-catalog`, `doc-correlation`,
`ocr-engines`, fact extraction from documents, the cloud-agent `extract` job kind
(`agent-context`/`agent-apply`/`agent-enqueue`), and document embeddings.

**Compliance** — `requirement_profiles`, `requirement_items`, `person_requirements`,
`company_requirements` and every surface that read them: the Documents page's compliance
cards and Needs-attention panel, the person drawer's Compliance view, the company profile's
summary card, the Registrations tab on Tax & Legal, the Director Brief's "Compliance watch"
and its HR `belowFullCount`, Home's compliance signal/pulse/queue, the org-chart compliance
ring, the People table's score column, the staff portal's checklist, the `find_missing` Ask
intent, `automation-gaps` (gap chasing), and the compliance half of `automation-reactions`.

**Profile suggestions** — `profile_suggestions`, `/suggestions`, the suggestion tray on
the person drawer and company profile, and the record half of the cockpit.

## What stayed

- **Expiry**: `deriveDocStatus` / `daysToExpiry` / `expiryLabel`, the tiered immigration
  cadence (`ALERT_CONFIG`), the daily renewal reminder, and the "Renew" action that creates
  a task deadlined at expiry. All driven by dates the owner types.
- **Full-text search**: `content_tsv` was rebuilt without `extracted_text` — it now indexes
  title, type, reference, issuer, category and notes. `search_documents` lost its body
  snippet and its `intake_state` filter.
- **⌘K search**: documents keep their `EntityDef`, but only its `search` half (a plain SQL
  ilike). They are no longer embedded, and nothing re-indexes them on write.
- **Chat/task/portal attachments**: still create a document row — file name as title,
  category "Attachment", no owner until edited.
- **Person pack**: kept, minus its compliance sections. `person-pack-builder.tsx` was
  rewritten as a purpose picker + "open pack" link.
- **Portal**: "Your documents" is now a plain list of the person's documents plus
  `portalUploadDocument` (files it under the person, nothing read).

## Migration 0114

Dropped 9 tables (`requirement_profiles`, `requirement_items`, `person_requirements`,
`company_requirements`, `owner_corrections`, `routing_corrections`, `profile_suggestions`,
`custom_shelves`, `extraction_cache`) and 15 `documents` columns (`supersedes_id`,
`review_status`, `needs_original`, `file_hash`, `vetted_at`, `compilation_id`, `page_range`,
`expiry_kind`, `intake_state`, `intake_reason`, `confidence`, `trashed_at`, plus the raw-SQL
`extracted_text` / `text_source` / `extracted_text_at`), then deleted 2,403 document rows
from `embeddings`.

**Gotcha that cost a first attempt:** `documents.content_tsv` is a GENERATED column whose
expression references `extracted_text`, so `DROP COLUMN extracted_text` failed until the
index + generated column were dropped first and rebuilt afterwards. Drizzle runs the file in
one transaction, so the failed run rolled back cleanly — nothing partial landed.

## The purge (done)

Two one-off scripts, both dry-run by default, `--yes` to act:

- `scripts/purge-old-documents.ts` — removed **1,025 rows** (868 trash, 153 quarantine, 4
  archived; all `archived = true`, which is why the page already looked empty) and their
  **796 storage objects**. Checked first that no `chat_messages` row referenced the documents
  bucket — none did.
- `scripts/purge-old-inbox.ts` — removed the dead email/WhatsApp intake: **689 `inbox` rows**
  and **221 objects** under the `inbox/` storage prefix.

Backups taken immediately before each: `backups/2026-08-04T16-54-55Z` and
`backups/2026-08-04T17-06-53Z`. Storage objects are NOT in those backups — the files
themselves are gone for good.

## ⚠️ `company-letterhead/` is company LOGOS — do not delete it

The prefix is named after the removed letterhead feature, but it holds the **13 live company
logo/branding objects** that `getCompanyLogoMap()` signs for the company avatars on Documents,
People, the Companies hub and the Director Brief. Deleting the folder blanks every avatar in
the app. Only one true orphan was removed (a superseded Terra Green logo). The two Cocozuri
`header_image_path` / `footer_image_path` objects are genuinely letterhead-only, but their
columns still point at them, so they were left alone.

The `documents` storage bucket now contains nothing else.

## The assistive read, rebuilt (same day)

Straight after the strip-out the owner asked for bulk upload with OCR back — the *reading*,
not the deciding. Rebuilt in the safe shape:

- **`src/lib/doc-read.ts`** — `readDocumentFile(file)` → `{ ok, fields, source, confidence, note }`.
  Reads Office/text directly, uses a PDF's text layer when it's genuine (`usableTextLayer`
  rejects CamScanner-style watermarks), else rasterises pages / decodes HEIC and sends them to
  Gemini vision. Returns title, docType, issuer, referenceNo, issueDate, expiryDate, notes.
- **`src/app/documents/read-actions.ts`** — the single server action. Reads and returns; writes
  nothing but a `doc-read` telemetry event.
- **`src/components/bulk-upload-dialog.tsx`** — rewritten: pick owner + category → drop files →
  read each → review in `DocumentForm` → Save & next / Skip → summary.
- **`DocumentForm`** gained one prop, `initialFields`, holding the AI's read as ordinary
  editable defaults.

What was deliberately NOT rebuilt: owner resolution, automatic naming, dedup, renewal chaining,
learning loops, quarantine, self-heal, embeddings. The model is never told who the companies
are, so misfiling is structurally impossible — the owner sets that for the batch.

Verified against real reads: a BRELA licence returned every field correctly (including
"12 January 2026" → `2026-01-12`); an invoice with a payment due-date returned
`expiryDate: null`; an unreadable file failed honestly with no invented fields.

## Forward rule

Intelligence may READ and SUGGEST. It must never move, rename, archive, hide or file a
document on its own. Anything that writes needs the owner to press a button. The owner's
objection was never to the capability — it was to the system acting without being asked.

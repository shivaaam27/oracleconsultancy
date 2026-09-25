# Documents — manual filing, now in Files (Aug 2026, current Sept 2026)

Documents are filed **by hand**. The document intelligence layer was removed in
Aug 2026 at the owner's request ("it was really messing with my work"). Since
24 Sept 2026 the library is **Files** (`/files`); `/documents` and
`/documents/[id]` only redirect there (`?co=` / `?pe=` / `?open=`). The Files
screens, folders, preview, upload and Deleted are described in
**`memory/file_manager_plan.md`** — read that for anything on screen. This file
is the record of what was removed, what survived, and the rule that governs it.

## The owner's four decisions (Aug 2026)

| Question | Answer |
| --- | --- |
| Task / portal attachments | **Keep** auto-creating a document row (no AI naming) |
| Compliance (checklists, scores, gaps) | **Remove everywhere** |
| Expiry tracking (dates, warnings, reminders) | **Keep** — the owner types the date |
| Old code + tables | **Delete properly**, not park |

## What went

- **Intake brain** — the Dropbox connector and `auto-sort` cron; the sorting
  desk, quarantine and Trash queues; confidence badges; automatic naming and
  the rename sweep; owner-guessing and its learning loops; custom shelves;
  duplicate detection; renewal chaining; self-heal; re-scan; split-document;
  scan capture; extraction health; `/inbox` and `/api/inbox`.
- **The automatic AI read** — OCR/vision on upload, field extraction on upload,
  document RAG passages, fact extraction from documents, the cloud-agent
  `extract` job, and document embeddings.
- **Compliance** — the four requirement tables and every surface that read them
  (Documents cards, person/company compliance views, Tax & Legal
  Registrations, the Director Brief's compliance watch, Home's signals, the
  org-chart ring, the People score column, the portal checklist, gap chasing).
- **Profile suggestions** — `profile_suggestions`, `/suggestions` and its trays.

**Migration 0114** dropped 9 tables (`requirement_profiles`,
`requirement_items`, `person_requirements`, `company_requirements`,
`owner_corrections`, `routing_corrections`, `profile_suggestions`,
`custom_shelves`, `extraction_cache`) and 15 `documents` columns (intake state,
confidence, file hash, renewal lineage, the OCR body…), and removed 2,403
document rows from `embeddings`. Purge scripts then removed 1,025 archived
document rows with 796 storage objects, and 689 dead `inbox` rows with 221
objects (backups `backups/2026-08-04T16-54-55Z`, `…T17-06-53Z`; the storage
files themselves are gone for good).

⚠️ `documents.content_tsv` is a GENERATED column. A column its expression reads
cannot be dropped until the generated column and its index are dropped first
and rebuilt after — 0114's first run failed on exactly this (and rolled back
cleanly).

## What stayed

- **Expiry**: `deriveDocStatus` / `daysToExpiry` / `expiryLabel`
  (`lib/documents/documents-shared.ts`), the tiered alert cadence, the daily renewal
  reminder, and "Make a renewal task" in the Files preview. All driven by dates
  the owner types.
- **Search**: `content_tsv` indexes title, type, reference, issuer, category and
  notes. In ⌘K documents keep their `EntityDef` for a plain SQL match only —
  **not embedded, not re-indexed on write**.
- **Attachments**: a file posted on a task update, from the portal, on a note
  or with an event still becomes a `documents` row — its own file name as the
  title, category **"Attachment"**, the company/person the context knew, nothing
  read or renamed (`ingestAttachmentDocument` in `src/app/documents/actions.ts`;
  notes and event papers have their own thin versions). Every creator goes
  through `createDocument`, which files into the right company/person folder.
- **Portal**: Profile → "My files" is a plain list of the person's documents
  plus `portalUploadDocument` (filed under the person, nothing read). The portal
  download route refuses archived rows and "Attachment" rows.

## The assistive read — suggest, never file

The owner asked for the *reading* back, not the deciding.

- **`src/lib/documents/doc-read.ts`** — `readDocumentFile(file)` →
  `{ ok, fields, source, confidence, note }`. Extraction is
  `lib/documents/file-extract.ts` (shared with the event reader): Office and text files
  are read directly; a PDF's text layer is used when genuine (`usableTextLayer`
  rejects scanner watermarks such as CamScanner); scans, photos and HEIC go to
  Gemini vision. Returns title,
  docType, issuer, referenceNo, issueDate, expiryDate, notes. Dates are accepted
  only as real ISO dates in a sane range, and a payment due-date is never an
  expiry. The model is **never told who the companies are**, so it cannot
  misfile.
- **Where it is used**: `readFileDetailsAction(id)` in
  `src/app/files/actions.ts` (`guardOwner`), behind **"Read it for me"** in the
  Files preview (`components/files/file-preview.tsx`). It downloads the stored
  file, reads it, fills only EMPTY boxes in the details panel, and **writes
  nothing** except a `doc-read` telemetry event. The owner saves.
- Retired with the move to Files: the old bulk-upload dialog
  (`bulk-upload-dialog.tsx`) and the unauthenticated
  `src/app/documents/read-actions.ts`.

## ⚠️ `company-letterhead/` in storage holds company LOGOS

The prefix is named after the removed letterhead feature, but it holds the live
company logo/branding objects `getCompanyLogoMap()` signs for every company
avatar. Deleting it blanks every avatar in Oracle.

## Forward rule

**Intelligence may READ and SUGGEST. It must never move, rename, archive, hide
or file a document on its own.** Anything that writes needs the owner to press
a button. His objection was never to the capability — it was to the system
acting without being asked.

# Document Intake Overhaul — June 2026

Owner-requested sweep fixing the bulk-upload / smart-intake pain points. Built **all at once**, **review-before-commit** for splits & duplicates. **PUSHED to master (commit 6ffae2d, 2026-06-15).** `tsc --noEmit` clean; `/documents` renders 200 in dev. Migration **0072** applied to the live DB (additive nullable cols only — safe; Vercel re-runs it on deploy).

## What the owner reported
1. After bulk upload, failed / unscanned files vanish — no way to fix them in the same pop-up.
2. In the edit form the attachment shows but only offers **Replace** — can't open/preview it; had to hunt locally.
3. Wanted clicking a title/row to open the file directly (keep existing buttons too).
4. "Run a check on why AI is failing."
5. Multi-page **compilations** (a recruit's scanned bundle = passport+CV+contract) → AI should read all pages and split into separate records, each keeping a link to the same source file.
6. **Duplicates** piling up (BS/PES business licences doubling) — re-uploads not flagged.
7. **Expiry** wrongly defaulted (created-date-as-expiry); not all docs expire (CVs, invoices, analytical).

## Root causes found (the "why is it failing" answer)
- Vision model `meta-llama/llama-4-scout-17b-16e-instruct` is **current/fine** — NOT the problem.
- Scanned PDFs only read **first 2 pages** → bundles & long scans truncated.
- HEIC rejected; images >4 MB rejected; AI-off fails every scan; confidence <0.55 or no-owner → needs_review.
- **Expiry bug (real):** `ruleExtract` fallback set "latest date found = expiry" → a CV's 2026 employment date became "expires 2026".
- Dedup ran **only in the single-file form**, matched **owner+category only**, **never** on bulk/auto-upload.
- **No preview component existed** anywhere; edit form attachment row had Replace/Remove only.

## What was built

### Schema (migration 0072) — `documents` table, all nullable
- `file_hash` — SHA-256 of stored bytes → catch identical re-uploads even under new name/owner.
- `compilation_id` + `page_range` — group documents split from one file; they **share one stored object**.
- `expiry_kind` — "yes" (genuinely expires) / "no" (no expiry by nature) / null.

### Data layer (`src/lib/documents.ts`)
- `uploadDocumentFile` now stores `file_hash`. New `hashBuffer`/`hashFile`, `attachStoredFile` (point a row at an already-stored file — for splits), `findDocumentsByHash`.
- `removeDocumentFile` now **won't delete a storage object another live row references** (protects shared compilation files).

### Brain (`src/app/documents/actions.ts`)
- **Expiry intelligence:** killed the "latest date = expiry" fallback. Prompt now returns `expiryKind` from doc TYPE (CV/invoice/report/minutes/etc = no; permit/visa/licence/insurance/lease = yes). `coerceFields` drops expiry when kind="no". Rule path classifies no-expiry types too.
- **All pages + compilation:** `MAX_VISION_PAGES` raised 2→8. Prompt returns a `parts[]` array when one file holds several distinct documents → `ExtractedSegment[]` on `ExtractResult`. Bigger token budget (1200 multi-page / 900 text).
- **Compilation split (review-first):** auto-upload files a detected bundle as ONE doc flagged needs_review (parts listed in notes, never auto-split). `detectCompilationForDocumentAction(id)` re-reads a stored file; `splitDocumentAction(id, segments)` splits — original row becomes part 1, siblings created sharing the file via `attachStoredFile`.
- **Real dedup everywhere:** `findDuplicateDocumentsAction({fileHash,referenceNo,title,category,owner})` matches on **identical-file / same-reference / similar-title**. Auto-upload **skips** an exact-hash duplicate (new status `"duplicate"`, points at existing — stops the pile-up). Form panel shows match reason + Keep both / Replace.
- **Existing-duplicate cleanup:** `findExistingDuplicatesAction()` clusters all live docs (hash / reference / owner+category+title — works on old rows without hashes). `backfillFileHashesAction(limit)` hashes old stored files in batches so exact-dedup works on them too.
- **Diagnostics:** every file read logs to `system_events` kind `doc-extraction` (source, confidence, `failKind`: no-key/heic/too-big/unreadable/unsupported/low-confidence, parts). `getExtractionHealthAction()` summarises last 200.

### UI
- **`components/doc-preview.tsx`** (NEW, reusable) — inline PDF/image preview via signed URL or a local File; click the name to preview, Open button for new tab. Used in the edit form (existing + just-picked file), and available app-wide.
- **`document-form.tsx`** — attachment row now has Preview + Open (was Replace-only); richer dup panel; **"No expiry — this type doesn't expire"** toggle + `expiryKind` hidden field; compilation banner ("looks like N documents — save then split").
- **`split-document-dialog.tsx`** (NEW) — editable split UI (HrmsDialog); opened from the documents-table peek **"Split into documents"** action (when a file is attached).
- **`bulk-auto-upload.tsx`** — results grouped Filed / Needs a look / Already on file / Couldn't read; every row **clickable** to open; bundle hint.
- **`bulk-upload-dialog.tsx`** — records per-file outcome (saved/skipped/failed); end-of-run **in-dialog summary** lists leftovers, click to jump back and fix.
- **`needs-review-panel.tsx`** — whole row clickable (kept Open/Confirm).
- **`extraction-health.tsx`** (NEW) — "AI reading health" card on `/documents` (collapsed): why reads failed/needed a look, friendly reasons, recent list.
- **`find-duplicates-button.tsx` + `duplicate-sweep-dialog.tsx`** (NEW) — "Find duplicates" on the Documents header → review clusters, pick which to keep, archive the rest (kept as history); "Fingerprint old files" runs the hash backfill.
- **`company-documents.tsx`** — document **title is now clickable** to open the file. Person-drawer rows were already fully clickable.

## Retro-fix for ALREADY-uploaded documents (commit 95a06d6)
The above only changes NEW reads. For the existing library:
- **Existing duplicates** → the "Find duplicates" sweep already scans all live docs (built in 6ffae2d). Press "Fingerprint old files" first so identical old copies are caught too.
- **Existing wrong expiries / missed reads** → new **"Re-scan documents"** tool on `/documents` (button beside Find duplicates): per-company, re-reads each stored file with the new brain and PROPOSES corrections — **propose-then-approve, nothing changes silently**. Headline = fix the old false-expiry dates (proposes clearing a bogus expiry when expiryKind="no"); also fills blank issuer/ref/dates/owner and flags already-uploaded bundles to split. Actions: `listRescanCompaniesAction` / `listRescanCandidatesAction` / `rescanDocumentAction` (reads, saves nothing) / `applyDocumentRescanAction` (whitelisted patch of approved fields). UI `rescan-documents-dialog.tsx` processes sequentially with progress + Stop; per-field checkboxes. Owner chose: propose-all + per-company scope.

## Still open / notes
- A `next build` wasn't run (heavy, needs 4 GB heap); `tsc` clean + `/documents` 200 in dev is the gate used.
- Backfill is batched (40/call) — for a big library the owner presses "Fingerprint old files" a few times.
- NOT pushed. Twin/portal: documents are admin-only; staff-portal "Your documents" upload path unchanged (separate `portalUploadRequirementDocument`).

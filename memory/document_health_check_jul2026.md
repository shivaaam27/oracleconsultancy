---
name: document-health-check-jul2026
description: Document Health Check panel — find failed/unread/unverified docs with no AI cost; live snapshot
metadata:
  type: project
---

# Document Health Check (8 Jul 2026) — PUSHED @c10a634

A zero-AI, egress-light audit of the whole document library so failed uploads can be
found WITHOUT re-uploading everything. Reads only structural DB columns (never
`extracted_text`), so it's cheap on egress and immune to AI mis-naming (keys off
structure, not titles).

- `src/lib/document-health.ts` — `getDocumentHealth()` buckets active docs:
  **noFile** (no stored file → re-upload), **noText** (`text_source` null/`ocr-empty` →
  re-READ, the ONLY AI step, on demand), **needsReview** (`needs_review` OR confidence
  <0.75), **duplicates** (by `file_hash`). Each `HealthItem` carries `companyId` for the filter.
- `getDocumentHealthAction()` in `src/app/documents/actions.ts` — on-demand only.
- `src/components/document-health-panel.tsx` — "Health check" button on the To Sort
  action row (`to-sort-panel.tsx`). Company filter (FluidSelect) scopes every bucket +
  the re-read. Re-read loops `ensureDocumentText(id, true)` over the FILTERED noText ids.
- `scripts/audit-document-health.ts` — reusable CLI audit (same query, prints counts).

**Live snapshot (8 Jul, 323 active docs):** 200 healthy · **5 noFile** (only ~2 real
failures — #592 MES_Operations, #1020 TerraGreen; the other 3 are `.ics`/`.txt`
calendar/email artifacts) · **95 noText** (a mix of correctly-filed-but-unindexed +
passport photos with little text) · **36 unverified** · **2 duplicate** items (1 group).

**Why re-uploading to find failures is the WRONG tool** (confirmed in code): `autoFileDocumentAction`
runs extraction (cache-keyed on `file_hash`) BEFORE the exact-hash dedup; a re-uploaded
file that's already on record → dedup → **Trash** (noise). Text PDFs hit the extraction
cache (no AI); scans/photos re-read (AI cost) — and an uploaded-but-UNREAD doc dedupes
against its own broken row, so re-uploading HIDES it. Health Check finds both from the DB.
**Limit:** a failure that left NO row at all (rare pre-fix double-crash) has no DB trace —
only a source-folder comparison finds those. See [[doc_intake_audit_jul2026]].

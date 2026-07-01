# Document Intelligence — reference (Jun 2026)

How the system reads, files, correlates, learns from and self-heals documents.
All of it is **deterministic on the free Groq models** (text `llama-3.1-8b`, vision
`llama-4-scout`); a stronger model is an optional later upgrade behind the
`aiHighQuality` toggle. Everything is best-effort (try/catch) — a failure never
blocks a document from filing — and grows automatically as data is added.

## The intake pipeline (every uploaded / Dropbox-pulled file)

`autoFileDocumentAction` (src/app/documents/actions.ts):

1. **Read the file** — `extractDocumentFromFile` → typed text (unpdf / mammoth /
   xlsx) or vision OCR for scans/photos.
   - **CamScanner / Adobe Scan / Tap Scanner / MS Lens** export image PDFs whose
     only text layer is the app watermark. `usableTextLayer()` rejects those (and
     near-empty layers) so the real scan is OCR'd, not skipped.
   - **HEIC** is converted to JPEG; **images >4 MB** are downscaled (`@napi-rs/canvas`)
     instead of rejected.
2. **Consistent name** — `buildDocTitle({owner,type,ref,date})` → "Owner · Type ·
   Ref/Year" on every path.
3. **Resolve the owner** (company OR person), in order — quarantine is the LAST resort:
   1. ID match — TIN/VRN/email-domain (`matchCompanyByIdentifiers`).
   2. AI read with **RAG context** (`extractPrompt` is given the KNOWN RECORDS:
      companies w/ aliases+legal name+TIN/VRN/code/email-domain; people w/ role+company).
   3. Fuzzy/legal-name (`resolveEntity` — legal_name folded into aliases; suffix-
      agnostic token overlap: "PINNACLE ENGINEERING SOLUTIONS LTD" → "PES Ltd").
   4. **Learned owners** (`owner_corrections`) — a past manual assignment.
   5. **Cross-document correlation** (`correlateOwnerByIdentifiers`) — a TIN/VRN/
      reference with no name inherits the owner of another doc/fact that shares it.
4. **Dedup** (`findSameLogicalDoc`) — same reference / same title / **same content**
   (Jaccard ≥0.7 of body words, any name or format). photo↔PDF → the PDF supersedes;
   else quarantine "Possible duplicate of #X".
5. **Renewal chaining** (`findRenewalTarget`) — a renewable doc that supersedes an
   OLDER same-type doc → `supersedes_id` set, old one renamed `-EXP` and moved to
   Trash for review (restorable, not deleted).
6. **File or quarantine** — filed runs: profile/fact **suggestions** (Smart-auto on
   clean reads, undoable), compliance reconcile, automation reactions, relationship
   facts. Quarantine = couldn't read / no owner / suspected duplicate / low confidence.

## Deeper reading & accuracy (Wave 4/5 upgrades, Jun 2026)

- **Two-pass confidence re-read** (`documents/actions.ts`) — when a first extraction
  comes back below `LOW_CONFIDENCE` (0.75) and AI is on, the system does **one**
  automatic retry along the stronger path: a text read is forced onto `GROQ_SMART`; a
  vision read steps to the **next model in the `GROQ_VISION` ladder** (skipping the one
  already used). It keeps whichever result is more confident, caches under the model
  that actually produced it (model-aware cache), and logs the first→second confidence to
  `system_events`. No-op when AI is off, the first read was already confident, there's a
  cache hit, or no stronger path exists. Best-effort and capped to a SINGLE retry so cost
  stays bounded.
- **Raised, env-overridable page caps** — long contracts/bundles are now read end to
  end. `MAX_VISION_PAGES` 8→**20** (override `DOC_MAX_VISION_PAGES`) and `MAX_OCR_PAGES`
  20→**40** (override `DOC_MAX_OCR_PAGES`), each clamped to 1–200.
- **Fact-ledger cross-check** (`src/lib/fact-checks.ts` `detectFactDiscrepancy`) — a
  freshly-read value is compared against the CURRENT fact before it is appended. The
  comparison is field-aware (identifiers like TIN/passport/bank matched verbatim,
  percentages folded to a fraction, director/shareholder lists compared as sets, all
  formatting-insensitive). On a real disagreement it logs a `fact-discrepancy`
  `system_event` and flags the document `needs_review` — it **never blocks the append**
  (the ledger stays append-only; the conflict surfaces for a human).
- **Richer owner correlation** (`src/lib/doc-correlation.ts`) — `correlateOwnerByIdentifiers`
  now matches on **phone, email, email-domain, bank account and address** (not just 6+-digit
  IDs), with **initials-aware person resolution** ("S. J. Manek" ~ "Samir Jayantilal
  Manek", conservative threshold). `emergency_contact_phone` is **deliberately NOT** used
  as an owner signal (it would mis-merge a staff member to their next-of-kin), and all
  ILIKE wildcards are escaped. Quarantine is still the last resort.
- **Intake accuracy dashboard** (`src/lib/intake-metrics.ts` `computeIntakeMetrics(30d)` +
  `components/intake-accuracy.tsx`) — an Aurora card on `/inbox` showing auto-filed %,
  how often the intake needed a human, corrections learned and discrepancies, with a
  trend.

## Self-learning (compounds with use)

- `routing_corrections` — owner re-categorises a doc → future similar docs follow.
- `owner_corrections` — owner assigns a doc's owner → future similar docs inherit it.
- `profile_suggestions` dismissals — stops re-proposing what you keep dismissing.
- `custom_shelves` — a genuinely new document type can become a new shelf (proposed).

## System health (silent-failure watchdog, in-app only)

`lib/system-health.ts` `checkSystemHealth()` knows every scheduled job's cadence
(cron.morning/snapshots/cleanup/reminders/email/reindex/auto-sort + AI doc-extraction
error-rate) and classifies each healthy/failed/stale/never from its `system_events`
rows. A dead-man switch flags the scheduler itself if nothing ran in 36h.
The morning-run cron is the watchdog: on any non-ok it logs a `system.health` event
→ shows in the Activity log. No email, no spend.

**One merged card** (`components/system-status-card.tsx`) on /inbox replaces the three
old housekeeping panels: a single collapsible "System status" card with a segmented
toggle **Automations · AI reading · Data checks** (each with a status dot; AI reading
embeds `ExtractionHealth bare`, Data checks renders the safety-net findings). Headline
= worst area; data-quality findings cap at "needs a look" (never "stopped working").
The old `system-health-panel.tsx` / `extraction-health` standalone / `safety-net-panel.tsx`
were folded in (first two deleted; ExtractionHealth kept with a new `bare` prop).

## Self-healing (nightly, in the morning-run cron)

`selfHealDocuments` finds filed docs the system previously mis-read (scanner
watermark text, or never-extracted) and re-OCRs them + fills a now-resolvable owner.

## Correlation & graph (read-only, no AI)

- **Related documents** (`getRelatedDocumentsAction`) on the doc edit form: same
  reference / renewal lineage / same source file / shared ID / same owner+type.
- **Relationship inference** (`lib/relationships.ts`) — directors/shareholders/
  secretary/signatories parsed from facts → matched to people; on the company Profile.
- **Entity knowledge graph** (`lib/entity-graph.ts`, page `/graph?type=&id=`) —
  traversable: people, **linked companies that share a director**, documents, facts,
  applications, compliance; person view = directorships, manager/reports, docs, facts.

## Verify queue (review-by-exception)

`/inbox` → **Verify** tab (first tab). One worklist of documents needing a decision,
from flags the intake already sets (`lib/verify-queue.ts` `getVerifyQueue`): **Couldn't
place** (quarantine, incl. suspected duplicates), **Unsure reads** (filed, confidence
<0.6 or needs_review), **No owner yet** (filed, no company/person). Checkbox select +
per-group "Select all" → a sticky **bulk bar**: Confirm (`bulkConfirmVerifyAction` —
files quarantine, clears review on filed), Assign owner (`bulkAssignQuarantineAction`),
Bin (`bulkTrashQuarantineAction`), Export CSV. Quarantine was FOLDED IN here (its old
tab + `needs-review-panel.tsx` removed); **Trash stays a separate tab** (the decided
bin). Empty state = "all caught up".

## Confidence (the "unsure, please check" lane)

Every AI read stores its `confidence` (0–1) on the document (`documents.confidence`,
migration 0093). `ConfidenceBadge` (`components/confidence-badge.tsx`): ≥1 human-
confirmed "Confirmed", ≥0.6 "High confidence", <0.6 amber "Please check". Low reads
also set `review_status=needs_review` → the Needs-review lane on /inbox (badge shown
there + on the doc edit form + as an amber chip in the documents list). Confirming a
doc bumps confidence to 1.

## Compliance

`requirements.ts` / `company-requirements.ts` — per-owner checklist, score, band.
"Draft chase" (`draftComplianceChaseAction`) drafts a missing+expired request (with
the reason for each) into the Outbox for review (never auto-sent); "Email now" sends.

## Tables (migrations 0090–0093)

`profile_suggestions` (ask-first record proposals + Smart-auto log), `routing_corrections`
(category learning), `custom_shelves` (Part D), `owner_corrections` (owner learning).
Plus existing: `documents` (supersedes_id, reference_no, extracted_text, intake_state),
`facts`, `automation_events`, `pipeline`, `embeddings` (semantic search, ON).

## Safety / growth

- All data-driven → adding companies/people/docs is picked up automatically.
- Confidence stays conservative; correlation/learning reduce false quarantines
  rather than lowering the bar.
- Guardrails: `npm exec tsc --noEmit` + `npm test` (74 tests) before every change;
  migrations with `npm run db:backup` first.
- Scale note: the entity-graph shared-director scan + some in-memory document
  filtering are fine at current size; revisit with indexes at tens of thousands of docs.

## Layered OCR — Groq-free document reading (2026-07-01, built+verified, NOT pushed)
Owner asked for OCR that works "even without Groq" (Groq vision retires 17 Jul) and
chose the LAYERED option. Scan-reading now degrades gracefully instead of dying.
- **New `src/lib/ocr-engines.ts`**: `cloudOcrTranscribe` (OCR.space, env `OCRSPACE_API_KEY`,
  inert until set — free tier ~25k/mo, always-on, no host) + `tesseractTranscribe`
  (Tesseract.js, eng+swa, in-site, no key/bill, offline floor) + `disposeOcr`. Both take
  a data-URL/Buffer page image → text. Lang models cache to `os.tmpdir()`
  (`TESSERACT_CACHE_PATH` override) — NOT repo root; Vercel-safe (read-only fs except /tmp).
  `*.traineddata` gitignored.
- **`documents/actions.ts`**: `ocrDocumentText` no longer early-returns without a Groq key;
  new `transcribePageLayered(img, apiKey)` = Groq vision (if key, best here) → cloud OCR →
  Tesseract. Fallback path caps pages via `DOC_FALLBACK_OCR_PAGES` (default 10) since
  Tesseract/cloud are slower; disposes the Tesseract worker after a keyless batch.
- Full chain incl. the async ORI worker (Claude vision, PC-on, best) which already reads
  scans via signed URL in `agent-context.ts` gatherExtract. So: ORI worker → Groq vision →
  cloud OCR → Tesseract. Tesseract = the guaranteed floor.
- NOTE: OCR = pixels→text only. The UNDERSTANDING step (owner/dates/type) still uses Groq
  TEXT (`gpt-oss`, NOT retiring) or the ORI worker/rules. dep added: `tesseract.js`.
- Verified: tesseract reads EN + Swahili at ~95% on rendered test images; cloud layer
  correctly inert without a key; tsc clean; dev build clean (only offline Google-Fonts warns).

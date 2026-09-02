# Deep Audit — Documents, Compliance, ORI & Intelligence (2026-07-02)

**UPDATE 2026-07-03: Phases 1–5 + the UI-redesign core are ALL BUILT, VERIFIED
AND PUSHED to master** (the per-phase "(local, uncommitted)" notes below were
accurate when written; ignore them — everything shipped). Also shipped after the
audit: the Gemini provider swap + all AI-reliability fixes + the ⌘K search
upgrade — see [[ai_provider_gemini]] and [[ori_search_and_ai_reliability]].
Deferred: the fuller UI redesign (Files-tab split / hide-empty-shelves) with the
owner watching a live preview. The cloud-agent finding below is now ADDRESSED
(migration 0106 + audit trail + canAutoSend + dispatcher heartbeat).

**Status (original): AUDIT COMPLETE.** Read-only 50-agent deep audit
(16 grounded readers + adversarial verify + 2 design agents). This file is the
durable handoff so the fix pass could execute without re-auditing.

## Scoreboard
- 123 findings: 6 critical, 30 high, 43 medium, 44 low.
- Serious findings adversarially re-checked against the code: **31 CONFIRMED, 1 REFUTED**.
- The single REFUTED item: "owner-learning fingerprints don't line up" — the
  cross-company generic-token misfile variant IS confirmed; the "never lines up"
  claim was overstated. Treat owner-learning as "works but too generic", not broken.

## The two hard, time-boxed risks (do first)
1. **Groq vision model (llama-4-scout) shuts down 2026-07-17 (~2 weeks).** The
   document CLASSIFICATION path calls groqVision alone with NO OCR fallback
   (actions.ts:3147, 3179). When it dies, every scanned PDF / phone photo stops
   auto-filing (no owner/type/expiry/compliance) — only typed PDFs/Office keep
   working. FIX = wire the existing layered OCR (transcribePageLayered: OCR.space
   -> Tesseract) into the classification path, then run its text through
   fieldsFromText, exactly as typed PDFs do. Add an ocrSpaceApiKey Setting
   (env-only today; the documented in-app setting was never built and OCR.space
   is almost certainly OFF right now). This is Phase 1 and is date-forced.
2. **Portal/chat/task uploads bypass the document brain** (owner's #1 concern —
   "fully rely on the system"). Chat attachments NEVER become documents at all
   (invisible to Documents centre, search, compliance, trace, profiles). Task /
   completion-proof attachments become bare "Attachment" docs (no type, no owner
   resolution, no dedup, no dates, no compliance, no in-file text). Portal profile
   uploads mark compliance GREEN instantly with no admin check and no dedup. FIX =
   one shared intake entry point (ingestDocument) that ALL doors call.

## OWNER RULE (confirmed 2026-07-02) — keep-in-place AND also-file
When a file is uploaded through a non-admin door (chat, task/proof, portal profile,
request), it MUST stay visible where it was posted for that person's reference AND
also flow into the command-centre intake. Non-negotiable behaviour:
- **One file, two doors — never a second physical copy.** The Document becomes the
  system-of-record; the chat bubble / task thread references it by `documentId`
  (store it on the attachment JSON). Do NOT keep a separate chat-storage object and a
  separate document object for the same file — point the bubble at the filed doc (or,
  if unified storage is impractical in Phase 2, at minimum dedup by hash so no
  duplicate Document row is created and the two never diverge).
- **Non-blocking.** Intake runs in the background after the message/attachment is
  saved; a slow read must never delay the chat send or the task update.
- **Intake outcome never removes the in-place reference.** Filed OR quarantined
  ("Needs you" tray), the chat/task copy stays exactly where the person posted it.
- **Dedup across doors.** If the file was already filed elsewhere, link to the
  existing Document (hash match) instead of creating another.
- **Survives chat deletion.** Soft-deleting the chat message must not delete the
  Document (system-of-record persists).
- Add a small "filed in Documents" affordance on the bubble (admin/owner view) so the
  command-centre record is one tap away; portal stays scoped as today.

## Why image-1 / the compliance page looks wrong (owner asked specifically)
- **Same generic 18-item list on every company.** COMPANY_DEFAULT_ITEMS is
  conditional on only two flags: VAT (inferred from a typed VRN) and
  "sector_regulated" — and sector_regulated has NO UI and is hard-set for PES Ltd
  alone by a one-off migration. So every company gets the identical statutory list.
  FIX = add explicit "VAT registered" + "Regulated sector" toggles (and ideally a
  per-company compliance profile: food/TFDA vs construction/CRB vs general trading)
  on the company Profile form; drive applicableCompanyItems off explicit flags.
- **0 verified even where docs exist (two separate causes):**
  (a) Unseeded companies fall through to synthDefaultScore, which ignores VAT/sector
  rules and matches docs only by broad CATEGORY (not the catalogue type) — this is
  why the portfolio panel shows every company 0% / identical "12 missing". FIX =
  guarantee ensureAllCompanyRequirements runs (idempotent) and delete the synth path.
  (b) Deterministic auto-verify only fires when a doc's FILENAME/title contains a
  catalogue keyword; a correctly-classified-but-badly-named scan ("Scan_2093.pdf")
  won't link and stays "missing". FIX = trust a stored doc_type/category from intake
  in the deterministic pass instead of re-deriving from the filename.
- **Portfolio/Home/Brief use weaker matching than the per-company checklist**, so
  the numbers can disagree. FIX = one shared deterministic-link helper used by both.
- Catalogue gaps that starve compliance: sector permits (TFDA/TBS) point at a
  non-existent companyReqKey so a food permit can NEVER tick a box; government
  receipts (WCF/NSSF/PAYE) mis-file as generic "Transaction Receipt" (drop the bare
  "receipt" alias). Missing TZ types: tax control-number/demand note, title deed,
  customs/import clearance, council levy, EWURA/TCRA sector licences.

## "Couldn't place" / quarantine (owner asked to fix this tightly)
- **Daily auto dedup sweep can silently pull a VETTED, filed doc back into
  quarantine** using weaker logic than intake's own near-dup guard — a shared
  registration/control number (very common in TZ: incorporation cert + BRELA search
  share the reg no.) triggers it. FIX = reuse findSameLogicalDoc guards + EXCLUDE
  vetted_at IS NOT NULL from auto-quarantine.
- **The recovery tools exist but have NO buttons** — retryQuarantineAction,
  reviewFalseDuplicatesAction, fileFromQuarantineAction are script-only. FIX = wire
  them into the Verify tab; add a dedicated "Couldn't place" view grouped by reason.
- Phone-camera generic names (IMG_1234) skip the name-guard, so two staff members'
  filled-in standard forms can be flagged duplicates of each other.
- Quarantined docs are archived -> invisible to search/ORI unless "Include history".

## Phased build order (execution plan)
**Phase 1 — before 17 Jul (date-forced): ✅ DONE 2026-07-02 (local, not committed/pushed).**
 Built + verified end-to-end by simulation (GROQ_VISION_MODELS=dead model → OCR→text-model
 classified a fake licence scan perfectly, conf 0.97; vision-alive regression run returned
 source:vision + the new transcript). tsc clean, 161/161 tests pass. What shipped:
 - `extractFromPageImages` (documents/actions.ts, after groqVision): the one scan-reading
   ladder for BOTH the scanned-PDF and image branches — vision fields (while alive) +
   layered page transcript (Groq→OCR.space→Tesseract, caps DOC_INLINE_OCR_PAGES=6 /
   DOC_FALLBACK_OCR_PAGES=10) → vision-dead/AI-off falls to fieldsFromText on the OCR
   text (rules-only OCR reads forced needsReview=true). Returns fullText+textSource:"ocr"
   → deriveFiling/correlation/uploadDocumentFile-cache all see body text now.
 - applyIdFirstCompany now also runs: on the vision path (vs transcript) and on ALL
   rules fallbacks in fieldsFromText/extractDocumentFields (TIN/VRN match without AI).
 - autoFileDocumentAction persists res.fullText via setDocumentText right after upload
   (filed AND quarantined docs searchable-inside immediately; nightly sweep = re-reads only).
 - `ocrSpaceApiKey` setting (settings.ts type/default/KEY ai.ocrSpaceApiKey/parse +
   getOcrSpaceKey/getOcrSpaceKeyPreview) read by cloudOcrTranscribe (env fallback);
   Settings → AI & Voice card has the "Scan-reading key (OCR.space)" field (masked,
   write-only-when-typed + remove, added to the section's __keys). OWNER STILL NEEDS TO
   PASTE AN OCR.SPACE KEY (free, ocr.space/ocrapi) — without it Tesseract floor works but slow.
 (Original spec: OCR fallback in classification path + ocrSpaceApiKey setting; vision
 branch returns fullText + central applyIdFirstCompany; persist text at intake.)
**Phase 2 — close the invisible-document holes: ✅ DONE 2026-07-02 (local, uncommitted).**
 tsc clean + 161/161 tests + behavioural sim (a chat-uploaded cert with NO owner hint was
 auto-classified "Certificate of Incorporation", house-titled "TerraGreen_Certificate-of-
 Incorporation_…", owned to Terra Green, and a re-upload de-duped to the same doc id).
 - New shared seam `ingestAttachmentDocument(opts)` in documents/actions.ts: FAST path
   (hash-dedup → createDocument w/ context owner → attach existing OR upload bytes →
   optional linkDocumentTask → return documentId) + SLOW path `enrichAttachmentDocument`
   via `after()` (falls back to inline when no request scope, e.g. cron/scripts): reads
   through the brain, deriveFiling (house title/type/category/expiry), owner = file's own
   read if it self-identifies else the context owner, setDocumentText, reconcileOwnerCompliance.
   `existingStoragePath` opt = point the doc at the caller's already-uploaded object (chat)
   so it's ONE physical file, two references. `mode:"staff-review-first"` → needs_review.
 - Call sites routed through it: admin chat + portal chat postMessage (documentId on the
   attachment JSON; same stored object), admin task update + portal task update + portal
   completion-proof (createTaskAttachment DELETED from lib/documents.ts), admin + portal
   request attachments. Chat/task references stay in place; message deletion never deletes
   the doc (system of record).
 - Portal profile checklist upload (portalUploadRequirementDocument): now hash-dedups per
   person, deriveFiling sets docType/expiry, reviewStatus="needs_review" (staff self-upload
   → admin Verify glance, no silent green). Requirement still links as "received".
 - Fixed request-attachment 403: authorise via isRecipient() not the dead addressee_id
   (multi-recipient requests blocked legit recipients).
 STILL TODO in this area (deferred, not blocking): true single-copy storage for chat isn't
 universal (portal already double-copied historically — the seam does single-copy for NEW
 chat posts via existingStoragePath); uploader-person attribution on task attachments kept
 conservative (company context, brain resolves person if the file is clearly personal);
 "submitted scores 0 until verified" compliance-scoring change deferred to Phase 4.
 (Original spec: extract ingestDocument + resolveOwner unify 3 drifted owner-resolution
 copies + person-vs-company owner-type guard — the resolveOwner unification + owner-type
 guard remain for Phase 3; the attachment seam is done.)
**Phase 3 — resolution correctness: ✅ DONE 2026-07-02 (local, uncommitted).** tsc clean +
 168 tests (7 new pure-guard tests in doc-catalog.test.ts). What shipped:
 - Unique-owner rule on ALL correlation paths (correlateOwnerByIdentifiers +
   correlateByContactIdentifiers): new uniqueOwnerOf() — a numeric/reference/fact/bank/
   body-text identifier resolves an owner ONLY when exactly one entity shares it (mirrors
   the phone/address rule); bare numeric floor raised 6→7 digits (labelled referenceNo
   still 4+); reference match now exact (.eq) not .in.
 - Renewal-chaining corroboration (findRenewalTarget, now takes incomingName): same
   type + older date is no longer enough — a candidate must be subject-COMPATIBLE
   (same person/premises/product); and when the incoming has no distinctive subject
   AND >1 older same-type doc exists, it refuses to chain (won't retire the wrong lease).
 - Daily dedup sweep (autoSweepLibraryDuplicatesAction + findExistingDuplicatesAction now
   select vetted_at + raw ref/expiry): skips vetted_at IS NOT NULL rows (never yanks a
   reviewed doc back to quarantine), and a same-reference cluster member is only treated as
   a duplicate when sameLogicalDocPair(keep,d) holds (shared reg/control number no longer
   collapses an incorporation cert vs a BRELA search).
 - Owner-learning (owner-corrections.ts rewritten): signatureTokens() strips 4-digit years
   (renewals keep the same fingerprint); GENERIC_DOC_WORDS + hasDistinctiveToken() — a
   signature made only of generic words ("business licence certificate") is NOT learned and
   NOT matched (kills cross-company misfile); learnedOwnerFor resolves nobody on an owner
   TIE; recordOwnerCorrection no longer DELETES sibling lessons for other owners.
 - New shared pure guards moved to doc-catalog.ts (client-safe, unit-tested): subjectTokensOf,
   subjectCompatible, sameLogicalDocPair, LogicalDocLite — reused by near-dup + renewal + sweep.
 DEFERRED (deliberate): owner-TYPE auto-quarantine guard — would quarantine person-owned docs
 (contracts) when the staff member isn't a person-record yet (common here), ADDING friction;
 revisit once intake can propose a person. resolveOwner unification of the 3 drifted copies
 (retry/self-heal use a weaker copy) — a simplify, not a correctness bug; left for later.
 confirm-to-learn (record a low-weight correction on accept) + bulk-assign-thin-metadata skip
 — low severity, deferred.
 (Original spec: unique-owner correlation; renewal corroboration; daily-sweep guard + vetted
 exclusion; owner-learning stable fingerprints + confirm-to-learn.)
**Phase 4 — compliance fix (image 1) + catalogue polish: ✅ CORE DONE 2026-07-02 (local, uncommitted).**
 tsc clean + 172 tests (4 new catalogue tests) + behavioural sim PASS (per-company required
 counts differ 12/13/17 by VAT/sector; a badly-named "Scan_2093.pdf" whose stored doc_type is
 "Business Licence" auto-verified the licence requirement — the Task-12 fix). What shipped:
 - ONE shared linker `linkDocsToRequirements` (company-requirements.ts) used by BOTH
   getCompanyChecklist AND buildCompanyRequirementScores (portfolio/Home/Brief) → the numbers
   now AGREE (they used different matchers before). Deterministic catalogue-type pass (→verified)
   then fuzzy for non-catalogue only (→received); catalogue-owned req with no type stays missing.
 - `docCatalogueReqKey` trusts the STORED doc_type when the filename has no keyword (Task 12) —
   a correctly-classified but badly-named scan now links + auto-verifies.
 - synthDefaultScore rewritten: unseeded companies scored against their APPLICABLE items
   (respects VAT/sector, not the whole generic 18) using the same deterministic linker — so
   Home/Brief agree with the detail even before a company's File tab is opened.
 - Regulated-sector TOGGLE on the company Profile form (companies.sector_regulated, col already
   exists from 0104 — NO migration) → drives applicableCompanyItems; saveCompanyProfileAction
   calls new syncCompanyRequirementApplicability (adds newly-applicable items, hides no-longer-
   applicable ones without a filed doc, re-surfaces on re-enable). VAT stays VRN-driven with
   clearer help text.
 - Catalogue: dropped bare "receipt" alias + fixed dead "m-pesa"→"m pesa"; classify tie-break
   prefers a type with companyReqKey; Swahili aliases (leseni ya biashara, mkataba wa ajira,
   hati ya usajili, kibali cha kazi, mkataba wa pango); removed the ORPHANED sector-permit
   companyReqKey (pointed at a non-existent seed item — a food/TFDA permit now files clean +
   fuzzy-links to a company's own "TFDA permit" requirement when added).
 DEFERRED (need a migration + backup, or are UI/larger scope): explicit vat_registered column
 (kept VRN-driven for now); per-sector compliance PROFILE (food/TFDA vs construction/CRB — the
 proper fix so a food company gets TFDA not CRB); the "Needs you" review-tab + wired recovery
 buttons (retryQuarantine/reviewFalseDuplicates) — UI work; _NEEDORIG/-OLD suffix, already-
 expired flag, not-a-document, locked/corrupt detection — intake polish, low severity.
 (Original spec: "Needs you" tab + VAT/sector toggles + kill synthDefaultScore + trust stored
 doc_type + shared match helper + catalogue fixes.)
**Phase 5 — scale + hygiene: ✅ DONE 2026-07-02 (local, uncommitted).** tsc+172 tests.
 - `selectAllPaged` helper (db-helpers.ts) → paginated allRows + removeOrphans
   (embeddings-reindex.ts) + coverage-audit indexedCount past the 1000-row PostgREST cap.
 - backfillCompanyProfileFromDocument (company-profile.ts) now reindexEntity("company")
   after filling TIN/VRN/registration (searchable same-day, not next night).
 - Chat 20MB per-file cap on both postMessage actions; shared safeFileName +
   MAX_UPLOAD_BYTES in documents-shared.ts (dropped the 3 audit-flagged copies:
   documents.ts + both chat actions; 5 other copies left as a later cleanup).
 DEFERRED: side-effect error telemetry (the swallowed intake catches) — low severity.
**UI redesign — ✅ CORE DONE 2026-07-02 (local, uncommitted), tsc-verified (NOT pixel-
 verified — a dev server was already running in-folder so preview tools couldn't drive it;
 that server DOES serve these changes via HMR).**
 - Documents page: removed the standalone ExpiryRadar (duplicate + only non-Aurora box);
   subtitle trimmed to "N tracked" (glance counts live once in the compliance panel hero).
   Now = ComplianceScorePanel (ring + 4 stats + worst-first owner list + drawer) +
   NeedsAttentionPanel (expiry Chase/Renew/Send-notice + missing + leave) + DocumentsTable
   = the approved 3-section mockup.
 - Company page: dropped the duplicate Compliance StatTile (ComplianceSummaryCard owns it;
   6→5 tile grid) + removed CompanyKeyDocuments from Profile (statutory numbers were shown
   3×; the checklist is the single home). Checklist is COMPACT by default — shows only
   actionable items (missing/expired/expiring/requested/received) with "Show all N
   requirements" toggle + a calm "everything in order" line; kills the 17-row wall of red.
 DEFERRED (bigger/nav-risk, do with the owner watching a preview): the dedicated Files tab
 split; hide-empty-shelves + per-shelf Add-button removal; full merge of the two Documents
 panels into one. CompanyKeyDocuments component + buildCompanyKeyDocuments now dead (unused).

## Other confirmed high-value fixes (by area)
- **Search:** multi-word query + one small typo returns NOTHING (loosen the all-tokens
  gate to allow 1 missing token; extend typo tolerance to 3-char words). Tasks (biggest
  data set) get a crude un-ranked substring filter — give them the real scorer. Plain
  searches starting with add/show/open/set/create get hijacked as commands on Enter.
- **Indexing:** nightly reindex + orphan sweep + coverage audit all silently see only the
  first ~1000 rows per type (paginate). Fact-extraction patches don't reindex the
  person/company (searchable only next night).
- **ORI Ask:** "when does X's licence expire" ignores the named company and can return the
  WRONG entity's date (trust problem). Every question scans ALL documents + recomputes ALL
  compliance (gate it). Governance synonym expansion pulls unrelated staff + their passport
  numbers into the AI prompt.
- **Cloud agent:** claim_next_ai_job RPC is hand-typed into the live DB, NOT in a migration
  (clean deploy breaks the queue). AI actions leave NO audit trail and NO undo despite the
  docs promising both. AI sends skip canAutoSend. Re-read of a hard doc skips naming/dedup/
  compliance. Whole feature unshipped/unpushed.
- **Guardrails:** the AI monthly spend cap can NEVER fire (all cost rates are 0 -> spend
  always 0 vs cap). AUTO_HARD_DELETE_FORBIDDEN is defined but never called. The email cron
  is falsely reported broken + "self-repaired" every single day. Un-pausing Tax & Legal
  resets a SHARED date baseline -> renewal/notice/probation tasks due during the pause are
  silently never created.

---

# APPENDIX A — Self-Healing Scenario Engine (intake) design

# The Self-Healing Scenario Engine for Document Intake

## 1. Guiding principle (one line)

**Every document that enters the system, through any door, gets read, named, owned, de-duplicated and compliance-checked by ONE brain — and anything the brain isn't sure about lands in ONE "Needs you" tray with a one-tap fix that also teaches the brain, so the owner never fixes the same thing twice.**

*Engineer:* There is exactly one intake entry point — `ingestDocument()` — that wraps `extractDocumentFromFile → resolveOwner → dedup/renewal → file/quarantine/trash → side-effects`. Chat, task, portal, request, inbox and Dropbox uploads all call it with a `mode` preset. Uncertainty is expressed as `intake_state = "quarantine"` with a machine-readable `reason_code`; the Verify tray renders one-tap resolutions per `reason_code`; every resolution writes an `owner_correction`/`routing_correction`.

---

## 2. Scenario → behaviour table

Plain English first; the code location is where the change lands.

| # | Scenario | Current behaviour (grounded) | Desired automatic behaviour | Where the code goes |
|---|----------|------------------------------|------------------------------|---------------------|
| 1 | **Scanned photo / image PDF with a tax number (TIN/VRN)** | ID-first match runs only on the text path (`actions.ts:2785, 2905`); the vision branch (`actions.ts:3147–3155, 3179–3187`) returns `coerceFields` with **no** `applyIdFirstCompany` and **no** `fullText`. So the most common intake leans on the AI guess and over-quarantines. | Vision branch returns the transcribed pages as `fullText` and routes fields through the same `applyIdFirstCompany` + `scanEntities` backfill the text path uses. Tax-number owner match works on scans. | `extractDocumentFromFileInner` — make both vision returns `{ ...coerce, fullText: <transcript>, textSource:"ocr" }` and call `applyIdFirstCompany(fields, fullText)` once centrally in `extractDocumentFromFile`. |
| 2 | **Any auto-filed document → instant search + correlation** | Filed branch (`actions.ts:479–530`) uploads the file but never persists `res.fullText`; body text waits for nightly `selfHealDocuments(limit=20)`. Search-inside, cross-doc correlation and facts are blind at intake. | On `finalState==='filed'`: if `res.fullText` → `setDocumentText(id, fullText, textSource)` then `reindexEntity('document', id)`; else fire-and-forget `ensureDocumentText(id)`. Zero extra AI cost. | `autoFileDocumentAction`, after `uploadDocumentFile` at `actions.ts:479`. |
| 3 | **Vision model dies (17 Jul 2026)** | Classification path calls `groqVision` alone, no OCR fallback (`3147`, `3179`). When it 503s, every scan lands "Couldn't read that scan" with no owner/type/expiry. | When `groqVision` is not-ok **or** no vision key/model → OCR page images via `transcribePageLayered` (OCR.space → Tesseract) into text, then run that text through `fieldsFromText`, exactly as typed PDFs do. Owner/type/expiry survive with zero vision. | New branch in `extractDocumentFromFileInner` PDF + image sections; add `ocrSpaceApiKey` setting with `process.env.OCRSPACE_API_KEY` fallback. **Ship before 17 Jul.** |
| 4 | **Bundle of several documents in one PDF** | `f.segments` detected; filed as one doc flagged `isCompilation`, held for review with parts in notes (`actions.ts:415–431`). Correct + safe. | Keep. Add: surface the "looks like N documents — split" action on the quarantine card (`splitDocumentAction` already exists) so it's one tap, not a script. | Verify-tray wiring only. |
| 5 | **Several documents in one PHOTO** | Only one image sent; usually filed as a single doc. | Strengthen the vision prompt to report multiple distinct headers/reference numbers as segments; expose the same "split" tap on any quarantined image regardless of `segmentCount`. | `extractPrompt` + Verify tray. |
| 6 | **Exact same file re-dropped** | Hash dedup → Trash row sharing the stored object, visible + undoable (`actions.ts:298–310`). Correct. | Keep as-is. | — |
| 7 | **Photo now, better PDF later (or vice-versa)** | `findSameLogicalDoc` → `formatSupersede`: photo↔PDF pair auto-resolves, better format wins (`actions.ts:396–410, 676–678`). Correct. | Keep. | — |
| 8 | **Renewal of a licence/permit** | `findRenewalTarget` chains older→Trash on **same type + older date only** (`actions.ts:586–611`). Can trash the wrong copy when two genuine same-type docs exist (e.g. two leases). | Require a corroborating signal before chaining: matching reference **OR** compatible subject tokens **OR** high content overlap (reuse `findSameLogicalDoc`'s guards) **and** same person for person-scoped types. Skip when the owner has multiple non-corroborating same-type live docs. | `findRenewalTarget` — import the subject/ref/content guards from `findSameLogicalDoc`. |
| 9 | **Already-expired document uploaded** | Filed silently; expiry read but no "you're non-compliant now" flag. | File it, but if catalogue `expires===true` and `expiryDate < today` → soft flag `reviewStatus` note "Already expired on filing" + `recordEvent`, so the renewal radar/Brief surface it immediately. | `autoFileDocumentAction`, filed branch. |
| 10 | **A person's document that prints the employer TIN** | ID-first company match is an absolute override; can yank a person-owned doc onto the company and blank the person. | Only let ID-first company win when **no person resolved** OR catalogue `ownerType` is `company`/`either`. If a person resolved and the type is person-owned, keep the person; treat company TIN as context. | New `resolveOwner` helper (see §3), gated on `filing.ownerType`. |
| 11 | **Shared bank account / reference / control number** | `correlateOwnerByIdentifiers` (`actions.ts:2273–2317`) takes the **first** match for the by-ref / fact / body paths (unlike phone/address, which require uniqueness at `2383–2384`). Can mis-own. | Apply the unique-owner rule to numeric/reference/fact/bank paths: collect distinct `(companyId,personId)` owners, resolve only when exactly one; raise bare-numeric floor above 6 digits or require a keyword cue. | `correlateOwnerByIdentifiers` + `correlateByContactIdentifiers` bank branch. |
| 12 | **Correction should teach the next similar doc** | Learned-owner keyed on `title + issuer + docType` (`actions.ts:348`), but the stored fingerprint is built from the display title, which differs after `buildDocTitle` renaming — audit says it often fails to line up. | Key learning on stable fields only: `distinctiveTokens(issuer + catalogue typeKey)`, drop the title; strip 4-digit years so renewals keep the same fingerprint. Require ≥1 distinctive non-dictionary token + unique owner (mirror §3). | `owner-corrections.ts` — `distinctiveTokens`, `recordOwnerCorrection`, `learnedOwnerFor`. |
| 13 | **`_NEEDORIG` hand-tagged file (photo standing in for an original)** | Tag stripped as noise; `needsOriginal` only set when the AI decides. Documented convention not honoured. | `deriveFiling`/`parseConventionalName` detects `_NEEDORIG`/`_NEEDID` → `filing.needsOriginal`; `autoFileDocumentAction` sets `input.needsOriginal ||= filing.needsOriginal`. | `doc-catalog.ts` + filed branch. |
| 14 | **`-OLD`/`-VOID` superseded copy** | Straight to Trash if the word appears anywhere in base name (`actions.ts:450` via `isOld` at `doc-catalog.ts:155`). "Old Post Office" could be auto-trashed. | Require the marker as a **trailing suffix** (the convention is `..._-OLD`), anchored to the end of the base name, or co-occurring with a recognised catalogue type. | `doc-catalog.ts` `isOld` regex. |
| 15 | **Swahili-titled document** | Catalogue is English-only; falls through to generic "Letter". | Add Swahili aliases to high-value types (`leseni ya biashara`→business-licence, `mkataba wa ajira`→employment-contract, `hati ya usajili`→incorporation, `kibali cha kazi`→work-permit). Cheap + deterministic. | `DOC_CATALOG` alias arrays. |
| 16 | **Government receipt (WCF/NSSF/PAYE)** | `transaction-receipt` has bare alias `"receipt"` (`doc-catalog.ts:66`) → "WCF-Receipt" mis-files as Banking, no compliance credit. | Drop the bare `"receipt"` alias; add a tie-break preferring a type with a `companyReqKey`. | `doc-catalog.ts` + `classifyDocText` tie-break. |
| 17 | **Password-protected / corrupt file** | Vague "Couldn't render… try a clearer photo". | Detect unpdf encryption error → `failKind:"locked"`, message "This PDF is password-protected — upload an unlocked copy." Zero-page/parse-fail → `"corrupt"`. Surface reason on the quarantine card. | PDF branch of `extractDocumentFromFileInner`. |
| 18 | **Non-document image (logo, headshot, screenshot)** | Tries to file it as a business doc. | Vision prompt returns `is_business_document:false` for structure-less images → quarantine reason "Doesn't look like a business document". | `extractPrompt` + filed gate. |
| 19 | **No name, no identifiers (blank-header letter)** | Correctly quarantined; `retryQuarantine` just re-reads — sits forever. | Lean on batch `folderHint`/context; in Verify pre-select the most-likely owner and prompt one tap. Set expectation: this class needs one human tap (it cannot self-identify). | Verify tray + `retryQuarantine`. |
| 20 | **File attached in CHAT** | Stored as loose file in a chat message; **never becomes a Document** — invisible to Documents, search, compliance, trace, profiles. | Route each chat attachment through `ingestDocument({mode:"attachment", contextPersonId: sender, contextCompanyId: thread.company})`, store the returned `documentId` on the attachment JSON so the bubble links to it. Uncertain → Quarantine (never mis-owned). | `postMessage` in `chat.ts` / portal chat action; add `documentId?` to `Attachment`. |
| 21 | **File attached to a TASK / completion proof** | `createTaskAttachment` (`documents.ts:515–532`): title = raw filename, `category:"Attachment"`, owner = task company only, no read, no dedup, no dates, no compliance. Even statutory "proof of completion" gets this. | `createTaskAttachment` calls `ingestDocument({mode:"attachment", contextCompanyId: task company, contextPersonId: resolved uploader/task owner})`, then `linkDocumentTask`. If the task links a pipeline/commitment/requirement, pass that owner so `reconcileOwnerCompliance`/`findRenewalTarget` chain the proof. | `createTaskAttachment` rewrite + `task/actions.ts:779`. |
| 22 | **Staff PORTAL profile upload (checklist item)** | Real Document + ticks compliance, but no dedup, no catalogue, **instantly marks compliance green with no admin check**, no house name. | `ingestDocument({mode:"staff-review-first", forceOwner:{person:me.id}})`: hash-dedup, `deriveFiling` for type/shelf/expiry/house-name, status `"submitted"` scoring **0** until an admin verifies (surface in Verify tray). | portal profile upload action → `ingestDocument`. |
| 23 | **Request attachment** | Bare "Attachment" doc; no text captured. Also multi-recipient download 403s (dead `addressee_id` check). | Route through `ingestDocument({mode:"attachment"})` for text + house name; fix download auth to `requester_id===me.id OR isRecipient(...)`. | request actions + download route. |
| 24 | **Bulk drop of 200 mixed files (Dropbox / "Add several")** | Auto-files each; text indexed only 20/night (see #2). | With #2 fixed, all become searchable at intake. Nightly `selfHealDocuments` keeps the cap for genuine re-reads only; paginate its reads past 1000. | `autoFileDocumentAction` (#2) + `selfHealDocuments`/`removeOrphans` pagination. |
| 25 | **Daily sweep pulls a vetted doc back into Quarantine** | Daily library dedup uses weaker logic than `findSameLogicalDoc`; a shared registration/control number (common in TZ) can re-quarantine a reviewed doc. | The sweep reuses `findSameLogicalDoc` guards for the same-reference path (matching type + non-conflicting expiry/subject) and **excludes `vetted_at IS NOT NULL`** rows from auto-quarantine (manual review only). | the daily duplicate sweep (`actions.ts` ~1579 same-title path). |

---

## 3. New / changed pieces (named concretely)

**One entry point — `ingestDocument(opts)`** in `src/lib/document-ingest.ts` (new). Signature:
```
ingestDocument({ file, mode, forceOwner?, contextCompanyId?, contextPersonId?, folderHint?, taskId? })
  → { documentId, state: "filed"|"quarantine"|"trash", reasonCode?, ownerName? }
```
`mode ∈ "admin-auto" | "attachment" | "staff-review-first"`. It wraps the *existing* `extractDocumentFromFile` + the logic currently inline in `autoFileDocumentAction`. `autoFileDocumentAction` becomes a thin FormData adapter over it.

**Extracted helper — `resolveOwner(fields, {fullText, folderHint, ctx, filing})`** returning `{companyId, personId, ownerName, resolvedBy, reasonCode, reason}`. Lift the three drifted copies (main filer `actions.ts:313–370`, `retryQuarantine:876–881`, `selfHeal:930–939`) into this one function so retry/self-heal get folder + context + correlation for free. Owner-type guard from #10 lives here.

**Reason codes (machine-readable) on `documents.intake_reason`** or a new `documents.reason_code` column: `no-owner`, `unclear-read`, `possible-duplicate`, `bundle`, `ambiguous-identifier`, `owner-type-mismatch`, `not-a-document`, `locked`, `awaiting-original`, `staff-submitted-unverified`. The Verify tray maps each code → a one-tap action.

**Changed:**
- `extractDocumentFromFileInner` — vision branches return `fullText`/`textSource:"ocr"`; central `applyIdFirstCompany`; OCR fallback (#3); locked/corrupt detection (#17).
- `findRenewalTarget` — corroboration guard (#8).
- `correlateOwnerByIdentifiers` — unique-owner rule (#11).
- `owner-corrections.ts` `distinctiveTokens`/`recordOwnerCorrection`/`learnedOwnerFor` — stable-token fingerprints + uniqueness (#12).
- `doc-catalog.ts` — `_NEEDORIG`/`_NEEDID` on `Filing`, `isOld` anchored to suffix, Swahili aliases, drop bare `"receipt"`, add `sector-permit` seed item, `classifyDocText` tie-break preferring `companyReqKey`.
- `createTaskAttachment` — route through `ingestDocument`.
- `chat.ts postMessage` — attachments → `ingestDocument`; add `documentId?` to `Attachment`.

**New DB:** one migration adding `documents.reason_code text` and a `person_requirements` (or `person_documents`) `status='submitted'` value that scores 0 until verified (#22). No new tables strictly required — reuse `owner_corrections`, `routing_corrections`.

---

## 4. How portal / chat / task uploads plug in

All four channels stop writing their own bare documents and call `ingestDocument` with a preset:

- **Task update / completion proof** → `mode:"attachment"`, `contextCompanyId = task.companyId`, `contextPersonId` resolved from `createdBy` (`portal:<Name>`) or task owner, then `linkDocumentTask`. Proof gets classified, dated, deduped, compliance-chained. (#21, #23)
- **Chat message** → `mode:"attachment"`, `contextPersonId = sender`, `contextCompanyId = thread.companyId`; store `documentId` on the attachment JSON; the bubble links to the filed doc. Uncertain → Quarantine, never silently mis-owned. (#20)
- **Portal profile checklist** → `mode:"staff-review-first"`, `forceOwner:{person:me.id}`; status `"submitted"` scores 0 until an admin verifies. (#22)
- **Request attachment** → `mode:"attachment"`; plus the download-auth fix. (#23)

Because they all share one path, a passport dropped by the owner, sent in chat by staff, or attached to a task now gets **identical** treatment.

---

## 5. How it stays safe and self-learning

**Safe (review-first, undo, no wrong overwrite):**
- Uncertainty is a first-class outcome: any low-confidence read, missing owner, ambiguous identifier, owner-type mismatch, or possible duplicate → `state:"quarantine"` with a `reason_code`. Quarantine has **no** compliance/profile side-effects until filed.
- Nothing is ever hard-deleted by automation — supersede/`-OLD`/duplicate paths all write **Trash** rows sharing the stored object (recoverable), matching today's `setDocumentIntakeState(id,"trash",…)`.
- Profile facts stay **propose-only** via `enqueueDocumentSuggestions` (blanks-only, one-tap accept) — never silent overwrite (`actions.ts:514–520`).
- Unique-owner rule everywhere (phone/address already do it) prevents a shared number silently mis-filing.
- The daily sweep excludes `vetted_at` rows and reuses the strict duplicate guards, so a reviewed document can't be yanked back overnight (#25).
- Side-effect failures get a lightweight `recordEvent('documents.sideeffect','error',{docId,step})` instead of silent swallow, surfaced as a count on the System status card.

**Self-learning:**
- Every Verify-tray resolution writes an `owner_correction` (owner) or `routing_correction` (category), keyed on **stable** distinctive tokens (#12) so the next similar document self-files.
- Learning fires not only on *edits* but on *confirms* (accepting a correct auto-filing records a low-weight correction), so correct guesses are reinforced.
- `learnedOwnerFor` requires a distinctive token + unique owner, so a lesson for one company can't grab another's generic "annual return".

**One clear review place:** a dedicated **"Needs you"** tab on `/inbox` backed by `getIntakeBucket('quarantine')`, grouped by `reason_code`, each group showing per-row one-tap actions (Assign owner with pre-selected best guess · Split bundle · File anyway · Not a document · Awaiting original · Verify). Buttons for `retryQuarantineAction` and `reviewFalseDuplicatesAction` are wired here (they exist but are currently script-only).

---

## 6. Phased build order (what to do first)

**Phase 1 — Stop the bleed before 17 July (highest value, hard deadline).**
1. OCR fallback in the classification path + `ocrSpaceApiKey` setting (#3). Without this, scans stop auto-filing in ~2 weeks.
2. Vision branch returns `fullText` + central `applyIdFirstCompany` (#1) and persist text at intake (#2). One change, fixes ID-first-on-scans, instant search and correlation together.

**Phase 2 — Close the invisible-documents holes.**
3. Extract `ingestDocument` + `resolveOwner` (unifies the drifted copies; owner-type guard #10).
4. Chat attachments → `ingestDocument` (#20 — the single biggest "relying on the system" gap).
5. Task/completion-proof attachments → `ingestDocument` (#21, and #22 portal review-first).

**Phase 3 — Correctness of resolution and chaining.**
6. Unique-owner correlation (#11); renewal corroboration guard (#8); daily-sweep guard + vetted exclusion (#25).
7. Owner-learning stable fingerprints + confirm-to-learn (#12).

**Phase 4 — The one review place + catalogue polish.**
8. "Needs you" tab with `reason_code` groups and one-tap actions; wire `retryQuarantine`/`reviewFalseDuplicates` buttons (#4, #5, #19).
9. Catalogue fixes: drop bare `"receipt"` + tie-break (#16), `sector-permit` seed item, `_NEEDORIG`/`-OLD` suffix (#13, #14), Swahili aliases (#15), already-expired flag (#9), not-a-document + locked/corrupt (#17, #18).

**Phase 5 — Scale + hygiene.**
10. Paginate nightly re-index / orphan sweep / coverage audit past 1000 rows; side-effect error telemetry; per-file 20 MB cap on chat.

Do Phase 1 first — it is date-forced and the two changes touch the same vision return, so they ship together cheaply.

---

**Key evidence files:** `src/app/documents/actions.ts` (`autoFileDocumentAction` L272–541; vision-no-fullText/no-ID-first L3147–3155, 3179–3187; text path applies both L2785, 2905; `correlateOwnerByIdentifiers` first-match L2288–2306; `findRenewalTarget` type+date-only L586–611; `retryQuarantine` weaker copy L876–881; `selfHeal` weaker copy L930–939), `src/lib/doc-catalog.ts` (`transaction-receipt` bare `"receipt"` alias L66; `isOld` loose regex L155; `sector-permit` present but no seed item L55), `src/lib/documents.ts` (`createTaskAttachment` barebones L515–532), `src/lib/chat.ts` (attachments never become documents).

---

# APPENDIX B — Documents & Company page UI redesign

# (A) Documents & Compliance page (`/documents`)

## 1. What's wrong now (plain English)
The page stacks four heavy panels in one long scroll and tells you the same three facts — **missing, expired, expiring** — four times over. The `ComplianceScorePanel` shows a portfolio ring + missing/expired/expiring/all-clear tiles + a per-owner scorecard list; the `ExpiryRadar` shows expiring documents again as a ribbon; the `NeedsAttentionPanel` shows expired/expiring/missing yet again as an action list with the *same* Add/Renew/Chase buttons; and the `DocumentsTable` shows all of it a fourth time as status chips (and already has a Timeline view that duplicates the radar). Both data sources feeding all of this are just two things: the compliance scores and the live documents. With nothing uploaded, all 13 companies read an identical "0% / 12 missing," so the repetition is multiplied into a wall of red. Evidence: `documents/page.tsx:94-104` stacks all four; `compliance-score-panel.tsx:339-344` and `needs-attention-panel.tsx:255-279` render the same counts as tiles vs chips; `expiry-radar.tsx:14-68` duplicates `documents-table.tsx:71-72` timeline view.

## 2. Proposed final layout, top to bottom

**Frame — NEW (wrap in Aurora).** Wrap the whole page in `CommandWall` with a `Hero` header, replacing the bare `<div className="space-y-4 max-w-5xl mx-auto">` + `PageHeader`. Reference: `DESIGN_SYSTEM.md:41-49`, surfaces from `surface-kit.tsx`. This alone calms a long page.

**Section 1 — Hero + StatStrip (MERGE, was the top of ComplianceScorePanel).**
Shows: the portfolio compliance **ring** (from `compliance-score-panel.tsx:326-329`) on the left, and a single `StatStrip` (from `ui.tsx`, per `DESIGN_SYSTEM.md:50-52`) of the four glanceable numbers — **Missing · Expired · Expiring · All clear**. These numbers now live **once**, here. Each Stat is a door (deep-links: Missing → the merged action list filtered "missing"; Expired/Expiring → same list filtered; ring → toggles the by-owner view). Action buttons (`ComplianceExportButton`, `RequirementTemplatesButton`, `JourneyTemplatesButton`) move into the `Hero`'s action slot.

**Section 2 — "Needs doing" (MERGE of NeedsAttentionPanel + ComplianceScorePanel's scorecard list; the single action surface).**
One `CockpitModule`. Header carries `FilterChips` (All · Expired · Expiring · Missing — reuse `filter-chips.tsx`, `DESIGN_SYSTEM.md:53-55`) plus a small **"By owner"** toggle. Body = one worst-first, actionable list — reuse `needs-attention-panel.tsx`'s existing row + Chase/Renew/Add/View actions and its leave tile (`needs-attention-panel.tsx:285-348, 197-215`). The per-owner scorecard (the `ScoreRow` list at `compliance-score-panel.tsx:98-137`) becomes the **"By owner"** view of *this same panel* — same data, second lens — not a second panel. Keep the compliance detail `EntityDrawer` (`compliance-score-panel.tsx:392-441`) opening from an owner row. **Group identical rows:** when many owners share the same 0%/"12 missing" state, collapse them into one expandable summary row ("13 companies not started · 12 documents each") so the empty-state wall disappears.

**Section 3 — Documents table (KEEP, unchanged, single exhaustive list).**
`DocumentsTable` stays as-is — it is already the one complete, filterable, searchable list, and its status chips are legitimate *filters* not a scoreboard (`documents-table.tsx:71-72` list/timeline view). This is the only place that enumerates every document.

**REMOVE — ExpiryRadar entirely** (`documents/page.tsx:95`, `expiry-radar.tsx`). Its "see the wave coming" idea already exists as the table's Timeline view. Optionally lift its 0–90-day ribbon into the Timeline view *header* so expiry-over-time lives in exactly one place.

## 3. Where information moves (nothing lost)
- Portfolio ring + 4 counts → **Hero StatStrip** (section 1), the sole home for glance numbers.
- Missing/expired/expiring **action rows + buttons** → **section 2** ("Needs doing"), unchanged behaviour.
- Per-owner scorecards + compliance drawer → **section 2 "By owner" toggle** (same panel).
- Leave-to-approve tile → top of section 2 (already there).
- Expiry radar's timeline → the table's existing **Timeline view** (section 3).
- Every document, all filters/search → **section 3 table** (unchanged).
- Duplicated counts in the page subtitle (`documents/page.tsx:62`) → dropped (keep only "N tracked" or nothing).

## 4. Components to reuse / build
- **Reuse:** `CommandWall`, `Hero`, `CockpitModule`, `StatStrip`, `Stat`, `FilterChips`, `EntityDrawer`, `TONE`, `Reveal`, `DocumentsTable`, the existing attention-row + renew/chase actions and leave tile.
- **Build:** one merged `ComplianceActions` panel that owns *(a)* the FilterChips + "By owner" toggle and *(b)* renders either the flat action list (current `NeedsAttentionPanel` body) or the by-owner `ScoreRow` list. Add a tiny "identical owners" grouping helper.
- **De-dupe code:** extract `categoryForRequirement` + `addDocumentHref`/`addHrefFor` (copy-pasted in `compliance-score-panel.tsx:68-88` and `needs-attention-panel.tsx:41-60`) into `lib/documents-shared.ts` — falls out naturally of the merge.

---

# (B) Company detail page (`/companies/[id]`)

## 1. What's wrong now (plain English)
The Profile tab shows the same statutory papers **three times**: `CompanyKeyDocuments` (Registration/TIN/VRN/Licence/Lease), then the `CompanyRequirementsChecklist` inside "Company files," then the actual files in the eight shelves — the same numbers restated (`companies/[id]/page.tsx:425-441`). The compliance **percentage** appears three times too: the Overview `StatTile` (`page.tsx:221-229`), the `ComplianceSummaryCard` right beneath it (`page.tsx:249`), and the ring inside the checklist. On a near-empty company the checklist expands to a ~17-row, 8-shelf wall of "Missing" (`company-requirements-checklist.tsx:246-365`), which reads as alarming rather than glanceable. The code is sound; the problem is repetition and density.

## 2. Proposed final layout, top to bottom

**Header (KEEP).** Avatar + open/total chips + `CompanyActions` (`page.tsx:194-210`) — unchanged, calm.

**Tabs — NEW split.** Add a **Files** tab so the crowded Profile tab stops doing two jobs. Tabs become: Overview · Profile · **Files** · Tasks · Timeline · Org.

**Overview tab:**
- **Tile grid → 5 tiles (MERGE).** Drop the **Compliance** `StatTile` (`page.tsx:221-229`); the richer `ComplianceSummaryCard` (progress track + "Next: gap", `compliance-summary-card.tsx`) owns compliance. Remaining tiles: Open · Overdue · Team · Documents · Expiring. Cleaner 5-col row.
- **ComplianceSummaryCard (KEEP)** — the single compliance readout on Overview.
- **Documents needing attention (KEEP, trim).** Keep the list (`page.tsx:252-286`); make the **Expiring** tile deep-link into it and let the section header carry the count — so the tile is a door, not a duplicate.
- Open tasks preview, Equipment/Suppliers, collapsed Insights — **KEEP** (already well-judged, `page.tsx:288-393`).

**Profile tab (record only, much shorter):**
- `SuggestionTray` — **KEEP but only render when it has pending items** (avoid an empty panel; `page.tsx:399`).
- `CompanyRelationships` + graph link — **KEEP** (`page.tsx:400-403`).
- `CompanyProfile` editable form — **KEEP**; surface the 3 headline numbers (Reg no./TIN/VRN) inline in its Identity section.
- **REMOVE `CompanyKeyDocuments`** (`page.tsx:425-431`) — its statutory numbers/expiries are the checklist's job, now on the Files tab.
- Facts / Governance — wrap each in collapsed `<details>` so the default view is short.

**Files tab (NEW — all documents+compliance in one place):**
- **Statutory checklist (KEEP, compact by default).** The single home for statutory numbers/expiry. Keep collapsed (`defaultOpen={false}`); when expanded, default to **actionable-only** mode (missing/expired/expiring/requested) with a "Show all N requirements" toggle for verified/waived. Move the "add VRN, extra registrations…" banner (`company-requirements-checklist.tsx:241-243`) behind a small info affordance. Show shelf grouping only when >~6 actionable items; below that, a flat calm list.
- **Company files shelves (KEEP, trim).** Render **only shelves that contain documents** (or match search), with a "Show all folders" toggle for empties (`company-documents.tsx:285-325`). **Remove the 8 per-shelf Add buttons** (`company-documents.tsx:304-311`) — keep the one header Add.
- **Staff files (KEEP).**

## 3. Where information moves (nothing lost)
- Compliance % → **one** place per tab: `ComplianceSummaryCard` on Overview, checklist ring on Files.
- Statutory numbers/expiry (was in KeyDocuments) → **checklist on Files** + headline 3 inline in the Profile form.
- All documents + shelves + staff files → **Files tab** (moved off Profile).
- "Documents needing attention" stays on Overview as the act-now list; the Expiring tile becomes its door.

## 4. Components to reuse / build
- **Reuse:** `ComplianceSummaryCard`, `CompanyRequirementsChecklist`, `CompanyDocuments`, `StatTile`, `EntityDrawer`, `CompanyTabs`, `Reveal`.
- **Build:** an "actionable-only + Show all" mode flag on `CompanyRequirementsChecklist`; a "hide empty shelves + Show all folders" toggle in `CompanyDocuments`; the new `Files` tab value in `parseCompanyTab`/`CompanyTabs`.
- **Delete usage:** `CompanyKeyDocuments` import + render (component can be retired once nothing renders it).

**Net effect:** Documents page drops from 4 panels to 2 (+ table); the company Profile tab sheds its documents half and its triple-shown statutory list, and the checklist stops presenting as a red wall — each fact now has exactly one home.

Key files for the engineer: `src/app/documents/page.tsx`, `src/components/compliance-score-panel.tsx`, `src/components/needs-attention-panel.tsx`, `src/components/expiry-radar.tsx` (remove), `src/app/companies/[id]/page.tsx`, `src/app/companies/[id]/_tabs/tabs.tsx`, `src/app/companies/[id]/_tabs/company-documents.tsx`, `src/components/company-requirements-checklist.tsx`, `src/app/companies/[id]/_tabs/company-key-documents.tsx` (remove usage).

---

# APPENDIX C — All 123 findings (plain English + fix + verdict), by area

## AREA: Document intake pipeline (autoFileDocumentAction + supporting extract/dedup/renewal/self-heal machinery)
SUMMARY: The intake pipeline reads a dropped file, classifies it against a ~45-type catalogue, resolves an owner through a documented cascade (ID → AI+RAG → fuzzy name → learned owner → cross-doc correlation → quarantine), then files, quarantines, or trashes it and runs enrich/compliance/facts side-effects. It is well-structured, heavily commented, and mostly correct: dedup, renewal chaining, near-duplicate guards and self-heal all have thoughtful conservative safeguards. The main problems are (1) the deterministic TIN/VRN "ID-first" match — advertised as step 1 of owner resolution — silently does NOT run for scanned images/PDFs (the most common intake), (2) several places where a document is wrongly mis-owned via shared cross-doc identifiers, and (3) copy-pasted owner-resolution blocks that have already drifted apart. None of these lose a document (quarantine is the safety net), but they cause mis-filing and mis-attribution that the non-technical owner then has to unpick by hand.
- [high/bug/CONFIRMED] The deterministic TIN/VRN owner match never runs on scanned photos or image PDFs
    WHY: The system's own rulebook says the first and most reliable way to find a document's owner is to read its tax number (TIN/VRN) and match it to a company. But that hard match only runs for typed Word/PDF files. For phone photos and scanned PDFs — which are the bulk of what gets dropped in — that step is quietly skipped, so those documents lean entirely on the AI's guess and land in quarantine or on the wrong company far more often than they should.
    FIX: After the vision read returns fullText/OCR text, run the same applyIdFirstCompany + rule/scanEntities backfill the text path uses. Simplest: have the vision branch return fullText (the transcribed pages) and route its coerceFields through the same post-processing as fieldsFromText, then let autoFileDocumentAction's res.fullText carry it. Alternatively call applyIdFirstCompany(fields, res.fullText) once centrally in extractDocumentFromFile for every source. (effort M)
- [high/bug/CONFIRMED] Scanned documents are filed with no searchable body text and no cross-doc correlation input
    WHY: When a scanned photo or image PDF is read by the AI, the system keeps the extracted fields but throws away the actual text it read. That means: you can't later search for words inside that scan, the 'find the owner by a shared reference/phone/email' fallback has nothing to work with, and rule-based facts (passport number, TIN) are never captured at intake. The nightly self-heal partially patches this, but the document is mis-served until then.
    FIX: Have the vision path also transcribe/return fullText (it already has the page images; reuse transcribePageLayered output or the vision JSON's raw text) and set textSource:'ocr'. Then autoFileDocumentAction should call setDocumentText/ensureDocumentText on the filed scan so body text, facts and correlation all work at intake, not only after nightly self-heal. (effort M)
- [medium/bug] A shared bank account, address or reference can silently file a document to the wrong owner
    WHY: To find an owner for a document that only shows a number, the system looks for any other record sharing that number. For some identifiers this is too trusting: a bank account or reference number that appears on another company's document will pull the new document onto that other owner, with no check that it's actually unique. Unlike the phone and address paths (which correctly refuse when a value is shared), these paths take the first match they find.
    FIX: Apply the same 'unique owner only' rule to the numeric/reference/fact/bank-account correlation paths: collect all distinct (companyId,personId) owners for the token and only resolve when exactly one entity owns it; otherwise fall through to quarantine. Also raise the bare numeric token floor above 6 digits or require a keyword cue, since short shared numbers are the main false-positive source. (effort M)
- [medium/bug] A person's document that mentions a company TIN gets yanked onto the company
    WHY: If a staff member's document (say an employment contract or a permit) happens to print the employer's tax number, the 'match by tax number' step will attach the document to the COMPANY and blank out the person it was really about. The tax-number match is applied as an absolute override even when the AI correctly identified the individual.
    FIX: Only let the ID-first company match win when no person was resolved, OR when deriveFiling's catalogue ownerType for the document is 'company'/'either'. If the read resolved a person and the catalogue type is person-owned, keep the person as owner and treat the company TIN as context, not owner. (effort S)
- [medium/gap] Errors during filing are swallowed with no trace, so failures look like successes
    WHY: Almost every step after a document is created — saving the read text, recording facts, updating compliance, learning the owner, even the whole self-heal pass — is wrapped so that if it fails, nothing is reported. If the database hiccups while attaching facts or reconciling compliance, the document still shows as 'filed' and the owner never learns a step silently failed. Over time this can leave compliance scores or the search index quietly wrong with no signal.
    FIX: Keep the non-blocking behaviour but record a lightweight recordEvent('documents.sideeffect','error',{docId,step,message}) inside the catch of the important ones (facts, compliance reconcile, reactions, text capture). Surface a count on the AI-health/System status card so silent partial failures become visible. (effort S)
- [medium/simplify] The owner-resolution logic is copy-pasted in three places and has already drifted apart
    WHY: The block that turns an AI-read name into a known company/person, and then falls back to the 'learned owner' memory, is written out three separate times (in the main filer, the quarantine retry, and the nightly self-heal). They are meant to behave identically but no longer do — the main filer also does folder, context and cross-document correlation, while the other two only do name + learned-owner. So a document that would resolve during normal intake can stay stuck in quarantine when the retry sweep looks at it, purely because the retry uses a weaker copy of the same logic.
    FIX: Extract one async resolveOwner(fields, {fullText, folderHint, ctx}) helper returning {companyId, personId, ownerName, resolvedBy, reason} and call it from all three sites. retryQuarantine and selfHeal then get folder/context/correlation for free and behaviour can't drift. (effort M)
- [medium/bug] Renewal chaining can retire the wrong copy when two dated documents of the same type exist
    WHY: When a new licence/permit is filed, the system finds the older one it replaces and moves that old one to Trash. It decides 'older' only by comparing a single date and matching the exact type words. If a company has two genuinely different documents of the same broad type (e.g. two leases for two premises), filing a new one can trash the wrong existing document, because the match is on type + date alone with no reference/subject check.
    FIX: Before chaining, require the same corroborating signals findSameLogicalDoc uses: a matching reference number OR compatible filename subject tokens OR high content overlap, in addition to same type + older date. For person-scoped types, also require the same person. Skip chaining when the owner has multiple same-type live docs that don't corroborate. (effort M)
- [low/gap] The _NEEDORIG filename tag documented as a convention is never honoured at intake
    WHY: The house filing convention says a file tagged _NEEDORIG means 'this is only a photo standing in for an official original we still need to collect'. The intake code treats that tag as noise to strip out, and only sets the 'awaiting original' flag when the AI itself decides the file is a placeholder. So a human who correctly names a file _NEEDORIG does not get that flag recorded.
    FIX: In deriveFiling/parseConventionalName detect a _NEEDORIG (and _NEEDID) marker and surface it on Filing; in autoFileDocumentAction set input.needsOriginal ||= filing.needsOriginal so a hand-tagged file is honoured, matching the documented convention. (effort S)
- [low/improvement] A document whose body legitimately contains 'old' or 'void' is not affected, but filename matching for -OLD is loose
    WHY: A file is sent straight to Trash if its name contains the word 'old' or 'void' as a superseded copy. The check is reasonable but fires on the whole base filename, so an unlucky real-world name (for example a document about a building called 'Old Post Office', or a supplier with 'void' in a product code) could be auto-trashed. It's recoverable, but worth tightening.
    FIX: Require the OLD/VOID marker to appear as a trailing suffix (the convention is Prefix_DocType..._-OLD), e.g. anchor to the END of the base name, or require it to co-occur with a recognised catalogue type/prefix, so a descriptive filename containing 'old' isn't auto-trashed. (effort S)
- [low/improvement] iPhone HEIC photos are decoded up to three times per read, wasting time and memory
    WHY: When an iPhone photo (HEIC) is processed, the system converts it to a normal image several times over during one read — once up front, again inside the OCR routine, and again when saving the text. Each conversion is slow and memory-heavy. It works, but it makes scanned-photo intake noticeably slower and heavier than it needs to be.
    FIX: Decode HEIC once at the entry point and pass the JPEG buffer/File through the pipeline (or memoise by file hash), so OCR and text-capture reuse the already-converted image. (effort S)
- [low/gap] Office files and scanned PDFs whose text is captured never write extracted_text at intake
    WHY: For typed Word/Excel/PDF files, the AI read pulls out the body text but the auto-filer doesn't save that text onto the document record either — it relies on a separate background step. Combined with scans (covered above), it means freshly auto-filed documents often aren't searchable by their contents until a later sweep runs.
    FIX: After createDocument+uploadDocumentFile in the filed branch, if res.fullText is present call setDocumentText(id, res.fullText, res.textSource ?? 'typed'); else fire-and-forget ensureDocumentText(id), mirroring the manual path, so auto-filed documents are searchable immediately. (effort S)

## AREA: Compliance & per-company required-doc checklists
SUMMARY: Company compliance is driven by ONE hard-coded 18-item Tanzanian statutory list (COMPANY_DEFAULT_ITEMS) that is genuinely conditional per company — but only on two flags: VAT (inferred from whether a VRN is typed) and "sector regulated". The sector flag has NO user interface anywhere and is set for PES Ltd alone by a one-off migration, so in practice every company gets the same generic list and the checklist does not reflect what each company actually needs. The "0 verified / everything missing" symptom has two real causes: (1) companies that were never seeded fall through to a fallback scorer (synthDefaultScore) that ignores the VAT/sector conditions entirely and only matches documents by broad category, and (2) the accurate deterministic auto-verify only fires when a document's filename/title contains a catalogue keyword — otherwise a statutory requirement deliberately refuses to link to any document and stays "missing". The person-side profiles are cleaner but are pure person-type templates with no company or Tanzanian-nuance tailoring.
- [critical/gap/CONFIRMED] Only PES can ever be 'sector-regulated'; every other company is stuck on the identical generic list
    WHY: The system is supposed to tailor each company's document checklist to what THAT company needs, but the only real switch that changes the list ('is this a regulated/construction company?') can never be turned on from the screen — it was hard-set for PES Ltd once in the database and nowhere else. So Dar Spices (a food/spice business), the chocolate company, Terra Green, etc. all get the exact same statutory list, which is why the owner feels it doesn't match reality. There is also no way to say 'this company is VAT-registered' other than typing a VRN number into the profile.
    FIX: Add a 'Regulated sector (construction/industrial — needs CRB/OSHA/Local Content/Fire)' toggle and an explicit 'VAT registered' toggle to the company profile form (companies/[id]/company-profile.tsx + actions.ts field map + the profile write). Persist sector_regulated and drive applicableCompanyItems off the explicit VAT flag rather than mere presence of a VRN string. Consider a small per-company 'compliance profile' (e.g. sector = food/TFDA, construction/CRB, general trading) so the list truly reflects each business. (effort M)
- [critical/bug/CONFIRMED] Unseeded companies are scored by a fallback that ignores VAT/sector rules and matches docs only by broad category
    WHY: When a company has never had its checklist created in the database (nobody opened its File tab and the Documents-page seeding didn't run for it), the portfolio compliance panel scores it with a rough 'backup' method. That backup counts 17 documents as required for EVERY company — including VAT and construction permits that most companies don't need — and it only recognises a document if its broad category label matches, ignoring the smart document-type detection used everywhere else. This is almost certainly why the panel shows every company at 0% with the same list, and why PES shows '0 of 17 required, 17 missing'.
    FIX: Either (a) make synthDefaultScore call applicableCompanyItems(company) and skip it entirely once every company is guaranteed seeded, or (b) call ensureAllCompanyRequirements for the companies being scored at the start of buildCompanyRequirementScores (it is idempotent), removing the synth path. Also call ensureCompanyRequirements on the company detail page before scoring. Backfill: run scripts/backfill-company-requirements.ts so every existing company has stored rows and never hits synth. (effort M)
- [high/bug/CONFIRMED] A required document only ticks its box if its filename or title contains a recognised keyword — otherwise it stays 'missing'
    WHY: The accurate auto-verify only works when a company document's file name or title contains a word the system recognises (e.g. 'TIN', 'business licence', 'NSSF'). If a real certificate was uploaded as 'Scan_2093.pdf' or 'document.pdf', the system cannot tell what type it is, so it deliberately refuses to link it to the matching requirement and leaves that requirement showing 'missing' — even though the document is sitting right there. This is a second, separate reason a checklist can read '0 verified' while documents exist.
    FIX: When a document already has a confirmed catalogue type stored (doc_type / category set at intake), trust that in the deterministic pass instead of re-deriving from the filename, so a correctly-classified-but-badly-named scan still links. Alternatively relax the fuzzy-fallback exclusion to allow a high-confidence fuzzy match on catalogue-owned requirements when no deterministic hit exists. Enforce/encourage house-naming (Prefix_DocType_...) on upload so classification is reliable. (effort M)
- [high/bug/CONFIRMED] The portfolio/Home/Brief compliance figures use weaker matching than the per-company checklist, so numbers can disagree
    WHY: The compliance percentages shown on the portfolio panel, Home and the Director Brief are calculated with a simpler matching method than the detailed per-company checklist screen. It doesn't use the smart document-type detection and doesn't even read the document's file name. So a company can look worse on the summary panel than on its own detailed checklist — inconsistent numbers that erode trust in the figure.
    FIX: Factor the deterministic catalogue-type linking into a shared pure helper and use it in BOTH getCompanyChecklist and buildCompanyRequirementScores (select file_name in the bulk doc query). Then the summary and the detail always agree. Persisting stays at save time only, as today. (effort M)
- [medium/improvement] Whether a company needs a VAT certificate is decided by whether someone typed a VRN, not by an explicit fact
    WHY: The system decides a company must hold a VAT Certificate only if a VRN number has been typed into its profile. If the VRN field is simply blank (data not entered yet), the VAT requirement silently disappears — so a VAT-registered company with a missing VRN entry looks fully compliant when it isn't. It couples 'have we filled in this field' with 'does this obligation apply', which are different questions.
    FIX: Introduce an explicit vat_registered flag on companies (defaulting from VRN presence during backfill) and drive the VAT requirement off it, so a blank VRN on a known-VAT company still raises the requirement as a gap. (effort S)
- [medium/gap] The Tanzanian statutory list is broadly right but misses a few common obligations and mislabels others as generic
    WHY: The core list captures the main Tanzanian company obligations (BRELA incorporation, MEMARTS, UBO register, annual return, TIN, VAT, tax clearance, business licence, PAYE/SDL, NSSF, WCF, bank account, statutory registers). Gaps worth considering for these portfolio companies: TFDA/TBS product permits for the food/chocolate companies (only PES's construction permits are modelled), workers' compensation (WCF is there but no employer liability/insurance), and local-government levies. Some items are also lumped under generic categories which weakens document matching.
    FIX: Add per-sector requirement sets (e.g. food: TFDA/TBS permit, premises health licence) selectable via the per-company compliance profile suggested in sector-flag-no-ui. At minimum add a 'sector-permit' COMPANY_DEFAULT_ITEMS row so the existing catalogue type can satisfy a requirement. Confirm the full list with the owner/accountant per company. (effort M)
- [low/improvement] Person document checklists are the same four templates regardless of which company or Tanzanian nuance applies
    WHY: Staff document checklists are driven by four fixed templates (local staff, expat, outsider, candidate). They are sensible but identical across all companies and don't reflect, for example, that food-handling staff may need a health certificate or that a driver needs a licence. This is lower priority than the company side but worth noting since the audit asked whether checklists are truly tailored.
    FIX: Keep type templates but allow role/company overlays (e.g. food-handler health cert, driver licence) as optional add-on sets, and give currently-'Other' items more specific categories where a matching catalogue type exists. (effort L)

## AREA: Document catalogue & classification (src/lib/doc-catalog.ts)
SUMMARY: The catalogue is a well-structured, client-safe "brain" of ~45 document types that deterministically drives shelf/category/expiry/owner-kind/compliance once a type is identified, replacing the old free-guessing that mis-filed documents. It is genuinely a strong design and the company-side compliance auto-verify path uses it soundly. However several defined capabilities are wired up but never actually used (ownerType, personReqLabel), one compliance key is orphaned so a whole class of permits can never satisfy a requirement, the filename reference parser returns the wrong token (weakening dedup), and the flat name-vs-body scoring produces tie-break mis-classifications for common Tanzanian "receipt" documents.
- [high/bug/CONFIRMED] Sector permits (TFDA/TBS food & standards) can never satisfy a compliance requirement
    WHY: When you file a food or product permit (e.g. a TFDA/TBS permit for Dar Spices or Cocozuri), the system will never tick it off any company's required-documents checklist, so those companies can look permanently short of a permit they actually hold. The catalogue points these permits at a compliance slot that doesn't exist.
    FIX: Either add a seed item {key:'sector-permit', label:'Sector / product permit (TFDA/TBS)', category:'Permit', applies:'sector'} (and consider a food-sector flag distinct from the construction 'sector' set) to COMPANY_DEFAULT_ITEMS, or remove companyReqKey from the sector-permit catalogue row so it isn't excluded from fuzzy matching. Prefer adding the seed item so filed food permits verify. (effort S)
- [high/bug/CONFIRMED] Government payment receipts (WCF/NSSF/PAYE/licence) get mis-filed as generic 'Transaction Receipt'
    WHY: A file named like 'WCF-Receipt' or 'NSSF-Receipt' — exactly the kind the owner scans for statutory payments — is classified as a plain banking receipt instead of the WCF/NSSF document. It lands on the Banking shelf and does not count towards the company's WCF/NSSF/PAYE compliance.
    FIX: Remove the bare 'receipt' alias from transaction-receipt (keep 'transaction receipt','payment receipt','payment slip'), or give the statutory types a small specificity boost, or add a tie-break that prefers a type with a companyReqKey. Simplest: drop 'receipt' as a standalone alias. (effort S)
- [medium/bug] Filename reference parser returns the document TYPE, not the reference number — weakens duplicate detection
    WHY: The part of the system that reads a reference number out of a filename actually grabs the document-type word instead. Because of this, the safeguard that keeps two different documents (with different reference numbers) from being treated as duplicates quietly fails to do its job.
    FIX: Parse ref as the token AFTER the DocType segment, e.g. take base.split('_'), drop the prefix (index 0) and the type segment, then pick the first remaining non-EXP/non-OLD token ≥5 chars; or anchor on a known ref shape. Add a unit test in doc-catalog.test.ts covering Prefix_DocType_Ref_EXP. (effort M)
- [medium/gap] The catalogue knows who a document belongs to (person vs company) but never uses it
    WHY: The catalogue records that, say, a CV or employment contract belongs to a person and a business licence to a company. But intake never uses that knowledge, so a personal document that gets matched to a company (from a folder or the upload batch) is filed against the company with no sanity check.
    FIX: In autoFileDocumentAction after deriveFiling, when filing.ownerType is 'person' but only a company resolved (or vice-versa), either re-weight resolution toward the matching kind or route to quarantine with reason 'type expects a person/company owner'. Low-risk, high-signal. (effort M)
- [low/remove] personReqLabel on 12 catalogue types is never used
    WHY: Twelve document types carry a note saying which staff checklist item they satisfy, but the staff-compliance code never looks at it. It is harmless but misleading — someone maintaining the catalogue will assume it does something.
    FIX: Either wire a deterministic person-side pre-pass mirroring company-requirements.ts:236-248 (match filing.personReqLabel to person_requirements.label, auto-verify) — the higher-value option — or delete personReqLabel to avoid implying behaviour that doesn't exist. Prefer wiring it up for parity/accuracy. (effort M)
- [medium/gap] Several common Tanzanian document types have no catalogue entry and fall through to generic 'Letter'/Operations
    WHY: Everyday government paperwork — a control-number/demand note for a tax or fee payment, a land title deed, an import/customs clearance, a City/Municipal council levy, sector-regulator licences (EWURA/TCRA/mining) — isn't recognised, so it gets filed as a generic letter under Operations and won't help compliance or expiry tracking.
    FIX: Add catalogue rows for at least: tax control-number/demand note (Tax), title deed / certificate of occupancy (Contracts & Leases, could satisfy premises-lease), and a generic government levy/permit. Keep aliases specific to avoid the tie problem in receipt-alias finding. (effort M)
- [low/bug] The 'm-pesa' alias can never match (hyphen stripped from the text being searched)
    WHY: An alias meant to catch 'M-Pesa' payment files can never fire, because the text is de-hyphenated before matching but the alias keeps its hyphen. It's low impact since other spellings still work, but the alias is dead code.
    FIX: Change the alias to 'm pesa' (matches the normalised haystack) or normalise aliases the same way as the haystack before comparing. Trivial. (effort S)
- [low/improvement] 'Ordered most-specific first' comment is misleading given flat scoring
    WHY: A comment promises the list is ordered so more precise types win, but the matching logic only uses that order to break exact score ties. This gap is what lets the receipt mis-classification happen, and it will surprise future maintainers.
    FIX: Add a deterministic tie-break in classifyDocText (e.g. prefer the type with a companyReqKey/personReqLabel, then longer total matched-alias length) and update or remove the ordering comment. Pairs naturally with the receipt-alias fix. (effort S)

## AREA: ORI search + entity registry + result layout
SUMMARY: The search brain is genuinely well-architected: one entity registry (entity-registry.ts) is the single source of truth for 12 entity types, the client/server split (entity-meta.ts) is correctly enforced, and search.ts loops over it generically so a new entity type needs only one EntityDef. Deep person/company indexing (passport, TIN, VRN, phone) and the in-file Postgres FTS augmentation are strong, distinctive features. However, the in-memory scorer has a strict "every word must match" gate that, combined with typo tolerance only firing on 4+ character words, makes multi-word and slightly-misspelt queries silently return nothing. Tasks — the highest-volume entity — are deliberately outside the good deep-search path and get a crude, un-ranked substring filter instead. And the in-file document matches skip the lifecycle labelling that everything else honours.
- [high/bug/CONFIRMED] Multi-word searches with a small typo return nothing
    WHY: If you search for two or more words and misspell one of them even slightly (or one word simply isn't stored on the record), the search shows zero results instead of the near-match. So a quick, imperfect search — exactly how people actually type — often comes up empty, which makes the search feel broken.
    FIX: Loosen the gate to allow the strongest single missing token when the others match strongly (e.g. require matchedTokens >= tokens.length-1 for queries of 2+ tokens, with a score penalty), and extend the within(w,t,1) typo check to tokens of length >=3 (and words >=3). Alternatively fold in the trigram index already created in 0101 (documents_title_trgm_idx) / add pg_trgm similarity as a recall floor. (effort M)
- [high/gap/CONFIRMED] Tasks — the biggest data set — get a much weaker search than everything else
    WHY: Tasks are the thing you search for most, yet they use a crude 'does the text contain these exact letters' filter with no typo tolerance, no relevance ranking, no synonym understanding, and a hard cap of 8. Meanwhile people, companies and documents get the smart ranked search. So finding the right task is harder than finding a vendor, which is backwards for a task-tracking system.
    FIX: Either give tasks a real EntityDef.search entry so they flow through the same scorer/typo/synonym path (they already have textFor + a bespoke trace), OR at minimum tokenise the task filter, match per-token across code/action/update/comments/category/company/assignees, and rank by the shared score() before slicing. Keep the rich task row rendering. (effort M)
- [medium/bug] In-file document matches ignore the History toggle and can be silently capped out
    WHY: When search finds a match inside a scanned document's text, that result is treated differently from all others: it never shows the faded 'history' styling, and because it's added late it can be pushed out by the six-per-type limit — so a genuine hit buried inside a PDF can vanish from the list.
    FIX: Set lifecycle:'active' on FTS-pushed docs for consistency; and give FTS-originated documents a small reserved allowance or run the per-type cap so an in-file-only match isn't crowded out by column-net hits (e.g. cap documents at perTypeLimit but always keep the top FTS snippet result). (effort S)
- [medium/bug] Some plain searches get treated as commands when you press Enter
    WHY: If you type a search that happens to start with a word like 'add', 'show', 'open', 'update', 'set' or 'create' and press Enter without picking a result, the system tries to run it as an action/AI command instead of just searching. For example searching for a person to 'add' to something, or a document titled 'Update...', jumps into the command flow unexpectedly.
    FIX: Tighten the command regex (drop bare 'show'/'add'/'open' unless followed by an object phrase like 'show me task', require an imperative object), or when results exist prefer opening the top result on Enter and reserve command-routing for the explicit ORI affordance click / a modifier. (effort S)
- [low/simplify] Confusing leftover code in the scoring gate
    WHY: There's a bit of leftover code in the ranking logic that does nothing (subtracts zero), which makes the rule harder to read and easier to break during a future fix. No user impact today, but it's a trap for the next engineer.
    FIX: Collapse to a single clear guard, or actually parameterise it (allow 1 missing token for 3+ token queries) as part of the strict-token-gate fix above. (effort S)
- [low/improvement] Exact-name boosting compares against the raw query and can miss
    WHY: The big relevance bonus for an exact name/title match compares the record's field against the raw typed query including its punctuation, so a small formatting difference (a full stop, hyphen, extra space) means the exact match bonus isn't awarded and the result ranks lower than it should.
    FIX: Normalise both sides for the whole-query comparison the same way tokens are (strip punctuation, collapse whitespace) before the ===/startsWith/includes bonuses. (effort S)
- [low/gap] Search results for risks all link to the home page
    WHY: When a risk shows up in search and you click it, it just takes you to the home dashboard rather than to that specific risk, so you can't actually get to the thing you searched for.
    FIX: Point risk to the company profile risk section with an anchor/query (e.g. /companies/{company_id}#risks or a filtered view), and give governance rows a company-scoped anchor where company_id is known. (effort M)

## AREA: Deep indexing, FTS, embeddings & search coverage
SUMMARY: The semantic-search index is genuinely registry-driven and, contrary to its own stale documentation, is now wired into essentially every write path (create/update/archive across all 12 entity types) as best-effort fire-and-forget hooks that never break the underlying write. Document body text is indexed at intake (not just nightly) both to the always-on Postgres full-text index (content_tsv) and, when enabled, to embeddings. The design is sound and defensively coded. The main real risks are scaling ceilings from un-paginated Supabase reads (the nightly catch-all and the coverage audit both silently see only the first ~1000 rows per type), one intake write path that fills searchable identity fields without re-indexing, and several places where records are indexed with only partial content (causing wasteful re-embedding). None of these break correctness of writes; they degrade search freshness/completeness and waste AI spend.
- [high/bug/CONFIRMED] Nightly re-index and orphan sweep silently ignore everything past the first ~1000 records per type
    WHY: The overnight job that keeps search complete only ever looks at the first roughly 1,000 records of each kind (tasks, documents, people, etc.). Once any of those lists grows past that size, the rest stop being caught by the nightly safety net — so a record that was created while search was briefly failing, or edited in bulk, could stay invisible to search indefinitely. The same limit also means genuinely deleted records never get cleaned out of the search index past the first 1,000.
    FIX: Paginate both loops with .range() until fewer than a page is returned (e.g. 1000-row pages), or add an explicit high .limit(N) with a page loop. Apply the same to removeOrphans' embeddings read. Consider a shared paginated-select helper so future callers can't reintroduce the cap. (effort M)
- [medium/bug] Passport / national ID / TIN / VRN learned from a document aren't searchable until the next night
    WHY: When the system reads a document and automatically fills in a person's passport or national-ID number, or a company's tax numbers, into their profile, it forgets to refresh the search index for that person/company. So if you immediately search for that passport or tax number, you won't find them until the overnight job runs. (The separate, reviewed 'suggestions' path does refresh correctly — this only affects the direct fact-extraction fill.)
    FIX: After each successful patch, add `void reindexEntity('person', personId)` / `void reindexEntity('company', companyId)` (best-effort). Note: document body FTS (content_tsv) still finds the number inside the file, so this only affects the person/company entity's own semantic index. (effort S)
- [medium/bug] The self-audit that flags 'search blind spots' can cry wolf for any large record type
    WHY: The health check that tells you when part of your data has fallen out of search counts indexed items using the same capped read as above. For any kind with more than ~1,000 indexed chunks it will undercount and wrongly report a big 'gap', so once you turn semantic search on and your data grows, this warning becomes untrustworthy noise.
    FIX: Either page the source_id read, or replace the in-memory Set dedup with a DB-side distinct count (an RPC doing `select count(distinct source_id) ... group by source_type` in one call is both correct and far cheaper than pulling every chunk id). (effort M)
- [low/improvement] Coverage-audit's own comment describes indexing that no longer matches the code
    WHY: The explanatory note at the top of the self-audit file says only four record types get indexed when written, and only on creation. In reality all twelve types are now indexed on create, update and archive. An engineer reading this will misunderstand how fresh search is and may 'fix' a problem that doesn't exist.
    FIX: Update the comment to reflect that all 12 types are reindexed on create/update/archive via reindexEntity, and the cron is now a heal/orphan-sweep catch-all, not the primary path. (effort S)
- [low/improvement] New tasks and documents are indexed with only part of their text, then re-embedded in full later — wasted AI cost
    WHY: When a task or document is first created, the system indexes only a slice of its text (e.g. just the action item, or title without the notes/status). The full-text version differs, so the next edit or the nightly job re-embeds the whole thing again. Each embed is a paid/round-trip operation, so this quietly doubles indexing work for every such record.
    FIX: Replace the ad-hoc partial indexEmbedding calls on create with `reindexEntity(type, id)` so the create indexes exactly the registry text (single source of truth) and the content_hash matches subsequent runs — no re-embed churn. (effort S)
- [low/gap] Document full-text search can't find words that live only in the Notes or Category field
    WHY: The instant, always-on document search reads a document's title, type, reference number, issuer and the scanned/typed body — but not the free-text Notes you add or its Category. If a distinguishing word is only in the Notes, a text search inside documents won't surface it.
    FIX: Add coalesce(notes,'') and coalesce(category,'') to the content_tsv generated expression in a new idempotent migration (regenerating a generated column is a table rewrite, so take a backup and run off-peak). (effort S)
- [low/improvement] ORI Ask's semantic recall only covers tasks, meetings, documents and people
    WHY: When you ask ORI a question, its 'find by meaning' step only looks at tasks, meetings, documents and people. Questions whose answer lives in a company profile, a risk, a governance/shareholder record, a vendor, an asset, a letter, a pipeline application or a commitment won't be surfaced by that meaning-based step (they may still arrive via other, exact-match context builders, but semantic recall for them is off).
    FIX: If recall for those entities matters, widen the types list (or drop the filter to search all) and add lightweight context blocks for the extra hit types; weigh added context size/latency against benefit. (effort M)

## AREA: ORI Ask + direct-answer + memory
SUMMARY: ORI Ask (/api/ask) is a well-built RAG assistant: it assembles tasks, documents, compliance, governance, a relationship graph, memory and eight lightweight coverage lists in parallel, cites passages, prints a provenance line, and degrades to a clean 503 when AI is off. The plumbing (retry/backoff/timeout, best-effort try/catch on every heavy slice) is genuinely robust. The main risks are: (1) the instant document-expiry chip ignores the company/person named in the query, so it can confidently show the wrong entity's expiry date; (2) the buildContext fan-out does several unconditional full-table reads (all documents, all people/company compliance scores) on every question, which is the most likely cause of slow answers / occasional timeouts on a large dataset; and (3) synonym expansion can pull unrelated people (with their passport numbers) into context. None are catastrophic, but the expiry-chip bug is a trust problem for a non-technical owner.
- [high/bug/CONFIRMED] "When does X's licence expire?" can show the wrong company's date
    WHY: If you ask the search bar for a document's expiry and name a company or person, the instant answer ignores who you named. It just finds the document of that type with the furthest-off expiry date anywhere in the portfolio and shows that. So "Dar Spices business licence expiry" could confidently return Terra Green's licence date instead — a wrong answer presented as fact, which is exactly the kind of mistake that erodes trust.
    FIX: After classifying the type, extract the residual entity tokens (as resolveDirectAnswer already does at direct-answer.ts:104-105) and, when present, filter `matches` to documents whose owning person/company name scores against those tokens; only fall back to the global furthest-future doc when no entity was named. Alternatively return null (let normal search proceed) when an entity is named but no doc of that type belongs to it. (effort M)
- [medium/improvement] Every question scans all documents and recomputes all compliance scores
    WHY: For any question at all — even "what's DAR-007 about" — ORI loads the entire document library and recalculates the compliance checklists for every company and every person before answering. On a small dataset this is fine, but as documents and staff grow this is the part most likely to make answers feel slow or occasionally time out, and it runs whether or not the question is about documents or compliance.
    FIX: Only run buildCompanyRequirementScores/buildPersonRequirementScores when wantsDocuments or a compliance-flavoured intent fires (mirror the vendors/assets/leave gating already used below). Keep the always-on expired/expiring surfacing but source it from listDocuments alone (deriveDocStatus) rather than the full requirement engines. Remove the `|| true` so kwHit/companyHit actually narrow the document set. (effort M)
- [medium/bug] Governance questions can pull unrelated staff (and their passport numbers) into context
    WHY: When you ask an ownership/governance question, ORI widens the search with synonyms (owner→director, board, control, runs…). Those extra words are then matched against staff NAMES, so a person whose name happens to start with one of them gets pulled in — and ORI is handed that person's passport number, national ID and date of birth as "relevant" detail. It rarely surfaces in the reply, but sensitive fields are being loaded into the AI prompt for people the question was never about.
    FIX: Match people names against the LITERAL question tokens (`tokens`), not `matchTokens`, exactly as companies already do; keep the synonym set for content nets only. Optionally require token length >= 3 for the startsWith name match. (effort S)
- [low/improvement] Streamed answers are remembered in a slightly rawer form than shown
    WHY: After a streamed answer, ORI saves the exchange to its memory so it stays consistent later. It saves the raw streamed text rather than the tidied version the user actually saw, and it does this from the browser (so if the tab closes at the wrong moment the memory isn't saved). Minor, but it means recalled memories can read slightly differently from the on-screen answer.
    FIX: Send the same tidied text the user saw (tidyOri(acc)) to /api/ai-memory, or buffer the final answer server-side at stream close and recordQA there so it doesn't depend on the client. Low priority. (effort S)
- [low/improvement] The "sources" line can over- or under-count what actually answered
    WHY: The little "8 tasks · 2 documents · 1 governance record" line under an answer counts how much data was LOADED, not how much ORI actually used. So it can claim governance/relationship sources that had no bearing on the reply. It's cosmetic, but for a non-technical owner it slightly overstates how grounded an answer is.
    FIX: Accept this as a "what I looked at" line and relabel accordingly, or derive counts from citations actually present in the answer text (e.g. task codes/doc titles the model referenced). Low priority. (effort M)
- [low/improvement] Expiry chip treats the latest of several expired copies as the answer
    WHY: If every copy of a document type on file has already expired, the instant chip still picks the least-expired one and shows "expired N days ago". That's usually reasonable, but if a document was renewed and the renewal wasn't filed (or was filed without an expiry), the answer can look more reassuring or more alarming than reality.
    FIX: When the chosen best is already expired, optionally note if an un-dated doc of the same type/owner exists ("a newer copy is on file without an expiry date"). Minor polish; the core behaviour is acceptable. (effort S)

## AREA: Claude Code Cloud Agent bridge (ai_jobs queue + runner/dispatcher/next/complete + trigger)
SUMMARY: The cloud-agent bridge is a genuinely working queue: the live app drops "jobs" (Ask ORI questions, document reads, actions) into an `ai_jobs` table, and a Claude Code worker running on the owner's Max plan claims them, does the thinking, and writes results back — no paid API key. Ask ORI is wired and was verified end-to-end; document extraction and action-taking are built but only lightly tested. However the whole thing is still uncommitted/unpushed (per memory), depends on a hand-applied database function that is NOT in the migration file (so a fresh deploy would break the queue), and the safety story is weaker than the docs claim: automated writes and message sends leave NO audit trail and are NOT undoable despite the worker instructions promising "every action is logged and undoable". It is fine as a single-operator background helper today, but not yet safe or reproducible enough to be the live site's AI without more hardening.
- [critical/bug/CONFIRMED] The database function the whole queue depends on isn't in the migration — a fresh deploy breaks it
    WHY: The bit of database code that hands out jobs to the worker was typed straight into the live database by hand and never written into the project's official migration file. If the site is ever re-deployed onto a clean database (or the migration is re-run), the version that gets created only understands one input, but the app sends it two — so every attempt to fetch a job fails and the AI assistant silently stops answering. Today it happens to work only because the live database still has the hand-made version.
    FIX: Add a migration that defines the two-parameter `claim_next_ai_job(p_lane text DEFAULT NULL, p_kinds text[] DEFAULT NULL)` (with the `AND (p_kinds IS NULL OR kind = ANY(p_kinds))` filter) so the code and schema agree and a clean deploy reproduces the live DB. Drop the stale one-arg overload to avoid ambiguity. (effort S)
- [high/bug/CONFIRMED] Automated changes leave no audit trail and cannot be undone, despite the docs promising both
    WHY: The worker's own instructions tell it 'every action is logged and undoable', and the plan sells this as the key safety net (owner = verifier). In reality, when the agent creates a meeting, creates a task, files/edits a document, or sends a reminder, nothing is written to the audit log and no undo record is created. So if the AI does something wrong there is no history of what it changed and no one-click way to reverse it — exactly the safety the design promised is missing.
    FIX: In agent-apply.ts, wrap each mutating branch with a system_events/audit_log entry (who=`ai-command`, jobId, entity, before/after) and, for create_meeting/create_task/extract, mint an undo token via the existing undo-token machinery and pass it to completeJob. At minimum call recordEvent so the action shows in the activity feed. (effort M)
- [high/bug/CONFIRMED] AI-triggered WhatsApp/email sends skip the central 'is auto-send allowed' safety switch
    WHY: The system has a single safety switch (canAutoSend) that is supposed to gate every automated outbound message, and the plan explicitly says the agent should reuse it. The agent's reminder path ignores it: as long as a job is marked 'confirmed', it sends a real WhatsApp/email straight away. That means the global 'don't let automation message people' guardrail and quiet-hours protections don't apply to anything the cloud agent sends.
    FIX: Before sending in applyAction, call `canAutoSend(channel)` and refuse (return a proposal) when it forbids; honour quiet hours. Keep the `confirmed` check as an additional Tier-3 gate, not the only one. (effort S)
- [high/gap/CONFIRMED] When the AI re-reads a hard document it skips the naming, filing, dedupe and compliance brain
    WHY: The document intake 'brain' normally names files to house format, resolves the right owner through several fallbacks, detects duplicates, chains renewals and recomputes each company's compliance checklist. When a document is too hard for the rules and gets handed to the AI worker instead, the worker's result is written back as plain fields only — the naming, duplicate-catching, renewal-chaining and compliance-recompute steps are skipped. So the very documents that most need the smart handling get the least of it.
    FIX: Have applyExtract feed the model's extracted fields back through the shared filing pipeline (title-builder, owner correlation/dedupe, renewal chaining, compliance recompute) rather than writing raw columns; only clear needs_review after those checks pass. (effort M)
- [medium/simplify] The simple non-AI worker can never claim the real jobs it's pointed at
    WHY: There are two workers. The lightweight one is described as the 'deterministic' drainer, but it only knows how to handle a test 'ping' job — it can't do the real work (answering, reading documents, taking actions), and by design it refuses to touch those. In practice it does nothing useful and just adds a moving part to understand and maintain.
    FIX: Either delete agent-runner.ts (folding the ping proof into a test) or clearly retire it in docs so only the dispatcher+worker path remains. Removing it shrinks the surface and the two-worker confusion. (effort S)
- [medium/ux] The Ask box can give up before the worker has time to answer
    WHY: The Ask ORI box waits about three minutes then shows 'ORI didn't answer in time'. But the team's own notes say the first answer often takes one to two minutes just to spin up the worker, and jobs process one at a time. If a couple of questions are queued, or the worker is cold, the box can time out and show an error even though the answer arrives moments later — looking broken when it isn't.
    FIX: Raise the timeout (or show 'still working — this can take a couple of minutes' instead of an error), and keep polling/allow resume so a late answer still displays. Consider surfacing queue position. (effort S)
- [medium/gap] The 'wake the agent instantly' endpoint doesn't actually wake anything
    WHY: When you ask a question the app is meant to nudge the worker to start right away. That nudge endpoint currently just checks a password and counts how many jobs are waiting — it doesn't start or signal the worker. So 'instant' actually depends on the separate always-on dispatcher's ~3-second poll plus the worker's own start-up time; if that dispatcher isn't running on some machine, nothing drains the fast lane at all.
    FIX: Either implement a real wake (signal/RemoteTrigger to the routine) in the trigger route, or document plainly that liveness fully depends on the always-on dispatcher and add a health check/alert when no dispatcher has polled recently. (effort M)
- [medium/improvement] The background worker runs with all safety prompts disabled and full command-centre access
    WHY: To run unattended, the worker is launched with permission checks turned off and given full access to the whole administrator. That's a deliberate trade-off for a single-operator tool, but combined with no audit log and no undo (see other findings), a mistaken or manipulated instruction (e.g. via a malicious document it reads) could make real changes with nothing recording or reversing them. Worth tightening before this powers the live site for more people.
    FIX: Constrain the worker to the repo's agent scripts + DB only (it already should only run agent-next/agent-complete), add the audit+undo trail, keep Tier-3 sends behind the central guardrail, and treat document-derived text as untrusted (never let it change owner/permissions without the dedupe/correlation checks). (effort L)
- [medium/gap] The entire feature is unshipped and only 'works' because of manual local setup
    WHY: Per the project's own notes, none of this has been committed or pushed, and the live database function was hand-typed. So today it 'works' only on the owner's machine with a manually-started dispatcher and a hand-made DB function. On the deployed site there is no worker running by default and (see the migration finding) the queue would break on a clean deploy. It's a prototype wired into real UI, not a shipped, reproducible feature.
    FIX: Decide to either fully ship (commit code + real migration for the RPC, stand up an always-on dispatcher, set AGENT_TRIGGER_SECRET/NEXT_PUBLIC_APP_URL in Vercel, monitor liveness) or keep the async Ask UI behind a flag so deployed users don't hit a queue that nothing is draining. (effort M)
- [low/bug] A slow-but-alive worker can have its job retried, risking a duplicate action
    WHY: If a worker takes longer than four minutes on a job (the notes say answers can take one to two minutes and it does real work like downloading and reading documents), the system assumes it died and hands the same job to another run. If the first worker was actually still alive and finishing, the action (e.g. create a task, file a document) can happen twice. It's an edge case but the timing is close to real-world latencies.
    FIX: Make the reap window comfortably larger than the worker timeout, and/or have agent-complete verify the job is still 'running' (and owned by this attempt) before applying, so a re-queued-then-completed job can't double-insert. (effort S)
- [low/improvement] The AI only sees active companies/people, so questions about archived records go unanswered
    WHY: When the worker resolves names to records or answers questions, it is only given companies and people currently marked active. Questions about a former employee or a dormant company can't be answered or correctly attributed, and the worker is told never to guess — so it will simply say it doesn't know even when the data exists in history.
    FIX: Include inactive companies/people (flagged as archived) in known records for extract/ask so historical ownership and questions about former staff/dormant companies can be answered and attributed. (effort S)

## AREA: OCR / vision document reading
SUMMARY: The document intake reads scans/photos through two separate paths that DIVERGED: a robust "layered" reader (Groq vision → OCR.space → Tesseract) is used only to fill the searchable text; but the path that actually classifies a document (owner, type, expiry date, compliance shelf) still calls Groq vision alone with NO fallback. Groq's vision model (llama-4-scout) shuts down on 2026-07-17 — in ~2 weeks. When it dies, typed PDFs and Office files keep working, and scans will still become SEARCHABLE via OCR.space/Tesseract, but every scanned PDF and phone photo will FAIL to auto-classify — no owner, no type, no expiry, no compliance credit — and land as "Couldn't read that scan". The safety net (OCR.space) is only reachable via an environment variable that isn't set, and the in-app setting the code documents doesn't exist. The cloud-agent extract handler that was meant to replace vision is not built (only a ping stub). Overall: the reading floor is solid, but the intelligence layer is about to lose its eyes with no working replacement wired in.
- [critical/bug/CONFIRMED] In ~2 weeks, scanned documents and photos will stop being auto-filed
    WHY: The AI model that reads scans and phone photos is switched off by its provider on 17 July 2026. After that date, any scanned PDF or photo of a document will still become searchable, but the system will no longer be able to work out who it belongs to, what type it is, or when it expires — so it lands as 'Couldn't read that scan' with no owner and no compliance credit. Typed PDFs and Word/Excel files are unaffected. This is the single biggest risk in this area and it has a hard deadline.
    FIX: Wire the layered OCR fallback into the classification path, not just the search-text path. When groqVision returns not-ok (or when no vision apiKey/model is usable), OCR the rendered page images via transcribePageLayered (OCR.space → Tesseract) into plain text, then run that text through fieldsFromText()/groqExtract() (the text-model extractor) exactly as typed PDFs already do. This reuses existing code and keeps owner/type/expiry/compliance working with zero vision. Do this before 17 Jul. (effort M)
- [high/bug/CONFIRMED] The scan-reading safety net can't be turned on from Settings, only by a developer env var
    WHY: OCR.space is the always-on cloud reader meant to keep scans readable after the AI vision model dies. The code's own documentation says you can switch it on either from an app Setting or an environment variable — but the Setting was never built, so the only way to enable it is a developer editing Vercel environment variables. For a non-technical owner this means the safety net is effectively unavailable unless someone technical sets it up, and it is almost certainly OFF right now.
    FIX: Add an ocrSpaceApiKey setting (like groqApiKey) and read it with env fallback: `const key = (await getAppSettings()).ocrSpaceApiKey?.trim() || process.env.OCRSPACE_API_KEY || ''`. Surface it in Settings → AI & Voice. Alternatively, if env-only is intended, correct the misleading comment and CLAUDE.md. Either way, ensure a key is actually configured before 17 Jul. (effort S)
- [high/gap/CONFIRMED] The planned replacement for the vision model is not built yet
    WHY: The intended long-term fix — having a Claude cloud agent read documents instead of the dying Groq vision model — exists only as a placeholder. The job queue and a test 'ping' handler are in place, but the actual 'read this document' handler has not been written. So there is no ready alternative to fall back on when vision dies; the OCR engines are the only real safety net.
    FIX: Do NOT depend on the cloud-agent extract handler to save the 17 Jul deadline — it needs the owner to supply AGENT_TRIGGER_SECRET + a cloud-routine login and is a larger build. Ship the OCR-text→text-model classification fallback (first finding) as the reliable stopgap; treat the cloud agent as the later quality upgrade. (effort L)
- [medium/improvement] Watermark-stripping could occasionally hide a genuinely short document's real text
    WHY: To detect scanner-app watermarks (like 'CamScanner'), the system deletes those words and then decides the page is 'just a watermark' if fewer than 6 distinct words remain. A legitimately terse document — say a short stamp, a one-line receipt, or a sparse ID card whose text layer is thin — could be wrongly judged as watermark-only and sent for a full re-read/OCR, wasting a vision/OCR call. It won't lose data, but it can misroute and cost extra.
    FIX: Add unit tests for usableTextLayer (watermark-only → null; short-but-real → passes). Consider anchoring the 'scanned with' regex to line boundaries and only treating a layer as watermark when the watermark tokens dominate (e.g. >60% of tokens), rather than an absolute 6-word floor. (effort S)
- [low/improvement] Low-confidence re-read of a multi-page scan re-sends every page — avoidable cost
    WHY: When the AI is unsure about a scan, the system tries a second, stronger read. For a multi-page scanned PDF this re-renders and re-sends all the pages again to the AI, doubling the reading cost for that document. It only kicks in when a second vision model is configured, so it's dormant today, but it will bite once a fallback vision model is added.
    FIX: When adding a second vision model, cache the rendered page images (or the raw OCR text) from the first pass and reuse them in the re-read instead of re-rasterising and re-uploading. Or gate the vision re-read to single-page/image docs only. (effort M)
- [low/ux] Scan-with-AI-off message tells users to type details manually even though OCR could read it
    WHY: When AI is off (or once vision is dead), uploading a scanned PDF shows 'This looks like a scanned PDF and AI is off. Type the details…'. But the system already has non-AI OCR engines that could read the text. The message gives up prematurely and pushes manual data entry that shouldn't be necessary.
    FIX: In the no-Groq-key branch for scans/images, run transcribePageLayered (no key needed) → ruleExtract/scanEntities for a best-effort read before falling back to the manual-entry message. Reuses existing functions. (effort S)

## AREA: Owner resolution & self-learning loops (owner_corrections / routing_corrections / correlation / relationship inference / entity graph)
SUMMARY: This subsystem is how a document finds its rightful owner (a company or person) without the owner having to file it by hand, and how the system "remembers" past corrections so it stops asking twice. The core machinery is well thought-through and deliberately conservative in most places (it would rather leave a document in Quarantine than guess wrong). However, the owner-learning loop has a real defect that quietly undermines its whole purpose: the "fingerprint" it stores when you correct a document does not match the "fingerprint" it looks up on the next similar document, so a correction often fails to teach the next document — the owner keeps correcting the same thing. Separately, the fingerprints are built from generic words and year numbers, which risks both mis-teaching across companies and going stale every year. The relationship-inference and entity-graph pieces are read-only and safe, but have a performance cliff and a couple of matching-quality gaps.
- [high/bug/REFUTED] A correction usually fails to teach the next document (fingerprints don't line up)
    WHY: When you correct a document's owner, the system is supposed to remember it so the next similar document files itself. In practice the memory it saves rarely matches what it looks for next time, so the same kind of document keeps landing in Quarantine and you keep correcting it — the exact frustration this feature exists to remove.
    FIX: Key the learning on stable fields only, not the display title. Store and look up on distinctiveTokens(issuer + docType) (or the catalogue typeKey from deriveFiling) and drop the title from the signature entirely — or normalise both sides through the same buildDocTitle before tokenising. Also strip pure 4-digit year tokens in distinctiveTokens so renewals of the same doc keep the same fingerprint year-to-year. Add a unit test that records a correction from a filed (house-title) doc and asserts learnedOwnerFor hits on the next raw-AI-title read of the same doc type. (effort M)
- [high/bug/CONFIRMED] Owner learning can misfile across companies (fingerprints are too generic)
    WHY: The 'remember this owner' feature identifies documents by ordinary words like 'business', 'licence', 'certificate'. Because every company has documents with those words, a lesson learned for one company can wrongly grab another company's document and file it to the wrong owner — and auto-filed documents skip the review step, so a mistake goes live silently.
    FIX: Tighten the learned-owner gate: require a higher overlap ratio (e.g. ≥3 tokens or ≥0.6 of the stored signature) AND at least one DISTINCTIVE, non-dictionary token (a company code/alias/identifier) in common; when two different owners tie on the same signature, resolve nobody (mirror the unique-owner rule used elsewhere). Consider treating a learned owner as a suggestion that still routes to Quarantine below a confidence bar rather than auto-filing. (effort M)
- [medium/bug] A new correction wipes out a previous, unrelated lesson sharing the same generic words
    WHY: When you assign an owner to a document, the system deletes every past lesson that shares the same word-fingerprint before saving the new one. Combined with the too-generic fingerprints above, correcting one company's 'annual return' can silently erase the lesson the system learned for a different company's 'annual return'.
    FIX: Once signatures include a distinctive owner token (per the generic-tokens fix), this delete becomes safe. Until then, do not delete siblings on owner change; instead keep multiple (signature→owner) rows and let learnedOwnerFor pick by hits + require uniqueness, resolving nobody on a tie. (effort S)
- [medium/bug] Identifier inheritance takes the first match without checking it's the only one
    WHY: When a document has a reference/TIN number but no readable name, the system copies the owner from another document that shares that number. It stops at the first match it finds rather than confirming only one owner shares it, so a number that appears across companies (a shared bank, a control number, an OCR-mangled short number) can pull in the wrong owner.
    FIX: Require ≥8-digit identifiers (TIN/VRN/account length) to correlate, match reference_no with exact equality not substring, and for each token collect distinct owners across the candidate rows — resolve only when exactly one owner shares it (mirror the contact-identifier uniqueness rule). Otherwise fall through to Quarantine. (effort M)
- [medium/improvement] Opening a company's knowledge graph is O(companies²) and will get slow
    WHY: Viewing the connections for one company re-computes the director list for every other company from scratch, each of which itself re-reads all people. As the portfolio and filings grow this page will get noticeably slow and hit the database hard.
    FIX: Load all companies' facts + the people list ONCE, build a name→personId index once, and compute director overlaps in memory in a single pass instead of N calls to getCompanyRelationships. Alternatively cache getCompanyRelationships per request. This also removes the repeated full people-table reads. (effort M)
- [low/gap] Director/shareholder matching silently ignores archived people
    WHY: When the system links the names on a filing to real people, it only searches people whose records aren't archived in one place but searches everyone in another, so a former director who's been archived shows up inconsistently across screens.
    FIX: Decide one rule (governance roles from filings SHOULD include archived people, since a filed director is historically true) and document it; keep matchPerson over all people but label archived matches, rather than filtering them out inconsistently elsewhere. (effort S)
- [low/improvement] Corporate shareholders and one-word parties are never linked
    WHY: When a filing lists a company as a shareholder, or a party is written with a single word, the system shows it as plain unmatched text and never connects it to the actual company record — so cross-company ownership links via corporate shareholders are missed.
    FIX: After person matching fails, attempt a company match (reuse resolveEntity/sigTokens against the companies list) for shareholder/beneficial-owner roles, and avoid splitting on ' and ' when the surrounding text looks like a single legal name. Surface corporate-owner links in the graph. (effort M)
- [low/gap] Learning only fires on edits, not when the owner accepts an auto-filing as-is
    WHY: The system only learns an owner when you change it. When it guesses correctly and you simply accept, it records nothing — so a correct fuzzy/AI guess isn't reinforced, and a later ambiguous document can't lean on that confirmation.
    FIX: When a human confirms an auto-filed document's owner (vetting / verify-queue confirm), record a low-weight owner correction for that signature too, so confirmed-correct resolutions reinforce the memory — not just fixes. (effort S)
- [low/improvement] Learned owner runs only after batch context, so a wrong batch owner is never corrected by memory
    WHY: If you upload a batch tagged to one company, every document in it takes that company even when the system has previously learned a specific document belongs to a different owner. The learned memory can't override a batch tag.
    FIX: When a strong learned-owner match exists AND it disagrees with the batch context owner, route that document to Quarantine flagged 'batch said X, memory says Y' rather than silently taking the batch owner — so mixed batches surface for a glance. (effort S)

## AREA: Portal/chat/task file uploads → administrator (Document Brain / intake) wiring
SUMMARY: Files that staff or portal users upload through chat messages and task updates are NOT processed by the "document brain" (the intake that classifies, correctly owns, de-duplicates, dates, links to compliance and makes content searchable). Chat attachments are the worst case: they are stored as loose files referenced only inside a chat message and never become a Document at all — invisible to the Documents centre, search, trace, compliance and every person/company profile. Task attachments do become a Document, but a barebones one (category "Attachment", owned only by the task's company, no type/dates/owner-resolution/dedup and no in-file text), so they are findable by filename only. Even compliance-critical "proof of completion" files uploaded to close a task get this stripped-down treatment. The net effect is that a large, growing share of the business's documents live outside the system's brain, which directly undermines the owner's goal of "fully relying on the system".
- [critical/gap/CONFIRMED] Files sent in chat never become documents — invisible to the whole system
    WHY: When a staff member or the owner attaches a file in a chat message (e.g. a signed contract, an invoice, a passport photo), the system stores the file but never records it as a document. It will not show up in the Documents centre, in search, in compliance checklists, in the trace/history view, or on the relevant person or company. It effectively disappears into the chat and can only ever be found by scrolling back through that exact conversation. This is the single biggest hole in 'relying on the system' for documents.
    FIX: In both postMessage actions, after a successful storage upload, create a first-class Document for each attachment and run it through the brain review-first. Concretely: for each file call extractDocumentFromFile then autoFileDocumentAction (or a shared helper that wraps them) with contextPersonId = the sender's person id (portal) and contextCompanyId = the thread's companyId when set, so owner resolution has a hint; store the returned document id on the attachment JSON (add an optional `documentId` field to the Attachment type in chat.ts:32) so the chat bubble links to the filed document. Route uncertain reads to Quarantine (already the brain's default) so nothing is mis-owned silently. Reuse the already-uploaded bytes rather than re-uploading. Keep the raw chat file for the bubble preview but make the Document the system-of-record. (effort M)
- [high/gap/CONFIRMED] Task attachments are filed as blank 'Attachment' documents with no classification, owner, dedup, dates or in-file search
    WHY: When someone attaches a file to a task update or completes a task with a file, the system does save it as a document — but a bare one. It is titled just with the raw file name, tagged only 'Attachment', owned by the task's company (never the person who sent it or the person the task is about), and its contents are not read. So you can only find it by typing the exact file name; you cannot find it by what is inside it, it never counts towards any compliance checklist, its expiry date is never captured for the renewal radar, and duplicates are not caught. It is in the cabinet but unlabelled.
    FIX: Rework createTaskAttachment to run the brain review-first: build a FormData with the file plus contextPersonId (resolve from createdBy 'portal:<Name>' / the task owner) and contextCompanyId=task company, call extractDocumentFromFile then autoFileDocumentAction, and link the returned document to the task via linkDocumentTask. At minimum (if you keep the lightweight path) call extractDocumentFromFile and pass docType/issuer/referenceNo/issueDate/expiryDate into createDocument and call setDocumentText with the read fullText so content search + renewal radar work, set personId when the task is person-centric, and run findDocumentsByHash for dedup. Keep category 'Attachment' only as a last resort when the catalogue can't classify. (effort M)
- [high/gap/CONFIRMED] Compliance 'proof of completion' files are stored but never read or verified
    WHY: Some tasks require a file to be attached before they can be marked done (for example, proof a licence was renewed). Today that proof is accepted and stored, but the system never reads it, never checks it is the right kind of document, never captures its expiry date, and never links it to the relevant compliance checklist. So the task shows 'done with proof', yet the proof itself is an unlabelled, uncategorised file that does nothing for compliance tracking.
    FIX: Once createTaskAttachment runs the brain (see task-attachment-no-brain), completion proofs will be classified, dated and reconciled automatically. Additionally consider, when a task is linked to a pipeline/commitment/requirement, passing that owner as the context so reconcileOwnerCompliance and findRenewalTarget can chain the proof to the right checklist item. (effort S)
- [medium/bug] Task-attachment documents are never attributed to the person who uploaded them or the task's people
    WHY: A file a staff member attaches to their task is filed only against the company, never against them. So it will not appear on that person's record or their document list, even though they are the obvious owner. This makes per-person document views and staff dossiers incomplete.
    FIX: Resolve the uploader's person id (parse 'portal[-mgr|-hr|-dir]:<Name>' or, better, pass the person id explicitly from the portal actions which already have me.id) and set it as personId when the attachment is clearly the person's own (e.g. an ID/certificate) — or at least record it via the brain's owner resolution. For personal documents prefer personId over the task company as owner. (effort S)
- [medium/improvement] Chat files pile up in the documents bucket with no cleanup or size limit
    WHY: Files attached in chat are dropped into the same private store as real documents but are never tied to a document record, never deduplicated, and are not removed when a message is deleted. Over time this becomes a growing pile of untracked files taking up storage with no way to manage it.
    FIX: Once chat attachments become Documents (chat-uploads-orphaned), storage is managed through the documents lifecycle (dedup via hash, removal via removeDocumentFile, Trash/retention). Separately, add the same 20MB per-file cap to both chat postMessage actions. (effort S)
- [low/simplify] Three copies of the same safeName() filename sanitiser
    WHY: The same small piece of code for cleaning up file names is copied in three places. It works, but keeping three copies in step is error-prone.
    FIX: Export safeName from a shared module (e.g. src/lib/documents.ts already re-exports documents-shared) and import it in both chat actions; delete the two local copies. (effort S)

## AREA: Portal profile & request uploads (staff-facing document ingestion)
SUMMARY: Staff can upload their required documents from the portal profile, and staff/managers can attach files to requests. Both paths save real, visible Document rows and (for profile uploads) tick the compliance checklist. But neither path runs the "intake brain" (autoFileDocumentAction) that every other upload uses: there is no duplicate detection, no catalogue-based classification, no quarantine/review-first hold, and no owner/facts correlation. The result is that a staff self-upload instantly raises a person's compliance score to green with no human check and no dedup, and identical files pile up. Full-text search does mostly work (recovered from the extraction cache), so uploaded docs are findable. Separately, the request-attachment download route authorises against a dead legacy column, so on any multi-recipient request the legitimate recipients are blocked (403) from opening the attachment.
- [high/bug/CONFIRMED] Recipients can't open attachments on multi-recipient requests (broken authorisation)
    WHY: When a staff member sends a request to more than one person (or the request desk moved to its current multi-recipient design), the people it was sent to are blocked from opening any attached file — the system says they're not allowed. Only the person who raised the request can see the attachment.
    FIX: Replace the addressee_id check with the join-table check: allow if (requester_id === me.id) OR (await isRecipient(u.request_id, me.id)). Import isRecipient from @/lib/requests. Keep the owner/admin short-circuit as-is. (effort S)
- [high/gap/CONFIRMED] Portal uploads never deduplicate — the same file piles up
    WHY: If a staff member uploads the same passport twice (or re-uploads after a reminder), the system keeps every copy as a separate live document. The admin upload catches identical files and moves the copy to Trash; the portal upload does not, so duplicates accumulate on people's files and clutter search and the person drawer.
    FIX: Before createDocument in the profile path, compute the hash (hashFile) and call findDocumentsByHash(hash, undefined, {excludeCompilations:true}); if a live copy exists for the same person, re-point the requirement at the existing doc (or replace-and-archive) instead of creating a new row. Simplest safe option: route both portal paths through a shared helper that does hash-dedup + createDocument + optional review flag. (effort M)
- [high/gap/CONFIRMED] Staff self-uploads instantly mark compliance green with no admin check
    WHY: The moment a staff member uploads a file against a checklist item, that item counts as satisfied and the person's compliance score jumps — even if the file is the wrong document, blank, expired, or a photo of something unrelated. There is no review-first hold; the admin 'Verify' tick is optional after the fact, and busy admins may never notice.
    FIX: Give staff uploads a lighter 'received, pending admin confirmation' treatment that does NOT count toward the mandatory score until an admin verifies — e.g. a distinct status ('submitted') that scores 0 until verified, or set review_status='needs_review' on the doc and surface these in the admin review queue. At minimum, only set status='received' when extraction succeeded and the file type matches the expected category; otherwise flag for review. (effort M)
- [medium/gap] Portal uploads skip the document catalogue — wrong type, wrong shelf, no house name, weak search
    WHY: Documents uploaded through the portal are named after the checklist label and never get the system's proper document type, standard shelf, or house-format name (e.g. 'DS_Passport_EXP-2028-01-01'). They also don't get the catalogue's expiry rules applied. This makes them harder to find by type, inconsistent with admin-filed docs, and means expiry tracking can be missed.
    FIX: Run deriveFiling(file.name, label, fullText) on the portal profile upload and set doc_type + expiryKind + expiryDate from it; compose the title with buildDocTitle when an owner prefix is available (fall back to the label). Consider routing the whole thing through autoFileDocumentAction with a forced person owner + a 'staff-submitted, review-first' flag rather than duplicating the logic. (effort M)
- [low/gap] Portal uploads don't run correlation, profile-suggestions, or company backfill
    WHY: When staff upload a document, the system doesn't offer to fill in blank profile details it can read from the file (e.g. a passport number or expiry), doesn't link related records, and doesn't refresh the person's overall compliance beyond the single item. These self-healing/enrichment steps only happen for admin uploads.
    FIX: After a successful portal upload, call enqueueDocumentSuggestions (personId, fields, clean=false so it always waits for a one-tap accept) and reconcileOwnerCompliance(personId, null). Keep everything blanks-only + review-first (never overwrite). (effort M)
- [low/improvement] Request attachments are second-class documents (no text captured, not searchable inside)
    WHY: Files attached to requests are saved as bare 'Attachment' documents with only the filename. Their contents aren't read, so you can't find them by searching for text inside the file, and they never get an owner beyond the sender's company.
    FIX: If request attachments should be findable, run extractDocumentFromFile first (as the profile path does) so the cache is warm and uploadDocumentFile captures full text. Otherwise leave as-is and document that request attachments are intentionally lightweight. (effort S)
- [low/simplify] Upload logic is copy-pasted across three paths — consolidate
    WHY: There are now three separate places that turn an uploaded file into a document (admin intake, portal profile, request attachment), each doing a different subset of the work. That drift is exactly why the portal paths silently miss dedup, classification and review. One shared entry point would keep them in step.
    FIX: Extract a shared ingestFile({file, owner, mode}) helper that always hash-dedups, optionally runs deriveFiling + buildDocTitle, and can quarantine/flag-for-review; have all three callers use it with mode presets ('admin-auto', 'staff-review-first', 'attachment'). (effort L)

## AREA: Quarantine / "could not place" bucket + inbox review
SUMMARY: The intake brain sorts dropped files into Filed / Quarantine ("couldn't place") / Trash, and surfaces the quarantine pile through a "Verify" worklist on /inbox (grouped into "Couldn't place", "Unsure reads", "No owner"). The core routing, dedup and owner-resolution logic is genuinely sophisticated and mostly conservative. But three things undermine the owner's goal of "check everything under could not place and fix it tightly": (1) the automatic library duplicate sweep runs DAILY and can silently yank already-filed, vetted documents back into quarantine using weaker logic than the intake's own carefully-guarded near-duplicate check; (2) the three actions built specifically to drain and recover the quarantine pile (retry re-scan, review-false-duplicates, single-doc file-from-quarantine) are not wired to any button — they only run from a developer script the non-technical owner cannot use; (3) generic phone-camera filenames (IMG_1234, scan001) bypass a key false-duplicate guard, so two different people's filled-in standard forms can be flagged as duplicates. Recovery from quarantine is otherwise reasonable (bulk assign/confirm/bin in Verify), and nothing is ever hard-deleted automatically.
- [critical/bug/CONFIRMED] Daily automatic sweep can silently pull already-filed documents back into quarantine
    WHY: Once a day a background job re-scans your whole filed library for duplicates. If two genuinely different documents happen to share a reference/registration number (very common in Tanzania — e.g. a company's incorporation certificate and its BRELA search both carry the registration number, or a licence and its receipt share a control number), the job quietly removes one of them from your library and dumps it into the 'couldn't place' pile — even if you already reviewed and filed it. So the pile you are trying to empty can refill itself with documents that were never actually duplicates, and the compliance count for that company can drop overnight for no visible reason.
    FIX: Make the sweep reuse findSameLogicalDoc's guards for the 'same-reference' path: before quarantining a reference-only cluster member, require matching catalogue type (deriveFiling(...).typeKey equal) and non-conflicting expiry/subject tokens; otherwise skip. Also exclude vetted_at IS NOT NULL rows from auto-quarantine (only surface them in the manual Find-duplicates review). At minimum, downgrade 'same-reference' clusters to the manual-review-only treatment already given to 'same-title' (actions.ts:1579). (effort M)
- [high/gap/CONFIRMED] The tools built to drain and recover the 'couldn't place' pile aren't reachable from the app
    WHY: Three features exist specifically to shrink the 'couldn't place' pile — 'try reading the unplaceable scans again and auto-file the ones that now resolve', 'file the ones that were wrongly flagged as duplicates', and 'file this single quarantined document' — but none of them has a button anywhere in the app. They can only be triggered by a developer running a script on a laptop. So the owner's explicit ask ('check everything under could not place and fix it') can't actually be self-served: the pile can only be cleared one-by-one in Verify, or by asking an engineer to run scripts.
    FIX: Add two buttons to the Verify tab (near 'Library tools' in intake-shell.tsx:97): 'Re-try unreadable scans' → retryQuarantineAction, and 'Clear false duplicates' → reviewFalseDuplicatesAction (show its {checked,filed,kept} summary). Wire fileFromQuarantineAction as a per-row 'File' action in the 'Couldn't place' group so a single doc can be filed without picking an owner when it already has one. (effort S)
- [high/bug/CONFIRMED] Phone-camera scans with generic names can be wrongly flagged as duplicates of a different document
    WHY: The safeguard that stops two different people's documents being called duplicates works by comparing the names in the filenames (e.g. 'Rehema-Filimini' vs 'Vailet-Peter'). But phone photos are usually named things like IMG_1234.jpg or scan001.pdf, which contain no names. When both files have nameless filenames, that safeguard is skipped entirely and the decision falls back to comparing the words inside the documents. Standard forms (like the staff data-collection form) share most of their printed wording between different people, so two different staff members' filled-in forms photographed on a phone can be held as 'possible duplicates', sending a valid new document into the 'couldn't place' pile.
    FIX: When either filename has no distinctive subject tokens, do NOT rely on content Jaccard alone — require an additional signal (same reference OR same normalised title OR a higher Jaccard threshold like 0.85) before holding as near-duplicate. Optionally strip common form boilerplate before tokenising, or skip the content check entirely for catalogue types known to be form templates. (effort M)
- [medium/ux] No dedicated 'couldn't place' view — it's mixed into a broader 'Verify' list
    WHY: The owner asked to 'check everything under could not place'. There is no screen or tab that shows exactly that. The quarantine pile is folded into a broader 'Verify' worklist alongside 'unsure reads' and 'filed-but-no-owner', and the Inbox tab bar only offers Verify / Inbox / Trash. You can't open just the 'couldn't place' items, can't deep-link to them, and the count shown on the tab is the combined total, so it's hard to know how big the actual 'couldn't place' problem is or to work through only that pile.
    FIX: Either add a 'Couldn't place' tab to IntakeShell backed by getIntakeBucket('quarantine') with the recovery actions from finding #2, or at least show the per-group counts on the Verify tab and support a deep link (e.g. /inbox?group=place) that opens with only that group expanded. (effort M)
- [medium/improvement] Documents the system couldn't place are invisible to search and to ORI Ask by default
    WHY: When the system can't place a document it marks it as archived/history, which hides it from normal search and from ORI's answers unless you specifically turn on 'Include history'. That's sensible for keeping unverified data out of answers, but it means a document you're actively hunting for can be genuinely unfindable through the search bar or by asking ORI — the only way to reach it is the Verify screen. For a non-technical owner who expects search to find everything, this is a silent dead-end.
    FIX: When a search/Ask yields few/no active results but a quarantined doc matches, surface a small 'N documents are waiting in Verify (couldn't place)' hint linking to /inbox, rather than returning nothing. Alternatively give quarantine its own lifecycle label distinct from archived history so it can be optionally included. (effort M)
- [medium/bug] Owner auto-matching can attach a document to the wrong company via loose substring matching
    WHY: When guessing which company/person a document belongs to, the matcher accepts a hit whenever one name contains the other as text. Short or generic names can therefore match the wrong owner (for example a company whose name is a substring of another's, or a person's name contained inside an unrelated word). A wrong-owner match is worse than quarantine because the document is filed silently to the wrong company and won't appear in the 'couldn't place' pile for review.
    FIX: For companies, require the substring match to be a whole-word/token boundary hit and a minimum matched length (e.g. >=6 chars) rather than any substring; keep only the strongest candidate and, when two candidates tie closely, quarantine instead of guessing (safer to review than to mis-file silently). (effort M)
- [low/improvement] Bulk 'Assign owner' files without re-reading, and learns from possibly-thin metadata
    WHY: When you bulk-assign an owner to several 'couldn't place' documents, the system files them and also 'learns' that documents like these belong to that owner — but it never re-reads the files first, and it teaches itself from whatever title/type it already had (often the messy filename for an unreadable scan). If a couple of unrelated scans are assigned together for convenience, the system can learn a misleading rule that mis-routes future documents.
    FIX: Only record an owner-correction when the doc has a meaningful, non-fallback title/issuer/docType; skip learning for filename-only rows. Optionally re-extract on assign so the filed doc carries real metadata. (effort S)

## AREA: Guardrails, autonomy tiers &amp; self-healing health
SUMMARY: The safety spine (Propose → auto-if-safe → log → undo, with a Tier-3 gate for send/spend/delete) is genuinely coherent and well-built: every automated write goes through automation_events with a recorded undo, sends are gated by canAutoSend (fails closed), automated paths archive rather than hard-delete, and a nightly watchdog re-runs stalled jobs before alerting. It largely delivers on "handles scenarios without owner intervention." However there are real gaps that undermine two of the three tiers: the "monthly spend cap" can never actually fire (all cost rates are zero, so spend is always £0 vs the cap), the AUTO_HARD_DELETE_FORBIDDEN safeguard is defined but never called anywhere (so it protects nothing), the email job is permanently mis-reported as broken and "self-repaired" every single day (a false alarm masked by a false fix), and pausing/resuming the Tax & Legal switch silently resets a shared date-baseline that also governs renewals, notices and probation reviews — so those can quietly stop being created.
- [high/gap/CONFIRMED] The AI monthly spend cap can never trigger — it's a dead safety net
    WHY: The system offers an 'AI monthly spend cap' the owner can set to stop runaway AI costs. But because every AI call is currently costed at zero, the running total is always £0, which is never 'over' any cap the owner sets. If a paid model is ever switched on and someone forgets to fill in its price, the cap will silently do nothing — the exact runaway-spend scenario it exists to prevent.
    FIX: Add a token-based fallback ceiling so the cap still bites when a rate is missing: e.g. if aiMonthlySpendCap is set but no rate resolves for a model in use, either treat the cap as a token budget or refuse the call and log. At minimum, surface a health warning when a cap is set AND a paid (non-zero-rate) model is configured but its MODEL_RATES entry is absent, so the owner is told the cap is not actually protecting them. (effort M)
- [medium/gap] The 'never auto-delete' safeguard exists but is never actually called
    WHY: The system documents a rule that automated processes must never permanently delete data (they should archive instead). There's a guard function written to enforce this, but nothing in the codebase ever calls it. So the rule is a promise on paper only — if a future automated path were wired to hard-delete, this guard would not stop it because it isn't in the path.
    FIX: Either (a) call assertReversibleAutoAction() at the top of every automated deletion helper that could ever run without a human (guarding the pattern for the future), or (b) drop the pretence and document it honestly as 'no automated path deletes; enforced by code review, not a runtime guard'. Option (a) is safer given the roadmap adds more autonomy. (effort S)
- [medium/bug] The email job is reported as broken and 'auto-repaired' every single day — a false alarm hiding a real blind spot
    WHY: The health watchdog watches the 'Automated emails' job and expects it to log a success each day. That job never logs a success on its normal run — it only logs per-category rows and only logs an error if it crashes. So the watchdog always thinks email is stale, and the nightly self-repair 're-runs' it and logs a fake success. The owner sees the system 'looking after itself' daily when nothing was ever wrong, and a genuine email failure would be harder to spot because a repair success always appears.
    FIX: Record a 'cron.email' ok event on the successful path of the email cron route (or inside runDueAutomations once per run), matching the other crons which all log their kind on success. Then the watchdog sees real successes and the daily phantom repair stops. (effort S)
- [medium/bug] Un-pausing 'Tax & Legal' silently stops renewal, notice and probation tasks that came due while paused
    WHY: There is one shared 'only act on dates from here forward' line. When the owner un-pauses the Tax & Legal switch, that line is reset to today. But the same line also governs document-renewal tasks, lease/insurance notice tasks, probation reviews and gap-chasing. So pausing then resuming Tax & Legal can quietly cause the system to never create renewal/notice/probation tasks whose dates fell during the pause — a silent miss the owner isn't warned about, in exactly the kind of statutory work this system is meant to never drop.
    FIX: Give the Tax & Legal (obligations) cadence its OWN baseline key, and reset only that on resume — leave the renewals/commitments/probations/gaps baseline alone. Alternatively, on resume do not move the baseline forward at all (let the normal dedup guards prevent duplicates) so genuinely-due work is still picked up. (effort M)
- [low/remove] An unused, unscheduled duplicate of the automations job still exists
    WHY: There's a standalone 'automations' web endpoint that runs the same date-chasing work as the morning run, but it isn't on the schedule anywhere, so it never fires. It's dead code that can confuse future maintenance (someone may think time-automations run twice) and its error logging uses a name the watchdog doesn't watch.
    FIX: Delete src/app/api/cron/automations/route.ts (its work is fully covered by morning-run), or if kept as a manual trigger, note that clearly and rename its event kind to something the watchdog either ignores or watches deliberately. (effort S)
- [low/improvement] The runaway-cascade guard counts all concurrent chains together, not the depth of one chain
    WHY: The safety limit that stops automated 'one thing triggers another' chains from spiralling is really a limit on how many chains are running at the same moment in one server, not on how deep a single chain goes. In the rare case many documents/tasks are processed at once in the same warm server, a legitimate chain could be skipped just because others are in flight — the automation quietly does nothing with no log.
    FIX: Track true recursion DEPTH per request (e.g. an incrementing counter/AsyncLocalStorage) rather than a shared Set size, and log when a cascade is skipped by the guard so a silently-dropped automation is at least visible. Raise or remove the concurrency cap independently. (effort M)
- [low/bug] Morning run drops the count of recurring-obligation tasks it created from its log
    WHY: The morning run reports how many renewal/notice/probation tasks it created, but omits the count of recurring tax/legal obligation tasks it created, so the daily activity note under-reports what the system actually did.
    FIX: Initialise work with obligations: 0 (and include it in the logged/returned payloads) so the morning summary reflects obligation tasks created. (effort S)
- [low/improvement] Lowering the spend cap can take up to a minute to take effect
    WHY: If the owner sets or tightens the AI spend cap, the change may not be honoured for up to a minute because the over-budget answer is cached. Minor today (the cap is inert anyway), but worth fixing when the cap is made real.
    FIX: Call clearSpendCapCache() from the settings save path when aiMonthlySpendCap changes, so a new cap is honoured immediately. (effort S)

## AREA: Documents & Compliance page UI
SUMMARY: The Documents & Compliance page (`/documents`) stacks four heavy panels — Compliance score, Expiry radar, Needs attention, and the Documents table — one under the other in a single scroll. Each panel re-derives and re-displays the SAME three facts (missing / expired / expiring) from the SAME two data sources (compliance scores + live documents), so the owner reads the same numbers three or four times on one very long screen. It is functionally sound and the individual panels are well built, but the information architecture is repetitive rather than layered, which is exactly why it reads as "long and repetitive". With no documents uploaded yet, every company also correctly shows 0% with the identical "12 missing" list, which multiplies the repetition visually. The fix is to merge the compliance-score and needs-attention panels into one "what needs doing" surface, demote/absorb the expiry radar, and let the table be the only exhaustive list — cutting the page roughly in half without losing any capability.
- [high/simplify] Compliance score and Needs attention are the same data twice — merge into one action surface
    WHY: The 'Compliance score' panel and the 'Needs attention' panel show the owner the same three facts (what's missing, what's expired, what's expiring) from the same records, just arranged differently. Reading the same thing twice on a page that's already too long is the core reason it feels repetitive. Combine them into one panel: the portfolio ring and headline numbers at the top, then a single worst-first action list underneath.
    FIX: Fold the two into a single `glass elevated rounded-3xl` panel: keep the portfolio ring + the four headline tiles (missing/expired/expiring/all-clear) as the header (compliance-score-panel.tsx:317-345), and below it render ONE worst-first, actionable list — reuse NeedsAttentionPanel's row + Chase/Renew/Add/View actions and its All/Expired/Expiring/Missing filter chips. Drop the separate per-owner ScoreRow scorecard list (or make it a secondary 'By owner' toggle on the same panel). Net: one panel does glance + act instead of two panels doing glance then act. (effort L)
- [high/ux] Every company renders an identical 0% / '12 missing / Certificate of Incorporation, MEMARTS' row
    WHY: Before any documents are uploaded, all 13 companies score 0% and show the exact same missing-document list, so the panel becomes 13 near-identical rows the owner has to scroll past. This is correct data but a poor first impression. When many owners share the same status, summarise them instead of listing each one.
    FIX: When a run of owners share the same status/score, group them: e.g. a single '13 companies not started · 12 documents each' summary row that expands on tap, instead of 13 rows. At minimum, cap the visible attention list (like the table's INITIAL=8 / 'Show all' pattern already used in needs-attention-panel.tsx:68,351-357) and show the identical-preview text once as a group heading rather than repeating it per row. (effort M)
- [medium/remove] Expiry radar repeats the table's timeline and is the one non-Aurora box on the page
    WHY: The 'Expiry radar' ribbon shows the same upcoming-expiry information that the Documents table's Timeline view and the Needs attention panel already show, and it's styled as a hard-bordered box that doesn't match the glass look of the rest of the page. It adds a fourth repetition of expiry data. Either remove it or fold its one useful idea (a visual 'wave coming' timeline) into the table's existing Timeline view.
    FIX: Remove the standalone ExpiryRadar from the page (page.tsx:95). If the 'see the wave coming' visual is valued, move the 0–90 day ribbon into the DocumentsTable Timeline view header as a compact glance strip, so expiry lives in exactly one place. If kept temporarily, at least restyle it to `glass elevated rounded-3xl` to match Aurora. (effort S)
- [medium/improvement] Page skips the Aurora CommandWall/Hero frame and stacks bare sections
    WHY: The page uses a plain centred div and a standard header rather than the app's standard Aurora page frame. Adopting the shared frame makes it match every other page and gives the panels consistent rhythm and spacing, which on its own makes a long page feel calmer.
    FIX: Wrap the page in `CommandWall`; lead with a `Hero` that carries the portfolio ring + StatStrip (missing/expired/expiring/all-clear) so those numbers live once at the top; render the merged action panel + table as CockpitModules with Reveal stagger. Reuse StatStrip/FilterChips rather than the per-panel hand-rolled tiles and chips. (effort M)
- [medium/simplify] Expired / Expiring counts appear up to four times before the table
    WHY: The number of expired and expiring documents is printed in the page subtitle, again in the compliance headline tiles, again as the Needs attention filter tabs, and again as the radar's caption and the table's status chips. One authoritative place is enough.
    FIX: Pick one home for the glance counts (the Hero StatStrip after the merge). Drop the duplicated counts from the header sub-line (or keep only 'N tracked'), and let the table chips remain as FILTERS (their legitimate second job) rather than as a second scoreboard. (effort S)
- [low/remove] categoryForRequirement + addDocumentHref are copy-pasted across two components
    WHY: The same small helper functions that guess a document category and build the 'Add document' link are written out twice in two files. If the categories ever change, someone has to remember to edit both. Move them to one shared place.
    FIX: Extract to a shared helper (e.g. src/lib/documents-shared.ts or a small compliance-links util) and import in both. This also naturally falls out of merging the two panels (see merge-score-and-needs-attention). (effort S)
- [low/improvement] Table receives every document including archived, then hides most — heavier than needed
    WHY: The page pulls in every document ever filed, including archived ones, on every load, even though archived items are hidden until the owner ticks a box. As the archive grows this makes the already-long page slower to load. Consider loading archived rows only when asked.
    FIX: Either lazy-load archived rows when 'Show archived' is toggled, or keep includeArchived only for the lineage maps and pass a live-only list to the panels. Low priority — correctness is fine; this is purely payload/perf as the archive grows. (effort M)

## AREA: Company detail page UI (/companies/[id]) — layout, tabs, panels, compliance checklist
SUMMARY: The company page is a five-tab surface (Overview, Profile, Tasks, Timeline, Org) that packs a lot into two heavy tabs. The Overview tab is a calm, well-judged snapshot. The Profile tab is where it gets crowded: the SAME document facts appear three times in a row (Key documents panel, then the Statutory checklist inside Company files, then the shelf list of the actual files) plus a duplicate Compliance number that already sits on Overview. On a company with nothing filed, the Statutory checklist expands to a ~17-row, 8-shelf wall of "Missing", which reads as alarming and heavy rather than glanceable. The code is sound and there are no correctness bugs of note here; the issue is repetition and density versus the owner's "minimal + beautiful" goal. The biggest wins are to collapse the checklist to a compact score-plus-"show details" (which the component already supports), and to fold the near-identical Key documents panel into the checklist so the same five statutory numbers aren't shown twice on the same screen.
- [high/simplify] The same statutory documents are shown three times on the Profile tab
    WHY: On the Profile tab, a company's key papers (Registration, TIN, VRN, Licence, Lease) appear in a 'Key documents' box, then again inside the 'Statutory checklist', and then a third time as the actual files in the shelves just below. It's the same information restated three times on one screen, which makes the page feel long and repetitive rather than minimal.
    FIX: Drop CompanyKeyDocuments from the Profile tab (remove page.tsx:425-431) and let the Statutory checklist be the single home for those statutory numbers/expiries — it already shows status, expiry and 'Add/Link'. If a quick at-a-glance headline is still wanted, surface only the 3-4 headline numbers (TIN/VRN/Reg no.) inside the CompanyProfile 'Identity' section next to the typed fields, not as a separate panel. (effort S)
- [high/ux] Statutory checklist expands to a 17-row, 8-group 'Missing' wall
    WHY: When you open the Statutory checklist for a company with few filed papers, it becomes a long list — up to ~17 rows grouped under eight headings — every one stamped 'Missing'. For a non-technical owner this reads as a page full of red flags and feels heavy, when the real message is simply 'we still need most documents'. It works against the 'minimal + beautiful' goal.
    FIX: Keep the checklist collapsed by default (already done via defaultOpen={false}), but when expanded default to a compact mode: show ONLY items that need action (missing/expired/expiring/requested) grouped simply, with a 'Show all N requirements' toggle to reveal the verified/waived ones. Move the 'add VRN, extra registrations…' helper (checklist:242) behind a small info affordance rather than a persistent full-width banner. Consider showing the shelf grouping only when >~6 actionable items exist; below that, a flat action list is calmer. (effort M)
- [medium/simplify] The compliance score is displayed in three places on one company
    WHY: A company's compliance percentage shows up as a tile on Overview, again as a full 'Compliance' card right beneath it, and a third time as a ring inside the checklist on the Profile tab. One clear compliance readout is enough; repeating it makes the page busier without adding meaning.
    FIX: On Overview keep EITHER the Compliance tile OR the ComplianceSummaryCard, not both — the summary card (with its progress track + 'Next:' gap) is the richer one, so drop the Compliance tile from the 6-tile grid (page.tsx:221-229) and let the card own compliance. The checklist ring on Profile is fine as the interactive detail. This also lets the tile grid drop to 5 tiles / a cleaner 5-col layout. (effort S)
- [medium/ux] Profile tab stacks six heavy panels in one scroll
    WHY: The Profile tab is doing too many jobs at once: AI suggestions, relationships, a graph link, the full editable company form, tracked facts, governance/board data, key documents, and the whole documents+compliance section — all stacked vertically. It's a very long page and mixes 'edit the company record' with 'manage all its files', which are different tasks.
    FIX: Split the Profile tab's two concerns. Option A (minimal-change): give Documents/compliance its own tab (e.g. a 'Files' tab) so Profile is purely the record + facts + governance + relationships, and Files holds the checklist + shelves + staff files. Option B: keep one Profile tab but wrap Facts, Governance and Staff files each in a collapsed <details> so the default view is short and the owner expands only what they need. Either way, move SuggestionTray to only appear when it has pending items (avoid an empty panel). (effort M)
- [low/simplify] 'Documents needing attention' repeats the Expiring/Overdue tiles just above it
    WHY: The Overview shows 'Expiring' and 'Overdue' count tiles, and then immediately lists 'Documents needing attention' — which is the same expiring/expired documents spelled out. It's not wrong, but the tile and the list cover the same ground back-to-back.
    FIX: Make the 'Expiring' tile the entry point and only render the 'Documents needing attention' list when there is something to act on (already the case) — but consider merging: the tile could deep-link to this section, and the section header could carry the count, removing the standalone tile. Low priority; the list is genuinely useful, so this is about trimming the tile, not the list. (effort S)
- [low/simplify] Multiple identical 'Add document' buttons on the same panel
    WHY: The documents area has an 'Add' button on the 'Company files' header and another 'Add' on every one of the eight shelf rows, all of which open the exact same blank form. It clutters the shelf headers with repeated buttons that don't behave differently.
    FIX: Either remove the per-shelf Add buttons (rely on the one header Add), or make the per-shelf Add actually prefill that shelf/category (pass a representative category) so it earns its place. Given 'minimal', removing the eight duplicate buttons is the cleaner move. (effort S)
- [low/ux] All eight document shelves render even when empty
    WHY: The file browser always shows all eight folders even for companies that have filed almost nothing, so you see rows of empty folders saying 'Nothing filed here yet'. For a minimal look, empty folders could be tucked away until they have something in them.
    FIX: Render only shelves that contain documents (or match the active search), and add a subtle 'Show all folders' toggle to reveal the empty ones for filing. This keeps the browser calm for near-empty companies while preserving the drop-anywhere mental model. (effort S)

## AREA: Document-scenario coverage (self-healing gap map): the intake brain in src/app/documents/actions.ts + src/lib/doc-catalog.ts + src/lib/documents.ts
SUMMARY: The intake pipeline is genuinely strong: it reads a dropped file (typed text, layered OCR, or vision), classifies it against a ~45-type catalogue, resolves the owner through six deterministic fall-throughs (ID match, folder/context, fuzzy name, learned owners, cross-document correlation), and routes it to Filed / Quarantine / Trash so nothing is ever lost. Most common scenarios (renewals, photo-vs-PDF, exact duplicates, wrong-owner learning, HEIC photos, superseded copies) are handled well. The gaps are mostly about latency and edge inputs: freshly auto-filed documents are NOT full-text indexed at intake (they wait for a slow nightly sweep), password-protected/corrupt files get a misleading generic message, a single photo holding several documents rarely splits, and a handful of scenarios (already-expired alerting, Swahili-named types, chat/task-uploaded docs) never touch the classification brain at all. None of these lose data; they mean the owner has to intervene where the system claims it self-heals.
- [high/bug/CONFIRMED] Auto-filed documents are not searchable by their content until a slow nightly sweep catches up
    WHY: When the system auto-files a document (the main Dropbox/bulk-drop path), it reads the whole document to work out who it belongs to, then throws that text away instead of saving it. So straight after filing, searching for a word or number INSIDE the document finds nothing, and the system can't cross-link a later document that shares the same reference. A background job fixes this, but only 20 documents a night — so a drop of 200 files takes ten nights to become fully searchable.
    FIX: After uploadDocumentFile in autoFileDocumentAction (actions.ts:479), when finalState==='filed' persist the already-read text: if res.fullText, call setDocumentText(id, res.fullText, res.textSource ?? 'ocr') then reindexEntity('document', id); else void ensureDocumentText(id).catch(()=>{}) as the manual path does. This costs zero extra AI (text is already read) and makes auto-filed docs instantly searchable/correlatable, matching the manual path. (effort S)
- [medium/gap] Password-protected or corrupt files get a vague 'couldn't render' message instead of a clear 'this file is locked' one
    WHY: If someone drops in a password-protected PDF (common for bank statements and payslips) or a truncated/corrupt file, the system just says it couldn't read the scan and suggests a clearer photo — which is misleading and sends the owner chasing image quality when the real problem is the password. It should recognise a locked/broken file and say so, so the owner knows to supply an unlocked copy.
    FIX: In the PDF branch, detect the encryption/password error from unpdf (its error name/message includes 'password'/'encrypted') and return a distinct failKind (e.g. 'locked') with note 'This PDF is password-protected — please upload an unlocked copy.' Similarly detect a zero-page/parse-fail as 'corrupt'. Surface these reasons in the quarantine card so the owner acts correctly. (effort M)
- [medium/gap] A single photo containing several stacked documents is filed as one, not split
    WHY: The system is good at splitting a multi-PAGE PDF that bundles several documents. But if someone photographs several documents laid out in one picture (or sends one WhatsApp image of a passport next to a permit), only one image is sent to the reader, so it usually treats the whole thing as a single document rather than offering to split it.
    FIX: For image inputs, keep the split path reachable: rely on the existing detectCompilationForDocumentAction/splitDocumentAction to offer a manual split on any quarantined image too (surface the 'looks like several documents?' action in the quarantine UI regardless of segmentCount), and strengthen the prompt for single images to look for multiple distinct headers/reference numbers. Low blast radius since split is review-before-commit. (effort M)
- [medium/gap] An already-expired document is filed silently with no 'this is already out of date' warning
    WHY: If the owner uploads a licence or permit that has ALREADY expired, the system files it and reads the expiry date, but nothing flags 'this is already expired — you may be non-compliant right now'. It is treated the same as a valid document; the owner only finds out if they happen to look at the expiry column.
    FIX: At intake, when a filed document is a compliance type (catalogue expires===true) and expiryDate < today, still file it but record a system event / add a soft flag (e.g. reviewStatus note 'Already expired on filing') and let the renewal radar/Brief pick it up immediately, so the owner is told rather than having to notice. (effort S)
- [medium/gap] Documents uploaded via the staff portal, tasks or chat skip the classification brain
    WHY: When a staff member uploads a document through their portal checklist, or a file is attached to a task or chat, it is saved but does NOT go through the auto-filing brain — it is not classified against the catalogue, not de-duplicated, not owner-correlated, and its content is not indexed for search. So the same passport uploaded by staff vs dropped by the owner gets very different treatment.
    FIX: Route portal/task/chat uploads through a shared post-create step that at minimum runs ensureDocumentText(id) (so they are searchable) and deriveFiling for a house name + expiry, and ideally runs the dedup/correlation checks. Keeps behaviour consistent regardless of upload channel. (effort M)
- [low/improvement] Swahili-named document types are not recognised by the catalogue
    WHY: The catalogue that identifies document types only knows English (and a few local acronyms). A document titled or headed in Swahili (e.g. 'Leseni ya Biashara' for a business licence, 'Mkataba wa Ajira' for an employment contract) won't be recognised by type, so it won't get the right shelf, expiry rule or compliance link automatically — even though the AI reader is told to expect Swahili.
    FIX: Add common Swahili aliases to the high-value catalogue types (leseni ya biashara→business-licence, mkataba wa ajira→employment-contract, hati ya usajili→certificate-of-incorporation, kibali cha kazi→work-permit, etc.). Cheap, deterministic, and lifts classification for local-language documents. (effort S)
- [low/improvement] A non-document image (logo, screenshot, headshot) can be filed as a document
    WHY: If a logo, a headshot, a product-label photo or a random screenshot is dropped in, the system tries to file it as a business document. It won't lose it, but it can clutter the library with things that aren't really compliance documents, and it may guess a wrong category for them.
    FIX: Add a prompt field like is_business_document:false for logos/screenshots/headshots with no document structure, and when false route to quarantine with reason 'Doesn't look like a business document' rather than auto-filing. Optional; low severity because low-text images already tend to quarantine on confidence. (effort S)
- [low/improvement] The self-healing text/owner backfill is capped at 20 documents a night
    WHY: The nightly repair job that re-reads documents whose text was never captured (including all auto-filed ones, per the bigger bug above) only processes 20 documents per night. After a large import the backlog clears very slowly, so 'the system heals itself' is true but can take a week or more.
    FIX: Once auto-file indexes text at intake, keep the cap for genuine re-reads. If not, raise the nightly limit or run in batches until the null-text backlog is drained (there is already backfillDocumentText for a full pass — schedule it to run to completion after an import). (effort S)
- [low/improvement] A document with no identifiers and no owner is quarantined but has no path to auto-resolve later
    WHY: A document that names no company, no person, and carries no reference/TIN/phone/email (e.g. a generic policy or a blank-header letter) is correctly held in Quarantine. But the only automatic retry (retryQuarantine) just re-reads the file — if there was never any identifier to find, it will sit in Quarantine forever until the owner assigns it by hand.
    FIX: For identifier-less quarantine, lean on batch context more aggressively (folderHint/contextCompanyId already exist) and surface a clear 'assign owner' prompt with the folder/most-likely-owner pre-selected, rather than repeatedly re-reading a file that can never self-identify. Set expectations: this class needs one human tap. (effort S)
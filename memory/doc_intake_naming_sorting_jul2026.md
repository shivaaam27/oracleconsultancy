---
name: doc_intake_naming_sorting_jul2026
description: Doc upload/naming/sorting overhaul — unified content-naming, one-owner, certificate-supersedes-precursors, fast sorting. IN PROGRESS.
metadata:
  type: project
---

Owner ask (6 Jul 2026): fix document UPLOAD + NAMING + SORTING. Build order = 5 phases,
nothing pushed until owner review. Mapped the whole system with 2 Explore agents first
(deployed intelligence core — "errors defame the owner", change carefully). Key files:
`src/app/documents/actions.ts` (autoFileDocumentAction, extractPrompt, confirmSortItemAction,
findRenewalTarget), `src/lib/doc-catalog.ts` (deriveFiling/bestDocType, 50+ types),
`src/lib/documents-shared.ts` (buildDocTitle, displayDocName, DOC_CATEGORIES, categoryExpiryDefault),
`src/components/document-form.tsx` (editor, owner mode), `src/components/sorting-desk.tsx`,
`src/components/to-sort-panel.tsx`, `src/components/documents-workspace.tsx`, `src/components/smart-add.tsx`.
AI = Gemini only (see [[doc_intelligence_gemini_search_jul2026]]). Read pipeline is ALREADY
native-text-first then vision/OCR (unpdf/mammoth/xlsx → typed; scan/image → vision; layered
OCR floor Tesseract). Owner-resolution order + NAME_CONFIDENCE 0.95 gate → quarantine (To Sort).

## PHASE 1 — one owner, never both — DONE, tsc clean, NOT pushed
Removed the "Company + Person" combined ownership everywhere:
- `document-form.tsx`: `OwnerMode` = "company"|"person" (dropped "both"); removed the
  segmented "Company + Person" option; init = personId?person:company; inline new-person →
  person mode; AI-read reflection uses new `ownerModeFor(category,hasCompany,hasPerson)` —
  personal categories (Immigration/Passport/HR) → person, else company; ties broken by category.
- `actions.ts` autoFileDocumentAction: after owner resolution + category, if BOTH companyId &&
  personId set, collapse to one via `PERSONAL_DOC_CATEGORIES` (Immigration/Passport/HR→person
  else company). New module const `PERSONAL_DOC_CATEGORIES`.
(confirmSortItemAction already enforced exclusive-or on save.)

## PHASE 2 — the naming brain (extractPrompt upgrade) — DONE, tsc clean, NOT pushed
`extractPrompt` in actions.ts now has, before the JSON keys:
- **IDENTIFY THE TRUE TYPE** disambiguation: a receipt/invoice paid to OBTAIN something
  (TIN fee, permit fee) = Payment Receipt/Invoice, NOT the certificate; a CONTROL NUMBER/
  assessment/demand note/bill = payment instruction, NOT a licence (docType "Control Number"/
  "Assessment", expiryKind "no"); an APPLICATION/acknowledgement ≠ issued certificate; only the
  issued signed/sealed cert with a serial is the real thing. Explicit TIN-cert-vs-invoice,
  business-licence-vs-fee-receipt, permit-vs-application examples.
- **TANZANIAN DOCUMENTS** knowledge block: TRA (TIN/VRN/tax-clearance + control numbers), BRELA
  (incorporation/business names/annual returns), local-authority business licences, NIDA
  (National ID), Immigration (passport/residence/work permit A-B-C/visa), OSHA/Fire/sector,
  NSSF/WCF/PAYE/SDL; stamps/seals/coat-of-arms ⇒ issued cert, their absence on a plain printout
  ⇒ receipt/application/control number.
- **OWNER IS ONE OR THE OTHER** (near company/person keys): personal papers → person + omit
  company; business papers → company + omit person even if a director is named.
- **GROUND EVERYTHING / no hallucination** (replaced the terse "do not invent" line): every
  value must be visibly present or an unambiguous KNOWN-RECORDS match; omit if absent; lower
  confidence rather than guess (low honest read → human review).
⚠️ Prompt change — verified by tsc only; NEEDS real-document testing by owner (can't exercise
live AI naming in the dev sandbox reliably).

## PHASE 4 — sorting UX + speed — DONE (tsc pending final confirm), NOT pushed
- **"File" instant**: `confirmSortItemAction` — heavy `reconcileOwnerCompliance` + `fireDocumentReactions`
  (+ Phase-3 `retirePrecursorDocuments`) now run in `after()` (next/server); dropped the pointless
  `revalidatePath("/inbox")` (/inbox redirects to /documents).
- **Auto Sort**: new `autoSortReadyAction()` (actions.ts) files every "place" (ready-to-confirm,
  has guessed owner) item via `confirmSortItemAction` in a loop → {ok,filed}. New **Auto Sort N**
  button in `to-sort-panel.tsx` next to Smart Add (shown only when readyCount>0; accent, Wand2 icon;
  toast + refresh). Skips shaky/no-owner items (still need a glance).
- **Fix Details inline**: `documents-workspace.tsx` now opens the editor IN PLACE — `cos:edit-document`
  fetches the doc via new `getDocumentRowAction(id)` and mounts `DocumentForm` in an HrmsDialog over
  the current tab (NO tab switch to Library, NO ?doc= round-trip). onComplete → close + refresh.
  (Old listener that did setTab("library")+?doc= replaced.)
- **Scan button** (`document-form.tsx`, edit + stored file): `runScan()` calls `rescanDocumentAction(id,true)`
  and fills the form fields (docType/issuer/ref/issue+expiry date/title/category/owner via ownerModeFor)
  from the re-read `patch` for review — owner saves. Uses setExtractNote for feedback ("Re-read — N
  fields updated"). Reuses the existing tested rescan action.
- **Unreadable files surfaced**: the read-failure path already fell through to a quarantine row (line
  294 `!res.ok` → ruleExtract → createDocument), so those already reach To Sort previewable. The gap
  was a thrown EXCEPTION → `autoFileDocumentAction` catch now best-effort creates a quarantine row +
  attaches the file → returns {ok:true,id} so every added file becomes a previewable To-Sort card
  ("Couldn't read — added for a manual check"), nothing dropped.
⚠️ UX verified by tsc only; needs live click-through (login) — inline editor open/save, Auto Sort,
Scan re-read, and an unreadable file landing as a card.

## PHASE 3 — certificate supersedes its precursors — DONE, tsc clean, NOT pushed
New in `actions.ts` (after findRenewalTarget): a **stage-lineage** model + `retirePrecursorDocuments(docId)`.
- `stageRankOf(category,docType,title)`: application(1) → control number/assessment/demand-note/
  invoice/proforma(2) → payment receipt(3) → issued certificate/licence/permit/registration/
  passport/visa/clearance/incorporation(4). 0 = not a lineage (letter/CV/lease/contract → never
  participates). Ordered checks so "Work Permit Application"→1, "Control No for Business Licence"→2,
  "Payment Receipt"→3, "TIN Certificate"→4.
- `retirePrecursorDocuments`: when a filed doc is rank ≥3 (receipt or the real certificate), find
  same-owner filed docs at a LOWER stage that are (a) older-or-equal date AND (b) either share the
  normalised reference/control number OR contain one of the certificate's DISTINCTIVE tokens
  (`distinctiveTokens` — docType/title words len≥4 or whitelisted short {tin,vrn,crb,wcf,sdl,paye,
  nssf,osha,visa}, minus stopwords {certificate,licence,permit,number…}). Matches → `setDocumentIntakeState
  "trash" {markExpired:true}` (restorable), `recordEvent("documents.supersede-precursor")`, set the
  new doc's `supersedesId` to the primary precursor (only if unset). **Capped at 8**, best-effort,
  never throws/blocks. So: a RECEIPT retires the control number+application; the CERTIFICATE retires
  receipt+control number+application — exactly the owner's rule (CN relevant only until its receipt;
  certificate makes all precursors history).
- Wired into BOTH filing paths: `confirmSortItemAction` after()-block (when a quarantined doc is
  confirmed→filed) and `autoFileDocumentAction` filed branch.
- SAFETY: same-owner + strong link (ref or distinctive token) + older-date + cap8 + Trash-restorable
  + logged. A generic/unrelated receipt with no matching token/ref retires nothing.
⚠️ Logic verified by tsc + reasoning only; NEEDS real precursor+certificate docs run through the
confirm flow to validate matching precision (can't exercise live in the dev sandbox).

## PHASE 4 bug-fix round (owner-reported, 7 Jul) — DONE, tsc clean, NOT pushed
Owner hit 3 bugs + wanted general speed. Root cause of the editor bugs: TWO editors existed
(my new workspace inline one AND DocumentsTable's own `?doc=` editor). DocumentsTable's `?doc=`
effect only CLEARED the param when the doc was in its (library-only) `documents` list — a
quarantined doc opened from Sort isn't there → `?doc=` persisted → re-fired on every Library
mount (the "editor re-opens on tab switch" bug) and the parallel path landed you in Library.
FIX = **unify to ONE editor** (the workspace inline one):
- `documents-table.tsx`: removed its own edit `DocDialog` + `editDoc` state; all edit triggers
  (row click/keydown, peek Edit, peek onOpen) now call `openEditor(doc)` = dispatch
  `cos:edit-document {id, doc}`. The `?doc=` deep-link effect is now **mount-only**, dispatches
  the event + strips the param (works for quarantined docs too; never re-fires).
- `documents-workspace.tsx` onEdit: uses `detail.doc` when present (Library → instant, no fetch)
  else fetches by id (Sort/deep-link). One HrmsDialog over the CURRENT tab → close returns you
  to that tab (no jump to Library). 
- **Optimistic speed**: SortingDesk (File/Trash) + TrashList (Restore/Delete/Empty) now hide the
  card the instant you tap (a `removed` Set), reconciling via a background `router.refresh()` —
  File/Restore feel immediate. Dropped the pointless `revalidatePath("/inbox")` from restore/
  delete/empty (it redirects to /documents; `revalidateDocs()` already covers it).
- NOTE on page load: /documents server work (compliance scores, ensureAllCompanyRequirements)
  is heavy but tab-switches are CLIENT-side (already fast) and actions are now optimistic, so the
  felt speed is fixed. Didn't gate compliance by tab — client tab-switch needs all tabs' data up
  front, so gating would break Library when arriving via ?tab=sort. Dev server restarted clean
  (long-running HMR across sessions was likely masking the fix); owner must re-login + hard-reload.

## SEMANTIC SEARCH IS ACTUALLY ON (checked live 7 Jul) — corrects stale notes
Ran a live check: setting `v2.semanticSearch` = **true**, `embeddings` table has **1071 rows**,
the Supabase `embed` edge function **works (384-dim)**. So semantic/hybrid search is LIVE — the
edge fn was deployed + backfilled at some point. ⚠️ [[doc_intelligence_gemini_search_jul2026]] #7
and [[intelligenceupgrade]] saying "semantic OFF/owner-gated" are STALE — it's on. embedText →
`sb.functions.invoke("embed")`; gated by `semanticEnabled()`; hybrid_search RPC.

## PHASE 5b — vision+OCR overlap (owner asked) — DONE, tsc pending, NOT pushed
`extractFromPageImages`: vision and the inline OCR pages now run **concurrently** (was serial:
vision → then OCR). `groqVision(...)` promise + `Promise.all(inline OCR)` started together, both
awaited; if vision FAILS, OCR becomes primary and tops up to FALLBACK_CLASSIFY_OCR_PAGES. Total
scan wait ≈ slower-of-the-two, not the sum. AI-off path stays serial Tesseract (one CPU worker) +
disposeOcr. Removed the now-dead `visionOk`/`cap` (return uses `vision?.ok && vision.data`).

## PER-TYPE READING TEMPLATES (owner: "#4, add more, cover much detail") — DONE, tsc pending
New `DOC_TYPE_FIELD_GUIDE` const injected into `extractPrompt` (after the TZ-docs block). A compact,
Tanzania-aware, one-line-per-type field guide the model consults AFTER it identifies the type — so
it captures the RIGHT identifier as referenceNo + type-specific detail into notes/personProfile/
companyProfile/facts. Covers: Passport, NIDA, Work/Residence Permit, Visa, Driving Licence, TIN,
VRN, Tax Clearance, Control Number/Assessment, Tax Invoice/EFD, Cert of Incorporation, Business
Licence, BRELA Annual Return, MEMART, UBO, OSHA/Fire/CRB/Sector, NSSF/WCF/PAYE-SDL, Employment
Contract, Academic Cert, Bank Details, Insurance, Payment Receipt (+ its control no in notes),
Lease, Service/Commercial Contract, Letter. ONE AI call (no two-pass) — richer extraction, no extra
latency. To extend: add a line to the const. ⚠️ Prompt change — needs real-doc testing.

## SORTING-DESK "Scan" button (owner: double-verify unsure reads) — DONE, tsc pending
`sorting-desk.tsx` SortCard: new **Scan** button (accent, Sparkles) next to Fix details on EVERY
card (place/unsure/owner — asked for unsure, added everywhere as it's the same value). Calls
`rescanDocumentAction(item.id, true)` and updates the inline owner/category/expiry guess in place
(setOwner/setCategory/setExpiry from the patch) for review before File — a one-tap AI re-read
without opening the editor. Own `scanning` state (spinner). NOTE rescan re-proposes owner only when
currently blank (fill-blanks); category/expiry always re-read. Toast summarises N updates.

## STILL TO BUILD (owner's spec)
- **Phase 4 rest — sorting UX:** (a) **Auto Sort** button next to Smart Add = batch-file all
  "ready to confirm" items (new bulk action); (b) **Fix Details opens the editor INLINE in the To
  Sort tab** (no jump to Library) — lift an edit dialog to documents-workspace so any tab opens it
  without a tab switch; today it dispatches `cos:edit-document` → switches to Library + ?doc=; (c)
  add a **Scan** button on the editor that re-runs the AI read + refills (re-scan path exists ~
  actions.ts rescan ~2352); (d) **surface unreadable Smart-Add files** — today "Sort now" shows
  them as failed text with NO doc row → not previewable; create a quarantine row (or save-to-inbox)
  so every picked file becomes a previewable/openable To-Sort card.
## PHASE 5 — read speed — DONE (partial), tsc pending, NOT pushed
`extractFromPageImages` (actions.ts): the layered OCR **transcript loop was SERIAL** (up to
INLINE_OCR_PAGES=6 independent OCR calls one-at-a-time, even after vision already read the fields).
Now `Promise.all` when AI is on (network-bound OCR — big win); kept serial only for the AI-off
Tesseract floor (single shared CPU worker → avoid contention). Order preserved (map). DEFERRED
(higher risk): overlap the vision call with the inline OCR batch (serial now — vision then OCR);
the two-pass low-confidence re-read stays (only fires <0.75, the minority — accuracy matters). One
vision call already carries all pages (not a loop).

## Workspace events (reuse, don't reinvent): `cos:edit-document` {id} (sorting-desk → workspace →
Library+?doc=), `cos:new-document` {companyId,personId,category,supersedeId} (Replace → documents-table).
FORWARD: to open the editor inline off-Library, add a workspace-level edit dialog (don't tab-switch).

See [[document_brain]], [[documents-redesign-plan-jul2026]], [[doc_intelligence_gemini_search_jul2026]].

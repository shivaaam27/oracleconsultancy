# Transfer-pack integration (compliance blueprint → live COS site)

Source spec: `C:\Users\User\Documents\Companies\transfer-pack\` (00–07 + 05-MEMORY-SNAPSHOT + reference-app).
It is the blueprint for a multi-company TZ compliance-tracking system (8 companies, ~35 people,
licenses/permits/leases/immigration/statutory filings). The live COS site is the production target.
Principle: ~90% is deterministic code; AI (Groq) does ONE job — read a freshly-dropped document and
extract structured facts. Keep that boundary.

## GAP-MAP (blueprint capability → live site status, June 2026)

- **Groq reliability harness (07, priority)** — was 🟡 Partial, now hardened (see below).
- Document expiry + status colours — 🟢 Has (`documents.expiryDate`, `deriveDocStatus`).
- Tiered alert cadence (immig 120/90/30/5; compliance 30/10) — 🟡 Partial (single `reminderLeadDays`, not multi-stage).
- Recurring statutory obligations — 🟢 Has (`recurring_obligations` + `obligation_company`, "Tax & Legal" hub).
- Append-only fact ledger (salary/shareholding/director history, source_hash, verified, stale>180d) — 🟡 Partial (`compliance_events`/`person_events`/`audit_log` only; no universal entity-field-value ledger).
- Pipeline / in-flight bureaucracy stages — 🔴 Missing (tracked as ordinary tasks).
- Governance (cap table, UBO, signatories, resolutions) — 🔴 Missing (only `companies.signatoryName`).
- Risk register (L×I, board-level) — 🔴 Missing.
- Safety-net data-quality findings (dup TIN, malformed expiry, awaiting-original, stale facts) — 🟡 Partial (compliance scoring + signals; no integrity findings).
- `_NEEDORIG` / `-OLD` / `-VOID` tags — 🔴 Missing.
- Soft-retire `active:false` + status_reason/status_date — 🟡 Partial (`active` exists; no reason/date cols).
- Cron (daily compliance, weekly digest, monthly board pack, statutory cal) — 🟡 Partial (4 daily crons; no monthly board-pack PDF, no safety-net cron).
- Recipient rules (routine→director+CFO; board pack→director+CFO only) — 🟡 Partial (owner-only hardcoded).
- ICS calendar feed — 🟢 Has (`lib/ics.ts`, `calendarEvents`).
- Board pack (monthly print PDF, restricted) — 🔴 Missing (Director Brief exists, not a board PDF).

Owner confirmed GAP-MAP. Chose: **Groq harness first, one area end-to-end.**

## DONE — Groq safety harness (the 5 guards), June 2026 — NOT pushed

New module `src/lib/ai-json.ts` (dependency-free, no Zod):
- `extractJsonBlock()` / `parseJsonObject()` — strip markdown fences + balanced-brace scan (guard 2; unit-tested, handles braces-in-strings + unbalanced).
- `validateShape()` + `ShapeSpec` — tiny type validator (guard 3).
- `callGroqJson()` — JSON-mode call with retry+exponential backoff on 429/5xx/network (guard 4), strip-and-parse, optional shape validation, reads model `confidence` (guard 5). Returns `{ok,data,confidence,error,problems,raw}`.
- `LOW_CONFIDENCE = 0.55`.

Wired the blueprint's ONE AI job — document extraction — fully onto it in `src/app/documents/actions.ts`:
- `groqJson`/`safeJson` → `groqExtract` (harness). `groqVision` returns `GroqJsonResult`.
- Added `confidence` to `extractPrompt`. New `ExtractResult` type carries `confidence`/`needsReview`.
- `extractDocumentFields`, `fieldsFromText`, `extractDocumentFromFile` (text/vision/scanned-PDF/image) all gate on confidence; low-confidence → `needsReview`.
- `document-form.tsx` `noteFor()` shows "document was unclear — double-check every field, especially the expiry date" when `needsReview`.

Cheap strip-and-parse retrofit (guard 2) on the other raw-`JSON.parse` Groq callers:
`api/action/route.ts` (command parser), `people/actions.ts` (person extract), `meeting/actions.ts` (task extract), `api/draft-email/route.ts`. (Form-field JSON.parse in people/actions left alone.)

tsc clean. All server-side already (guard "key on server" satisfied). Not yet done: a persistent
review-queue TABLE (current "queue" = the human-confirm step in the upload dialog — failed/low-conf
extractions surface there rather than silently saving). Hybrid stronger-model fallback (07 optional) not built.

## Groq harness PUSHED to master, commit 6489463 (2026-06-14). Live.

## Area B (governance + board pack) DONE + Pack v3 (09 seeding) + LIVE-DATA SEEDED — 2026-06-14
Pack updated again: NEW `09-SEEDING-AND-BACKFILL.md` ("seed reference tables, there is NO training") +
`live-data/` (full canonical dataset: companies/people/118 facts/governance/risks/decisions/processes/
registers + Excel) + minimal `seed-data.json`. 00 updated to list them. KEY: the ID-first matcher built in
Area C was INERT because live companies lacked TINs — seeding fixes that.

**Area B — DONE (migration 0065), commit 685c7e3:** tables cap_table/beneficial_owners/key_persons/
signatories/resolutions/risks/decisions + companies.authorised/issued_shares (shapes match governance.json/
risks.json/decisions.json). lib/governance.ts + governance-shared.ts (riskScore L×I→band ≥9 Critical/≥6 High/
≥3 Medium). GovernancePanel on company profile (cap-table bars/signatories/resolutions, hidden when empty).
**/brief/board** board pack (exec/risk/decisions/key-person/UBO/per-company ownership/immigration/safety-net
appendix; confidential director+CFO; print-to-PDF; linked from Director Brief). Monthly nudge = new
email-automation category "boardPack" (1st EAT, reminds owner to open+send; real PDF-attach deferred).

**SEEDING — DONE (applied to LIVE DB):** `scripts/seed-live-data.ts` (committed; reads confidential
`live-data/` from OUTSIDE the repo via LIVE_DATA_DIR, default the transfer-pack path; dry-run default,
`--apply` to write, `--create-people` optional). Reconcile-not-insert. APPLIED safe seed:
- Companies: filled TINs for all 7 (Terra/DSC/PES/MES + corrected Cocozuri 172-574→172-547, cleared PES
  garbage VRN), legal names/addr/email/phone blanks-only, placeholder TODO/N/A filtered; **created V1
  Intertrade** (8th company). → matcher now LIVE (every company has a TIN).
- Governance: 13 cap-table, 8 UBO, 4 key-persons, 10 signatories, 2 resolutions; risks 6; decisions 5.
- Facts: 52 seeded (created_by="seed-live-data", re-runnable: deletes own rows first) — company facts +
  4 matched people.
- People: **only 4 enriched, 0 created** — owner's live people table is a MESSY TEST DB (junk "dvd"/"Fire"/
  "Unknown", partial dups "Pulin" vs "Pulin Manek"). 26 unmatched real staff intentionally NOT created
  (would dup); they'll arrive via intake doc-upload or a later --create-people run. Owner chose "safe seed".
Verified: board pack populated (Single-PC risk, Pulin key-person, cap tables); tsc clean; no console errors.
NOT seeded yet: processes.json (pipeline — no table; still a gap), registers.json (overlaps assets/vendors),
obligations.json (recurring_obligations already exists/seeded differently). Backfill (Job 2: bulk-upload the
real document copy through intake) = owner-driven, needs the folder copy.

## Next areas — owner LOCKED sequence: A → C → B. Build only on owner's go-ahead, one area end-to-end.

**A — Fact Ledger — CORE DONE (migration 0063 applied to live DB), 2026-06-14:**
- `facts` table (schema.ts): entity_type/person_id/company_id/field/value JSONB/display/effective_date/
  source/document_id/source_hash/verified/verified_at/note/created_by/created_at + 3 indexes. Migration
  `drizzle/0063_superb_captain_britain.sql` generated + `npm run db:migrate` APPLIED.
- `src/lib/facts-shared.ts` (client-safe): Fact type, factStatus (verified|unverified|stale>180d|incomplete
  via NOT-STATED/VERIFY/placeholder regex), renderFactValue (money fields → TZS), COMMON_FACT_FIELDS.
- `src/lib/facts.ts` (server): listFacts, currentFacts (latest effective_date per field), factHistory,
  recordFact (append-only, never mutate), setFactVerified (restamps verified_at), deleteFact (mistake-fix only).
- `src/app/facts/actions.ts` ("use server"): loadEntityFacts, recordFactAction (coerceValue → number/list/text,
  money display via renderFactValue), verifyFactAction, deleteFactAction; revalidates /people + /companies/[id].
- `src/components/facts-panel.tsx` (shared client): current facts + status chips + per-field history expander +
  source/effective-date + verify/delete + inline "Record a fact" form (Combobox field). Wired into
  person-drawer.tsx (Details tab, after PersonPay) AND company-profile.tsx (after the form).
- VERIFIED in preview on live DB: render, record (Authorised Capital 20M on MES), display, delete, empty state;
  no console errors; tsc clean.
- NOT done (deferred sub-item, owner to choose): AI auto-record hook — current doc extraction only surfaces
  passportNo (not salary/shareholding), so auto "record as fact" needs a small extraction extension first.
  Manual ledger is complete and shippable without it. Also: facts don't yet feed the safety-net (that's Area C).

**C — Tiered alerts + safety-net — DONE (no migration), 2026-06-14:**
- `documents-shared.ts`: ALERT_TIERS {immigration:[120,90,30,5], compliance:[30,10]}, alertClassFor (regex
  immigration|passport|permit|visa|residence|interim|nida), isReminderDueToday (tier day when dte>0; immigration
  also on/after expiry every 30d incl. day 0 — edge caught + fixed by unit test), widestLeadFor. Unit-tested.
- notify cron: adds `remindersDue` (tier-day docs) + `dataIssues` (safety-net high/medium) to the push line +
  signature.
- `src/lib/safety-net-shared.ts` (Finding type/severity/tones/sort) + `src/lib/safety-net.ts` gatherSafetyFindings()
  (compute-on-read, no findings table): rules = duplicate-tin, missing-company-id (TIN/reg, low), awaiting-original
  (image file in official category — `_NEEDORIG` WITHOUT a stored col; Certificate excluded to avoid false +ves),
  stale-fact + incomplete-fact (from the ledger via factStatus on current value per entity+field), asset-on-leaver
  (open asset_assignments to an inactive person).
- `src/components/safety-net-panel.tsx`: collapsible card (high/medium/low summary, all-clear state, deep links)
  on `/documents` under NeedsAttention.
- VERIFIED in preview on live data: 9 medium + 6 low findings (awaiting-original photos, asset still out with an
  inactive director, missing company IDs); no console errors; tsc clean.
- NOT done: surfacing on Home (chose Documents page as the compliance hub instead); a stored `_NEEDORIG` column
  (heuristic detection used instead — reversible, no migration). **(both now done in the intake-rewire batch below)**

## Cadence v2 + Intake rewire (08-INTAKE-REWIRE) + Home safety-net — DONE 2026-06-14 (migration 0064)
Owner read NEW pack files 08-INTAKE-REWIRE.md + updated 04/00; said "do everything".
- **Cadence corrected** (owner clarified: intervals that CONTINUE past expiry): documents-shared.ts ALERT_CONFIG
  = immigration {earlyHeadsUp:[120,90], window:30, interval:5}, compliance {earlyHeadsUp:[], window:30, interval:10}.
  isReminderDueToday: >window → heads-up only; else `dte % interval === 0` (covers 30,25…0,−5… for immig;
  30,20,10,0,−10… for compliance) — nags every 5/10 days through AND past expiry until renewed. Unit-tested.
- **Schema (migration 0064 applied):** documents.review_status ("ok"|"needs_review", default ok) +
  documents.needs_original (bool). Threaded through documents.ts (DocDbRow/mapRow/DocumentInput/create/update) +
  DocumentRow type.
- **Intake rewire (08) in documents/actions.ts** — wraps the existing bulk-scan (bulk-upload-dialog → DocumentForm
  → extractDocumentFromFile), human-in-loop kept:
  - Step1 ID-first company match: loadCompanyIdentifiers (tin/vrn/code_prefix/email-domain) +
    matchCompanyByIdentifiers (TIN→VRN→email-domain, never address/director) → applyIdFirstCompany OVERRIDES the
    AI/name company on text paths (fieldsFromText + extractDocumentFields). Vision/image (no text) skips.
  - Step2 = the 5-guard harness (already built).
  - Step3 conventions: extractPrompt now also returns `facts[]` ({entityType,field,value,effectiveDate}) +
    `is_photo_placeholder`; coerceFields parses both into ExtractedFields.facts / .needsOriginal. On save,
    appendDocumentFacts → recordFact (UNVERIFIED, createdBy "ai-intake", linked documentId+owner) — the approved
    AI auto-record. needsOriginal stored on the doc.
  - Step4 confidence gate: form pre-ticks "needs review" when low-confidence OR no company/person owner →
    review_status="needs_review".
  - DocumentForm: captures facts/needsOriginal/needsReview; shows a panel ("Will also record N facts" chips +
    "only a photo" toggle + "Mark needs review" toggle); posts hidden facts JSON / needsOriginal / reviewStatus.
    factsFromForm + inputFromForm read them in createDocumentAction.
- **Needs-review queue:** components/needs-review-panel.tsx (one-tap Confirm → confirmDocumentReviewAction clears
  flag) on /documents above the safety net.
- **Safety-net** now reads the stored needs_original flag (OR legacy heuristic).
- **Home safety-net:** SafetyNetPanel added to _hub/cos-home.tsx (only when findings>0).
- VERIFIED in preview: /documents + / render, safety net 9 medium·6 low, no console/server errors, tsc clean.
  Live AI upload not exercised (needs real file+Groq) but all paths type-safe + logic unit-tested.

**B — Governance + monthly board pack (LAST, largest):** tables cap_table/beneficial_owners/signatories/
resolutions/risks/decisions. `src/lib/governance.ts` (key-person risk, UBO completeness). Board-only views on
company profile, EXCLUDED from daily dashboard + weekly digest. Monthly cron (1st) renders board-pack PDF
(reuse letters/print + email) to director+CFO ONLY. Recipient-rules config (routine→director+CFO;
board pack→director+CFO only) — not hardcoded.

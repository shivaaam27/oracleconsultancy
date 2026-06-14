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

**C — Tiered alerts + safety-net (SECOND):** extend `documents-shared.ts` so category → LIST of lead-days;
notify cron fires per matching tier (immigration 120/90/30/5 + past expiry; compliance 30/10). `_NEEDORIG`
flag (col + auto-detect photo-standing-in-for-original, NOT logos/headshots). `src/lib/safety-net.ts` rules
→ findings: dup TIN, malformed expiry, awaiting-original, stale facts (needs A), assets on archived people.
Surface on Home + daily cron line.

**B — Governance + monthly board pack (LAST, largest):** tables cap_table/beneficial_owners/signatories/
resolutions/risks/decisions. `src/lib/governance.ts` (key-person risk, UBO completeness). Board-only views on
company profile, EXCLUDED from daily dashboard + weekly digest. Monthly cron (1st) renders board-pack PDF
(reuse letters/print + email) to director+CFO ONLY. Recipient-rules config (routine→director+CFO;
board pack→director+CFO only) — not hardcoded.

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

## Next candidates (owner to pick): fact ledger · governance+board pack · tiered alerts+safety-net.

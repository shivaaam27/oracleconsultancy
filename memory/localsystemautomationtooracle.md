# Local System Automation → Oracle (transfer-pack integration master doc)

**What this is.** The complete record of integrating the local Dropbox+PowerShell compliance
"smart folder" (the *transfer-pack* blueprint at `C:\Users\User\Documents\Companies\transfer-pack\`)
into the live COS site (Next.js 16 + Supabase + Vercel), done across one long session (June 2026).
Read this first to understand what exists and why. Deep technical detail lives in
[[transfer_pack_integration]]; this is the readable master index.

**The blueprint's one principle:** ~90% of the system is deterministic code (expiry maths, alerts,
status, reports) that never needs AI; the LLM (Groq) does exactly ONE job — read a freshly-dropped
document and extract structured facts. Everything below keeps that boundary.

---

## What was built (in order), with files

### 1. Groq reliability harness — the "5 guards" (`src/lib/ai-json.ts`)
The site's AI felt unreliable. Fixed by wrapping every JSON-returning Groq call:
1. schema-first prompt · 2. **strip-and-parse** (pull the first `{…}` out of fenced/prose replies —
the #1 cause of intermittent failure) · 3. validate types · 4. **retry + backoff** on 429/5xx/network ·
5. **confidence gate** → low-confidence reads flagged for human review.
Wired into document extraction (`documents/actions.ts`) and the other raw-`JSON.parse` callers
(command parser, person extract, meeting tasks, draft-email). Commit 6489463.

### 2. Fact ledger (migration 0063)
`facts` table — append-only, source-linked record of any verifiable fact (salary, shareholding,
directors, bank account, passport, contract end). **Current value = latest `effectiveDate`; older =
history; recording a change ADDS a row, never overwrites.** `factStatus`: verified / unverified /
**stale (>180d)** / incomplete (placeholder). Files: `lib/facts.ts`, `lib/facts-shared.ts`,
`app/facts/actions.ts`, `components/facts-panel.tsx` ("Tracked facts" on the person drawer + company
profile). Commit a1921d8.

### 3. Recurring alert cadence + Safety Net (no migration)
- **Cadence (`documents-shared.ts`):** immigration docs nudge at 120/90 then **every 5 days from 30d
  out, continuing past expiry**; other docs **every 10 days**. Nags until renewed. `isReminderDueToday`.
- **Safety Net (`lib/safety-net.ts`):** read-only data-quality engine → findings for duplicate TINs,
  missing company IDs, awaiting-original photos (`_NEEDORIG`), stale/incomplete facts, equipment still
  out with leavers, and **lease/insurance notice due**. Card on `/documents` + Home. Commits 2ca549d, later.

### 4. Intake rewire — the AI's one job done right (transfer-pack `08`, migration 0064)
Wraps the existing bulk-scan (`bulk-upload-dialog` → `DocumentForm` → `extractDocumentFromFile`):
- **Step 1 ID-first company match** (TIN → VRN → email-domain; never address or director names)
  overrides the AI/name guess. → needs companies to have TINs (seeded, see §7).
- **Step 3 conventions:** extraction now returns `facts[]` + `is_photo_placeholder`. Facts are
  **appended to the ledger on save** (the AI auto-record). `_NEEDORIG` stored on `documents.needs_original`.
- **Step 4 confidence gate:** low-confidence / no-owner → `documents.review_status = needs_review` →
  a **Needs-review queue** on `/documents` (one-tap Confirm). `components/needs-review-panel.tsx`.
- Form shows facts-to-record chips + photo / needs-review toggles. Commit e9eb4e0.

### 5. Governance + Risk + Board pack (transfer-pack `03/04`, migration 0065)
Board-level, kept OUT of daily/weekly (blueprint §8). Tables: `cap_table`, `beneficial_owners`,
`key_persons`, `signatories`, `resolutions`, `risks`, `decisions` (+ `companies.authorised/issued_shares`).
`lib/governance.ts` (riskScore L×I → band ≥9 Critical/≥6 High/≥3 Medium). **GovernancePanel** on the
company profile. **`/brief/board`** = the board pack (exec summary, risk register, decisions, key-person
concentration, UBO, per-company ownership + signatories, expiring immigration, safety-net appendix);
confidential, print-to-PDF, linked from the Director Brief. Commit 685c7e3.

### 6. Board pack auto-PDF (`lib/board-pack-pdf.tsx`)
Server-side PDF via `@react-pdf/renderer` (no headless browser → runs in the cron). The monthly
**boardPack** email-automation category now attaches the real PDF (falls back to a link if render
fails). Owner-only for now (most sensitive artifact). Commit c186e48.

### 7. Live-data seeding (`scripts/seed-live-data.ts`) — APPLIED to live DB
Reconcile-not-insert from the confidential `transfer-pack/live-data/` JSON (kept OUTSIDE the repo;
the script holds only mapping logic; dry-run default, `--apply`, `--create-people`):
- **Companies:** filled TINs for all 7 (corrected Cocozuri's, cleared PES's bad VAT field), legal
  names/addresses/contacts (blanks-only, placeholders filtered); **created V1 Intertrade**. → the
  ID-first matcher is now live.
- **Governance/risk/decisions/facts:** 13 cap-table, 8 UBO, 4 key-persons, 10 signatories, 2
  resolutions, 6 risks, 5 decisions, ~52 facts.
- **Pipeline + commitments:** 7 in-flight cases, 11 commitments (7 leases, 2 insurance, 2 contracts).
- **People:** enrich confident matches only, **created none** (the live table was a messy test DB).
Commit 7c2caa7.

### 8. People-table cleanup (`scripts/cleanup-people.ts`) — APPLIED to live DB
55 → 33 people. 8 duplicate **merges** (moved each stub's tasks/docs/facts/todos to the real person,
then deleted the stub — Pulin/Jitesh/Hiral/Amal/Shvam/Shivam/Visha;l/Hanisha) + 13 junk deletes +
removed the "To Who It May Apply" placeholder. Ambiguous entries left for the owner. Commits 0d824b5, later.

### 9. Staff data-collection form (`/people/form`)
Printable A4, **bilingual EN/Swahili**, for local/labour staff with no system access. Blank or
`?person=<id>` pre-filled; `?missing=1` prints only the still-blank fields; **QR** links back to the
person record; **signature/thumbprint** box + "filled on behalf by" for a supervisor field-agent;
**outsider** person-type hides employment/payroll. Hand out → fill by hand → photograph → upload →
intake reads it. Print-font fix in `globals.css` (`.data-form`). Commits 06342bf, 3de1d94.

### 10. Pipeline + Commitments register (migrations 0066, 0067)
- **`/hrms/pipeline`** — kanban of in-flight bureaucracy (To Apply → Applied → Control No. Issued →
  Paid → Receipt → Issued). `lib/pipeline.ts`, `components/pipeline-board.tsx`.
- **`/hrms/registers`** — commitments register (leases/insurance/contracts) with **notice-by = end −
  notice_days** so renewals/lapses are caught early. `lib/commitments.ts`, `components/commitments-register.tsx`.
- Both have **calendar overlays** (notice-by + application deadlines) and **document file links**
  (attach/open a supporting doc). Nav entries added. Commits a1ec6cd, 3f7c976.

---

## New tables / migrations
0063 facts · 0064 documents.review_status + needs_original · 0065 governance set (cap_table,
beneficial_owners, key_persons, signatories, resolutions, risks, decisions + companies.authorised/
issued_shares) · 0066 pipeline · 0067 commitments. New deps: `qrcode`, `@react-pdf/renderer`
(serverExternalPackages).

## New pages / nav
`/brief/board` (board pack), `/people/form` (data form), `/hrms/pipeline`, `/hrms/registers`.
Launcher entries: "Applications in progress", "Commitments register".

## What is STILL outstanding (owner actions / deferred)
1. **Document backfill (Job 2)** — owner uploads a COPY of the real document folder via site "Add
   several" (NOT chat — confidential). Auto-creates the ~26 remaining staff + their ~68 facts, and
   lets pipeline/commitment file-links attach real docs.
2. **Email recipients = owner only** — the blueprint says routine → director + CFO (Jitesh), board pack
   → director + CFO only. Currently everything auto-emails the OWNER's inbox only; Jitesh is NOT wired.
   A recipients setting is the clean fix (flagged, not built — sending PII to another inbox needs sign-off).
3. **Ambiguous people** — Sanjay / Unknown / Aryan / Beka / Nayan / Rashmit / Hitesh: owner to decide,
   then `cleanup-people.ts` finishes them.
4. **Seed auto-match of pipeline/commitment file paths → uploaded docs** at backfill (manual Attach
   works today).

## Comprehensive audit + fixes (June 2026, run wf_1d9809bc-cf5)
A multi-agent adversarial audit (11 area finders → verify → synthesize) found **44 confirmed issues**.
Fixed and pushed across batches (commits 291a53b → ee10abc):
- **CRITICAL:** `recordEvent(..,"warn")` was an invalid EventStatus → the ONLY tsc error → broke
  `next build`/deploy since the auto-PDF commit. Fixed → "error". (Lesson: background tsc output capture
  was flaky and misread as clean; now always run tsc in the FOREGROUND.)
- **HIGH:** coerceValue corrupted identifier digits (leading zeros / >2^53) → now keeps account/passport/
  TIN/NIDA/phone verbatim; matchCompanyByIdentifiers digit-substring → exact boundary-token equality + 8-digit
  floor (no wrong-company misfiling); cleanup-people now repoints tasks.owner_id + reporting_lines and surfaces
  delete errors (production verified CLEAN — 0 orphans); **governance/risk/decisions are now editable in-app**
  (GovernancePanel add/remove cap/signatory/resolution; GovernanceQuickEdit on /brief/board for risks +
  "mark decided").
- **MEDIUM:** commitmentUrgency honours status (expired stops firing); asset-on-leaver skips archived assets;
  confidence gate fail-CLOSED on missing confidence; ai-json fence-strip removed (corrupted backticks in
  string values); AI fact-append deduped + typed via shared coerceFactValue; edit-saving a needs-review doc
  clears the flag; board leave-liability shows "excl. N no-wage"; daily-notify no longer double-counts;
  pipeline form captures deadline/control-no/amount; safety-net surfaces overdue pipeline deadlines.
- **LOW:** date validator round-trips (rejects 2027-02-30); MONEY_FIELD + placeholder regexes anchored;
  fact verify/delete report DB failure; currentFacts tie-breaks same-day by created_at; getCompanyGovernance
  no "issued 0"; shared appBaseUrl(); seed wipe scoped behind --reset-governance; seed V1 re-run match-by-name;
  commitment labels ("notice today" / "to expiry" when no notice period); board PDF empty-state guards.
- **Deferred (low value / owner-decision):** Director-Brief pipeline/commitment blocks (Home safety-net covers
  the surfacing), full inline edit of existing pipeline/commitment rows, command-parser per-intent validation,
  board-pack data-assembly extraction + N+1 (perf/maintenance only), Jitesh/CFO email recipients (owner
  decision — board pack stays owner-only until confirmed), company-fact chip entity indicator.

See [[transfer_pack_integration]] for the blow-by-blow + the GAP-MAP.

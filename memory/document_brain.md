# Document Brain — catalogue-driven intake, deep search, deterministic compliance

**Status: SHIPPED to master (2026-07-02).** The durable reference for how documents
are read, named, filed, and made searchable/answerable, and how compliance
auto-verifies. Built on top of the earlier ORI Search Brain (`memory/ori_brain.md`)
and the intake overhaul (`memory/doc_intake_compliance_overhaul.md`).

## The core idea — identify the TYPE, everything else is a lookup
Intake used to free-guess every field (category, owner, requirement) per document
and got them wrong (NSSF → Immigration, a BRELA search → Lease, VAT verified by a
business licence). Now every document is routed through a **known type** from a
canonical catalogue; once the type is known, its shelf, category, owner-kind,
expiry behaviour and the compliance requirement it satisfies are all lookups.

### `src/lib/doc-catalog.ts` — the catalogue (client-safe, pure)
- `DOC_CATALOG`: ~45 `CatalogType` rows. Each: `key`, `label`, `aliases[]`, `shelf`
  (DocShelf), `category` (DocCategory), `ownerType` (company|person|either),
  `expires`, `companyReqKey?`, `personReqLabel?`, `pipeline?`.
- `classifyDocText(name, body)`: scores catalogue types; the **NAME (filename+title)
  is weighted ×10 over the body**, so a taxpayer number in a WCF receipt's body
  can't hijack the filename. `bestDocType()` = top match.
- `parseConventionalName(filename)`: reads the owner's convention
  `Prefix_DocType_Ref_EXP-YYYY-MM-DD[-OLD]` → `{prefix, expiry, isOld, ref}`. The
  filename's own EXP-date + `-OLD`/`-VOID` markers are TRUSTED over a re-read date.
- `deriveFiling(fileName, title, body)`: the one function intake + re-sort + key-docs
  all use → `{typeKey, typeLabel, category, shelf, ownerType, expires, expiry,
  isOld, companyReqKey, personReqLabel, pipeline, prefix, ref}`.
- `CATALOGUE_COMPANY_REQ_KEYS`: the set of requirement source_keys a specific type
  satisfies → those requirements are linked DETERMINISTICALLY only, never fuzzy.

### Wired into the LIVE intake (`autoFileDocumentAction`, documents/actions.ts)
- After the AI read, `deriveFiling` OVERRIDES category/docType/expiry from the
  catalogue (a **learned routing_correction still outranks it** — the learning loop
  wins). `-OLD`/`-VOID` file → straight to Trash.
- The re-scan path (`rescanDocumentAction`) ALSO applies `deriveFiling` first, so
  re-scanning never reverts a correct filename expiry to a mis-read internal date.
- Opaque scans classify via the layered-OCR text (`res.fullText`) fed to the catalogue.

## House naming format
`Prefix_DocType-Hyphenated[_Ref][_EXP-YYYY-MM-DD]` (buildDocTitle, documents-shared).
`companies.file_prefix` (migration 0103) = brand short-name ("DarSpices" for legal
"DSC Ltd"), editable on the company Profile tab.

## Compliance — per-company + deterministic auto-verify
- **Conditional requirements**: `SeedItem.applies` = "vat" (only if VRN) | "sector"
  (only `companies.sector_regulated`, migration 0104 = PES) | base. Categories map
  to the right shelf (NSSF/WCF/PAYE → HR → People & HR; bank → Banking; OSHA/Fire/
  CRB → Permit → Licences & Permits). `applicableCompanyItems()` filters seeding.
- **Auto-link (getCompanyChecklist)**: DETERMINISTIC pass first — link each
  requirement to the doc whose catalogue type satisfies it (not expired, not -OLD).
  A catalogue-OWNED requirement is deterministic-only (stays missing rather than a
  fuzzy grab — no "Annual Return ← BRELA search"). Fuzzy fallback only for
  non-catalogue requirements.
- **Auto-verify**: a deterministic (type-matched) link is high-confidence → set
  `verified` (green, `verified_by:"auto-catalogue"`), no manual tick. Fuzzy → stops
  at `received`. `received` already counts toward the score (batch-2 change).

## Search — deep + instant
- **Full-text (FTS)**: `documents.content_tsv` (generated, GIN; migrations 0101/0102
  OR-semantics `search_documents` RPC + ts_headline). Merged into `unifiedSearch`
  (shows owner + snippet) AND ORI `buildContext`. Reads INSIDE files.
- **Deep index enrichment** (`entity-registry.ts` — single source of truth): the
  `textFor` (semantic) + `scoreParts` (keyword) + `selectColumns` now cover EVERY
  meaningful field: people (nationality/national-ID/passport/DOB/email/phone/address/
  emergency contact/start-date/person-type), companies (TIN/VRN/registration/address/
  phone/email/file_prefix/aliases), tasks (code/comments/category/priority/status).
  Documents already index full `extracted_text`. Keyword works live; semantic
  re-indexes via the nightly cron. FORWARD RULE: to make a field searchable, add it
  to that entity's `textFor`/`scoreParts` — nowhere else.
- **Direct-answer chips** (`src/lib/direct-answer.ts`): instant, Groq-free "it just
  knows" answers at the top of ⌘K. Person/company fields (passport/national-ID/
  nationality/DOB/role/TIN/VRN/registration/email/phone/address; company matched by
  file_prefix too) AND **document expiry** ("business licence expiry date" → date +
  days-to-go, resolved by catalogue type). Bypasses buildContext entirely.

## ORI Ask speed
`buildContext` parallelised the 3 heaviest reads (listDocuments +
buildCompanyRequirementScores + buildPersonRequirementScores via Promise.all):
~6.8s → ~3.7s local (faster on Vercel's EU DB). Lookups use direct-answer, never
touching buildContext → no more 504s on lookups. ORI Ask (⌘K) streams `/api/ask`
(Groq smart model). Note: buildContext peopleDetail feeds passport/etc. per matched
person so ORI answers personal-detail questions.

## UI additions this session
- **Compliance dossier**: the company Documents tab checklist groups by the 8 shelves
  (`DOC_SHELVES`/`SHELF_CODE`) with 01–08 prefixes; per-item inline Add/Verify/Renew.
- **Home autonomy recap** (`home-autonomy-recap.tsx`): slim "ORI handled N things"
  strip from `listCockpitActivity` → /inbox.
- **Expiry radar** (`expiry-radar.tsx`) on Documents: overdue cluster + 0–90-day track.
- **Key documents** (`buildCompanyKeyDocuments`): matches by catalogue TYPE (TIN row
  shows the TIN cert, never a WCF receipt).
- **Shelf-suggester DISABLED** (`maybeProposeShelf` → no-op): 8 fixed folders, unknowns
  → Operations & Branding, so no "Employee/Pesa/Chinese" new-shelf noise.
- **`.docx`/`.pdf` twins**: `formatSupersede` + `isDocFile` — a PDF supersedes its Word
  twin (collapses the pair instead of quarantining).

## Re-sort tool (backlog cleanup, NOT live)
`scripts/resort-company-docs.ts "<Company>" [--yes]` re-files an already-uploaded
company through the catalogue (category/expiry/OLD-trash/person-routing) + re-links
compliance deterministically. Applied to Dar Spices (DSC Ltd, id 1). New uploads
don't need it — the live intake does it.

## Migrations added this session
0101 document_fts · 0102 document_fts_or · 0103 company_file_prefix · 0104
company_sector_regulated. (0100 ai_jobs from the cloud-agent arc.)

## Scheduled routines (owner's machine, not the web app)
- `ori-worker` cron **DISABLED** (event-triggered via `scripts/agent-dispatcher.ts`
  instead; SessionStart hook auto-starts it — `.claude/settings.local.json`).
- `compliance-auto-rename` (daily) + `compliance-auto-review` (weekly) = the owner's
  PRE-web-app Dropbox compliance system (`C:\Users\User\Dropbox\Companies`, JSON DBs,
  email-intake, weekly PDF). KEPT running (owner chose "keep both"). It's where the
  naming convention + 8 folders originate. Reconcile later if migrating fully to the app.

## Near-duplicate detection — SAME doc, not same TYPE (2026-07-02, SHIPPED)
The near-dup layer (`findSameLogicalDoc` in documents/actions.ts) was quarantining
DISTINCT documents as "Possible duplicate": different employees' contracts (shared
offer-letter template → jaccard ≥0.7), permits with different expiry, an
incorporation cert vs a BRELA search sharing the registration number. Fix: before
any title/content match, guard on the catalogue **type** + the filename's own
**ref / expiry / subject**. Subjects (distinctive filename words beyond prefix +
doc-type aliases + format words) must be **subset-compatible** — every token of the
smaller name-set appears in the larger. So "Sanjay-Kaushik" .docx vs .pdf still
pairs, "signed" vs "unsigned" of one contract still pairs, but "Kasaba-Juma" vs
"Juma-Bagomwa" (one shared token, different people) does NOT. Exact re-uploads are
still caught upstream by file_hash — this layer only does the fuzzy near-dup.
- **Cleanup**: `reviewFalseDuplicatesAction({dryRun})` + `scripts/review-false-duplicates.ts`
  re-checks quarantined "possible duplicate" docs with the fixed logic, files the
  false ones, and drops a mis-attributed person (a contract tagged to an unrelated
  director — kept only if the person's name is corroborated by the filename), keeping
  the company. Ran once: 19 distinct docs filed (Dar Spices + Cocozuri), 5 wrong-
  director tags cleared, 2 genuine same-person twins (#456 signed/unsigned, #503
  docx/pdf) left in quarantine for the owner to eyeball.

## STILL TODO
- **Generic person-doc titles**: employment contracts still title as
  `<Prefix>_Employment-Contract` (no person) and some carry the wrong brand prefix
  ("FurahaInnovation" on Cocozuri docs — company id 2 is legal "Furaha Innovation
  Ltd", brand "Cocozuri"; owner to reconcile which is the file_prefix). The filename
  (e.g. `Cocozuri_Contract_Hermina-Renatus`) already has the person — intake should
  pass the filename subject as the title `ref` for person/employment docs so titles
  read `Cocozuri_Employment-Contract_Hermina-Renatus`. Also re-title the 19 just-filed.
- The 6 Cocozuri employees (Dukhishyam, Hermina, Leila, Rehema, Ruth, Vailet, Violet)
  and any Dar Spices contract staff aren't people records yet — their contracts are
  filed company-only. Owner to add the staff (intake never auto-creates people).
- Staff (person) compulsory-doc list + person-side dossier grouping.
- Deferred consolidations (owner-resolution helper copy-pasted 3×, single duplicate
  comparator, wire AUTO_HARD_DELETE_FORBIDDEN guardrail, reindex docs to semantic at
  intake not just nightly).
- Further ORI speed (peopleDetail/governance/graph still sequential).
- Cloud reader (Google Document AI) for PC-off opaque scans; OCRSPACE_API_KEY set on Vercel.

## Vision-shutdown fallback (2026-07-02, LOCAL — deep-audit Phase 1)
Scan CLASSIFICATION no longer dies with Groq vision (shutdown 17 Jul 2026):
`extractFromPageImages` (documents/actions.ts) is the one ladder for scanned PDFs
+ images — vision fields (while alive) + a layered page transcript
(Groq→OCR.space→Tesseract), and when vision is gone/AI off the OCR text is
classified by `fieldsFromText` exactly like a typed PDF. Scans now return
`fullText`/`textSource:"ocr"` → ID-first TIN/VRN owner match, catalogue
`deriveFiling`, cross-doc correlation and instant search-inside all work at
intake (autoFileDocumentAction persists the text straight after upload).
`ocrSpaceApiKey` is a real Setting (Settings → AI & Voice, env fallback,
`getOcrSpaceKey`). Verified by dead-model simulation. See
memory/deep_audit_jul2026.md Phase 1.

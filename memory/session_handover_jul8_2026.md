---
name: session-handover-jul8-2026
description: START HERE — consolidated handover for the 8 Jul 2026 session (docs intake, vision, health check, compliance watcher, receptionist/cleaning)
metadata:
  type: project
---

# Session handover — 8 Jul 2026 (START HERE for a new chat)

One session, five shipped work streams, ALL pushed to `master` and deploying on Vercel.
Everything below is tsc-clean and passes the test suite (263 → 272 tests as new tests were
added). Base commit before this session: `56a25de`. Each stream has its own detailed memory
file (linked). Owner is non-technical; British English; token-conscious.

## The five streams (newest first)

### 5. Receptionist role + portal Office Cleaning — `ad4f4b5` [[receptionist_cleaning_jul2026]]
New `receptionist` staff-portal role (free-text `portal_role`, NO migration). Her portal =
Home (announcements + check-in + to-do) + a **Cleaning** tab where she ticks rooms, comments
per room, and submits the day (submission marks her Present — attendance = cleaning). The
Command Centre `/hrms/ocr` is reframed as **overview + control** (reflects her ticks via the
same tables). Managers/directors (e.g. Shivam, Group Admin Manager) get a **read-only overview**
on the same `/portal/cleaning` route via the `cleaningOverview` cap. New caps: `cleaningLog`,
`cleaningOverview`. Files: `portal-permissions.ts`/`portal-auth.ts`/`portal-capabilities.ts`/
`portal-labels.ts`, `portal-pill.tsx`, `portal/(app)/page.tsx` (home strip), new
`portal/(app)/cleaning/{page,actions}.ts` + `portal-cleaning.tsx` + `cleaning-overview.tsx`.
⚠️ Admin `/hrms/ocr` actions have NO internal auth — portal MUST use its own gated actions.
**To test:** Settings → Portals → give a new person Receptionist role + password.

### 4. Compliance watcher overhaul — `430fc83` [[compliance_watcher_jul2026]]
Bills/invoices no longer show on the Expiry Watch: `deriveDocStatus` now honours
`expiry_kind === "no"` (strict real expiry). Catalogue (`doc-catalog.ts`) + `extractPrompt`
are the two levers for doc-type knowledge — added India (PAN/GST/Aadhaar/OCI), immigration
(special/dependant pass, CTA), and payment-bill types. Intake override is two-way (flags "no",
never wipes the date). Person-tagging health bucket ("Should be tagged to a person"). UI: Expiry
Watch countdown is a prominent heat pill. Zero-AI backfill flipped 7 existing bills.
⚠️ Don't force the bill type on `gepg`/"namba ya kumbukumbu" (they appear on issued docs too —
adversarial review caught this). 9 new classifier tests.

### 3. Document Health Check + plain-text reader — `c10a634`, `d7b8557` [[document_health_check_jul2026]]
Zero-AI "Health check" button (To Sort tab) buckets docs: no-file / no-text / unverified /
duplicates / should-be-a-person, with a company filter. Re-read is the only AI step, on demand.
Then fixed the root cause of "re-read keeps failing": plain-text files (`.txt`/`.eml`/`.ics`/`.csv`)
had NO read path — now decoded directly (no OCR/AI). Panel reports honestly (X read / Y couldn't).
Live snapshot: ~2 real failed uploads, 95 unindexed (mostly `.txt` + photos).

### 2. Vision → Gemini — `f6f7e11` [[groq-model-migration]] (via CLAUDE.md)
The retiring Groq vision model (llama-4-scout, shutdown 17 Jul) is a NON-EVENT: `getActiveProvider`
is hardcoded gemini, and `AI_VISION_MODELS` now points at live Gemini vision models. CLAUDE.md note
corrected (OCR does NOT fall back to "rules"). Owner confirmed the Gemini key is set.

### 1. Document intake fixes — `036fa4a` [[doc_intake_audit_jul2026]]
Never-fail uploads (files >22MB + transport failures fall back to the Inbox). Unsure-reads gate
restored (agent-apply.ts confidence gate + the extract agent now returns a numeric `confidence`).
Sorting Desk: newest-first, new "Couldn't read" section, clear review flag on confirm. Rescan
always re-reads fresh (was replaying a stale cache = wrong suggestions) + full owner ladder +
house-name proposal. Searchable "Link…" picker replaces native selects. Smart Add tells the truth.

## Reusable diagnostic scripts (kept, zero-AI, read-only unless noted)
- `scripts/audit-document-health.ts` — library health audit (counts by bucket).
- `scripts/backfill-expiry-kind.ts` — flip existing bills to non-expiring (`--apply`; flag-only, reversible).

## Owner working style (carried through the session)
Non-technical → explain business consequences, British English. Watches 5-hour usage → terse,
no preview screenshots, verify with tsc + tests + targeted checks, one final check. Pushes each
iteration to `master` (Vercel auto-deploys). Supabase egress is 312% over (grace ends 3 Aug) —
nothing this session added a background egress loop; the Pro upgrade is still the recommended safety net.

## Open threads / not done
- Supabase Pro upgrade (owner decision) — egress cliff 3 Aug + proper data/document backups (GitHub backs
  up CODE only, not the Supabase database/uploaded files).
- Receptionist: Chat is hidden + daily sign-off kept (both owner-flippable).
- The scanned-PDF receipt (#926) still won't OCR — a genuine per-file scan edge case, separate from the .txt fix.

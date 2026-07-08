---
name: compliance-watcher-jul2026
description: Strict real-expiry rule, catalogue/prompt as domain-knowledge levers, person-tagging bucket
metadata:
  type: project
---

# Compliance watcher overhaul (8 Jul 2026) — PUSHED @430fc83

Fixes to the Expiry Watch ("Needs attention" / `needs-attention-panel.tsx`): bills/invoices
were tracked, permits/visas sat on companies, thin domain knowledge.

**FORWARD RULE — two levers for "teach the AI what a document is":**
1. `src/lib/doc-catalog.ts` `DOC_CATALOG` — one entry per type with `ownerType`
   (company|person|either) + `expires` (bool) + `companyReqKey`/`personReqLabel`. Adding a
   type here makes intake classify/own/track it correctly. **Content-first** classifier
   (`classifyDocText`): body wins over filename.
2. `extractPrompt` in `src/app/documents/actions.ts` — the AI's domain knowledge (TZ + now
   India + immigration + bills-never-tracked + personal-papers-belong-to-person).

**Strict real expiry:** `deriveDocStatus` (`documents-shared.ts`) returns "No expiry" when
`expiry_kind === "no"`, IGNORING any date. So a non-expiring TYPE never lands on the watch.
Verified SAFE ripple: only surfacing/reminder callers pass a full DocumentRow (has
expiryKind); the compliance-SCORE/requirement engines rebuild `{expiryDate,…}` without
expiryKind, so scoring is unchanged. The intake catalogue override is **two-way** (a
non-expiring type flags "no") but must NEVER wipe `f.expiryDate` — keep the read date so a
mis-type is recoverable; the flag alone untracks it.

**Bills:** new `control-number` + `invoice` catalogue types (expires:false). A demand-
DOCUMENT header ("government bill"/"demand note"/"payment bill"/"assessment notice"…) FORCES
the bill type in `classifyDocText` so a fee bill can't inherit the licence's expiry. ⚠️ Do
NOT add mere identifiers (`gepg`, `namba ya kumbukumbu` = "reference number") to the force
list — they appear on ISSUED permits/licences too (adversarial review caught this). Keep
them as scoring aliases only.

**Person-tagging:** Health Check (`document-health.ts`) new bucket `personMistagged` — a
personal type (catalogue ownerType "person") filed under a company → "Should be tagged to a
person" (name-based, zero AI).

**Backfill:** `scripts/backfill-expiry-kind.ts` — zero-AI, flag-ONLY (never clears dates),
PRECISE title regex (bills/invoices/searches only, never the fuzzy classifier — it misfires
on names when filename≠title). Applied 8 Jul: 7 docs. Re-run `--apply` after new intake.

**UI (Phase 3):** Expiry Watch countdown is now a prominent colour-coded heat pill below the
title (mirrors home company-health cards). See [[document_health_check_jul2026]].

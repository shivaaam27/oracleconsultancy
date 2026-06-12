---
name: documents-compliance-remediation
description: "Tracked remediation + build plan for Documents & Compliance (people, companies, uploads, AI intake, alerting, reporting). Audit June 2026. Phase 0 DONE. Supersedes the original build plan in documents_compliance_plan.md (the centre itself is built)."
metadata:
  node_type: memory
  type: project
---

# Documents & Compliance — Remediation Plan

The Documents centre itself is built (see `documents_compliance_plan.md` for the
original build). This plan is the **forward-looking remediation + hardening** after a
June 2026 audit found compliance scores were neither trustworthy nor complete.

**Why this matters:** this is the core of the admin/HR role. Scores must be
*trustworthy* (right when a document is filed), *complete* (nothing slips), and
*defensible* (an audit trail of who verified what, when). Agreed June 2026.

How the engine works (recap): documents (`documents`) are owned by a company OR a
person; status (Valid/Expiring/Expired) is derived live from the expiry date. People
get a checklist from a shared per-type template (`requirements.ts`); companies each
own theirs (`company-requirements.ts`). A filed document auto-ticks an item, then you
*Verify* it to reach 100%. AI extraction (`documents/actions.ts`) pre-fills the form.
Alerting is one nightly push (`api/cron/notify`).

---

## Phase 0 — Foundation fixes (root-cause bugs). ✅ DONE (June 2026)
*These were why scores "looked wrong/stuck". Everything else reads off them.*

- [x] **0.1 Staff-document auto-linking** — new shared matcher
  `src/lib/requirement-match.ts` matches by item label + document title/type with
  domain synonyms, not broad category. Staff items that were category "Other"
  (National ID, NSSF, bank details, passport photo) now auto-tick. Wired into
  `requirements.ts`.
- [x] **0.2 Category collisions** — the matcher assigns globally best-first, each
  document/item used once, so several same-category items (Expat's 2× Certificate,
  a company's 6× Registration) each grab the *right* document. Wired into
  `company-requirements.ts` too. Both loaders now also load `doc_type`. Old
  `SPECIFIC_CATEGORIES` gates removed.
- [x] **0.3 AI duplicate `person` key** — `documents/actions.ts` prompt now uses
  `person` (matched name string) + `personProfile` (detail object); `coerceFields`
  reads `personProfile` with a legacy `person`-object fallback. Passports/IDs now
  auto-assign their owner.
- [x] **0.4 Deep-link category** — `requirements-checklist.tsx` always carries the
  item category into the new-document form (removed the SPECIFIC gate).
- [x] **0.5 tsc clean + matcher validated** on realistic staff/company data.

## Phase 1 — Make scores defensible (audit trail). ✅ DONE (June 2026)
*New `compliance_events` table (migration `0055`) — append-only, keyed to
person_id/company_id, with snapshotted `label` so the trail survives row deletion.
Client-safe types/labels in `compliance-audit-shared.ts`; DB helpers
(`logPersonRequirementEvent`/`logCompanyRequirementEvent`/`listComplianceEvents`)
in `compliance-audit.ts`. Logging is best-effort (never blocks the user action).*

- [x] **1.1 Audit-log every compliance action** — verify/unverify, waive/unwaive,
  link/unlink, requested, add/edit/remove, AND auto-link (actor "auto-link"), in
  both `requirements.ts` and `company-requirements.ts`. Actor from createdBy.
- [x] **1.2 Compliance history** — "History" collapsible in both the person checklist
  (`requirements-checklist.tsx`) and company checklist
  (`company-requirements-checklist.tsx`); APIs now return `events`.
- [x] **1.3 "Last verified" stamp** — header line in the person checklist
  ("Last verified Xh ago · You"). *(Portfolio "as at" line + company header stamp
  deferred — low value; revisit with Phase 5 reporting.)*

## Phase 2 — Close the "verified forever" gap. ✅ DONE (June 2026)
*New `review_date` column on both requirement tables (migration `0056`). A verified
item now lapses on whichever is sooner — its linked document's expiry OR this manual
"valid until / review by" date — via `worstDocStatus()` (documents-shared.ts) folded
into the effective status. Lead window from the category default. Verified: past date
→ expired (score drops, "expired N days ago"); ~near date → expiring; cleared → verified.*

- [x] **2.1 Manually-verified item carries its own review date** — `setRequirementReviewDate`
  / `setCompanyRequirementReviewDate` (+ `reqSetReviewDate` / `creqSetReviewDate` actions);
  "Valid until" date input on verified items in both checklists; logged to the audit trail.
- [x] **2.2 Surfaced in Expiring/Expired** — folded into `effectiveStatus` in the live
  checklists AND both bulk scorers (`buildPersonRequirementScores` /
  `buildCompanyRequirementScores`), so it flows into the Documents compliance panel,
  needs-attention worklist and scores. *(Push-notification surfacing handled in Phase 3 alerting.)*

## Phase 3 — Renewals & alerting. ✅ 3.1 + 3.2 DONE (June 2026); 3.3 deferred.
- [x] **3.1 Renewal "Chase" draft** — `draftDocumentRenewalAction(id)` (documents/actions.ts)
  persists an Outbox **Draft** renewal/chase message for the document's owner (person OR
  company), de-duped per-doc per-day, no real dispatch (channel deep-links as elsewhere).
  Surfaced in the needs-attention panel: every expiry row now has **Chase** (draft message,
  works for person + company docs) alongside the existing **Renew** (task, company docs only).
- [x] **3.2 Compliance-aware nightly alert** — `api/cron/notify` now also computes
  `buildPersonRequirementScores` + `buildCompanyRequirementScores` and adds
  "N compliance gaps" (missing + expired mandatory, incl. **review-date lapses**) to the
  push body + de-dupe signature. *(Per-owner scheduled digest dispatch still future — there
  is no real provider; drafts only, per open_issues.)*
- [x] **3.3 Renewal lineage** ✅ DONE — `documents.supersedes_id` (migration `0057`); the
  "Replace newest" duplicate flow now records the link (hidden `supersedesId` field → stored on
  the new doc) as well as archiving the old one. Documents table shows a "↻ Renewal" chip and
  the peek shows "Replaces … (archived)" / "Replaced by …". Verified.

## Phase 4 — Staff self-service (portal). ✅ DONE (June 2026)
*New "Your documents" section on `/portal/profile` (portal twin of the admin person
drawer's RequirementsChecklist). `getPersonChecklist(me.id)` server-side → portal
component `portal-documents.tsx` (Needed-from-you / On-file split + % complete).*

- [x] **4.1 Staff see their own checklist** — read-only status list, mandatory/optional,
  expiry labels; no verify/waive/edit (admin-only).
- [x] **4.2 Staff upload onto a gap** — `portalUploadRequirementDocument` (portal/actions.ts):
  re-verifies the requirement belongs to the signed-in person, files it as their Document
  (`createDocument` + `uploadDocumentFile`, createdBy `portal:<Name>`), links it **received**
  (NOT verified — admin verifies), logs to the audit trail as the portal actor. 15 MB cap.
  Verified: missing item → received + portal-stamped event.
- [x] **4.3 Portal parity** — surface-kit `Panel`/`SectionLabel`, `Reveal` entrance, shared
  toast; no hand-rolled motion. Twin map in `memory/portal.md` updated.

## Phase 5 — Reporting & export. ✅ 5.1/5.3 DONE (June 2026); 5.2 already covered.
- [x] **5.1 + 5.3 Portfolio compliance CSV** — `compliance-export.ts` (`buildComplianceCsv`,
  client-safe) + `exportComplianceCsvAction` (documents/actions.ts) + `ComplianceExportButton`
  on the Documents header. One row per company + per person, worst-first, with each owner's
  outstanding items. Verified: 50-row sheet, headers, companies first. Covers both the
  per-company sheet and the portfolio snapshot ask in one auditor-ready file.
- [~] **5.2 Per-person pack export** — the existing **person-pack builder**
  (`person-pack-builder.tsx` / `/people/[id]/pack`) already produces a per-person document
  request/pack (print-to-PDF). Left as-is; revisit only if a different format is wanted.

**Also done this session:** template **renames now propagate** to existing people's snapshots
(`editRequirementItem` updates all `person_requirements` with that `item_id`) — so reworded
requirements update on the person drawer AND the staff portal without a manual Sync.

## Phase 6 — Documents centre UX. ✅ 6.1 DONE; 6.2 already present; 6.3 deferred.
- [x] **6.1 Expiry-timeline view** — `documents-table.tsx` now has a List ⇄ Timeline
  toggle; Timeline groups the same filtered rows into buckets (Expired / Due this week /
  Due this month / Next 90 days / Later / No expiry date), each a glass card with a
  tone dot + count. Row markup extracted to `renderRow` (shared by both views).
  Verified in-browser: all six buckets render.
- [x] **6.2 Bulk actions** — already in place (select-mode + bulk archive/restore mirroring
  People). Bulk *renew* intentionally omitted (renew = per-company task, niche in bulk).
- [x] **6.3 "Manage" dialogs on the EntityDrawer shell** ✅ DONE — `requirement-templates-button.tsx`
  and `journey-templates-button.tsx` rebuilt on `EntityDrawer` (hero glow + tab pill + sticky
  action bar). Bonus UX: each **person type is now a tab** (with a count badge) instead of a long
  scroll; the journey drawer keeps its onboarding/offboarding toggle in the hero. Verified.

## Phase 7 — Smart intake completion (Inbox half). ✅ DONE (already built; verified June 2026)
*Found this was largely already implemented — plan entry was stale.*
- [x] **7.1 Inbox bundle → review queue** — the `/inbox` "Process" button
  (`inbox-list.tsx` `processBundle`) downloads the bundle's attachments as Files + gathers
  the message text, then opens `BulkUploadDialog`, which reviews each file in the full
  `DocumentForm` (files to person/company/both, can create a new person) and marks the
  inbox item filed on completion. Compliance recomputes automatically (filed person/company
  docs auto-link on next checklist read). Added `revalidatePath("/people")` to `revalidateDocs`
  so the People list compliance refreshes immediately too.
- [x] **7.2 Blanks-only profile enrichment** — `MessageProfilePanel` (in `bulk-upload-dialog.tsx`)
  reads the message for profile details and fills only BLANK fields (`enrichPersonProfile`,
  "Only empty fields are filled"); each `DocumentForm` also offers blanks-only enrichment from
  the document content. Always reviewed.

## Phase 8 — Coverage gaps. ✅ 8.1/8.3/8.5 DONE; 8.2/8.4 deferred (decisions).
- [x] **8.1 Seed all 7 company checklists up front** — `ensureAllCompanyRequirements(ids)`
  (one lookup, seeds only unseeded; idempotent) called on the Documents page before scoring,
  so every company scores from stored rows consistently (not the synthesized default).
  Verified: 7/7 seeded.
- [~] **8.2 Vendor document compliance** — **deferred** (a feature, not a bug; needs a vendor
  requirement model + UI). Revisit if wanted.
- [x] **8.3 Offboarding freeze** — already covered: `buildPersonRequirementScores` filters
  `active = true`, so deactivated/offboarded people never appear in compliance gap counts.
- [~] **8.4 Cross-owner documents** (company policy satisfying individual checklists) —
  **deferred**: an owner design decision (currently a doc is strictly company OR person, by design).
- [x] **8.5 Missing no longer double-counts expired** — `missing` now = genuinely absent only
  (expired shown separately) in `buildPersonRequirementScores`, `buildCompanyRequirementScores`
  and `synthDefaultScore`; comment in `compliance.ts` updated. Verified: Cocozuri 5→4 missing + 1 expired.

### Status
Phases 0–6 + 8 done. Remaining: **Phase 7** (Inbox intake review queue), and the deferred
niceties (3.3 supersede lineage, 6.3 dialog shell, 8.2 vendor compliance, 8.4 cross-owner).

---
name: v3-plan
description: "Version 3 direction: Home Intelligence, system-wide automations, and future operating layer."
metadata:
  node_type: memory
  type: project
---

# COS System - V3 Plan

V3 starts from the shipped V2 system and moves COS from a dashboard into a
daily operating desk. The product direction is:

> Home is not a dashboard. Home is the daily command desk.

The owner does not want OCR/OECR expanded for now. Do not include cleaning or
stock-control work in near-term V3 phases unless explicitly requested.

## V3 Phase 1 - Home Intelligence Rebuild

Status: **Started / first pass built**.

What changed:

- The old Home widget stack was replaced by a single **Home Intelligence** view.
- It reuses existing data rather than creating duplicate dashboards:
  - tasks;
  - personal to-dos;
  - documents and compliance alerts;
  - outbox drafts;
  - recent meetings;
  - recent task activity.
- OCR and OECR signals are intentionally excluded.

New Home sections:

- **Today's command** - the most important action to take now.
- **Portfolio pulse** - a compact status strip.
- **Secondary command cards** - other important actions waiting.
- **Focus queue** - one ranked list combining urgent tasks, documents, to-dos and drafts.
- **Recent movement** - a short activity trace of recent task updates/audit events.

Files:

- `src/components/home-intelligence.tsx`
- `src/app/_hub/cos-home.tsx`

Design rules:

- Use existing COS Liquid Glass design tokens and primitives.
- Keep Home quieter and more opinionated than V2.
- Avoid recreating the old widget grid.
- Home should answer: **what should I do next?**

## V3 Integration Rule

Every future feature should expose a small signal to Home Intelligence when it
matters operationally.

Examples:

- Tasks expose overdue, critical, blocked, stale, due-today.
- Documents expose expired, expiring, missing and renewal work.
- People/HRMS should expose workload, missing documents and inactive contacts
  with open work.
- Workbook exposes meeting actions, recent follow-ups and unprocessed notes.
- Outbox exposes drafts waiting and failed sends later.
- Ask COS should use the same Home Intelligence data for "Plan my day".

## Suggested V3 Phases

1. **Home Intelligence Rebuild** - current phase.
2. **Automation Engine V1** - safe suggestions/drafts, no silent mutations. **Started:**
   shared automation helper detects stale tasks and overdue reminder opportunities;
   Home shows stale-task pulse/commands; overdue assigned tasks can create
   de-duplicated Outbox drafts by accountable person (`source=automation-overdue`).
   Document renewal suggestions now detect expired/expiring documents without an
   open linked renewal task and can create de-duplicated linked renewal tasks
   from Home.
3. **HRMS People Profile Upgrade** - person workload, documents, reminders and status.
   **Started:** the person drawer now shows linked compliance documents with
   expired/expiring status, using the same derived status rules as the Documents
   centre. **Person Pack Phase 1 started:** `src/lib/person-pack.ts` now gathers
   one person's profile, compliance gaps, linked documents, open tasks, assigned
   personal to-dos and Outbox draft history, with purpose-based default section
   selections for Document Request, Visa/Permit, Recruitment, Task Reminder and
   Custom. **Phase 2 started:** the person drawer now has a preview-only
   **Prepare pack** action (`src/components/person-pack-builder.tsx`) backed by
   `/api/person-pack`. It now shows a simpler 1-2-3 flow: Reason, Include,
   Preview and draft. Visible reasons are Documents, Work reminder and Custom
   (the richer HR presets — visa/permit, expat onboarding, work-permit renewal,
   recruitment, contract signing — stay reachable via Custom and the Home/Ask COS
   `?purpose=` deep-links rather than as cold-start buttons); include options are grouped into
   Request, Saved documents, Work follow-up, Profile and a collapsed Sensitive
   internal area. Preview counts reflect only selected sections, so hidden work
   or internal data does not appear as if it will be sent. **People drawer
   cleanup pass:** the profile now shows one compact HR file health card near
   the top, with Prepare pack, Add document and Open documents as the primary HR
   actions. Detailed tasks/activity panels are collapsed by default and the old
   duplicate workload chip block was removed. **Documents/compliance integration
   cleanup:** person compliance issues now link to `/people?person=ID&pack=1`,
   opening the person drawer and Prepare pack modal instead of jumping straight
   to a PDF output. Documents linked to a person are labelled as Person file
   inputs in the Documents table. **PDF cleanup pass:** the person-pack PDF
   headline and stat cards now describe only selected sections. Work counts are
   hidden unless work/to-dos are selected, compliance shows "Not included"
   unless selected, and default wording no longer implies compliance data is in
   a document-only pack. **Phase 3 complete:** the builder is mobile/touch
   tightened (phone bottom-sheet behaviour, larger tap rows, sticky action bar)
   and can open a selected-section PDF route at `/people/[id]/pack`, using the
   existing Director Brief-style print approach. The PDF now has a person-facing
   request summary, selected-section content only, pack-specific print sections,
   and a print/PDF button. **Outbox draft phase complete:** the builder now
   shows channel-specific message wording before saving, then creates a saved
   Draft in Outbox with `source="person-pack:..."` and no auto-send.
   **Outbox context cleanup:** person-pack drafts now parse their saved source,
   show the pack purpose, and provide direct PDF and Edit pack links while still
   requiring manual WhatsApp/email opening and Mark sent.
   **Documents integration added:** the Documents form now
   has explicit ownership (Company / Person / Company + Person), supports URL
   prefill such as `/documents?newdoc=1&person=ID`, includes a person filter and
   labels person-linked documents as Person Pack inputs. Missing Person Pack
   requirements link straight to Add Document with person/category/title
   prefilled. **Phase 3 correction pass:** Person Pack now has a real
   "Linked documents" section, smarter empty-state guidance when the selected
   preset has no action items, explicit advice to include tasks/to-dos only when
   wanted, and a PDF layout closer to Director Brief (headline, stat cards,
   report sections). Compliance detail now offers Add Document for missing
   requirements and a person-pack PDF route for person issues. **Home signal
   added:** Home Intelligence now surfaces person-pack needs separately from
   company compliance, prioritising expat/personal document issues in the
   command cards, focus queue and pulse strip. **HR templates added:** the
   builder now includes Expat Onboarding, Work Permit Renewal, Recruitment File
   and Contract Signing as minimalist purpose presets using the same toggle/PDF/
   Outbox flow. **Ask COS pack intent added:** commands such as "prepare visa
   pack for Shivam" resolve locally to the person-pack Prepare pack route,
   without creating a draft or sending anything. **Home/Ask COS routing cleanup:**
   Home person-pack signals and Ask COS person-pack commands now open
   `/people?person=ID&pack=1[&purpose=...]`, landing in the cleaned Prepare pack
   modal with the intended purpose selected.
   **Phase 7 cleanup:** person-pack purpose validation now uses the shared
   `PERSON_PACK_PURPOSES` / `isPersonPackPurpose` helper instead of repeated
   allow-lists across API, PDF, actions and drawer code.
4. **Documents & Compliance Advanced** - missing-document checklists, versions,
   Word/Excel reading, compliance score. **Started:** shared compliance scoring
   now defines required company/person document checklists, computes missing,
   expired and expiring issues, surfaces a Compliance score panel on
   `/documents`, and sends the worst compliance issues into Home Intelligence.
   Follow-up tuning: company records and expats are strict required-checklist
   owners; internal/external people are monitored for expired/expiring linked
   documents but are not marked missing by default. Company checklist now focuses
   on core statutory documents (registration, tax/TIN, business licence/permit);
   insurance and leases are monitored when present rather than mandatory for
   every company. Compliance detail view now opens from each score row and shows
   why the score is low: missing requirements, expired/expiring linked documents,
   and owner-specific next links. Company pages now show their live compliance
   summary card; People Directory shows active people compliance issue counts.
   Word/Excel reading added to the existing document auto-fill upload path
   (`.docx`, `.xlsx`, `.xls`, `.csv`) alongside PDF/image reading. Document
   renewal tasks now de-duplicate against existing open linked tasks and show the
   linked task code directly in the Documents list.
5. **Director Brief Phase 5** - period filters, per-company brief, scheduled draft.
   **Started:** Director Brief now supports period filters (this month, last
   month, quarter, year); page, share text, email and print/PDF data all read
   from the same selected period. Compliance watch has been added to the live
   brief and the print/PDF report using the existing report-table design.
   Per-company brief filtering is now available and keeps page, share/email and
   PDF data in sync with the selected company. A safe "Draft" action now creates
   a de-duplicated Email draft in Outbox for the selected period/company without
   sending anything. Recommended director actions are now derived from live task
   risk and compliance issues, visible on the brief, included in share/email
   text, and printed through the existing PDF report-table layout.
6. **Ask COS Agentic Upgrade** - page-specific "what should I do here?", meeting
   preparation, suggested actions after answers.
7. **Voice Intelligence Expansion** - punctuation/lists, snippets, tone shaping,
   voice in Outbox.
8. **Real Message Dispatch** - choose one provider, keep manual links as fallback.
9. **PWA / Installable App** - manifest, icons, service worker, offline shell.
10. **Insights & Reports Upgrade** - trends and management reports.
11. **Automation Rule Builder** - only after V1 automations prove useful.
12. **Governance & Corrections** - correction workflow and stronger audit tools.
13. **Auth / Multi-user Readiness** - only if the app is shared beyond the single operator.

## V3 — HR & Admin Operating System (in progress, 2026-06)

The owner is the group **admin + HR manager**, building a full HR+Admin operating system, reusing existing primitives (no new silos). Shipped:

- **HR foundation**: 4 person types (`local_staff`/`expat`/`outsider`/`candidate`); person record gained department, start date, **HR profile fields** (DOB, nationality, national ID, passport no., address, emergency contact, probation) + AI "Auto-fill from a message" (blanks-only).
- **Document compliance**: per-type requirement profiles → per-person checklist, auto-link saved docs, verify→100%; surfaced on People/Home/Documents/Director Brief and the redesigned person drawer (glanceable hero tiles + accordion sections).
- **Onboarding / Offboarding journeys**: checklist of `todos` (tagged `kind`), auto-created on add (staff) / on archive (leaver).
- **Asset & Vendor Register** (`/hrms/assets`): durable assets assigned to person or team+custodian (auto-return on offboarding) + supplier link; vendor register (contracts reuse Documents). See `memory/hrms.md`.
- **Leave & Attendance** (`/hrms/leave`): leave types/requests/approvals + holidays, **grounded in Tanzania ELR Act 2004** (Mon–Sat working days; Annual 28/12mo, Sick 126/36mo = 63 full+63 half, Maternity 84, Paternity 3, Compassionate 4); derived balances. Attendance daily register = pending (phase 4.2).
- **ELR Act money phases (planned)**: wage field + s.26 wage-rate table (4.4); overtime ×1.5 / night +5% / Sunday·holiday ×2 + working-time breach warnings (4.5); termination/final-pay (severance 7 days/yr, notice 28 days, accrued leave) (4.6); statutory compliance pack — contract + certificate of service (4.7). Then Recruitment / Performance / Cases-Policies / HR Intelligence.

### People deep-project (2026-06, owner-driven)

Owner wants the person view to be the strong, unified foundation. Agreed 4 phases:
1. **Immersion + design** (DONE, see below). 2. **Customisable checklists** — per-person add/edit/remove on the document-compliance checklist AND onboarding/offboarding journey, **plus editing the per-type templates**. ("Delete" of a standard item = a hidden/not-applicable status so `ensurePersonRequirements` doesn't resurrect it; custom items (item_id null) hard-delete. Journey steps are `todos` rows — add/edit/delete directly.) 3. **Unification & auto-fill** — widen `rulePersonFields`/prompt so all profile fields fill (emergency contact, nationality, name, role currently miss when AI off/misses); link profile ↔ documents (passport field shows its document; adding a passport backfills the number) so everything syncs from one source. 4. (optional) pragmatic tailored add-document form (prefilled + shorter default + "More details" expander; photo upload already works).

**Phase 3 shipped (unification & auto-fill):**
- **Wider auto-fill**: `rulePersonFields` in `people/actions.ts` now also extracts labelled `Role/Designation`, `Nationality`, `Address`, `WhatsApp`, `Emergency contact` (name + phone, incl. "Name - +255…" split), `Manager/Supervisor`, and `Name`. Because the rule result is the base the AI result merges onto, a field the model omits but that's clearly labelled now still fills — fixes the owner's "emergency contact / passport don't fill" gap, and works AI-off.
- **Profile ↔ documents link**: the drawer's Profile details now shows a 📎 link under **Passport no.** and **National ID** when a matching person document is on file (`docFor()` matches by category/keyword), linking to `/documents?person=ID`. If the field is blank but a document exists it reads "{title} — on file", surfacing the backward connection the owner wanted. (Bidirectional backfill on upload already exists via the doc form's enrich banner.)

**Phase 2 shipped (per-person customisation + template editing):**
- **Per-person compliance** (`requirements-checklist.tsx` + `requirement-actions.ts` + `requirements.ts`): add a custom item, edit any item (name/category/required), and remove items. New lib fns `addPersonRequirement`/`editPersonRequirement`/`removePersonRequirement`. **"Remove" of a standard (profile-derived) item sets status `"removed"`** (a stored-only string, filtered out of `getPersonChecklist`/`buildPersonRequirementScores`) so `ensurePersonRequirements` never resurrects it; **custom items (item_id null) hard-delete**. No migration.
- **Per-person journey** (`journey-checklist.tsx` + `onboarding-actions.ts` + `onboarding.ts`): add/edit/delete steps inline (steps are `todos` rows — `addJourneyStep`/`editJourneyStep`/`deleteJourneyStep`).
- **Per-type template editor** (`/documents` → "Manage requirements" button → `requirement-templates-button.tsx`): edit the default `requirement_items` per `requirement_profiles` type. New `listRequirementProfilesWithItems` + `addRequirementItem`/`editRequirementItem`/`deleteRequirementItem` (`template-actions.ts`, `GET /api/requirement-templates` seeds then lists). **Propagation:** adds reach existing people on their next checklist sync (via `ensurePersonRequirements`); edits/deletes do NOT rewrite existing person snapshots (documented in the editor's info banner). Journey-template editing still deferred (hardcoded in `onboarding.ts`, would need a table).
- All verified in preview (API 200 with 4 seeded profiles; checklist Edit/Remove + journey edit/delete + template modal all render).

**Phase 1 shipped:**
- **Immersive add-document**: the requirements checklist "Add"/"Renew" and the drawer "Add doc" no longer navigate to `/documents` (which switched the background page + reloaded on return). They now open the `DocumentForm` in a **modal layered over the person drawer** (`addDoc` state in `person-drawer.tsx`, prefilled person/category/title), and on save refresh the checklist + tiles in place via `refreshKey` → `RequirementsChecklist reloadSignal`. `requirements-checklist.tsx` gained `onAddDocument` + `reloadSignal` props (falls back to the old `<Link>` when no handler). Verified in preview: drawer stays mounted behind, no route change.
- **Design consistency**: the Requirements / Journey / Equipment cards used flat `bg-bg-elev` (pure white in light mode — the "this section is more white" inconsistency) while the drawer's other accordions used `glass elevated`. Unified all to `glass elevated`. (Prepare-pack modal restyle still pending — owner flagged it as white/boring in light mode.)

### People area hardening pass (2026-06)

First "make the foundation strong" pass over People + Person Packs (balanced: bugs + obvious features):
- **Removed the dead parallel person-compliance model** (`buildPersonComplianceScores` + `PERSON_REQUIREMENTS` + `requirementApplies` + `CompliancePerson`) from `src/lib/compliance.ts`. Person compliance is owned solely by the DB-backed `src/lib/requirements.ts` (used by People list, person drawer, Documents page, Person Pack). `compliance.ts` now only scores **companies**; added a guard comment.
- **Person drawer**: deduped the manager line (header "Reports to" is now the single, clickable reference — the standalone block was removed); the **Documents** accordion now deep-links to `/documents?person=ID` (was bare `/documents`); the **Remind** button now always saves a de-duplicated Outbox draft via `createPersonPackDraftAction` (purpose `task-reminder`) and opens the best-channel deep-link (`pickChannel`/`linkFor`) — no more silent jump to `/outbox`.
- **Probation signal**: drawer shows a "Probation ends in Nd" badge (warn ≤45d, danger ≤14d) or "Probation ended {date}" (≤30d past); People directory gained a **"Probation ending"** filter chip (active people whose probation ends within 30 days). Uses the `probation_end_date` already captured.
- Fixed a misleading comment in `enrichPersonProfile` and a stale `person-card.tsx` doc-comment.
- Pack reasons deliberately kept minimal (3) — see note above.

## V3 — Smart Intake (shipped)

One extraction brain across Inbox/People/Documents. Dropping text/files anywhere can fill the person profile (**blanks-only, always reviewed — never overwrites**), file the document(s) to the right owner (person OR company), and recompute compliance. Bulk multi-file upload on `/documents` ("Add several"); recency-aware duplicate detection (Keep both / Replace+archive). Inbox bundles + unified "Process". `src/app/documents/actions.ts` (extractDocumentFromFile + vision), `src/app/people/actions.ts` (extractPersonFields/enrichPersonProfile).

## V3 — Company File (in progress, 2026-06)

Owner wants each company to become a glanceable **company file** (like the person drawer), not just a task list. Agreed direction (decisions locked): **dashboard-first landing**; **grouped documents + statutory checklist**; **editable profile that feeds Letters**. Reuse-don't-duplicate — the Documents/compliance/assets engines and the `companies` branding columns already exist; the company just never got a "file".

**Phase 1 shipped (dashboard-first restructure):**
- `/companies/[id]` tabs are now **Overview · Tasks · Timeline · Org** (`_tabs/tabs.tsx`). Tasks moved off the landing into their own **Tasks** tab; the old **Completed** tab was removed and now folds into Tasks as a collapsed `<details>`. `parseCompanyTab` maps legacy `?tab=completed` → `tasks`.
- **Overview is a real snapshot**, not a task table: six `StatTile`s (Compliance % / Open tasks / Overdue / Team / Documents / Expiring), the `ComplianceSummaryCard`, a "Documents needing attention" section (expired/expiring company docs via `deriveDocStatus`/`expiryLabel`), a compact top-5 open-tasks preview + KPI strip, and the existing insights (`MomentumStrip`/`CompanySummary`) collapsed. Team count = `person_companies` head count for the company.
- Verified in preview (Overview + Tasks tabs render; tsc clean). The pre-existing "script tag while rendering" console warnings are unrelated (AI briefing block).

**Phase 2 shipped (Company File / Documents tab):**
- New **File** tab on `/companies/[id]` (`_tabs/tabs.tsx` gained `file`, FolderOpen icon, doc count badge). `CompanyDocuments` client component (`_tabs/company-documents.tsx`) groups the company's documents by category in a fixed display order (Registration → Licence → Permit → Tax → Insurance → Lease → Contract → Certificate → Immigration → Passport → Other; unknowns last), each row showing issuer · ref · expiry countdown, a derived status badge, a paperclip (signed-URL open via `getDocumentFileLinkAction`) or external-link for `fileUrl`, and an edit deep-link to `/documents?company=ID&doc=ID`.
- **In-place add**: an "Add document" button (top + per-category) opens the shared `DocumentForm` in a Radix modal layered over the page (same pattern as the person drawer), prefilled `initialCompanyId` + `initialCategory`; on save it toasts and `router.refresh()`es — no route change. page.tsx now also fetches the companies+active-people lists for the form.
- Verified in preview: Dar Spices (CO01) shows grouped Licence/Tax/Immigration/Passport with badges + paperclips; empty-state on Terra Green; add modal mounts the form. tsc clean.

**Phase 3 shipped (statutory checklist):**
- New `COMPANY_CHECKLIST` + `buildCompanyChecklist(documents)` in `compliance.ts` — derived, no DB. Required: Company registration, Tax/TIN, Business licence (Licence|Permit). Recommended (monitored, don't drag score / not flagged missing): Insurance, Premises lease. Each item resolves to a status (valid/expiring/expired/missing) by matching the company's docs on category/docType/title, picking the best (valid > expiring > expired).
- Rendered at the top of the **File** tab inside `CompanyDocuments`: a "Statutory checklist" panel with an "X/Y required on file" counter, per-item status icon + badge (On file / Expiring / Expired), Recommended tag, and an **Add/Renew** action that opens the same prefilled `DocumentForm` modal (reuses `startAdd(category)`). Verified on Dar Spices (2/3 required; registration missing → Add; Tax/Licence On file; Insurance/Lease recommended). tsc clean.

**Phase 4 shipped (editable Profile tab):**
- New **Profile** tab (IdCard icon) on `/companies/[id]`. `CompanyProfile` client form (`_tabs/company-profile.tsx`) edits Identity (legal name, registration no., TIN), Contact (address, phone, email) and Authorised signatory (name, title) — the exact `companies` columns Letters/Letterheads read, so one edit point updates both. Save is dirty-gated, toasts, and `router.refresh()`es.
- Server action `saveCompanyProfileAction(companyId, fd)` (`_tabs/../actions.ts` → `src/app/companies/[id]/actions.ts`) updates the eight columns and `revalidatePath`s the company + `/letterheads`. Field names kept in sync with `saveCompanyLetterheadAction`. page.tsx widened the company fetch to load these fields.
- Verified in preview: form renders with live values, dirty-gating works, save persists to DB and reloads (test value written then reverted — no junk left). tsc clean.

**Phase 5 shipped (assets + suppliers on Overview) + UI pass:**
- Overview now has an **Equipment & suppliers** grid (lazy-fetched only on the overview tab): assets where `company_id` or `assigned_to_company_id` === this company (`listAssets`), and vendors where `company_id` === this company (`listVendors`). Each is a compact glass card (count + top 5 + "All" link to `/hrms/assets`); suppliers show an Expired/Expiring badge from their rolled-up contract docs. Section hides entirely when both are empty (current data: all assets are person-assigned, so it shows on no company yet — correct).
- **UI/layout pass** (owner: "huge and long, centre it, fix mobile tabs"): company page content constrained to `mx-auto max-w-[880px]` with tighter `space-y-3.5`; the tab pill is now horizontally **scrollable on mobile** (wrapped in an edge-bleed `overflow-x-auto` scroller, pill is `w-max`, tabs `shrink-0`) so all 6 tabs reach on a 375px screen. Verified: content centered (880px, equal margins at 1440); mobile tab scroll works (scrollWidth>clientWidth).

**Company File complete (Phases 1–5).** Tabs: ~~Overview · File · Profile · Tasks · Timeline · Org~~ — see Files-into-Profile restructure below.

### Files-into-Profile restructure (owner: "too much and long; 2 dropdowns")
Owner wanted the File tab gone and everything under **two dropdowns inside Profile**. Locked decisions: keep full checklist but **collapsed**; clicking a staff person **reuses the Person drawer**; "updates" = current info + last-updated (no history store). Build order: 1 merge & declutter (DONE) · 2 inline edit/delete on company rows (DONE) · 3 staff cards polish (DONE) · 4 auto-fill company profile from uploaded docs (DONE).

**Phase 1 shipped (merge & declutter):**
- **File tab removed**; tabs are now **Overview · Profile · Tasks · Timeline · Org** (`tabs.tsx`). Legacy `?tab=file` → Profile.
- **Profile tab** = company record form (top) + `CompanyDocuments` reworked into **two `<details>` dropdowns**: **Company files** (count badge + Add) containing the `CompanyRequirementsChecklist` collapsed (`defaultOpen={false}`) then a **single flat list** of all company docs (no category grouping), sorted needs-attention-first, each row showing category · issuer · ref · expiry · **last updated** + status + open-file + edit link; and **Staff files** containing compact **person cards** (name, role, file count, compliance dot, expired/expiring badge) that open the existing **Person drawer** via `PersonDrawerLink`.
- Verified in preview: both dropdowns render, flat list + last-updated, staff card → drawer (`?person=`), legacy `?tab=file` redirect. tsc clean.

**Phase 2 shipped (inline edit/delete):** company file rows now have a Pencil (opens `DocumentForm` mode="edit" with the row's `doc` in the same in-place modal — no hop to `/documents`) and a Trash (`archiveDocumentAction(id,true)` soft-delete behind a `window.confirm`, then reloadSignal + refresh). The add/edit modal is unified (`formOpen = addOpen || !!editDoc`). Verified: edit opens prefilled. tsc clean.

**Phase 3 shipped (staff cards polish):** staff cards now have an initials avatar colour-toned by worst doc status (accent/warn/danger), name + role, file count, and status pills (N valid / expiring / expired). Cards are ordered **issues-first** (`staffSeverity`: expired → expiring → rest, then name). Still open the Person drawer on click. tsc clean.

**Phase 4 shipped (profile auto-fill + Key documents):**
- New `companies` columns `vrn` + `incorporation_date` (migration `0034`). Profile form gained **VRN / VAT** and **Incorporation date** fields; `saveCompanyProfileAction` + page fetch updated.
- **Key documents panel** (`_tabs/company-key-documents.tsx`, derived read-only) on the Profile tab between the record and the dropdowns: named rows **Registration · TIN · VRN/VAT · Business licence · Lease agreement**, each showing the headline number (typed value or the matched document's reference) + the document title + expiry/status, or "Not on file". `buildCompanyKeyDocuments` in `src/lib/company-profile.ts` maps docs by category (Registration also matches a Certificate titled incorporation/registration; Tax split into VRN vs TIN by title/`/vrn|vat/`).
- **Auto-fill on document save** (`backfillCompanyProfileFromDocument`, blanks-only, never overwrites): `createDocumentAction`/`updateDocumentAction` call it whenever `companyId` is set — Registration doc → `registration_no` (+ `incorporation_date` from issue date); Tax doc → `vrn` if titled VRN/VAT else `tin`. So uploading company docs (single or bulk, in the Documents centre or in-place) fills the profile. Revalidates `/companies/{id}`.
- Verified: Key documents panel pulls TIN (40-011748-I), Business licence (BL…·in 118 days·Valid) and Registration (56059 from Certificate of Incorporation); VRN + Incorporation date fields present. tsc + migration clean.

**Files-into-Profile restructure complete (Phases 1–4).**

**Phase 6 shipped (File upgrade — per-company custom compliance + staff files):**
- **DB-backed per-company checklist** replacing the old fixed derived one. New `company_requirements` table (migration `0033`, mirrors `person_requirements`: `source_key` null=custom / set=seeded default, status/document_id/auto_link/verify/waive). `src/lib/company-requirements.ts`: `ensureCompanyRequirements` seeds only the 3 core items (Registration, Tax/TIN, Business licence — **no insurance/lease**, owner adds those), `getCompanyChecklist` (ensure + auto-link company docs by category + score), `buildCompanyRequirementScores` (bulk read-only; **synthesizes the 3 defaults for unseeded companies** so they aren't falsely 100%), plus full mutations (request/link/unlink/verify/unverify/waive/unwaive/add/edit/remove).
- **Compliance is now DB-backed everywhere** (owner choice): `buildCompanyComplianceScores` + the derived `COMPANY_CHECKLIST`/`COMPANY_REQUIREMENTS` removed from `compliance.ts` (now only shared types + `worstComplianceScores`). Consumers switched to `buildCompanyRequirementScores`: company Overview tile, `/documents`, Home (`cos-home`), Director Brief, Ask COS.
- **Interactive checklist UI** on the File tab: `company-requirements-checklist.tsx` (mirrors the person one — score ring, add/edit/remove custom items, verify/link/waive, in-place "Add"/"Renew" opens the prefilled DocumentForm modal). API `GET /api/company-requirements?id=`; actions `src/app/companies/[id]/requirement-actions.ts` (`creq*`).
- **Staff files** section on the File tab: documents owned by people of this company, grouped per person with role + counts + status + "Open" to the person. Person→company link = primary `people.company_id` **or** a `person_companies` association (the `company_id`-only case was the gap that made it look empty). Team tile uses the same union.
- Verified in preview: checklist auto-links Business licence + Tax/TIN (Received→verify to score), Company registration Missing; custom "VRN" add + remove round-trip clean (test item removed); staff files show on CO01/04/05/06 grouped by person. tsc + migration applied clean.

## V3 — Letters (shipped: engine + invitation)

System-wide branded PDF letters — per-company letterhead (typed / designed header+footer images / full-page background), Draft→Issue snapshot, full body editing, PDF + optional Outbox draft, no auto-send. First type = Invitation. See `memory/letters.md`.

## Guardrails

- Do not add a new Control Tower page unless the owner explicitly asks.
- Do not duplicate Director Brief; it is for upward reporting, while Home is for
  daily operation.
- Do not auto-send messages.
- Do not silently change task status or create records without confirmation.
- Automation V1 should prepare drafts/suggestions only; the operator still sends
  messages and confirms real status changes.
- Keep AI optional via `getGroqKey()`.
- Use British English and plain language.

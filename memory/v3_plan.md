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

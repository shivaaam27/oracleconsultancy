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
   Preview and draft. Visible reasons are reduced to Documents, Visa / Permit,
   Recruitment, Work Reminder and Custom; include options are grouped into
   Request, Saved documents, Work follow-up, Profile and a collapsed Sensitive
   internal area. Preview counts reflect only selected sections, so hidden work
   or internal data does not appear as if it will be sent. **Phase 3 complete:** the builder is mobile/touch
   tightened (phone bottom-sheet behaviour, larger tap rows, sticky action bar)
   and can open a selected-section PDF route at `/people/[id]/pack`, using the
   existing Director Brief-style print approach. The PDF now has a person-facing
   request summary, selected-section content only, pack-specific print sections,
   and a print/PDF button. **Outbox draft phase complete:** the builder now
   shows channel-specific message wording before saving, then creates a saved
   Draft in Outbox with `source="person-pack:..."` and no auto-send.
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
   pack for Shivam" resolve locally to the correct person-pack preview route,
   without creating a draft or sending anything.
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

---
name: person-record-plan
description: "Audit + phased plan for the Person record (the /people directory, the person drawer/cockpit, the create/edit form, and people actions). Audit June 2026, after the Documents & Compliance remediation."
metadata:
  node_type: memory
  type: project
---

# Person Record — Audit & Phased Plan

Audited June 2026 (after the Documents & Compliance remediation). The person record =
`/people` (directory list), the **person drawer** (`person-drawer.tsx`, the cockpit:
Overview / Compliance / Journey / Tasks / Details tabs), the create/edit form
(`person-form.tsx`), `people/actions.ts`, and `lib/people-queries.ts`.

## What's already solid (confirmed working)
- **Drawer cockpit** — EntityDrawer with hero (avatar tinted by compliance band, contact
  quick-links, probation/snoozed/inactive badges), Overview (compliance ring + stat tiles +
  needs-attention), Compliance (the checklist), Journey (onboarding/offboarding + assets),
  Tasks (assigned + recent activity), Details (grouped identity/contact/employment + inline edit).
- **Directory list** — search, filters (no-contact / snoozed / inactive / overloaded /
  probation-ending), company + type filters, **select-mode bulk archive/restore**.
- **Create/edit** — AI "scan to fill" (`extractPersonFields`, rule fallback), department
  auto-create, primary + dotted-line managers, company associations, duplicate-name guard,
  company-change keeps `previous_staff_ids`.
- **Lifecycle** — new staff auto-get a document checklist + onboarding journey; **archive →
  offboarding journey + auto-return assets**; snooze reminders; one-tap reminder draft; pack export.
- **Integration** — feeds the organogram (`/hrms/org`), per-company Org tab, calendar
  (birthdays/anniversaries/probation overlays). Compliance scores now reflect uploaded
  documents live (fixed in the compliance remediation — `reconcileOwnerCompliance`).
- **Blanks-only enrichment** — `enrichPersonProfile` tops up empty fields only, never overwrites.

## Gaps & issues found (the plan)

### Phase 1 — Person-record audit trail. (Mirror the compliance audit.)
*Right now profile edits leave no trace — you can't see who changed a role / manager / contact,
or when. For an HR record this is the biggest "defensibility" gap, exactly like compliance was.*
- [ ] **1.1** `person_events` table (append-only; person_id, field, old→new, actor, timestamp).
- [ ] **1.2** Log create / update (per changed field) / archive-restore / enrich / snooze in
  `people/actions.ts` (best-effort, like `compliance-audit.ts`).
- [ ] **1.3** A "History" section in the drawer Details tab (reuse the compliance History pattern).

### Phase 2 — Leave & attendance on the person record. (Biggest integration gap.)
*`/hrms/leave` is ELR-accurate and built, but the person record doesn't surface ANY of it — you
can't see a person's leave balance, upcoming/recent leave, or attendance from their cockpit.*
- [ ] **2.1** Surface leave balances (Annual/Sick/etc, derived) + next/recent leave in the drawer
  (a card on Overview or a new "Leave" tab), reusing `lib/leave.ts`.
- [ ] **2.2** Attendance summary (days present / absent this month) once the attendance register lands.
- [ ] **2.3** Add leave gaps/anomalies to the drawer's "Needs attention".

### Phase 3 — Compensation & pay (ELR groundwork).
*The person record has no wage/salary field, so the planned ELR pay / final-pay calculators
(v3 plan 4.4–4.7) have nothing to compute from.*
- [ ] **3.1** Add wage/salary fields (amount + basis: monthly/daily/hourly) to `people` + the form;
  show in Details. **Owner decision: confirm before storing pay data.**
- [ ] **3.2** Pay + final-pay (severance 7 days/yr, notice 28 days, leave-in-lieu) calculators
  per the ELR Act rules in `v3_plan.md`. Gated behind the wage field.

### Phase 4 — Probation & lifecycle automation.
*Probation shows as a badge only; nothing prompts the review.*
- [ ] **4.1** Auto-create a "probation review" task/reminder as the probation end nears.
- [ ] **4.2** Confirm-probation action (extend / confirm / end) from the drawer.
- [ ] **4.3** Service-anniversary surfacing on the record ("X years of service" chip).

### Phase 5 — Record display polish.
- [ ] **5.1** Show **portal access** state (enabled / last login) in the drawer Details/Manage.
- [ ] **5.2** Show **related person** + **secondary (dotted) managers** in the drawer (editable today,
  but not displayed — hero shows the primary manager only).
- [ ] **5.3** Open a person's document in place (the drawer's Documents list currently navigates
  away to `/documents`).

### Phase 6 — Bulk profile actions.
- [ ] **6.1** Extend select-mode beyond archive/restore: bulk set company / department / manager
  (mirrors the existing `setPeopleActive` pattern).

## Suggested sequence
1 (audit trail) → 2 (leave on the record) → 4 (probation) → 5 (polish), with 3 (pay) and 6 (bulk)
as owner-priority allows. Phase 1 and 2 are the highest-value: a defensible record + the leave
data that's already built but invisible on the person.

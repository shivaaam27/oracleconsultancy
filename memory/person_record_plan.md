---
name: person-record-plan
description: "Comprehensive audit + phased plan for the People page (directory, person drawer/cockpit, form, actions) AND its system integration + staff/manager/director self-service gaps. Audit June 2026, after the Documents & Compliance remediation."
metadata:
  node_type: project
---

# People / Person Record — Comprehensive Audit & Plan

Audited June 2026. Scope = `/people` directory (`people-table.tsx`), the **person drawer**
cockpit (`person-drawer.tsx`), the create/edit form (`person-form.tsx`), `people/actions.ts`,
`lib/people-queries.ts`, and how the person record integrates with the rest of the system
AND serves staff / managers / directors via the portal.

## Verdict
The person record is a **strong admin cockpit** — well integrated with tasks, documents/
compliance, onboarding/offboarding, assets, the organogram and the calendar. It is **not
"perfect"**: (a) profile changes leave **no audit trail**; (b) the **Leave & Attendance**
module is built but **invisible on the person**; (c) there is **no pay/comp data**; (d) the
**staff/manager self-service** side is thin (no leave request/approval, no team views); and
(e) **directors have no surface** at all. Plus a few smaller loose ends below.

## What's already solid (integration map — confirmed wired)
- **Tasks** ↔ person: workload (open/overdue/dueSoon/blocked/escalated/completed), assigned
  list, recent activity, top-task peek. ✓
- **Documents / compliance** ↔ person: checklist, score ring, doc issues, in-place "Add
  document"; scores now reflect uploads live (`reconcileOwnerCompliance`). ✓
- **Onboarding/offboarding journeys** ↔ person: auto-started for hires; archive starts
  offboarding + **auto-returns assets**. ✓
- **Assets** ↔ person: equipment held, custodian kit. ✓
- **Organogram** ↔ person: primary `manager_id` + dotted `reporting_lines`; edits revalidate
  `/hrms/org` + company Org tab. ✓
- **Calendar** ↔ person: birthdays / anniversaries / probation overlays. ✓
- **Outbox/reminders** ↔ person: one-tap reminder draft, pack export. ✓
- **Directory list**: search, filters (no-contact / snoozed / inactive / overloaded /
  probation-ending), company + type filters, **bulk archive/restore**. ✓
- **Create/edit**: AI scan-to-fill (rule fallback), blanks-only enrichment, dup-name guard,
  company-change keeps `previous_staff_ids`. ✓

## Loose ends, bugs & quality notes
- **No profile-change audit** — create/update/enrich/archive/snooze write nothing to history.
- **`getPersonDetail` loads ALL tasks** (`getAllTasks()`) just to compute one person's workload —
  wasteful; fine functionally. `getStaffIdMap()` is also called redundantly.
- **Related person + secondary (dotted) managers are editable but never displayed** in the drawer
  (hero shows only the primary manager).
- **Notes is a single freeform field** — no structured/dated HR notes (recognition, warnings, 1:1s).
- **No profile-completeness signal** — blank mandatory HR fields aren't surfaced anywhere.
- **Documents list in the drawer navigates away** to `/documents` rather than opening the file.
- **No "message this person"** link from the record into Chat (people are chat participants).
- **Portal access is managed only in Settings**, disconnected from the person record.

## Missing features by stakeholder

### Admin / owner
- Profile-change **audit trail** (who changed role/manager/contact/pay, when).
- **Leave balances + attendance** on the record.
- **Wage / compensation** data → enables ELR pay & final-pay calculators (v3 4.4–4.7).
- **Probation review** prompt + confirm/extend/end workflow (today just a badge).
- **Portal access** management from the record; **"Message"** (DM) link to Chat.
- **Profile completeness** indicator; **structured HR notes** log.
- **Bulk profile edits** (company / department / manager), not just active.
- **Full HR-file export** (PDF), beyond the document pack.

### Staff (portal)
- **Request leave** from the portal + see **leave balance** (today leave is admin-only).
- See **own onboarding journey** progress (admin-only today).
- See **equipment held**; see **payslip/pay** (if pay added).
- **Update own contact details** (review-gated).
- **Team directory** (who's who) in the portal.

### Managers (portal)
- **Approve leave** for direct reports (approval is admin-only today).
- See reports' **compliance / onboarding status** and **attendance**.
- **Team org chart / directory**; **1:1 / performance notes** on reports.

### Directors
- **No director surface exists.** Options: a read-only **director view/portal** (headcount,
  org chart, compliance %, leave liability, key risks) — or extend the Director Brief into a
  per-director interactive view. Bigger product decision; flag for owner.

## Phased plan

### Phase 1 — Person-record audit trail. ✅ DONE (June 2026)
*`person_events` table (migration `0058`) + `person-audit.ts` / `-shared.ts` (mirrors the
compliance audit). Best-effort logging — never blocks the user action.*
- [x] `person_events` table (append-only; person_id, action, field, old→new, detail, actor, ts).
- [x] Logging in `people/actions.ts`: **created**; **per-field update** (via `diffPersonChanges`,
  which resolves company/manager/department/type names + formats dates, one event per changed
  field); **archived/restored** (single + bulk); **enriched** (actor "intake", lists filled fields);
  **snoozed/unsnoozed**.
- [x] "History" section in the drawer **Details** tab — newest first, "Role: Clerk → Senior Clerk",
  with relative time + actor. `getPersonDetail` returns `events`; API unchanged (passes through).
  Verified: lib round-trip + real snooze path both log and read back; tsc clean; no console errors.

### Phase 2 — Leave & attendance on the person record. ✅ DONE (2a–2e).
*The `/hrms/leave` module was built but invisible on the person. Now surfaced by reusing
`personLeaveBalances` + `listLeaveRequests` (added to `getPersonDetail` → `PersonDetail.leave`).*
- [x] **2a Leave tab** — new "Leave" tab in the drawer (`person-leave.tsx`): per-type balance
  bars (taken/entitlement, remaining, pending; "N left" with low-balance warning) + a requests
  list (upcoming/pending first, then past) with status badges. Verified: 6 balance types render.
- [x] **2b Overview / Needs attention** — pending leave requests appear in the drawer's
  "Needs attention" ("N leave requests pending" → Leave tab); Leave tab carries a pending-count badge.
- [x] **2c Hero badge** — "On leave" when currently on approved leave; "Leave in Nd" when the next
  approved leave is within 21 days.
- [x] **2d Attendance summary** — `personAttendanceThisMonth` (leave.ts) → `PersonDetail.leave.attendance`;
  the Leave tab shows a Present/Absent/Leave-Sick/Recorded card **only when the register has rows**
  (recorded > 0), so it lights up automatically once the attendance register (HRMS Leave 4.2) is used.
- [x] **2e Actionable requests** — pending leave rows have inline **Approve/Reject**
  (`decideLeaveRequestAction`); a **"Record leave"** mini-form (type/dates/half-day/reason →
  `createLeaveRequestAction`) sits under the requests list. Verified: record → pending balance,
  approve → taken balance, both recompute live. The drawer refreshes via `onChanged`.

#### Follow-on sub-phases (future, owner-priority)
- [ ] **2f** Leave on the directory list (a column/peek hint: on-leave-today / balance-low).
- [ ] **2g** Leave liability roll-up for the Director Brief / Insights (cost of accrued leave).

### Phase 3 — Staff & manager self-service (portal). ✅ DONE (3a–3e).
*Portal leave self-service loop built on the Phase 2 leave foundation. Auth always forced
server-side (`getPortalPerson`), never trusting the form.*
- [x] **3a Staff request leave** — "Your leave" section on `/portal/profile` (`portal-leave.tsx`):
  read-only balance bars + own requests + a "Request leave" form → `portalRequestLeave`
  (forces personId = me.id; reuses `createLeaveRequestAction`). Lands Pending.
- [x] **3b Manager approve/reject** — "Leave to approve (N)" section on the portal home for
  managers (`portal-team-leave.tsx`): pending leave from direct reports with Approve/Reject →
  `portalDecideLeave` (manager-only; authorises requester ∈ directReports; stamps
  `portal-mgr:<Name>`). Verified: reporting model populated; pages render; tsc clean; parity
  (surface-kit/Reveal). Note: grant the **manager** portal role in Settings to see approvals.
- [x] **3c Staff: onboarding + equipment** — "Your onboarding" (journey progress bar + steps,
  read-only) and "Your equipment" (assets held) sections on `/portal/profile`, reusing
  `getJourney` + `assetsForPerson`. Verified data flows (e.g. 3/10 journey, held laptop).
- [x] **3d + 3e Manager "My team"** — a team roster on the portal home (manager only): each
  direct report as a card with compliance %/band + onboarding % (reuses
  `buildPersonRequirementScores` + `getJourney`); links to chat. Covers the team status glance
  AND the directory in one surface.
  *(Attendance-at-a-glance folds in once the attendance register lands — same as 2d.)*

### Phase 4 — Probation & lifecycle automation. ✅ DONE (4a–4b).
- [x] **4a Probation workflow** — a Probation panel in the drawer Manage section
  (`person-probation.tsx`, shown for active people): status line + **Confirm passed**
  (clears the date), **Extend/Set date**, and **Create review task**
  (`createProbationReviewTaskAction` → an HR task in the person's company, due on the
  probation date, owned by their manager). `setProbationDateAction` logs the change to the
  Phase-1 audit trail. Verified: events logged; review task created (then test orphan cleaned).
- [x] **4b Service anniversary** — a "{N} yrs" hero chip (active people, ≥1yr from start date)
  + a "Needs attention" entry when a work anniversary is within 14 days.
  *(Auto-creating the review task via cron, and anniversary nudges in the Brief/notify, are a
  natural follow-on — left for when the notify cron is next touched.)*

### Phase 5 — Compensation & pay (ELR groundwork). *Owner decision before storing pay.*
- [ ] Wage/salary fields (amount + basis) on `people` + form + Details.
- [ ] Pay + final-pay calculators (severance 7d/yr, notice 28d, leave-in-lieu) per `v3_plan.md`.

### Phase 6 — Record display polish + bulk.
- [ ] Show related person, secondary managers, portal status; "Message" → Chat; profile-completeness chip.
- [ ] Open documents in place (no navigate-away).
- [ ] Bulk set company / department / manager (mirror `setPeopleActive`).
- [ ] Perf: scope `getPersonDetail` workload to the person's tasks; dedupe `getStaffIdMap`.

### Phase 7 (optional, owner decision) — Director surface.
- [ ] Read-only director view (headcount, org chart, compliance %, leave liability, risks),
  or a per-director interactive brief.

## Suggested sequence
1 (audit) → 2 (leave on record) → 3 (staff/manager self-service) → 4 (probation) → 6 (polish),
with 5 (pay) and 7 (director) as owner-priority decides. Phases 1–3 carry the most value:
a defensible record, the leave data made visible, and real staff/manager self-service.

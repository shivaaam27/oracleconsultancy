---
name: audit-phase2-jun2026
description: "Second DEEP full-system audit (June 2026) — page-by-page + cross-module integration/sync/compliance + daily-UX/mobile/unification. 90 findings, labelled. Owner refers to items by ID (e.g. 'do P1-COMP-03'). Mode = audit-then-fix-in-one-sweep, push nothing until reviewed."
metadata:
  node_type: memory
  type: project
---

# COS System — Second Full Audit (DEEP pass), June 2026

**What this is:** a deeper successor to `audit_phase1_jun2026.md`. The first audit was a code/dimension sweep (safety, tokens, centring, correctness, perf). This one goes **page-by-page + traces cross-module data round-trips**: portal upload → person → compliance → onboarding → Brief; classification changes; organogram; dead links; daily journeys; mobile; the Task-page bloat; the to-do centring. Produced by **16 read-only specialist auditors** on 2026-06-14 (workflow `wf_1aad7b1f-5ac`), 90 findings. All findings are **static-code-verified** (no live DB/browser run) — file:line evidence is exact; runtime repro recommended for the ⚠ live-behaviour ones.

**How to use the numbers:** say e.g. "do P1-COMP-03" or "skip P2-DSGN-05". Severity: 🔴 critical (data-loss/security/broken-core) · 🟠 major (wrong behaviour / broken flow) · 🟡 minor · ⚪ cosmetic. Effort: S (<30 min) · M · L.

**Mode (owner chose):** audit-then-fix in ONE sweep, fix-agents partitioned so they never edit the same file, **nothing pushed** until the owner reviews the whole diff.

---

## EXECUTION LOG
- **2026-06-14 (discovery):** 16 finders, 90 findings. Synthesis hand-done by main loop (finder-synthesis agent hit the session limit; raw findings recovered via cached resume).
- **2026-06-14 (Wave 1 — functional, run wf_4026d815-55c):** 8 disjoint-file agents, **69 findings fixed**, `tsc --noEmit` clean (1 trivial Supabase-inference error fixed centrally). Plus 3 central cross-agent wirings: leave-to-approve tile wired into documents/page.tsx (P1-PORTAL-01), portalMarkAttendance no longer clobbers created_at (P1-PORTAL-04 portal side), `&from=person` link (P2-NAV-08 via Agent H). Owner decisions applied: shared-kit→clear-custodian; Insights→stripped to unique charts; chat roster→unchanged (all-companies); calendar→condensed mobile Month. **Nothing pushed.**
  - Wave 1 covered: P1-COMP-02/03/04/05, P1-CLASS-01/02/03/04/05, P1-HR-01/03/04/05/06, P1-PORTAL-01/02/03/04(both)/05/06, P1-ORG-01/02/03/04/05/06, P2-NAV-01..10, P2-LIFE-01/02/03/04/05/06, P2-JRNY-01/03/04/05/06, P2-UPL-01/03/04/05/06/07/08/09, P2-MOBILE-01/03/04, P2-POPUP-03/04, P2-XCUT-01/02/03/04, P2-LAYOUT-02, P1-HR-02. P1-COMP-01 = company side fixed; **people-half deferred** (zero-row legacy people read false 100% — per-load seed too costly; minor edge case).
- **2026-06-14 (Wave 2a — UX/layout, run wf_f25fa4e6-af4):** DONE, tsc clean. Task-page declutter (P2-TASK-01/02/03 — WidgetCard→PageHeader, removed duplicate gauge grid, table now table-first), to-do centring (P2-LAYOUT-01 — `mx-auto` on the 672px to-do column), OCR header/width→OECR parity (P2-LAYOUT-03), search-bar mobile (P2-MOBILE-05), popup Escape/scroll-lock/aria (P2-POPUP-05 on snooze/peek/meeting-extractor).
- **2026-06-14 (Wave 2b — design-system unification, run wf_c84f34fc-bee):** DONE, tsc clean. Primitives: `HrmsDialog` upgraded to the one responsive shared dialog (centred glass on desktop, **mobile bottom-sheet** with grab handle, Esc/scroll-lock/aria free via Radix, width/footer props, backward-compatible) + new `CountPill` badge primitive. Adopted across: assets+site-tools (11 dialogs), vendors+leave (2 dialogs), documents DocDialog + bulk-upload + new-person + add-inbox (4 dialogs) → all P2-POPUP-01/02 + P2-MOBILE-02 + P2-DSGN-03; count-badges→CountPill + shadow-2xl→shadow-lg across people-table/attention-list/needs-attention/outbox/macos/sent-log (P2-DSGN-04).
- **FINAL VERIFICATION:** `tsc --noEmit` clean after every wave; **full `next build` GREEN**; 85 files changed, +2724/−1554; **NOT committed, NOT pushed** — awaiting owner review.
- **2026-06-14 (RE-AUDIT, run wf_cdb54287-ae9):** 5 finders (mobile / all portals / unification-gaps / Wave-2b regression / polish), 18 findings — incl. 2 REAL BUGS missed earlier (company-with-0-tasks 404s; issuing a letter with no company locks it blank forever). Wave 2b dialogs confirmed NOT regressed.
- **2026-06-14 (Wave 2c, run wf_cfce5d63-de8):** portal + mobile + polish, tsc clean. F1 company-404 fix, F2 letter-no-company guard, P1-ORG-05 org-picker now TOASTS the cycle message (actions return {ok,error}), director portal (badge/duplicate-composer/redundant-Home-tab/empty-activity→group-feed), manager team→DM, self-check-in note no longer clobbers admin note, portal-leave zero-balance hide, portal task-new Hero; mobile: calendar EventForm→HrmsDialog + kebab actions + hide dup button, attendance register condensed mobile mode, person-drawer Add-doc/New-task → HrmsDialog bottom-sheets + snooze wrap; polish: chat mute/error-state, palette import, meeting flash/onBlur, insights→Brief link.
- **2026-06-14 (Wave 2d, run wf_32c5ecbe-784):** design-system adoption, tsc clean. New shared RegisterList/RegisterRow/RegisterGroupHeader + CountPill warn/transparent tones (ui.tsx). Adopted: documents/people/vendors/assets/site-tools/leave rows → one register style; ~16 raw `<select>` → shared Select (vendors/assets/site-tools/leave + people bulk + person-form); count badges → CountPill (incl tinted filter-chips via inherit tone); bespoke headers (workbook/companies-detail/OCR/drawer-kit/register-tabs) → standard shape. **Deliberate:** Hero kept on dashboard pages (Brief/Calendar/Companies/Command-centre/Assets/Outbox) — two-tier header is intentional, not downsized.
- **2026-06-14 (FILE SPLITS, run wf_2b7c80e3-b7e):** ATTEMPTED, hit session limit (resets 2:10pm) — agents died mid-edit leaving command-palette.tsx broken + 3 stray -parts.tsx. RECOVERED cleanly: `git checkout HEAD` on the 3 files + deleted stray files + re-applied the one functional edit (home METRIC_HREF). **File splits NOT done** (audit-1 7.1 still open — lowest value, highest risk; do per-file later, NOT in a batch).
- **FINAL STATE:** `tsc --noEmit` clean; **full `next build` GREEN**; **97 files changed, +3411/−1816; NOT committed, NOT pushed.**
- **Deferred minor / not done (all non-bug):** P1-COMP-01 people-half (zero-row legacy people read false 100% — per-load seed too costly); audit-1 7.1 file-splits (9 files >900 lines — do per-file later); a few deep raw-select migrations (person-form comboboxes intentionally kept; one multi-row listbox; ~remaining scattered selects); documents/people rows kept as raw divs (long-press pointer handlers RegisterRow doesn't forward) inside the new RegisterList; leave-board Overview/Setup cards still glass while its Requests list went solid.
- **Owner to visually confirm (static-verified only, no live DB/browser in the sweep):** the to-do centring, the Task-page layout, the mobile dialogs/bottom-sheets + attendance condensed mobile mode, the condensed mobile calendar Month, the unified register rows (leave Requests list now solid not glass), and the portal screens for all three roles.

---

## Severity counts (after de-dup → ~80 distinct)
- 🔴 critical: 0 (no data-loss/security — the audit-1 P0s held; chat-file guard, soft task-delete, login throttle all verified in place)
- 🟠 major: ~26
- 🟡 minor: ~38
- ⚪ cosmetic: ~16

**Headline:** the foundations are genuinely sound — auth scoping, the core compliance loop, the create→onboard→offboard lifecycle, blanks-only intake, and most portal round-trips are correctly wired (see "Confirmed healthy"). The real value here is in **(a) classification-change compliance bugs**, **(b) bulk-path gaps that the single-person path handles**, **(c) ~10 broken/inconsistent links**, **(d) the Task-page bloat + dialog/table/mobile unification**, and **(e) a few money/figure mismatches in the Brief & pay**.

## Top themes
1. **Type-change compliance is the weakest real area** — changing a person's type can duplicate requirements and keep stale ones scoring (P1-COMP-03/04).
2. **Bulk paths skip side-effects the single path does** — bulk deactivate skips offboarding + asset return; no bulk person-add at all (P2-LIFE-02, P2-JRNY-02).
3. **~10 links are broken/inconsistent** — ⌘K reaches only 6 of 16 pages; calendar "Meeting" + AI "/audit" dead-end; home tiles jump to wrong filter (P2-NAV-*).
4. **Notifications miss leave + director replies** — a leave request pings nobody (P1-PORTAL-01).
5. **Task page is the owner's core UX complaint, confirmed** — ~430-480px of header chrome above the table, KPIs shown twice (P2-TASK-*).
6. **Dialogs/tables/headers/mobile not unified** — ModalShell unused, ~24 hand-rolled dialogs, 3 table surfaces, 3 header styles, portal pill overflows phones (P2-POPUP-*, P2-MOBILE-*, P2-DSGN-*).
7. **Brief & pay figures** mix company-filtered with portfolio-wide; severance label vs amount disagree (P1-HR-01, P1-HR-03).
8. **Upload divergence** — admin upload is already unified (DocumentForm); the **portal** upload and **person-form scan** are the outliers (no AI-read, no dedup, file discarded) (P2-UPL-*).

---

# PART 1 — Integration, sync, compliance, organogram, portal

## Compliance & requirements
- **P1-COMP-01 🟠 Company scores read 0% until the File tab is opened; zero-row people read a false 100%** [M] — the bulk scorers are read-only and seeding never auto-links. `src/lib/company-requirements.ts`. Fix: auto-link unlinked rows in the bulk scorers; sync people on Documents load.
- **P1-COMP-02 🟠 "Add document" deep-links from the needs-attention panel drop the requirement category, so the saved doc fails to auto-link back; and re-assigning a doc's owner orphans the old requirement** [M] — `src/components/needs-attention-panel.tsx`, `src/app/documents/actions.ts` (updateDocumentAction). Fix: use `gap.categories[0]` in the link builders; reconcile the PRIOR owner too in updateDocumentAction.
- **P1-COMP-03 🟠 Changing a person's type DUPLICATES shared requirement items** (e.g. "Employment contract", "TIN", "Passport photo", "Bank details", "CV") — they exist as separate `requirement_items` rows per profile, so the verified old row stays AND a fresh "missing" row is inserted → the item shows twice, lowering the score. `src/lib/requirements.ts` (ensurePersonRequirements ~:182), `src/app/people/actions.ts`. Fix: skip-insert when a non-removed row has the same case-insensitive label; re-point its item_id instead of duplicating.
- **P1-COMP-04 🟠 Old-type mandatory requirements (Visa, Work permit) persist and keep scoring after a person changes type** — orphan-cleanup preserves verified/linked rows, so a now-local-staff person still shows "Visa" and it counts toward mandatory totals everywhere (drawer, portal, People list, Documents tiles). `src/lib/requirements.ts:197-206`, `src/app/people/actions.ts:546`. Fix: on type change, soft-remove verified/linked rows whose item belongs to a profile that no longer applies and whose label isn't in the new profile.
- **P1-COMP-05 🟡 Deleting a template requirement item leaves an un-syncable orphan on every person** — FK set-null turns the snapshot into an item_id=null "custom" row that no future sync can clean (and a delete-then-re-add then duplicates). `src/lib/requirements.ts` (deleteRequirementItem). Fix: soft-remove the matching person_requirements rows BEFORE deleting the template item.

## Classification propagation (department / role / org)
- **P1-CLASS-01 🟠 The person edit form & bulk-set CREATE DUPLICATE departments** — `resolveDepartmentId` / `bulkSetPeopleField` / `enrichPersonProfile` match department name CASE-SENSITIVELY and insert if absent, while the Companies-hub guard uses `ilike`. Typing "finance" when "Finance" exists makes a second dept → split counts, duplicated org group + combobox option. `src/app/people/actions.ts:62,780,609`. Fix: one `resolveDepartmentByName` helper using `ilike(...).maybeSingle()`, reused everywhere.
- **P1-CLASS-02 🟡 Role rename/merge silently skips people whose role text has surrounding whitespace** — counts trim but the re-point uses a raw `ilike` (no trim) → "will affect N" updates fewer, leaving padded stale roles. `src/app/companies/reference-actions.ts:108,127`, `src/lib/roles.ts`. Fix: compare on `lower(trim(role))`.
- **P1-CLASS-03 🟡 Archiving a person does not vacate their department-head or dotted-line-manager roles** — `department_heads.head_person_id` / `reporting_lines` keep pointing at the leaver; head counts still include them. `src/app/people/actions.ts` (togglePersonActive), `src/lib/departments.ts`. Fix: clear those on archive (or at least filter getDepartmentHeads to active).
- **P1-CLASS-04 🟡 Department merge/delete doesn't revalidate the Tasks hub or company-detail pages it re-points** — tasks carry department but only `/companies`, `/hrms/org`, `/people` are revalidated. `src/app/companies/department-actions.ts`. Fix: add `revalidatePath('/')` + `/companies/[id]`.
- **P1-CLASS-05 🟡 One-tap director/manager changes on the org chart don't revalidate /people** — `setPersonDirector`/`addPersonManager` revalidate `/hrms/org` but not `/people`, so the directory + drawer show stale reporting. `src/app/hrms/org/actions.ts`. Fix: add `revalidatePath('/people')` + `updateTag('people')`.

## Organogram
- **P1-ORG-01 🟡 The Portfolio flowchart and the "Everyone" web cannot be printed/exported** — the whole print pipeline is scoped to `.org-root` which only wraps the per-company TreeView; the two flagship board-facing views have no Print. `src/components/org-flow.tsx`, `globals.css`, `org-chart.tsx`. Fix: add a Print control to OrgFlow reusing the `--org-print-scale` approach (factor TreeView's print() into a shared helper).
- **P1-ORG-02 🟡 "Reporting lines" shows two different numbers on the same screen** — the page header counts primary-manager-only; OrgFlow's toolbar counts primary + every secondary edge. Same words, two values. `src/components/org-flow.tsx:173`, `src/app/hrms/org/page.tsx`. Fix: relabel/split (`X reporting lines · Y also-reports-to`).
- **P1-ORG-03 🟡 Department heads are invisible in every hierarchical view except By-department** — `deptHeads` is loaded but only used in the By-department list; no "Head" marker in Chart/Outline/flowchart/web. `src/components/org-chart.tsx`, `org-flow.tsx`, `org/page.tsx`. Fix: thread a `headIds` set into the cards, render a "Head" pill.
- **P1-ORG-04 🟡 The flowchart renders a BLANK box (no message) when ELK fails or there are no people** — `.catch` sets layout null and the render guard hides everything; no error/empty state (TreeView has them). `src/components/org-flow.tsx:114,193`. Fix: add fallback + empty states.
- **P1-ORG-05 🟡 A reporting CYCLE can be saved; the chart then silently drops the line with no warning** — no write-path rejects A→B + B→A; render-time `createsCycle` drops it, reading as "the app lost my change". `src/app/hrms/org/actions.ts`, `src/app/people/actions.ts`, `src/lib/org-chart.ts`. Fix: guard at write time with a clear message.
- **P1-ORG-06 ⚪ The Portfolio flowchart has no company colour legend** though "company = colour" is the locked design — the legend explains only line types. `src/components/org-flow.tsx:171-176`. Fix: add a per-company swatch+name legend (pass `companies` in).

## Portal round-trips
- **P1-PORTAL-01 🟠 A staff leave request notifies NOBODY** — `createLeaveRequestAction` only revalidates; no createNotification/push. The approver learns of it only by visiting the leave page; owner needs-attention doesn't surface pending leave. `src/app/portal/actions.ts`, `src/app/hrms/leave/actions.ts`, `src/lib/notifications.ts`, `src/components/needs-attention-panel.tsx`. Fix: notify the requester's manager(s) + admin on insert; add a "Leave to approve (N)" needs-attention tile.
- **P1-PORTAL-02 🟡 Director-stamped posts render as the raw string `portal-dir:<Name>` in the admin timeline** (and fall through to a generic "Management" label on the portal). `actorLabel` handles every other stamp but not `portal-dir:`. `src/components/timeline-entry.tsx`, `portal/(app)/task/[code]/page.tsx`, `portal/(app)/activity/page.tsx`. Fix: one-line branch each.
- **P1-PORTAL-03 🟡 Replying to a director's pinned instruction never notifies the director** — `recipientForCreatedBy` doesn't decode `portal-dir:`. `src/lib/notifications.ts`. Fix: add the branch.
- **P1-PORTAL-04 🟡 Admin can't see (and silently corrupts) the self-check-in provenance note** — the register loader doesn't read `note`, and an admin override leaves the stale `portal:<Name>` note, mislabelling the admin's correction as a staff self-report. `src/lib/attendance.ts`, `src/app/hrms/leave/actions.ts`, `src/components/attendance-register.tsx`. Fix: read/badge note; overwrite to 'web-ui' on admin write. (Also tracked as P1-HR-05; same root.)
- **P1-PORTAL-05 🟡 A portal task update doesn't refresh an already-open admin task drawer** — `portalAddUpdate` revalidates `/task/[code]`, now a redirect stub (a no-op); LiveSync is mounted only on the portal page. No data loss. `src/app/portal/actions.ts`, `src/components/task-drawer.tsx`. Fix: revalidate `/`, or mount LiveSync in the admin drawer.
- **P1-PORTAL-06 ⚪ The once-a-day check-in pop-up mounts on EVERY portal page (incl. the director board) and runs a query per navigation** — gated by localStorage so it pops once, but it shouldn't mount off the home surface, and directors get it over their board. `portal/(app)/layout.tsx`, `portal/(app)/page.tsx`. Fix: move the mount + query to the home page only; skip for directors.

## HR records (leave / pay / attendance / Brief)
- **P1-HR-01 🟠 Director Brief HR card MIXES company-filtered headcount with portfolio-wide leave/cost** — filter the Brief to one company and you get that company's headcount but ALL-7-companies' on-leave, leave-liability TZS and sick-cost TZS in the same card. Also in the printed report + share text. `src/lib/director-brief.ts`, `src/lib/leave.ts`. Fix: make the leave helpers accept a companyId (or compute from the filtered id set).
- **P1-HR-02 🟠 Offboarding orphans SHARED-asset custodianship** — `returnAssetsForPerson` only returns personally-held kit; team kit where the leaver is `custodian_person_id` keeps pointing at them forever. `src/lib/assets.ts`, `src/app/people/actions.ts`. Fix: also clear/reassign custodian on archive. (Owner decision: return-to-store vs clear-custodian — see Owner Decisions.) *(Same as P2-LIFE-03.)*
- **P1-HR-03 🟡 Final-pay severance LABEL shows uncapped years but the AMOUNT uses the 10-year cap** — ">10 yrs" staff see e.g. "7 days × 15 yrs" next to a 10-year figure. `src/lib/pay.ts:79`, `src/components/person-pay.tsx:52`. Fix: return/show the capped years.
- **P1-HR-04 🟡 Person-drawer "Attendance this month" ignores approved-leave days the register shows** — it reads only the attendance table, not the leave/holiday overlay the register + portal derive, so the two views disagree. `src/lib/leave.ts` (personAttendanceThisMonth). Fix: fold in the same overlay.
- **P1-HR-05 🟡 Admin attendance override leaves a stale `portal:<Name>` note + re-writes created_at on every edit** — provenance lies; original insert timestamp clobbered. `src/app/hrms/leave/actions.ts`. Fix: set note on admin write; only set created_at on insert. *(Pairs with P1-PORTAL-04.)*
- **P1-HR-06 🟡 Leave "remaining" ignores PENDING requests** — drawer/portal show more days than are bookable (the booking guard correctly subtracts pending, but the displayed remaining doesn't), and that remaining also feeds the final-pay leave-payout estimate. `src/lib/leave.ts` (personLeaveBalances). Fix: subtract pending from displayed remaining; keep accrual/liability on approved-only.

## Lifecycle (onboarding / offboarding)
- **P1-LIFE / see P2-LIFE-*** — lifecycle findings are grouped under Part 2 journeys (P2-LIFE-01..05) since they're daily-flow-shaped.

---

# PART 2 — Daily UX, mobile, task page, popups, upload, unification

## Navigation & links (high-value, mostly S)
- **P2-NAV-01 🟠 ⌘K command palette + Settings "pin pages" can only reach 6 of ~16 destinations** — `NAV_ROUTES` has only inbox/workbook/people/documents/outbox/settings; typing "leave", "calendar", "organogram", "tax", "assets", "companies", "letters", "insights" in ⌘K returns NOTHING, and those can't be pinned or appear in recents. `src/lib/nav.ts`, `top-pill.tsx`, `command-palette.tsx`, `nav-settings.tsx`. Fix: extend NAV_ROUTES to the full launcher set (ideally derive both NAV_ROUTES and the launcher DESTINATIONS from one shared list).
- **P2-NAV-02 🟡 The nav pill shows NO active item on 9 launcher pages** (People, Documents, Companies, Calendar, Letters, Outbox, Inbox, Insights, Settings) — `hrmsActive` only matches `/hrms/*`, so the Menu icon doesn't light on its own non-/hrms destinations. `src/components/top-pill.tsx`. Fix: match against the DESTINATIONS hrefs too.
- **P2-NAV-03 🟡 Home "Completed" and "Stale" metric tiles jump to the WRONG list** — they link to bare `/?tab=tasks` (which hides Closed and shows open tasks), so the Completed tile lands on a list excluding completed work. `src/components/home-mission-control.tsx` (METRIC_HREF). Fix: `&status=Completed`, `&flag=stalled`, `&flag=due-soon` (all already honoured).
- **P2-NAV-04 🟠 Calendar event "Meeting" link goes to a redirect stub and DROPS the meeting id** — `<a href="/meeting">` → `/workbook` generic tab; the event already carries `meetingId`. `src/app/calendar/calendar-board.tsx:598`, `api/action/route.ts`. Fix: `href={/workbook?tab=meetings&open=${meetingId}}`.
- **P2-NAV-05 🟡 AI "open audit" navigate intent routes to `/audit` which 404s** (route removed). `src/app/api/action/route.ts:759`. Fix: remove/repoint the branch.
- **P2-NAV-06 🟡 Task links from Today / Needs-attention / notification bell force a full-page redirect through `/task/[code]` instead of the in-place `?task=CODE` drawer** — inconsistent with the rest of the app. `today-brief.tsx:91`, `attention-list.tsx:85`, `notification-bell.tsx`. Fix: use the in-place open(code) helper.
- **P2-NAV-07 🟡 Launcher-only pages (Insights, Outbox, Inbox, Letters, Settings) lack the "‹ Home" back-crumb** that every other launcher destination carries. Add `<HrmsCrumbs>`.
- **P2-NAV-08 ⚪ Person-drawer "Open in Documents" drops `from=person`, so Documents shows no back-to-person crumb** (the reverse direction is wired). `src/components/person-drawer.tsx:298,664`.
- **P2-NAV-09 ⚪ Same area named three ways:** launcher "Letters & Letterheads" vs page title "Letters" vs back-link "‹ Letters". And **P2-NAV-10 ⚪** Assets page hero "Asset, Tools & Vendor Register" vs launcher "Assets & Vendors". Pick one canonical name each. `top-pill.tsx`, `letters/page.tsx`, `hrms/assets/page.tsx`.

## Lifecycle / daily journeys
- **P2-LIFE-01 🟠 Converting a Candidate to a hire (local_staff/expat) does NOT auto-start the onboarding journey** — the standard recruit→hire path (add as Candidate, later change type) reconciles the checklist but never calls `startJourney`. `src/app/people/actions.ts` (updatePerson), `src/lib/onboarding.ts`. Fix: detect the type transition into an AUTO_ONBOARD_TYPE in updatePerson and start the journey (idempotent).
- **P2-LIFE-02 🟠 Bulk "Deactivate" in the People table skips offboarding journey AND asset auto-return** — `setPeopleActive` only flips `active`; the single-row path does both side-effects. Archiving several leavers leaves their laptops assigned + no exit checklist. `src/app/people/actions.ts`, `src/components/people-table.tsx`. Fix: run startJourney('offboarding') + returnAssetsForPerson per id in the bulk path.
- **P2-LIFE-03 🟠 Offboarding asset-return ignores shared/team kit where the leaver is custodian** (= P1-HR-02). `src/lib/assets.ts`.
- **P2-LIFE-04 🟡 Onboarding/offboarding journey steps LEAK into the AI "Plan my day" to-do list** — every other todo consumer filters `kind=null` but the Ask route query doesn't. `src/app/api/ask/route.ts:~133`. Fix: add `.is('kind', null)`.
- **P2-LIFE-05 🟡 The offboarding journey can only be viewed AFTER archiving** (no notice-period prep), and onboarding vanishes the moment you archive. `src/components/person-drawer.tsx:822`. Fix: allow access to both journeys regardless of active state.
- **P2-LIFE-06 🟡 Probation panel and the onboarding "Confirm probation" step are unlinked** — confirming one doesn't tick/clear the other. `src/app/people/actions.ts`, `src/lib/onboarding.ts`. (Low priority polish.)

## Daily-operator journeys (friction)
- **P2-JRNY-01 🟠 You CANNOT assign/create a task for a person from their drawer** — the most common HR action (open someone, give them a job) is the most fragmented: no "New task" action in the drawer; `task/new` accepts only a company preset; PersonPicker has no defaultValue. `src/components/person-drawer.tsx`, `src/app/task/new/new-task-form.tsx`, `src/components/person-picker.tsx`. Fix: add a "New task" drawer action opening NewTaskForm in a layered dialog (mirror "Add document"); give PersonPicker an initial value.
- **P2-JRNY-02 🟠 There is NO bulk-add for people** — onboarding a 5-person intake = repeating the full single-person flow 5×. Documents have a first-class bulk queue; people don't. `new-person-button.tsx`, `people/page.tsx`, `people/actions.ts`. Fix: an "Add several" queue (paste lines / mini-grid → loop createPerson, reusing extractPersonFields).
- **P2-JRNY-03 🟡 The Inbox bundle has two overlapping actions ("File it" vs "Process") with no explanation of which to use** — and a message with both a task AND a doc needs both, run separately. `src/app/inbox/inbox-list.tsx`. Fix: relabel for intent + pick the primary by whether attachments exist.
- **P2-JRNY-04 🟡 "New person" created inside DocumentForm / BulkUpload / MessageProfilePanel is silently typed local_staff with no company** — so a contractor/expat/candidate captured this way gets the WRONG checklist + an unwanted journey. `document-form.tsx`, `bulk-upload-dialog.tsx`. Fix: add a tiny type select + inherit the parent form's company.
- **P2-JRNY-05 🟡 The compliance "Add" button leaves the page to `/documents` everywhere EXCEPT the person drawer** — same action, inconsistent page-leaving. `requirements-checklist.tsx`, `person-drawer.tsx`. Fix: always host the in-place DocumentForm dialog.
- **P2-JRNY-06 🟡 The record-leave form in the drawer can over-book past entitlement and only learns so AFTER submit** — the "N left" is already in props but not shown on the type select. `src/components/person-leave.tsx`. Fix: annotate options with remaining days.
- **P2-JRNY-07 ⚪ Person Details is read-only with one all-or-nothing "Edit"** that swaps the full ~25-field form for a single-field correction. `person-drawer.tsx`. (Low priority; add per-row inline edit.)

## Upload unification (owner's "one intelligent upload" question)
- **Finding:** admin uploads are ALREADY one intelligent flow (`DocumentForm`, reused by single-add / Add-several / person-drawer / checklist / Inbox-process). The outliers are:
- **P2-UPL-01 🟠 Portal requirement upload diverges** — no AI read (staff passports get NO expiry → defeats the renewal radar), no dedup, 15 MB vs admin's 20 MB. `src/app/portal/actions.ts` (portalUploadRequirementDocument), `portal-documents.tsx`. Fix: run extractDocumentFromFile + dedup; ideally a shared `lib/intake.ts fileDocument()` used by both admin and portal.
- **P2-UPL-02 🟠 Person-form scan-to-fill reads a passport/CV then DISCARDS the file** — the copy invites uploading the passport/ID/CV, but the file is cleared after extraction; the user must re-upload via Documents. `person-form.tsx`, `people/actions.ts`. Fix: keep the File; offer one-tap "Also save as document" reusing the extraction.
- **P2-UPL-03 🟡 Inbox bundle files are stored TWICE; the `inbox/` object is never cleaned up** — Process re-uploads into the doc's path; dismiss/file never removes the original. `src/app/inbox/actions.ts`, `inbox-list.tsx`. Fix: remove `inbox/` objects on file/dismiss. *(Also unifies: one ACCEPTED_DOC_TYPES const + one putBucketObject helper — currently duplicated 4×.)*
- **P2-UPL-04 🟠 Process DROPS forwarded-email/share attachments that arrive as a URL** (no storagePath) — the inbound bridge accepts `{name,url}` links (it can't upload to the private bucket), but processBundle filters to storagePath-only, so the real email attachment is never filed and renders as a non-clickable grey span. `inbox-list.tsx`, `api/inbox/route.ts`. Fix: fetch url-only attachments to a Blob (or render a clickable link).
- **P2-UPL-05 🟡 Text-only inbox items processed via "Process" can never be marked filed** — onAllDone only fires after a FILE is saved, so a profile-enrich-only bundle lingers as pending forever. `bulk-upload-dialog.tsx`, `inbox-list.tsx`. Fix: mark filed when an enrich succeeds with no files (or add a "Mark filed" button).
- **P2-UPL-06 🟡 Profile/company enrich from intake doesn't refresh the open list** — the client callers never `router.refresh()` after a standalone enrich; stale until navigation (server cache is correct). `bulk-upload-dialog.tsx`, `document-form.tsx`. Fix: call an onChanged()/refresh.
- **P2-UPL-07 🟡 `enrichCompanyProfile` never revalidates `/documents`** (asymmetry vs the person path). `companies/[id]/actions.ts`. Fix: add revalidatePath.
- **P2-UPL-08 🟡 HEIC photos are accepted on intake but unreadable by the extractor** — silent "couldn't read" with no guidance (common for forwarded iPhone IDs). `document-form.tsx`, `documents/actions.ts`, `add-inbox-dialog.tsx`, `bulk-upload-dialog.tsx`. Fix: convert HEIC→JPEG or drop `.heic` + tailor the failure note.
- **P2-UPL-09 🟡 Duplicate detection only checks the PERSON owner in "both" mode** — a company-owned duplicate is missed. `document-form.tsx` (recheckDup). Fix: query both owners.

## Task Management page (owner's core complaint — confirmed)
- **P2-TASK-01 🟠 The Tasks header is a 4-gauge WidgetCard that pushes the table ~430-480px down** — StatTiles+ArcGauge + toolbar + Focus/All + ChipRail + Group-by all stack before row 1; on mobile the tiles go 2×2 so the table is below the fold. `src/app/_hub/tasks-section.tsx`, `widget-card.tsx`, `stat-tiles.tsx`. Fix: drop WidgetCard → PageHeader; move/collapse StatTiles; hide the tile grid on mobile.
- **P2-TASK-02 🟠 Header KPIs are double-counted** — the same signals render as big gauge tiles AND again as the ChipRail filters. `tasks-section.tsx:130-139,232-342`. Fix: keep one surface (prefer the ChipRail, which is also a filter); remove the StatTile grid.
- **P2-TASK-03 🟠 WidgetCard is used ONLY on Tasks despite a docstring claiming it's the universal shell** — People/etc use the compact PageHeader; Tasks is the oversized outlier with an aurora glow. `widget-card.tsx`, `tasks-section.tsx`, `ui.tsx`. Fix: standardise on PageHeader; convert Tasks; fix the docstring.

## Popups / dialogs / drawers
- **P2-POPUP-01 🟠 ModalShell is unused; ~24 dialogs hand-roll their own Radix shell** (audit-1 3.1 was NOT actually done — only the buttons 3.2 landed). 51 `Dialog.Content` across 16 files (assets ×6, site-tools ×5, documents, vendors, leave, letters, new-person, add-inbox, bulk, attendance, HrmsDialog). `modal-shell.tsx`, `hrms-dialog.tsx`, `documents-table.tsx`. Fix: promote HrmsDialog as the one shared centred-form dialog; route the hand-rolled ones through it.
- **P2-POPUP-02 🟠 Hand-rolled dialogs are centred cards on phones (no bottom-sheet/drag)** — ModalShell + capture-wizard give a mobile sheet; the dialogs hard-code centred on every breakpoint. The owner's "unpolished on mobile" complaint. `hrms-dialog.tsx`, `entity-drawer.tsx`. Fix: add a bottom-sheet responsive variant.
- **P2-POPUP-03 🟠 Person & Company drawers render as a floating card on mobile, not a full-screen sheet** (the Task drawer passes `fullScreenOnMobile`; these don't — and the person drawer is the heaviest surface, 8 tabs). `person-drawer.tsx`, `company-drawer.tsx`. Fix: pass `fullScreenOnMobile` (prop already exists).
- **P2-POPUP-04 🟠 Person-drawer 6-tab pill overflows on phones with no scroll cue** — rightmost tabs off-screen, no fade. `entity-drawer.tsx`, `person-drawer.tsx`. Fix: right-edge mask-fade + scroll active tab into view; icon-only on the narrowest breakpoint.
- **P2-POPUP-05 🟡 Snooze / Meeting-extractor / Peek-preview popups lack Escape, scroll-lock and aria-modal** (framer modals, backdrop-click only). Fix: add the modal-shell Escape+scroll-lock effect + role=dialog.
- **P2-POPUP-06 ⚪ The once-a-day check-in pop-up over-mounts** (= P1-PORTAL-06).

## Mobile
- **P2-MOBILE-01 🟠 The PORTAL nav pill overflows the viewport on phones** (no max-width/overflow guard, unlike the admin pill) — worst for managers (+create button) and directors (5 tabs): ~430px+ centred pill wider than a 320-414px screen, so the outer tabs/controls are clipped off-screen and unreachable. `src/components/portal-pill.tsx`. Fix: add `max-w-[calc(100vw-1rem)]` + horizontal scroll or icon-only labels on mobile. **(Highest-impact mobile fix — real users about to land.)**
- **P2-MOBILE-02 🟡 The "Add several documents" bulk dialog is a hand-rolled narrow centred card on phones** (heavy form squashed). `bulk-upload-dialog.tsx`. Fix: re-home onto ModalShell / bottom-sheet.
- **P2-MOBILE-03 🟡 The attendance register's 24px paint cells are below the 44px touch target and the month grid needs horizontal scroll on phones.** `attendance-register.tsx`. Fix: bigger cells / per-person day-list on mobile.
- **P2-MOBILE-04 🟡 The /calendar Month grid is cramped at ~44px/cell on phones** (confirms audit-1 2.5 — phones now default to Agenda, but tapping Month still gives the cramped grid). `calendar-board.tsx`. Fix: condensed dots-per-day, or accept Agenda-default and close 2.5.
- **P2-MOBILE-05 ⚪ Vendors / Stock / Stock-movements search bars use `min-w-[220px]` without `min-w-0`/sm: fallback** (the newer tables use the safer pattern). Fix: align to `w-full sm:flex-1 min-w-0 sm:min-w-[240px]`.

## Layout / centring (the owner's named example)
- **P2-LAYOUT-01 🟡 The /workbook TO-DO list is NOT centred** — Notes (notes-workspace.tsx:165) and Meetings correctly fill the centred 1024px shell; **only the To-do slot regressed** off-centre. *(This is the owner's explicitly-named "to-do list isn't centred" issue. The layout finder confirmed it in its coverage but its structured row was lost to a finder output glitch — captured here from the evidence; fixer must open `/workbook` To-do slot and add the missing `mx-auto`/centring wrapper.)* `src/app/workbook/*`, the To-do slot component.
- **P2-LAYOUT-02 ⚪ The Letters EDITOR page is left-aligned** (`max-w-3xl` with no `mx-auto`) while the Letters list and every sibling centre — clicking a letter jolts left. `src/components/letter-editor.tsx:100`. Fix: add `mx-auto`.
- **P2-LAYOUT-03 ⚪ OCR vs OECR differ in width AND header** (OCR 672px plain PageHeader; OECR 1024px tabbed HrmsShell) — feels like two apps. `hrms/ocr/page.tsx`, `hrms-shell.tsx`. (Pairs with audit-1 2.3.)

## Design-system unification (the deferred audit-1 2.3 + 3.7 live here)
- **P2-DSGN-01 🟡 Register lists use 3 different surfaces** (documents glass rounded-3xl / people glass rounded-2xl / vendors+assets+site-tools solid rounded-2xl; none use the canonical TableShell) — audit-1 3.7. Fix: a `RegisterList` primitive in `ui.tsx`, repoint all five.
- **P2-DSGN-02 🟡 Page headers split 3 ways** (Hero on Assets/Companies/Letters/Inbox/Outbox/Org; PageHeader on Documents/People/Leave/OCR; HrmsShell inline on OECR) — audit-1 2.3. Fix: one header primitive.
- **P2-DSGN-03 🟡 Dialog shell markup is hand-copied 21× instead of reusing HrmsDialog** (widths drift 440/520/560/640px; max-h 80/88/85). Fix: migrate to HrmsDialog with width/maxH props. *(Pairs with P2-POPUP-01.)*
- **P2-DSGN-04 ⚪ Uppercase label spacing inconsistent** (tracking-0.08em in the kit vs tracking-wider in 112 hand-rolled spots), **count badge built 4 ways**, **2 drawers use raw shadow-2xl not tokens**. Fix: standardise on FieldLabel + a CountPill primitive + shadow-pill.
- **P2-DSGN-05 🟡 Mixed glass/overlay-dim + 66 raw `<select>` across 30 files bypass the shared Select** (assets-table alone has 7 native-arrow selects). Fix: one backdrop class + one panel material; replace raw selects with shared Select/Combobox in dialog forms.

## Cross-cutting (Letters / Insights / Settings / OCR)
- **P2-XCUT-01 🟠 An ISSUED letter can be deleted with one click and NO confirmation** — `deleteLetter` doesn't guard `status='Issued'` and the Delete button isn't gated on issued (unlike Save/Issue); destroys a frozen legal record + leaves a gap in the ref sequence. `letter-editor.tsx`, `lib/letters.ts`, `letters/actions.ts`. Fix: refuse delete when Issued; add confirm(); hide/disable Delete when issued.
- **P2-XCUT-02 🟡 Settings' primary header action is a developer-only "Resync latest-update mirror"** — opaque jargon as the most prominent control on Settings. `settings/page.tsx`, `resync-button.tsx`. Fix: move it into a low-key "Maintenance" card with plain-language copy.
- **P2-XCUT-03 🟡 Insights largely DUPLICATES the Director Brief + Home** (leave liability, compliance-by-company, renewals, probation all appear in both); Insights adds only status/priority distribution bars. **Owner decision** (retire /insights, or strip it to just the distribution analytics). `insights/page.tsx`, `brief/page.tsx`.
- **P2-XCUT-04 🟡 OCR lets you page back to ANY historical date, silently creating empty cleaning-day rows** (the back chevron has no floor; `?date=1990-01-01` materialises a row). `hrms/ocr-today.tsx`, `ocr/page.tsx`, `lib/cleaning.ts`. Fix: clamp the back navigation / make ensureDay lazy.

---

## Owner DECISIONS needed (not auto-fixed)
1. **P1-HR-02 / P2-LIFE-03 — offboarding & shared kit:** on archive, should team/shared assets where the leaver is custodian (a) return to store, or (b) just clear the custodian and keep the company assignment? (Default recommendation: clear custodian, keep company assignment.)
2. **P2-XCUT-03 — Insights:** retire `/insights` and fold its 2 unique charts into Brief/Home, OR strip the duplicated forecast cards so it's purely distribution analytics?
3. **Audit-1 4.21 (still open) — chat roster:** should every staff member see the full cross-company roster in chat, or be scoped to their own company?
4. **P2-MOBILE-04 / audit-1 2.5 — calendar Month on phones:** accept the Agenda-default mitigation and close it, or build a condensed mobile Month grid?

## Deferred (large refactors, confirmed still open — not blocking)
- **Audit-1 7.1** file-splits: now **9** files >900 lines (command-palette 1283, schema 1151, task/actions 1107, chat-surface 1039, home-mission-control 997, person-pack-builder 987, person-drawer 921, requirements 918, calendar-board 911). Do per-file when touching, not in a batch.

---

## Confirmed HEALTHY (do NOT "fix" — verified working this pass)
- **Core compliance loop** create→request→upload→100% stays on one screen; createDocument→reconcile auto-links; template item RENAME propagates to every person + portal; blanks-only intake never overwrites (verified across scan/extract/inbox).
- **Lifecycle:** create auto-starts checklist + onboarding journey; single-person archive auto-starts offboarding + returns personally-held assets; compliance correctly ignores archived staff (no ghost gaps).
- **Portal scoping:** EVERY mutation re-derives the actor from the cookie, never the form; manager approve scoped to direct reports; chat edit/delete + passkey delete ownership-checked; the audit-1 chat-file P0 guard is in place; director board actions role-gated + honour the kill switch.
- **Org:** multi-parent primary/secondary edges drawn correctly; cycle-safe rendering; orphans → labelled Unassigned roster; cross-company reporting shown honestly.
- **Records:** asset auto-return (personal kit), vendor→documents.vendor_id expiry roll-up, leave now surfaced per-person on the drawer + directory (audit-1 "leave invisible" is RESOLVED), attendance write-key agrees admin↔portal, leave cycle anchored to 1 Jan.
- **Nav:** audit-1 4.9/4.10/4.11/4.12 all FIXED; redirect stubs resolve + preserve context; query-param deep-links round-trip.
- **Mobile (working):** admin pill clamped; ModalShell is a true bottom-sheet; task drawer + task table view stack correctly on mobile; chat is full-screen on phones.

---

*Source: workflow `wf_1aad7b1f-5ac` (16 finders, 90 findings). Raw output: the task output JSON. This file is the actionable, de-duplicated, labelled subset.*

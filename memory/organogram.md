---
name: organogram
description: "Organogram (/hrms/org) — portfolio is an ELK layered multi-parent flowchart (June 2026)"
metadata:
  node_type: memory
  type: project
---

# Organogram — portfolio flowchart (June 2026)

`/hrms/org` views: **Everyone** (force-directed web, default) · **Portfolio** (NEW = ELK layered flowchart) · per-company **trees** (`TreeView`) · By-department.

## Owner's vision (LOCKED — this is what they want)
ONE portfolio diagram where **everyone lands**, including shared-service roles (Admin/HR Shivam, CFO) **inside** the chart (NOT a side band). A person can have **multiple bosses** all drawn (e.g. an employee → Admin/HR + 2 managers + Director). Cross-company reporting drawn cleanly (company = card COLOUR, lines cross freely). "Same card format, more connections, not spaghetti."

### Rejected approaches (do NOT rebuild)
- Nested one-parent **tree** for portfolio (can't show multiple bosses; shoved shared-services into a band) — built & reverted.
- **Dotted-line SVG overlay on the HTML tree** — looked like spaghetti because the tree positions boxes for one parent then draws extra lines on top. Reverted twice. Don't re-add.
- A separate **"Group Shared Services" band** + `people.group_service` column — built & fully reverted (migration 0060 removed, column dropped). Owner wants shared roles IN the flow, not banded.

## What IS built (the keeper)
- **Dependency:** `elkjs@^0.9.3` (layered graph layout engine, runs in browser; `elk.bundled.js`).
- **`src/lib/org-flow.ts`** (pure): `FlowPerson` type; `personTier(p, hasReports)` → 0 Leadership / 1 Managers & shared services / 2 Team, decided by **role/seniority** (staffCategory director/manager/admin_hr, else role regex, else hasReports). `managerIdSet`, `TIER_LABELS`.
- **`src/components/org-flow.tsx`** `OrgFlow`: builds an ELK graph — nodes partitioned by tier (`elk.partitioning`), edges **boss→report** (primary from `manager_id`, secondary from `reporting_lines`), `elk.algorithm=layered`, `direction=DOWN`, `edgeRouting=ORTHOGONAL`. Renders fixed-size cards (226×84) at ELK x/y over an SVG edge layer (primary = solid `fg-muted`, secondary = dashed `info`). Pan/zoom/fit/fullscreen, hover-focus dims non-neighbours, tier band labels down the left, legend. Async layout in useEffect (cancellable).
- **`OrgChart` wrapper:** new `flowPeople?: FlowPerson[]` prop; `view==="portfolio"` now renders `<OrgFlow>` (falls back to old `portfolioTree` TreeView if no flowPeople). `portfolioOn` keyed off flowPeople.
- **`hrms/org/page.tsx`:** builds `flowPeople` from active people (incl. `staffCategory`, accent colour, secondary ids) and passes it.

Decisions locked with owner: **levels by role/seniority**; **primary boss = solid, extra bosses = lighter/dashed, all drawn**. **No schema change** — uses existing `manager_id` + `reporting_lines`.

Verified live: Portfolio renders 43 cards, ~86 routed edges, 3 tier bands, no console errors, tsc clean. UNCOMMITTED.

## Phase 2 — surface reporting in People (DONE, June 2026, uncommitted)
- Form labels fixed: **"Director" → "Reports to"**, **"Non Company Person" → "Related to"** (`person-form.tsx`).
- **Person card** (`person-card.tsx`) now shows a reporting line: `↳ {managerName}` · `+{N}` secondary · `{N}` direct-reports (Users icon). Count comes from `reportsCountById` memo in `people-table.tsx` (passed as `directReports` prop).
- **Drawer**: hero "{N} reports" chip + a **"Direct reports (N)"** list in the Details tab (primary + dotted, each click-opens). Data: `getPersonDetail` now returns `directReports: [{id,name,role,companyName,kind:"primary"|"dotted"}]` (+ `PersonDetail` type + `DrawerPerson`/DrawerData type).
- **Bulk "also reports to"**: new `bulkAddSecondaryManager(ids, managerId|null)` action (null = clear all secondary) + a select in the people-table bulk "Set fields" bar ("Also reports to…" / "— Clear extra —"). Skips self + duplicate-of-primary.
- 2d orphan cleanup: NOT needed — `reporting_lines` FK has `onDelete cascade`, so deleting a person auto-removes their links.
Verified live; tsc clean; no console errors.

## Phase 3 — Departments admin (DONE, June 2026, uncommitted)
- Lives as a **"Departments" tab on the Companies hub** (`/companies`, segmented Companies | Departments via `companies-hub-tabs.tsx`) — NOT a standalone route and NOT per-company (departments are group-wide). Standalone `/hrms/departments` route + launcher entry were removed (owner decision); `actions.ts` still lives in that folder (no page = 404, fine). `getDepartmentsAdmin()` in `lib/departments.ts` (returns id/name + peopleCount/companyCount/taskCount/headCount).
- `src/components/departments-admin.tsx`: add department, inline rename, **merge into another** (re-points people+tasks+heads, drops head on company collision, deletes source), **delete** (nulls people+tasks dept, removes heads). Actions in `src/app/hrms/departments/actions.ts` (`createDepartment`/`renameDepartment`/`mergeDepartments`/`deleteDepartment`), all revalidate `/hrms/departments` + `/hrms/org` + `/people`.
- 3 tables reference `departments.id` (people, tasks, department_heads) — no FK cascade, so merge/delete repoint all three explicitly. Heads still set per-company in Organogram → By department.
- Verified live: create + delete round-trip works, counts correct, no console errors, tsc clean.

Also this session: people bulk Set-fields panel made compact (was oversized) — `w-[min(90vw,26rem)]`, h-8 controls, 2-col grid, opaque `bg-bg-elev`. (uncommitted)

## Phase 4 — Attendance (DONE, June 2026, uncommitted)
Owner decisions: **staff self check-in, trusted, manager can override**; **status-per-day** (no clock in/out). No schema change — uses existing `attendance` table (person_id, date unique, status, note).
- `lib/leave-shared.ts`: `ATTENDANCE_SELF_STATUSES` (Present/Remote/Half-day/Sick), `ATTENDANCE_ABBR`, `ATTENDANCE_CELL` classes.
- `lib/attendance.ts`: `getAttendanceMonth(y,m)` (admin grid: people + recorded map + approved-leave overlay + holidays) and `personAttendanceWeek(personId)` (portal: this week Mon–Sat, derives On leave/Holiday, today editable + lockReason).
- Admin actions in `hrms/leave/actions.ts`: `recordAttendanceAction(personId,date,status|null)` (upsert/clear on person_id+date) + `bulkRecordAttendanceAction(ids,date,status)` ("mark all Present today").
- Admin UI: **Leave | Attendance tab** on `/hrms/leave` (`?view=attendance&ym=YYYY-MM`). `attendance-register.tsx` = month grid, **brush-to-paint** (pick a status, click cells), company filter, month nav, On leave/Holiday auto-filled & read-only. VERIFIED LIVE (painted a cell → DB row + "P" shows).
- Portal: `portalMarkAttendance(status)` (stamps note `portal:<Name>`, only self statuses) + `portal-attendance.tsx` ("Your attendance" on `/portal/profile`: today buttons + this-week strip; locks on leave/holiday). Built + tsc-clean; NOT visually tested (needs a staff portal login).
- **Check-in pop-up** (`attendance-checkin.tsx`, Radix Dialog, ~304px minimal): auto-opens once/day on portal landing (mounted in `portal/(app)/layout.tsx` via `personAttendanceToday`) when today not marked & not leave/holiday; greeting + 4 self buttons + "Maybe later"; dismiss remembered in localStorage per-day. Shows for ALL portal roles (managers/directors are staff too).
- **Manager "Team attendance today"** card on portal home (`teamAttendanceToday(reportIds)`): "{N} in · {M} not marked", per-report status badges. Same reportIds gate as "My team" (only managers with reports).
- VERIFIED LIVE end-to-end via a temp manager login (Shivam): pop-up opened → marked Present → closed; profile week strip showed Sat→P; manager card showed "0 in · 5 not marked / 0/5 recorded". Temp login + test rows reverted after.
Lights up existing readers (person drawer monthly card, directory "abs" chip).

## Known tuning / next steps (not bugs)
- Leadership row is wide (~13) because each of 7 companies has real directors — inherent; pan/zoom/fit handle it.
- Possible refinements: collapse/expand a person's subtree, search-to-highlight, apply the flowchart to per-company views too, more tiers (Senior Mgr) if 3 feels flat.

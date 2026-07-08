---
name: receptionist-cleaning-jul2026
description: Receptionist portal role + portal cleaning log; Command Centre OCR as overview/control
metadata:
  type: project
---

# Receptionist role + portal Office Cleaning (8 Jul 2026) — PUSHED @ad4f4b5

The cleaning registry (OCR = Office Cleaning Registry, `/hrms/ocr`) is now driven by a
receptionist from the portal; the Command Centre + oversight roles only VIEW/control.

**Role:** new `receptionist` portal role. `portal_role` is free-text → NO migration.
Registered in `portal-permissions.ts` (union/PORTAL_ROLES/ROLE_LABEL/DEFAULT_SCOPE/
DEFAULT_CAPS/normaliseRole), `portal-auth.ts` (PortalRole + getPortalPerson mapping),
`portal-labels.ts`, `portal-capabilities.ts` (tabs: home+cleaning+profile only). Role
pickers + Settings whitelist updated. Appears AUTOMATICALLY as a column in Settings →
Portals → Roles & permissions.

**Two new caps** (`portal-permissions.ts`): `cleaningLog` (do the ticks — receptionist)
and `cleaningOverview` (read the register — receptionist + manager/hr/director). FORWARD
RULE holds: gate on `me.caps.cleaningLog/cleaningOverview`, never the role.

**Portal cleaning** `/portal/(app)/cleaning/`:
- `page.tsx` — one route, two modes: `cleaningLog` → `<PortalCleaning>` (entry);
  else `cleaningOverview` → `<CleaningOverview>` (read-only + 14-day history, batched
  queries, no N+1). Today key = `new Date().toISOString().slice(0,10)` (matches admin).
- `actions.ts` — gated portal writes (re-verify getPortalPerson + cleaningLog, because
  portal routes are NOT admin-gated — the admin `/hrms/ocr` actions have NO internal auth
  and MUST NOT be reused from the portal). Reuses pure `lib/cleaning.ts` helpers. Every
  write stamps `attendance_person_id = me.id`; **sign-off calls `portalMarkAttendance("Present")`**
  so her cleaning submission = her attendance.
- `components/portal-cleaning.tsx` (entry, portal kit, inline comments, "Submit today's
  cleaning") + `components/cleaning-overview.tsx` (read-only, pure render / server-safe).

**Command Centre** `/hrms/ocr` — reframed header to "overview & control"; reflects her
ticks automatically (SAME `cleaning_days`/`cleaning_checks` tables) and keeps full edit.

**Home strip** (`portal/(app)/page.tsx`): `isReceptionist` hides tasks + meetings; raise-
a-request is now `me.caps.navRequests`-gated (fixed an always-on bug). Nav pill
(`portal-pill.tsx`): new SprayCan "Cleaning" tab (caps.tabs.cleaning); directory/chat/
meetings/activity now tab-gated so the receptionist shell is Home+Cleaning+Profile.

**To test:** Settings → Portals → give a NEW person access with role "Receptionist" +
password. Shivam (Group Admin Manager = a manager) already gets `cleaningOverview` by
default → sees the read-only overview on his `/portal/cleaning`. Tune per-role in the
permissions editor. Data model unchanged (day-level attendance_person_id = who cleaned;
no per-check attribution). See [[portal_permissions_engine]] [[company_scoped_roles]].

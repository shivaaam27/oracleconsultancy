---
name: receptionist-cleaning
description: The receptionist portal role and the office cleaning log — she ticks it from the portal, the owner oversees it on Studio /hrms/cleaning
metadata:
  type: project
---

# Receptionist role + office cleaning (built Jul 2026, on Studio Sept 2026)

The cleaning register is driven by the **receptionist from the portal**; the
owner and the oversight roles view it and can step in.

## The role

- `receptionist` is one of the four portal levels (`PORTAL_ROLES` in
  `src/lib/portal-permissions.ts`). `portal_role` is free text, so it needed no
  migration. Granted like any level, through `src/lib/portal-access.ts`.
- Data-entry only: every task, communication and navigation capability is OFF by
  default; default scope `own`.
- **She is staff-like on screen** — `isStaffLikeRole()`
  (`src/lib/director-routes.ts`) puts her on the staff Studio pages (Home,
  Calendar, Announcements, Companies, People, Profile). **UI only**: permission
  checks read her real role and `caps`. Her footer (`staffStops`) has no Tasks
  stop (`navTasks` off) and gains **Cleaning** because she has `cleaningLog`.

## The two capabilities

Gate on these, never on the role (`me.caps.<key>`):

| Capability | staff | manager | director | receptionist |
|---|---|---|---|---|
| `cleaningLog` — tick rooms, comment, sign off the day | – | – | – | ✓ |
| `cleaningOverview` — read the register and history | – | ✓ | – | ✓ |

Directors were switched off the overview in Jul 2026 (they don't need it). The
owner can change any cell in Settings → Portals → Roles & permissions.

## The portal page — `/portal/cleaning`

`src/app/portal/(app)/cleaning/page.tsx`, one route, two modes; anyone with
neither cap is sent to `/portal`:

- **`cleaningLog`** → `StudioCleaningToday` with the `portal` prop — the SAME
  Studio screen as the owner's log, with her own actions.
- **else `cleaningOverview`** → `StudioCleaningOverview`
  (`components/studio/cleaning/`), read-only with 14 days of history (batched,
  no N+1). This is a manager's page; the portal layout draws it in the
  Studio frame.

"Today" is the **EAT day** on both sides (`Date.now() + 3h`).

`src/app/portal/(app)/cleaning/actions.ts` — every write re-checks
`getPortalPerson()` + `cleaningLog` (portal routes are not behind the admin
gate), then reuses `lib/cleaning.ts`. Every write stamps
`attendance_person_id = me.id`; **signing off the day calls
`portalMarkAttendance("Present")`**, so her cleaning submission is her
attendance. Unlock reopens a signed day.

## The owner's view — `/hrms/cleaning`

Studio (`StudioCleaningToday`, 26 Sept 2026): today's log with `?date=` to walk
back (never before the earliest record or 30 days, never into the future, so a
typed date cannot create an empty day). Same `cleaning_days` /
`cleaning_checks` tables, so her ticks appear at once, and the owner keeps full
edit. Its actions (`src/app/hrms/cleaning/actions.ts`) start with
`guardOwner()` — ⚠️ never call them from the portal; the portal has its own.

`/hrms/ocr` is a redirect to `/hrms/cleaning` that carries the query across.

## Traps

- `ensureDay` (`lib/cleaning.ts`) retries its read after a duplicate-key race —
  two first visits of the day used to throw.
- Attribution is day-level (`attendance_person_id` = who cleaned); there is no
  per-check attribution.

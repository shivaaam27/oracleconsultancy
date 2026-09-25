---
name: hrms
description: "The HR & admin registers — Tax & Legal, Assets & Vendors (tools, warranties, stock-take, service log), Supplies, Cleaning, Attendance register + holidays. All Studio, Sept 2026."
metadata:
  node_type: memory
  type: project
---

# HR & admin registers — current reference (Sept 2026)

Five working registers under `/hrms/*`, all rebuilt in **Studio** on 26 Sept 2026
(read `memory/studio_redesign.md` for the look). There is no hub page:
**`/hrms` redirects to `/hrms/command-centre`**. Each page is a thin server
component that loads data and hands it to one Studio client component.

| Route | UI label | Page component | Server actions |
|---|---|---|---|
| `/hrms/command-centre` | **Tax & Legal** | `components/studio/tax/studio-tax-legal.tsx` | `app/hrms/command-centre/actions.ts` |
| `/hrms/assets`, `/hrms/assets/[id]`, `/hrms/vendors/[id]` | Assets, Tools & Vendors | `components/studio/assets/studio-assets.tsx`, `studio-asset.tsx`, `studio-vendor.tsx`, `asset-sheets.tsx` | `app/hrms/assets/actions.ts`, `site-tools-actions.ts`, `app/hrms/vendors/actions.ts` |
| `/hrms/supplies` | Supplies | `components/studio/supplies/studio-supplies.tsx` | `app/hrms/actions.ts` |
| `/hrms/cleaning` | Cleaning | `components/studio/cleaning/studio-cleaning-today.tsx` | `app/hrms/cleaning/actions.ts` |
| `/hrms/leave` | Attendance | `components/studio/attendance/studio-attendance.tsx` | `app/hrms/leave/actions.ts` |

**Redirect stubs** (carry the query string across): `/hrms/ocr` → `/hrms/cleaning`,
`/hrms/oecr` → `/hrms/supplies`. Old nav ids are mapped in `LEGACY_ROUTE_IDS` /
`resolveRouteId()` in `src/lib/nav/nav.ts`. Pipeline and Commitments (and
`/hrms/registers`) were removed 26 Sept 2026 and redirect to Home.

Every server action starts with its guard (`guardOwner` / `guardViewer` / a
portal check) — see `src/lib/auth/viewer.ts`. Currency is **TZS**. British English.

---

## Tax & Legal (`/hrms/command-centre`)

Recurring tax / statutory / legal obligations. Route path unchanged; only the
label is "Tax & Legal".

- Data: `recurring_obligations` + `obligation_company` (per-company tick and
  "not applicable"). Logic in `src/lib/operations/recurring.ts` (`listObligations`,
  `splitObligations`, `buildDeadlinesWithCompanies`, `loadObligationCompany`)
  and `src/lib/operations/command-centre.ts` (`permitFlag`, `daysUntil`, `CcFlag`).
- Page: the period's progress and the next deadline on top; every dated
  obligation with a tick per company; the routine daily/weekly duties you tick
  as you go (habits); `?view=permits` = **Permit Watch** — person documents in
  the Immigration / Permit / Passport categories on the 90 / 60 / 30-day bands.
- Actions: `tickHabitAction`, `toggleObligationCompanyAction`,
  `setObligationApplicableAction`, `createTaskFromObligationAction`.
- **Auto-spawn**: due obligations spawn tasks on the daily tick
  (`src/lib/automation/automation-time.ts`), only for trigger dates on/after the automation
  baseline.
- **Master pause**: `commandCentrePaused` (Settings) hides the page from nav and
  renders `StudioTaxPaused`; nothing is computed or spawned. Unpausing resets
  the automation baseline so it starts fresh from that day.

## Assets, Tools & Vendors (`/hrms/assets`)

One page, three registers: `?view=assets|tools|vendors`; `?st=archived` swaps
in archived assets (restore lives there). Filters go through `useUrlFilters`, so
a filtered view survives Back and reload. Each asset and each supplier also has
its own page: `/hrms/assets/[id]` and `/hrms/vendors/[id]`.

- **Assets** (`src/lib/operations/assets.ts`, `assets-shared.ts`) — individually serialised
  durable equipment. Assigned to a person, or shared to a company + custodian
  (`assignAssetAction` / `assignAssetSharedAction` / `returnAssetAction`), with
  a history (`asset_assignments`). **Auto-returned on offboarding** (the
  "Returned on offboarding" path in `assets.ts`). Statuses include `in_store`,
  `maintenance` ("the workshop") and `retired`. CSV/sheet import
  (`importAssetsAction`, `lib/operations/asset-import.ts`). Printable register
  `/hrms/assets/print` and a hand-over receipt `/hrms/assets/[id]/receipt`
  (company legal name + signatory in the footer).
- **Run as a management system (migration 0171)**:
  - `assets.warranty_until` — `warrantyState()` in `assets-shared.ts`; "ending
    soon" is inside 60 days. Surfaced on the page (stat tile, list filter,
    shield icon on the row). **There is no automatic warranty reminder** — it is
    shown, not pushed.
  - `assets.checked_at` — the **stock-take**. "Seen it" (`checkAssetAction` →
    `markAssetChecked`) stamps now; `checkedRecently()` counts anything checked
    in the last six months as seen, and the "Not seen in 6 months" tile filters
    to the rest.
  - `asset_services` — the service log: every service / repair / check / other
    (`AssetServiceKind`), date, supplier (`vendor_id`, ON DELETE SET NULL),
    cost, notes. `addAssetServiceAction` / `removeAssetServiceAction`
    (`ServiceSheet`). Feeds "Upkeep, last 12 months" and each supplier's
    bought + upkeep totals.
  - The top strip ("needs attention"): in the workshop, warranty ending,
    stock-take, value and upkeep — each tile filters the list.
- **Tools** (`src/lib/operations/site-tools.ts`, `site-tools-shared.ts`) —
  quantity-tracked kit owned by a site: no serial numbers and no single holder;
  one row per tool kind per site with count, minimum and condition. Grouped by
  site with low stock flagged; movements and import in `site-tools-actions.ts`.
- **Vendors** (`src/lib/operations/vendors.ts`, `vendors-shared.ts`) — suppliers,
  contractors, landlords. Their contracts are ordinary `documents` rows via
  `documents.vendor_id` (filed in Files). The vendor page shows what they sold
  us, their upkeep cost and whether their papers are in date.
  `vendors` is the shared supplier register — do not drop or fork it.

## Supplies (`/hrms/supplies`)

Office consumables (never equipment — that is Assets). Renamed from "OECR".

- Data: `stock_items`, `stock_purchases` (in), `stock_issues` (out, tagged to a
  company). **Current stock = opening + purchased − issued, derived at read time,
  never stored** (`currentStock` in `src/lib/operations/stock-shared.ts`; Supabase reads in
  `src/lib/operations/stock.ts`).
- `?tab=purchases|issues` picks the lane; `?archived=1` shows archived items.
- Actions in `app/hrms/actions.ts`: item create/update/archive/delete, purchase
  and issue record/update/delete. Issuing below zero is guarded with an
  "Issue anyway" override. Movements are simply edited or deleted (no
  reverse-entry trail — the owner's call for stationery).

## Cleaning (`/hrms/cleaning`)

The daily office cleaning checklist — one shared HQ register, not per company.
Renamed from "OCR".

- Data: `cleaning_areas`, `cleaning_days` (one per date), `cleaning_checks`
  (per-area tick + time + comment). Logic: `src/lib/operations/cleaning.ts`
  (`ensureDefaultAreas`, `ensureDay`, `listDays`, `dayStatus`, …) and
  `cleaning-shared.ts` (derived completion %).
- **The receptionist ticks from her portal** (`/portal/cleaning`, capability
  `cleaningLog`, role `receptionist`); the administrator page is the log and
  steps in when needed. Actions: `toggleCheckAction`, `setCheckCommentAction`,
  `setAttendanceAction` (who cleaned, picked from People), `setNoteAction`,
  `signDayAction` (tap-to-confirm sign-off locks the day).
- `?date=` walks back — never before the earliest record (or 30 days), never
  into the future — so a hand-typed date cannot create an empty day row.

## Attendance (`/hrms/leave`)

The route kept its old name; the page is **Attendance**. **The Leave module
(types, requests, approvals, balances) was retired in July 2026** — mark "On
leave" directly on the register. `src/lib/people/leave.ts` still holds `listHolidays`
and the ELR working-day maths; its request/balance functions are unused.

- `?ym=YYYY-MM` picks the month, `?view=holidays` the Holidays list, `?co=` a
  company.
- **Register**: month grid, brush-to-paint status, "mark all Present today".
  One `attendance` row per person per day; statuses Present / Absent / On leave
  / Holiday / Remote / Half-day / Sick. No clock in/out.
  `recordAttendanceAction` / `bulkRecordAttendanceAction`;
  `getAttendanceMonth()` in `src/lib/people/attendance.ts`.
- **Holidays**: `public_holidays` fill the register by themselves
  (`addHolidayAction` / `deleteHolidayAction`).
- **Staff self check-in** (trusted, a manager can override): the "Today" card on
  the staff Studio Home (`components/studio/home/staff-cards.tsx`,
  `StaffCheckinCard`; `CheckinPanel` on Profile for managers), and
  `portal-attendance.tsx`. Server side `portalMarkAttendance` in
  `app/portal/actions.ts`; `personAttendanceToday` / `personAttendanceWeek` /
  `teamAttendanceToday` in `lib/people/attendance.ts`.

## Related, managed elsewhere

- Departments, Sites, Roles: tabs on the **Companies hub** (`/companies`).
- Reporting lines, HR profile fields, onboarding/offboarding journeys: the
  person record (`/people`); journeys are `todos` tagged `kind`.
- ELR Act 2004 rules (for reference only): the HR section of `CLAUDE.md`.
- More detail on the receptionist's cleaning log:
  `memory/receptionist_cleaning.md`.

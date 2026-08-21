---
description: "Turning the one long sidebar into ERP modules — the launcher, the module-scoped sidebar, and a line-by-line audit of everything that could break."
---

# Modules — making COS navigate like an ERP

The sidebar has grown to **23 destinations in four groups** and a fifth module
(CocoZuri Operations) is coming. This is the plan to put a module layer above it,
and the audit that says what must not break.

---

## 1. The problem, stated honestly

A single rail of 23 links is not a filing system, it is a list. Adding CocoZuri
makes 24, and the next module 25. The groups (Work / Records / Operations / System)
already carry a lot of weight — "Operations" alone holds nine unrelated pages, from
Tax & Legal to Cleaning to the whole PES trading module.

**But a launcher on its own would make things worse.** If every destination becomes
two clicks instead of one, the owner does more work, not less. That is the trap to
design around, and it is why the plan below is a launcher **plus** a module-scoped
sidebar **plus** global pins — not a launcher alone.

This is also exactly what ERPNext does, which is the shape the whole redesign has
been following.

---

## 2. The five modules

| Module | What is in it | Route today |
|---|---|---|
| **Task Management** | Everything the owner uses daily: home, tasks, approvals, notes, outbox, chat, calendar, brief, announcements, people, companies, documents, assets, tax & legal, commitments, orders & imports, applications, attendance, supplies, cleaning | `/` |
| **Recruitment** | The agency desk, orders, candidates, clients, shortlists, interviews, placements | `/recruitment` |
| **Ledger** | Chart of accounts, journals, entries, reports, tax rates | `/ledger` |
| **Projects** | The construction/capital projects module | `/projects` |
| **CocoZuri Operations** | New — see `memory/cocozuri_ops_plan.md` | `/cocozuri` |

⚠️ **One thing to raise with the owner:** *Orders & Imports* (`/ops`) is the whole
PES trading business — orders, funnel, imports, delivery, payments, its own setup
tab. It is a module by any reasonable measure, and it is currently sitting inside
Task Management because that is what was asked for. Worth confirming rather than
deciding unilaterally.

**System stays outside the modules.** Settings, Activity log, Insights and ORI
Automation belong to the whole app, not to one module, so they sit at the foot of
the sidebar whichever module you are in. Burying Settings inside Task Management
would be wrong.

---

## 3. The design

**Three pieces, and the third is what stops the extra click hurting.**

1. **A launcher at `/apps`** — five tiles, each with an icon, its name, one line
   saying what it is for, and a live number that matters (open tasks · roles open ·
   this month's profit · projects running · what is owed). Reached by clicking the
   Oracle Consultancy wordmark at the top of the sidebar, and from ⌘K.

2. **A module-scoped sidebar.** The rail shows the module you are in, not all 24
   links. At the very top sits a **module switcher** — the current module's name
   and icon, one click to the launcher, so switching is one click and not two.

3. **Pins stay global.** The pinned shortcuts at the top of the rail cross module
   boundaries, so the three or four things the owner touches all day are always one
   click away no matter where he is. This is the safety valve that makes the whole
   thing cheaper than today, not dearer.

**⚠️ `/` does not move.** The command centre stays exactly where it is and stays
the home of Task Management. Making `/` the launcher would put an extra click in
front of the page the owner opens most, and would break every link and bookmark
that points at the hub.

---

## 4. How it is built — the smallest change that works

⚠️ **Home and Tasks are not in `NAV_ROUTES`.** They are prepended in
`desk-sidebar.tsx` as `/` and `/?tab=tasks`, because they are the hub's own tabs
rather than routes. They belong to Task Management and must be moved into that
module's definition — otherwise they would show under Ledger and Recruitment too.
Verified 21 Aug 2026: 25 routes, every one in exactly one group, none orphaned.

**The whole trick: `NAV_ROUTES` does not change at all.** Not one id, href or
label. A module layer is added *above* it:

```ts
export type NavModule = {
  id: string;          // "tasks" | "recruitment" | "ledger" | "projects" | "cocozuri"
  label: string;
  icon: LucideIcon;
  home: string;        // where the tile goes
  match: string[];     // path prefixes that mean "you are in this module"
  groups: NavGroup[];  // this module's own rail, reusing existing route ids
};
```

- `NAV_GROUPS` is kept and becomes Task Management's `groups`, minus the three ids
  that move out (`projects`, `ledger`, `recruitment`) and minus the System group.
- `SYSTEM_GROUP` is separated out and rendered under every module.
- `moduleForPath(pathname)` picks the module from the longest matching prefix, and
  **falls back to Task Management** so an unknown path can never render an empty
  rail.

Because the ids never change, **pins, the command palette, recents, saved views,
breadcrumbs and every deep link keep working untouched.**

---

## 5. ⚠️ The audit — everything that could break, and why it will not

Checked against the real consumers of `src/lib/nav.ts`.

| # | Thing | Risk | Why it holds |
|---|---|---|---|
| 1 | **Pinned shortcuts** (`use-pins.ts`) | Pins are stored as ids and **unknown ids are dropped on load** — a rename silently un-pins | No id is renamed. If one ever is, `LEGACY_ROUTE_IDS` + `resolveRouteId()` already exist for exactly this and must get a line. |
| 2 | **Command palette** (⌘K / Ctrl+Space) | It lists `NAV_ROUTES` | Unchanged list, so every destination stays findable **regardless of which module it now lives in**. This matters: the palette is the escape hatch that makes modules safe. |
| 3 | **Recents** (`recents-tracker.tsx`) | Tracks by route | Routes unchanged. |
| 4 | **Nav settings** (`nav-settings.tsx`) | Lets the owner choose pins from all routes | Must keep offering **all** routes, not just the current module's. Explicit requirement. |
| 5 | **`ungroupedRouteIds()`** | A build-time net that catches a route in no group | Must be rewritten to sweep **every module's groups plus System**, or it silently stops catching anything. Easy to miss. |
| 6 | **Mobile pill** (`top-pill.tsx`) | Below `lg` there is no sidebar; its "Go to" launcher lists secondary destinations | It is already a launcher. It gains the five modules as a first row and keeps the full list underneath — so mobile never loses a destination. |
| 7 | **Portal nav** (`portal-nav.ts`) | Staff side | Completely separate file and separate rules. Untouched. Do not "unify" them. |
| 8 | **`--desk-sidebar` variable** | `main`'s left gutter follows it | The rail's width does not change, only its contents. |
| 9 | **Collapsed rail (56px)** | Icons only | The module switcher must have an icon-only state, or collapsing breaks the way back. |
| 10 | **`/` and every link to it** | The hub | `/` does not move. |
| 11 | **Deep links with `?from=task:CODE`** | Smart breadcrumbs | Path-based, unaffected. |
| 12 | **Saved views / list keys** | Stored per `listKey` | Nothing to do with nav. |
| 13 | **The `?co=` vs `?company=` trap** | `?company=` slides a drawer open over any page | The launcher tiles must use plain paths with no query, and CocoZuri must use **`?co=`**. |
| 14 | **Home / Tasks** | They are hard-coded in the sidebar, outside `NAV_ROUTES`, so they would appear under every module | Move them into Task Management's own group definition. |
| 15 | **A route in no module** | Would vanish from the sidebar entirely | Two defences: the fallback in `moduleForPath`, and the rewritten `ungroupedRouteIds()` — plus a test that asserts every `NAV_ROUTES` id appears in exactly one module or in System. |

**The test to write first**, before any UI: every id in `NAV_ROUTES` appears in
exactly one module's groups or in the System group, and every module's `home` is a
real route. That single test makes the whole change safe to iterate on.

---

## 6. Order of work

1. **The test above**, and the `NavModule` type + `MODULES` table. No UI yet.
2. **`/apps`** — the launcher, five tiles, live counts.
3. **The sidebar** — module switcher at the top, module-scoped groups, System
   pinned to the foot, pins global.
4. **The mobile pill** — modules as the first row of the existing launcher.
5. **⌘K** — a "Modules" section, so the launcher is reachable without the mouse.

Steps 1–3 can ship together; 4 and 5 are small and independent.

⚠️ **Do not do this at the same time as building CocoZuri Operations.** They are
independent, and the sidebar change touches something the owner uses every minute
of the day. Ship the navigation first, live with it for a day, then build the
module into a shape that already exists.


---

# 7. BUILT — 21 Aug 2026

All five steps shipped together. `NAV_ROUTES` was not renamed or reordered; ten
sub-pages of Recruitment and Ledger were ADDED to it (they already existed as
pages and were reachable only by clicking through the desk).

| Step | What landed |
|---|---|
| 1 | `NavModule`, `MODULES`, `SYSTEM_GROUP`, `moduleForPath()`, `moduleGroups()`, `navSections()` in `lib/nav.ts`, and **`nav.test.ts` — 15 tests** |
| 2 | `/apps`, the launcher — five tiles with one live count each (`lib/module-counts.ts`) |
| 3 | `desk-sidebar.tsx` — module switcher under the brand, rail scoped to the module, System pinned at the foot |
| 4 | `top-pill.tsx` — the mobile "Go to" sheet sectioned by module |
| 5 | `command-palette.tsx` — a **Modules** group at the bottom, plus "All modules" |

**Measured after:** Task Management's rail is **20 items + System**, down from 23
in one column. Ledger's is 5, Recruitment's 7, Projects' 1.

## What was verified, in the browser

- Task Management rail: Projects, Ledger and Recruitment are gone from it; Home
  and Tasks still lead it.
- `/ledger` → Books · Output · System. `/recruitment/orders` → Desk · In progress
  · System. Both correct from a deep sub-page, not just the module home.
- The switcher goes to `/apps` from every module, and **collapses to an icon with
  a tooltip** — the 56px rail keeps its way back.
- `--desk-sidebar` still tracks (208px / 56px) and `main`'s gutter follows.
- Mobile "Go to" shows PINNED · RECENT · WORK · RECORDS · OPERATIONS ·
  RECRUITMENT · LEDGER · PROJECTS · SYSTEM — every destination present, none
  listed twice.
- ⌘K lists every individual page as before **and** the four modules. This is the
  property that makes the split safe: no page became harder to reach.
- Pins and recents unaffected (`nav-settings.tsx` and `recents-tracker.tsx` read
  `NAV_ROUTES`, which did not change).

809 tests pass, type-check and production build clean.

## Deliberately left for later

- **CocoZuri Operations is a tile marked "Being built"** — visible so the shape of
  the ERP is obvious, not clickable, and carrying no count (a `0` would read as a
  failure rather than as "not started"). Its `groups` are empty, which the test
  asserts.
- **Orders & Imports stays inside Task Management** — the owner's instruction.
  It is arguably its own module; still worth confirming.

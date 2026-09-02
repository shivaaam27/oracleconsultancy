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

**⚠️ `/` does not move.** The administrator stays exactly where it is and stays
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

---

## The launcher and the rail, revisited — 28 Aug 2026

The owner asked for the module sections to be improved: how they appear, how the
information is shown, and how the rail behaves once you are inside a module.
Everything below was **measured at 1440×900 on the live dev server**, not guessed.

### What was actually wrong

**`/apps` — the launcher**

1. **Three of seven tiles carried no number** — Marketing, Orders & Imports and
   CocoZuri. `moduleCounts()` only counted four modules, and CocoZuri's `null` was
   excused by a comment reading *"the tile already says Being built"* — which
   **stopped being true the day the module shipped**. No module is `soon` any
   more, so nothing said anything, and the file's own rule ("a tile that says
   nothing is just a big button") was broken on nearly half the page.
2. **439px of bare grey** under the grid — the owner's "dead space", on the
   launcher itself.
3. **Every tile was a dead end**: one destination each. You go to `/apps` to reach
   the stock book, not the CocoZuri desk, so it cost two clicks every time.

**The rail inside a module — the worse half**

4. **It clipped itself in silence.** CocoZuri's rail stood **1281px in a 696px
   column — 585px of it invisible**: "5 · Sell" through "9 · Know", and the whole
   of System. No fade, no scrollbar, nothing to say more existed. Task Management
   hid 141px.
5. **System was never pinned**, though this file and `CLAUDE.md` both said it was.
   It was the last group in one long scrolling column, which is not the same
   thing — so Settings, Insights, Activity and ORI were out of reach in *every*
   module.
6. **The rail highlighted the wrong link on any sub-page.** `isActive` was "exact
   or a prefix", tested per link, so a module's front door matched everything
   inside it: on `/cocozuri/trace` the rail lit up **CocoZuri** and left Trace
   plain. A pre-existing bug — the page renders perfectly, so only looking at the
   rail on a sub-page finds it.

### What was built

- **`module.quick`** in `nav.ts` — three or four route ids per module, shown as
  chips on its launcher tile. ⚠️ **`nav.test.ts` proves each one names a page
  inside its own module**, so a tile can never quietly become a door into
  somewhere else, and a shortcut can never outlive the page it names.
- **A count for every module** (`mkt_posts`, `ops_order_lines`, and CocoZuri's
  **issued** invoices — the same test the rest of that module uses; counting
  drafts would put a figure on the launcher no screen inside agrees with). ⚠️ A
  **zero is honest because the count ran**; the `null` case still shows nothing.
- **Two columns until `2xl`.** Three columns made short rows and left the grey
  behind; two wider ones give the chips room on one line. Dead space **439px →
  201px**, without inventing anything to fill it.
- **`moduleOwnGroups()` + `systemItems()`** split the rail in two: the module's
  pages scroll, **System is pinned above the footer**. `moduleGroups()` still
  returns both, so the existing test's "System at the foot" assertion holds.
- **Every group folds**, with a count when closed; the group you are in is
  **always open whatever is stored**, and your choice is remembered **per module**
  (`cos-rail-groups`, keyed by module id — CocoZuri's ten groups say nothing about
  Task Management's three). ⚠️ **A one-item group folds too.** Exempting them
  looked like the better trade until it was on screen: CocoZuri has four, so
  "7 · Pay out" and "8 · Put right" sat open among eight folded headings for no
  visible reason. **A rail whose shape you cannot predict is worse than a click on
  a page you rarely open.**
- **Longest match wins** for the active link, the same rule `moduleForPath`
  follows — scored, because `/ops` and `/ops/funnel` are both real links and only
  the longer one is where you are. An exact match always beats a prefix.
- **The active item is scrolled into view** on arrival, and a **bottom fade**
  appears whenever the rail can still scroll (it can: open every group, or use the
  56px icon rail, where there are no headings to fold).

### Measured after

| | before | after |
|---|---|---|
| Rail hidden, Task Management | 141px | **0** |
| Rail hidden, CocoZuri | 585px | **0** |
| System reachable without scrolling | no | **yes, every module** |
| Rail highlight on `/cocozuri/trace` | "CocoZuri" | **"Trace"** |
| Tiles with a figure | 4 of 7 | **7 of 7** |
| Dead space under the launcher grid | 439px | 201px |

1,301 tests pass; `tsc --noEmit` clean.

### Still open

- **The portal rail was not touched.** The portal has no modules, so there is no
  twin to keep in step here — but it has had none of this work, and that is the
  slice `memory/next_features_aug2026.md` already names.
- **Projects has one page**, so its tile carries a count and no shortcuts. Honest,
  and it will fix itself when the module grows.

### A second pass on the look — same day

The owner looked at the first cut and said the folded sections did not look
right, an open group among folded ones looked unbalanced, and the tiles' size,
layout and spacing felt wrong. All three were fair, and all three had the same
cause: **the pieces were styled as what they used to be, not as what they had
become.**

- **A folded group was still a caption.** 11px uppercase with a bare number is how
  you letter a section nobody touches — and these are now the thing you click.
  Beside 13px item rows they read as a whisper next to a shout, so a rail of
  folded groups looked broken and one open group among them looked lopsided. A
  group row now carries **an item row's exact metrics** — same height, same size,
  same left edge — and is told apart by weight and by the chevron sitting where an
  item's icon sits. Folded or open, the rail is one even list.
- **An open group's pages were flush with the group rows**, so they read as
  siblings of them rather than as what is inside — an open group just looked like
  the rail had grown three more headings. They are now **indented behind a
  hairline that starts under the chevron**, which is what makes the fold legible
  at a glance. Never in the 56px icon rail, where there are no headings to belong
  to.
- **The tile was two stacked boxes.** A heading with its own hover band, a rule,
  the count, another rule, then chips — four bands in a 129px card, and a module
  with no shortcuts (Projects) got an **empty section between two rules**. Now:
  the heading itself is the link, the figure sits with the words it describes, and
  there is **one hairline**, above the only part of the card that is a row of
  links. Every tile measures 153px; a chip-less module simply has no footer.
- **Two columns was over-correcting.** 3 columns → 2 fixed the dead space and made
  700px tiles for 60 characters of text. Two until `xl`, three above it, where a
  tile settles at ~400px — the width the blurbs were written for.
- ⚠️ **NO ICON ON A CHIP, and that is a fitting decision, not a taste one.**
  Measured at a 396px tile: four chips with icons summed **368px into 366px of
  room**, so Recruitment wrapped to a second line and stretched its whole grid
  row — and every module is one longer word away from the same. Dropping the icon
  frees 18px a chip: 296px into 366px. The module's own icon is an inch above
  them; these labels need no second one.
- Two `text-[Npx]` literals on the tile (14px title, 15px figure) went with it —
  `DESIGN_SYSTEM.md` forbids them and they had been there since the launcher was
  written.

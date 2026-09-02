---
name: erpnext-redesign-plan
description: The owner wants COS rebuilt in the ERPNext shape — flat/dense look, uniform list+record screens, saved views and bulk edit. Staged plan, decisions taken, and the measurements behind them.
metadata:
  type: project
---

# COS in the ERPNext shape — the plan (Aug 2026)

**Status: ALL FIVE STAGES BUILT + the left sidebar (13 Aug 2026).** **Aurora is
gone**; the design language is **Desk** (`DESIGN_SYSTEM.md`), live on every page
including the staff portal. Read this whole file before touching any UI.

## ⚡ Picking this up in a new chat — read this box first

**Where the work is.** A git worktree, NOT the main folder:
`C:\Users\Shivam Parmar\Documents\cos-system\.claude\worktrees\ai-document-event-attachment-e20b1d`
on branch **`claude/server-status-check-91a135`**, where the whole programme
landed as commit `d804ad5` ("Rebuild COS in the ERPNext shape — all five stages,
plus the sidebar"). *(It was built in an earlier worktree, `mpc-stage-2-556d33`
on `claude/erpnext-redesign-stage-0-0b5839` — that path is stale, don't look for
it.)* The owner's normal checkout (`Documents\cos-system`, `master`) still has
the OLD design — that is why "I see the old design" came up twice. **Nothing is
merged or pushed** (his instruction). `master` HAS moved on since this branch
started, so a merge is needed before anything ships.

**Run it:** `npm run dev` from the worktree, then sign in at localhost:3000.
⚠️ `npm run build` overwrites `.next` and breaks a running dev server — stop the
server, build, `rm -rf .next`, restart. This bit twice.

⚠️ **A stale `.next` will lie to you about the layout.** Aug 2026: the dev server
served an OLD CSS chunk in which the sidebar gutter still stopped at 1279px, so on
a wide monitor `main` got no left gutter at all and the content sat under the
sidebar. The source was correct the whole time. If a layout looks wrong and the
CSS doesn't match the file, stop the server, `rm -rf .next`, restart before
changing a single line.

**What is DONE** (all verified live, type-check + 281 tests + build clean):
| | |
|---|---|
| Stage 1 skin | ERPNext palette/radii/type app-wide; glass, blur, glows, pills gone |
| Stage 2 shells | `RecordList` + `RecordPage`/`RecordBody` |
| Stage 3 metadata | `src/lib/entity-view.ts` + `src/components/entity-cells.tsx` |
| Stage 4 rollout | Tasks, People, Documents, Assets, Vendors, Commitments |
| Stage 5 list power | column chooser (`listKey`), bulk edit (`bulkActions`), saved-views store |
| Extras | full-width layout (1600px cap), persistent left sidebar, record-as-page |

**Decisions the owner made** (do not re-litigate): a record is a PAGE with its
own URL; **Compact is the default** density on admin (portal stays Comfortable);
the left sidebar was wanted, and built last on purpose; full width everywhere
except reading/printing surfaces.

**THE PROGRAMME IS FINISHED** (16 Aug 2026). The last job — saved views only work
where filters live in the URL — is done: Assets, Vendors, Documents and
Commitments all filter through **`src/lib/use-url-filters.ts`** and carry a
`SavedViewsBar`. Notes for whoever comes next:

- The hook takes the defaults and returns `values` / `set` / `dirty` / `query`.
  Anything still at its default is left OUT of the URL, so a clean list has a
  clean address and a saved view records only what differs. Free-text fields are
  debounced (`debounceKeys`) so typing isn't one navigation per keystroke, and it
  writes with `router.replace` so filtering never fills the Back button.
- **Two lists on one page will fight over a param.** `/hrms/assets` mounts all
  three tabs at once, so Vendors namespaces its own (`vq`, `vcategory`) while
  Assets keeps `q`/`category`/`status`. The tab itself is now `?view=` rather
  than `useState`, so a saved view can record which tab it belongs to.
- **Commitments had no filters at all** — the old note said it filtered with
  `useState`, which was wrong. It gained company/kind/urgency so it has something
  to save.
- Saved views moved to the generic **`/api/prefs/list-views?list=<key>`** built on
  `lib/saved-views.ts`. The task-only `/api/prefs/task-views` route and
  `lib/task-views.ts` were duplicates and are deleted; the settings key
  (`<key>.savedViews`) is unchanged, so views already saved on Tasks still load.

**Not converted, with reasons:** Pipeline is a kanban (ERPNext has kanbans too);
OECR/OCR/attendance are grids and checklists, not record lists; Companies is a
hub of small reference lists. All three already inherit the Desk look.

> The owner: *"I have ERPNext and I love the interface and design, can we do that
> for our site also?"*

## Where it stands (Aug 2026, after the follow-up passes)

**Navigation is ONE map now.** The seven "Worlds" (`lib/worlds.ts`, `/world/<slug>`,
`world-screen.tsx`, the vertical SidePill and its flyouts) are DELETED. The desktop
sidebar and the mobile launcher both render `NAV_GROUPS` from `src/lib/nav.ts` —
Work / Records / Registers / System. **FORWARD RULE: add a route to `NAV_ROUTES`,
then put its id in a group.** A route in neither is reachable only by typing its
address, which is exactly how Chat, the Director Brief and the Applications board
went missing.

**Records are pages, not overlays.** `/task/CODE` and now `/people/<id>` both render
`RecordPage`. The person page reuses `getPersonDetail` — the same loader the drawer's
API route uses — so the two can never disagree. The `?person=` drawer still opens for
legacy links and still owns EDITING (one edit form, not two).

**Still on drawers/overlays:** Companies (`/companies/[id]` exists but is hand-built
with its own tabs), Documents, Vendors, Assets, Commitments, Pipeline. Each follows
the People pattern: a `[id]/page.tsx` that loads with the existing loader and hands
`RecordPage` its sections + sidebar.

## The mockup (look at this first)

**https://claude.ai/code/artifact/f149d8f1-628f-4804-bfff-909a540ebcea**

The Tasks page rebuilt in the ERPNext shape, using REAL data (40 open tasks, 21
overdue, real codes/owners/deadlines). Interactive: tick rows for the bulk bar,
press **Compact** for the density question, click a subject for the record page.
Source lives in the session scratchpad, not the repo — regenerate from this file
if it is needed again.

**He never judged the mockup — he judged the running app.** Twice he said it did
not look different enough, and both times he was right. The lessons are in the
Stage 0 and Stage 1 notes below; they are the most useful paragraphs in this
file for anyone doing similar work.

## What he chose

Asked what he loved about ERPNext, he picked **all four**:

1. **How it looks** — flat, grey, businesslike
2. **The density** — how much fits on screen
3. **That every screen works the same way** — list → record → sidebar → timeline
4. **The list power** — filters, saved views, bulk edit

Asked how far to go, he chose the largest option: **"Rebuild the structure to
match ERPNext too."** I had already put the case for a cheaper path (skin only,
or list-power only) and he chose this with that in front of him — so it is a
decision, not an unconsidered answer. Build it.

## The insight this plan rests on

**ERPNext's uniformity is not design discipline — it is METADATA.** Every DocType
is a definition, and one list view and one form view are *generated* for all of
them. That is why every screen behaves identically and why a new record type
costs nothing.

**COS already has the seed of it.** `src/lib/entity-registry.ts` defines each
entity — table, columns, indexable text, lifecycle, search mapping, trace mode —
and `CLAUDE.md` already carries the rule *"to make a new entity searchable, add
ONE EntityDef"*. Today it only drives search.

**So the route is: extend `EntityDef` with list columns, filters and form
sections, then generate the screens from it.** Not hand-copying ERPNext's layout
across 58 pages. Do it this way and uniformity, list power, and "add an entity →
get a screen free" all arrive together.

This is the single most important paragraph in this file.

## Measurements (already taken — do not re-measure)

| | |
|---|---|
| Page files (`src/app/**/page.tsx`) | **58** |
| Components (`src/components/*.tsx`) | **257** |
| App `.tsx` files | **121** |
| Files using design tokens | **299** |
| Files using raw Tailwind palette (`bg-gray-500` etc) | **1** |
| Token definitions in `globals.css` | **121** lines |
| `globals.css` | 963 lines |
| `DESIGN_SYSTEM.md` | 339 lines |

**The styling is unusually centralised** — that is why the skin is cheap. The
palette, radius ladder and dark mode all live in ~121 token lines in one file.
Changing them changes every screen at once, and it is reversible.

## The stages

Ordered so he can stop after any one and still be better off.

### Stage 0 — see it before committing (~half a day) ✅ BUILT 13 Aug 2026
Re-skin the tokens on ONE page (Tasks) so he can judge COS flat/grey/tight beside
the current look, in the running app rather than a mockup. Fully reversible.

**How he uses it:** hub → Tasks. A **Look: Current | ERPNext** switch sits in the
hero, top right. Pressing ERPNext repaints the page in ERPNext's colours; pressing
Current puts it back. The choice is his alone (browser localStorage), changes no
data, and is dropped the moment he leaves the Tasks tab — every other page stays
Aurora. Density is the **existing** toggle in the nav pill (no second switch);
under the ERPNext skin it means 9px rows → 4px rows, which is the real question
for open question 1.

**What was built** (4 files):
- `src/app/globals.css` — one additive block at the very bottom, under
  `:root[data-skin="erp"]`: the ERPNext palette (light + dark) mapped onto COS's
  existing ~121 tokens, 6/8px radii, glass and blur and lift stripped from
  `.glass`/`.nav-frost`/`.glass-menu`/`.vibrancy`/`.elevated`/`.wash-accent`, and
  the 9px/4px row density. Nothing above it was edited.
- `src/components/skin-preview.tsx` — `SkinScript` (pre-hydration, avoids a flash
  on reload; deliberately URL-aware so it only ever fires on the Tasks tab) +
  `SkinPreviewToggle` (the switch; clears the attribute on unmount).
- `src/app/layout.tsx` — mounts `SkinScript` beside `DensityScript`.
- `src/app/_hub/tasks-section.tsx` — mounts the switch; tags the hero's decorative
  glow `data-skin-hide`. Plus `data-list-row`/`data-list-head` on the Tasks list in
  `src/app/task/_views/table-view.tsx` (that list is a CSS grid of divs, not a
  `<table>`, so the density rules need a hook).

**To revert Stage 0 entirely:** delete the globals.css block + `skin-preview.tsx`,
and remove the four references. No data, no settings, no migrations involved.

**Verified live** (logged in, dev server): body `#f4f5f6`, ink `#1f272e`, accent
`#2490ef`, hero flat white / 8px / hairline border / no blur; dark mode `#15181b`
+ `#4aa3f5`; row padding 9px → 4px on Compact vs Aurora's unchanged 10px; the
attribute is absent on `/people` even with the preference stored; type-check clean.

**What Stage 0 deliberately does NOT do** — say this plainly when he judges it:
it repaints, it does not restructure. Chips and buttons stay pill-shaped, rows keep
their three-line Aurora shape (~88px tall), and there is no filter rail, no bulk
edit and no record page. That is Stages 2–3. He is judging **colour, flatness and
tightness**, nothing else.

**First attempt was too quiet — his words: "I really don't see much different."**
He was right, and the reason matters for Stage 1:
- **`rounded-full` is not a radius token.** The Tasks page alone has ~255 of them
  (chips, badges, status pills, segmented controls) at a hard-coded 9999px, so
  re-skinning the radius tokens left the page's whole SILHOUETTE untouched.
  Stage 1 must square the pills explicitly, not just move the tokens.
- **In light mode the two palettes are nearly the same** — Aurora `#f7f7f8` on
  white vs ERPNext `#f4f5f6` on white. Colour alone can never carry this change.
- So the skin now also: squares every pill except dots and photos (`:not(:empty)`
  keeps the empty status dots round), overrides Tailwind's `--text-*` scale to
  ERPNext's ~13px, and turns the Tasks hero from a 173px rounded glass card into a
  110px plain heading + rule (`data-page-header` / `-meta` hooks).
- **Specificity trap:** `:root[data-skin="erp"] [data-page-header]` ties with
  `:root[data-skin="erp"] .glass` and loses on source order — the card's white fill
  came back. Fixed by qualifying the element (`section[data-page-header]`).

**Measurement trap:** those chips carry `transition-all`, so reading computed
styles immediately after toggling the attribute returns MID-TRANSITION values (a
pill measured 4px because it was still animating). Wait ~800ms before measuring.

**Dev gotcha (cost 20 minutes):** after editing `globals.css`, Turbopack served the
CSS chunk from cache — the new rules were simply absent from the served file. Touch
the file a second time and hard-reload. Check with
`fetch(document.querySelector('link[rel=stylesheet]').href).then(r=>r.text())`
before concluding a rule "doesn't work".

### Stage 1 — the skin (1–2 days) ✅ BUILT 13 Aug 2026
- Rewrite the ~121 tokens in `globals.css`: ERPNext greys, flat surfaces, smaller
  radius, no glass/blur, tighter type scale.
- **Density switch (Comfortable / Compact)** stored in settings, applied as a
  root attribute so every screen honours it.
- Rewrite `DESIGN_SYSTEM.md` and the Aurora section of `CLAUDE.md`.

**What shipped, and the one idea that made it cheap:** the old material CLASS
NAMES were kept (`.glass`, `.vibrancy`, `.nav-frost`, `.glass-menu`, `.elevated`,
`.wash-accent`) and simply redefined as ONE flat surface. So ~94 components that
carry those classes were not touched at all. Everything is in `globals.css`:

1. **Tokens** — the ERPNext palette (light + dark), radii (4/6/8px), and
   Tailwind's `--text-*` scale re-pointed at 11/12.5/13/16/18/22/26px.
2. **Materials** — glass/vibrancy/frost → solid fill + hairline; only menus,
   popovers and the nav pill keep a (flat) drop shadow.
3. **Fields are boxes** — white fill, visible hairline (the old look hid the edge
   behind a tinted well).
4. **Square corners, globally** — `rounded-full` is squared for everything except
   status dots, spinners and `[data-switch]`.
5. **No atmosphere** — `blur-3xl`/`blur-2xl` glow blobs, the command palette's
   drifting blobs and `[data-decor]` are `display:none`; backdrop blur is off;
   the launch splash lost its aurora.
6. **Density** — `data-density="compact"` (existing nav-pill toggle) now drops the
   type a notch and halves row padding on EVERY screen, not just `.card`/tables.
7. **Naming** — the language is now **"Desk"**. `DESIGN_SYSTEM.md` was rewritten
   around it (Aurora sections replaced; §10–13 kept and de-glassed).

Stage 0's preview switch and its `[data-skin="erp"]` block were DELETED — the skin
is the default now. Reverting the lot is one `git revert`; no data or settings.

**Verified live** across `/?tab=tasks`, `/documents`, `/people`, `/settings`,
`/chat`, `/` and `/portal/login`, in both themes: page `#f4f5f6` / `#15181b`, zero
elements with a stray >20px radius, zero real backdrop blur, zero visible glow
blobs, no text below 10.5px, fields 6px with a `#e2e6e9` edge, primary button
`#2490ef`. Type-check clean.

**Three traps this stage hit — read before the next CSS sweep:**
- **The minifier collapses prefixed pairs.** Writing `backdrop-filter: none
  !important` AND `-webkit-backdrop-filter: none !important` together left ONLY
  the `-webkit-` one in the output, which Chrome ignores in favour of the
  unprefixed property the utility also sets — so the blur survived. Fixed by
  emptying Tailwind's own `--tw-backdrop-blur` variable instead.
- **`:empty` is not "is a dot".** Every `<input>` is empty, so the rule keeping
  status dots round re-rounded all the search fields. The exception is now keyed
  on an exact size token (`[class~="h-2"]`, which never matches `h-20`).
- **A JSX comment cannot be the first thing inside `return (…)`** — it parses as
  two expressions. Put it above the `return`.

### Stage 2 — the two shells (~1 week) ✅ BUILT 13 Aug 2026
Build `RecordList` and `RecordPage`:
- **List**: filter bar, left filter rail with counts, sortable columns, row
  selection → bulk action bar, footer count/page size, saved-view slot.
- **Record**: header (title, status, primary action, ⋯), tabs, collapsible
  sections in a 2-column field grid, right sidebar (assigned / attachments /
  tags), activity timeline at the bottom.

Prove both on **Tasks** end to end before generalising.

**What shipped.** Two components, both layout-only and prop-driven, with props
shaped like the Stage 3 metadata so the registry can feed them unchanged:

- **`src/components/record-list.tsx`** — `RecordList<T>`: left filter rail with
  live counts (grouped, e.g. Status then Company), column header strip with
  URL-driven sorting, tickable rows, group headings, an optional second context
  line (`subRow`) and hover actions (`rowActions`), and the "N of M shown"
  footer. Sorting and filtering are **URLs, not state** — the server component
  stays the single source of truth and every view is a shareable link.
- **`src/components/record-page.tsx`** — `RecordPage` (header: code · status ·
  title · actions; tabs; collapsible sections in a 2-column field grid; right
  sidebar; activity last) plus **`RecordBody`** and `RecordSidebarBlock`.

**Proven on Tasks:**
- The desktop Tasks list (`task/_views/table-view.tsx`) now renders through
  `RecordList`. All the Tasks-specific behaviour survived — inline status,
  deadline editor, avatars, long-press peek, snooze, row actions, selection →
  bulk bar, grouping. The mobile card list is untouched.
- Sorting: `?sort=code|status|deadline|who` + `&dir=desc`, applied server-side in
  `tasks-section.tsx`. **Column sort runs BEFORE the group sort** — `Array.sort`
  is stable, so rows keep their column order inside each group. An undated task
  sorts last, never first.
- The rail reuses the counts already computed for the chips and pickers.
- The task record (the drawer's Details tab) renders through `RecordBody`:
  a "Detail" section (Deadline · Category · Department · Company · About) and an
  "Accountable" sidebar block.

**Verified live:** rail (15 entries, 2 groups), 4 sortable columns with
direction arrows, deadline sort ordering correct both ways, footer "45 of 101
shown", selection raises the bulk bar, record fields + sidebar render. Type-check
and `npm run build` both clean.

**⚠️ The fork to settle before Stage 4 — drawer or page?** In ERPNext a record is
a PAGE with its own URL. In COS a task record is a DRAWER: `/task/[code]`
currently redirects to `/?tab=tasks&task=CODE`, a deliberate earlier decision
("the pop-up is now the single, full-parity task view"). Stage 2 respected that —
which is exactly why the body was split into `RecordBody`. If the owner wants
real record pages, the change is small: render `RecordPage` on a route and drop
the redirect. **Ask him; don't assume.**

### Stage 3 — the metadata (~1 week) ✅ BUILT 13 Aug 2026
Extend `EntityDef` with `listColumns`, `filters`, `formSections`. Drive both
shells from it. **This is the stage that makes it ERPNext rather than a
lookalike.**

**Where it lives — and why NOT in `entity-registry.ts`:** the registry imports
the server-only Supabase client, so a client component can never import it (that
crashed the whole app once). The view metadata therefore lives in
**`src/lib/entity-view.ts`**, client-safe with type-only imports, exactly like
`entity-meta.ts`. Both server and client read it.

**It is DECLARATIVE — no functions.** A column says `{ key: "deadline", format:
"date" }`; the client maps the format name to a renderer. A render function could
not cross the server/client boundary, and could not be stored in a database if
this ever becomes owner-editable.

- `src/lib/entity-view.ts` — `ListColumnDef` / `FormFieldDef` / `FormSectionDef` /
  `FilterGroupDef` / `EntityView`, plus **`ENTITY_VIEWS`** with definitions for
  **task, person, company, document**.
- `src/components/entity-cells.tsx` — one renderer per `CellFormat` (text, muted,
  number, code, date, status, priority, people, company), plus `buildColumns()`
  → `RecordColumn[]` and `buildSections()` → `RecordSection[]`.
- **Escape hatch:** `overrides` supply cells metadata can't describe (the inline
  status editor, the deadline picker, avatars). Keep it small — if you are
  overriding every column, the format vocabulary is missing one; add the format.

**Proven on Tasks:** the list's columns, order, widths, labels and sortability now
come from `ENTITY_VIEWS.task.listColumns`; the record's field grid comes from
`formSections`. Verified live: header renders Task/Status/Deadline/Who, grid
tracks `28px 897px 150px 116px 80px` straight from the metadata, sort keys
`actionItem/status/deadline/assignees` match the metadata keys.

**⚠️ Sort keys must equal column keys.** `SORTERS` in `tasks-section.tsx` is
keyed by the metadata's column key — that is how a header finds its sort link.

**Bug found and fixed here:** descending sort floated every undated task to the
top. Empties are now pinned last OUTSIDE the direction flip (`isEmpty` on the
sorter), so reversing reverses the real values and leaves blanks at the bottom.

**FORWARD RULE — to give a new record type a screen, add ONE `ENTITY_VIEWS`
entry.** It inherits the list, the rail, the sorting, the field grid, the density
and the record layout. No new components.

### Stage 4 — roll out (2–4 weeks) ✅ BUILT 13 Aug 2026
One area at a time, each shippable on its own:
Tasks ✅ → People ✅ → Documents ✅ → Commitments ✅ → the register KIT ✅ →
Assets/Vendors rows ⬜ → Companies ⬜ → Pipeline ⬜ → OECR/OCR/attendance ⬜.

**The register kit was the lever (13 Aug 2026).** `RegisterList` / `RegisterRow`
in `ui.tsx` back SIX screens (assets, vendors, commitments, documents,
site-tools, OECR). Re-pointing those two components at the list shell's frame
(8px corners, hairline border, full-strength dividers) and tagging the row
`data-list-row` gave every one of them the Desk rhythm AND the Compact density
switch in a single edit — verified on `/hrms/assets`: 46 rows, 4px padding,
8px frame. **Look for the shared kit before converting screens one by one.**

**Metadata now exists for** task, person, company, document, vendor, asset,
commitment, pipeline.

**Assets ✅ and Vendors ✅ (13 Aug 2026)** — both rebuilt against
`ENTITY_VIEWS.asset` / `.vendor`. Assets: Asset · Category · Assigned to ·
Status (verified: 46 rows, grid `422.8px 130px 170px 110px`, "46 shown"). The
contextual Assign/Return buttons and the whole kebab menu moved to `rowActions`,
so nothing was lost. Vendors: Vendor · Category · Company · Contact — **there
are currently 0 vendors in the database**, so that tab shows its empty state;
that is data, not a fault.

**Left, with reasons:**
- **Pipeline** is a KANBAN. ERPNext has kanbans too — a board should not be
  forced into a list. Leave it; only its cards need the Desk look.
- **OECR / OCR / attendance** are grids and checklists, not record lists. They
  already inherit the register kit's frame and density.
- **Companies** is a hub of reference lists (`reference-admin.tsx`) — small
  add/rename/merge lists, not record lists. Convert only if the owner wants the
  company roster itself as a record list.

**The width sweep (13 Aug 2026) — do this before converting anything else.**
The owner asked for the empty margins to be used on EVERY page. Seventeen pages
carried their own cap (`max-w-5xl`, `max-w-3xl`, `max-w-[760px]`…) INSIDE the
layout's column, so widening the layout alone did nothing for them. Caps removed
from: activity, announcements, approvals, companies, documents, graph, hrms
(assets, command-centre, leave, ocr, pipeline, registers), insights, outbox,
people, settings, calendar, ori-automations. `companies/[id]` went 880px → 1100px
to match `RecordPage`.

**Deliberately still narrow** — these are read or printed, and a 1600px line
length hurts: `/ask` (a conversation), `/brief` (a printed report),
`/people/[id]/pack` (printable), `/design` (the gallery), `/task/new` (a
single-column form; it wants a 2-column rebuild before it earns the width).

**Documents (done 13 Aug 2026)** — `documents-table.tsx` renders through
`RecordList` (`DocList`), columns from `ENTITY_VIEWS.document`: Document ·
Category · Expires · Status. Overrides carry the file name with its chips, the
expiry countdown and the status badge. The company housings and category shelves
survive, both still collapsed by default — so a fresh page legitimately shows
ZERO `data-list-row` elements until you open one. Don't read that as a fault.
Columns were built in-place rather than in a new file because the row needs a
dozen helpers (`daysToExpiry`, `statusBadge`, `companyAccent`, `linkedTasks`…)
that already live in that component; extracting would have meant threading them
all through props.

**People (done 13 Aug 2026)** — `src/components/people-record-list.tsx` renders
the Browse list through `RecordList`, with columns from `ENTITY_VIEWS.person`
(Name · Manager · Portal · Open). Everything that made that screen useful
survived: the inline manager combobox, the tap-to-cycle portal role, the
workload figure with its tone, the on-leave dot, the no-contact marker, select
mode, and the collapsible company housings with their per-group stats.

**What the roll-out taught the shell** (both now in `RecordList`):
- `RecordListHeader` — a list split into collapsible groups draws ONE header
  above them, not a repeat at every group.
- `bare` / `showHeader` / `showFooter` — a list rendered INSIDE an existing
  housing must not draw its own frame, header or footer.

**Metadata correction:** `ENTITY_VIEWS.person` originally described Name / Role /
Company / Department — tidy, and not what the screen is for. It now matches the
job: identify someone, see who they report to, what portal access they have, and
how much is on them. **Write the definition from what the screen must DO.**

Comfortable density on People still renders the old `PersonCard` grid; only
Compact is the list screen. That is deliberate — cards are the glanceable read.

### Stage 5 — list power (~1 week) ✅ BUILT 13 Aug 2026 (one caveat, below)
Saved views, bulk edit, report/grid mode, column chooser. Built once against
`RecordList`; every list gets it.

**Column chooser ✅ (13 Aug 2026).** `RecordList` takes `listKey="task"` (or
asset / vendor / commitment) and draws a **Columns** button beside the toolbar.
Ticking a column off removes it from the header AND the grid template, and the
choice is remembered per list in `localStorage` (`cos-cols-<listKey>`). Verified:
hiding "Who" on Tasks took the header to Task · Status · Deadline and the grid to
`28px 338.8px 150px 116px`, stored as `["assignees"]`.

**The FIRST column is never hideable** — it is the record's identity, and a list
of blank rows helps nobody.

This only works because columns are metadata (Stage 3): the chooser enumerates
`listColumns` and filters by key. It would have been per-screen work otherwise.

**Bulk edit ✅ (13 Aug 2026).** `RecordList` takes `bulkActions` and then owns
the whole interaction: a tick box on every row, select-all in the header, and a
bar showing "N selected" with the actions and a Clear. Verified on Assets:
"1 selected · Archive · To maintenance · Clear", and Clear empties it. Wired —
Assets (archive, send to maintenance), Vendors (archive), Commitments (archive).
Tasks and People keep their own richer select bars; passing `selectionSlot`
overrides the built-in box, so they are untouched.

**Saved views ✅ generalised (13 Aug 2026).** `src/lib/saved-views.ts` reads and
writes `<listKey>.savedViews` in the SAME `settings` row shape Tasks already
used — no migration, and every view the owner has already saved still works.

**⚠️ Saved views only work where filters are URL-driven.** That is the Stage 2
rule paying off: Tasks qualifies. Assets, Vendors, Documents and Commitments
filter with `useState`, so there is no query string to save — their filters must
move into the URL before a saved view means anything. That is the honest
remaining work, and it is per-screen.

**Realistically 6–9 weeks of focused work.**

### The persistent left sidebar ✅ BUILT 13 Aug 2026
The owner deferred this until the stages were done, then asked for it.
`src/components/desk-sidebar.tsx` — ERPNext's workspace rail: fixed left column,
**208px** (**56px** collapsed, remembered in `localStorage`), grouped **Work ·
Records · Registers · System**, built from the same `NAV_ROUTES` list as the pill
launcher and ⌘K so the three can never drift. Shows from `lg` up only; below that
the bottom pill is still the navigation, because a fixed rail on a phone is dead
weight. Verified: sidebar 208px at x=0, `main` padding 228px, list running
428→1633 at 1680px; collapse → 56px/76px; on a 375px phone the sidebar is absent
and the bottom pill is there (319×52).

**It publishes its width as `--desk-sidebar` on `<html>`** and `globals.css` sets
`main { padding-left: calc(var(--desk-sidebar, 88px) + 1.25rem) }`, so the gutter
follows the sidebar instead of a hard-coded number.

**Bug it fixed on the way:** the vertical `SidePill` was positioned
`left-[max(0.75rem,calc((100vw-1100px)/2-86px))]` — computed off the 1100px
content column that the width sweep removed. At 1680px that put it at x≈204px,
ON TOP of the list. The sidebar replaces it at `lg`, and the pill is now hidden
there rather than mispositioned.

## Explicitly OUT of the structural rebuild

These adopt the new **skin** (Stage 1) but keep their bespoke shapes. Raised with
the owner; he did not object, but he also did not explicitly confirm — **check
before converting any of them.**

- **The staff portal** (`/portal/**`). Phone-first, used by staff. ERPNext's own
  mobile experience is its weakest part and density on a phone is a downgrade.
- **The calendar** (`/calendar`). A calendar rendered as a list view is strictly
  worse.
- **Chat** (`/chat`).
- **The administrator home and Director Brief.** Glance surfaces, not record
  lists — "every number is a door" is the point of them.

## The mockup's design tokens (Stage 1 can lift these directly)

Follows Frappe/ERPNext's own palette — a blue-biased grey family, one workmanlike
blue, semantic colour kept separate from the accent.

```
light   page #f4f5f6   surface #ffffff   surface-alt #fafbfc
        line #e2e6e9   line-soft #edf0f2
        ink  #1f272e   ink-muted #6b757d   ink-subtle #8d99a6
        accent #2490ef  accent-soft #eaf3fd
        red #d13d3d  amber #b7791f  green #2f9461  violet #7857c9

dark    page #15181b   surface #1c2126   surface-alt #20262c
        line #2c343b   line-soft #262d33
        ink  #e7ebee   ink-muted #9aa5ae   ink-subtle #78838c
        accent #4aa3f5  accent-soft #17293b
        red #f07171  amber #dda44b  green #5cc08a  violet #a58ae8

radius  6px controls · 8px cards        density  9px row padding / 13px
                                                 → 4px / 12px when compact
```

ERPNext uses **Inter**. The mockup used the system stack because the artifact
sandbox blocks font CDNs; the real app can load Inter properly.

## Decision recorded (done in Stage 1)

`CLAUDE.md` and `DESIGN_SYSTEM.md` currently mandate Aurora — *"Every new page,
dialog, pop-up, search surface, panel or feature uses Aurora by default."* This
programme supersedes that standing rule. Both were rewritten in Stage 1: the
language is now **Desk**, and every "use Aurora by default" instruction is gone,
so a fresh session cannot faithfully rebuild something in liquid glass.

## Questions — all now answered

1. ~~What did he think of the mockup?~~ He never judged the mockup; he judged the
   running app, twice, and both times the honest answer was that it was not
   different enough yet. See the Stage 0/1 notes — that is where the real lessons
   are.
2. ~~Should Compact be the default?~~ **Yes** (his words: "compact is fine").
   Admin defaults to Compact; the portal stays Comfortable.
3. ~~Is the record page layout right?~~ **Yes, and he went further** — a record
   is a PAGE with its own URL, as in ERPNext, not a drawer.
4. ~~Inter or the system font?~~ Settled: COS already self-hosts Inter.
5. ~~The persistent left sidebar?~~ **Wanted, and built** — deliberately last, so
   the stages settled the shape first.
6. ~~Confirm the out-of-scope list?~~ The portal keeps its own shapes but took the
   skin, exactly as planned. The calendar, chat, home and Brief were left alone.

## Related — the files that matter

**The design language**
- `DESIGN_SYSTEM.md` — Desk. Rewritten; Aurora is gone from it.
- `src/app/globals.css` — every token, the flat surfaces, the square-corner rule,
  density, the page-header/list-row hooks.

**The machinery** (this is the redesign, in five files)
- `src/lib/entity-view.ts` — the view metadata. **Add ONE entry to give a record
  type a screen.** Client-safe, declarative, no functions.
- `src/components/entity-cells.tsx` — `CellFormat` renderers, `buildColumns`,
  `buildSections`.
- `src/components/record-list.tsx` — the list shell (rail, sorting, ticking,
  column chooser, bulk bar, footer, grouped-list helpers).
- `src/components/record-page.tsx` — the record shell + `RecordBody`.
- `src/components/desk-sidebar.tsx` — the persistent navigation.

**Supporting**
- `src/lib/task-href.ts` — the one answer to "what is the link to a task?"
- `src/lib/saved-views.ts` — saved views for any list, in `settings`.
- `src/lib/nav.ts` — the one destination list (sidebar + pill + ⌘K).
- `src/lib/entity-registry.ts` — the SEARCH metadata (server-only). Kept separate
  from `entity-view.ts` on purpose: importing the registry from a client
  component drags the Supabase service key into the browser bundle and crashes
  every page.

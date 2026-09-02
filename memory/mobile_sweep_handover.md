---
name: mobile-sweep-handover
description: "IN PROGRESS — a page-by-page mobile sweep of the COS administrator. Read this first; the previous attempt measured geometry instead of LOOKING and must not be repeated. Task Management, the Go-to launcher and /people are DONE and merged; resume at /companies."
metadata:
  node_type: memory
  type: project
---

# Mobile sweep of the administrator — handover

**Status: IN PROGRESS. Task Management — the hub Tasks tab in all five views,
`/task/new` and `/task/[code]` — the Go-to launcher, and `/people` + the person
record are swept. Resume at `/companies`.**

⚠️ **19 Aug: this sweep was MERGED into the master line** (`b6f1b01`). It had spent
a day stranded on `claude/mobile-sweep-task-management-9eb936`, which is how the
Go-to launcher came to be broken a second time and fixed a second time, and how
`RecordList`'s grid bug came to be fixed twice independently. **Check what branch
your work is actually on before starting a page.**

## ▶ START HERE — the one thing to understand

The previous session built a JavaScript probe that measured **page overflow, tap-target
height and font size**, ran it per page, and called pages "clean" when those three
numbers looked right.

**That was the wrong method and the owner rightly stopped it.** Those numbers say a
page does not technically break. They say nothing about whether it *looks* right:
cramped spacing, ugly wrapping, weak hierarchy, controls that fit but sit awkwardly,
panels that stack into an endless scroll, text that is technically ≥11px but still
reads badly on a phone. **The owner can see all of that instantly and the probe was
blind to every bit of it.**

⚠️ **DO NOT REPEAT THAT APPROACH.** For each page:
1. **LOOK at it** — take a screenshot at 375px and actually study the layout. The
   owner has explicitly asked for this; the usual "no screenshots" token rule in
   CLAUDE.md is **overridden for this task**.
2. Then measure, as a second pass, to catch what the eye misses.
3. Fix, then **look again** before moving on. He asked for "double check before you
   move on" and meant it.

## The rule that must not be broken

**Mobile and web are separate. The web view must not change at all.** Everything so
far is inside `@media (max-width: 639px)` or `@media (hover: none)`, and each change
was verified at 1280px afterwards to prove the desktop was untouched. Keep doing that.

## What has been fixed so far (all verified both ways)

1. **Hover-only controls were unreachable on touch.** Nine components use
   `opacity-0 group-hover:opacity-100` — Reply on a message, remove on a row, saved-view
   actions. There is no hover on a phone, so **Reply was invisible and could not be
   used at all**. One rule in `globals.css` under `@media (hover: none)` fixes every
   one of them. Verified: opacity 1 on touch, still 0 on desktop.
   ⚠️ Written as `.opacity-0.group-hover\:opacity-100` — the first attempt used an
   `[class*="…"]` attribute selector and **Lightning CSS silently dropped the whole
   rule**. Always re-check the served stylesheet.
2. **16px tick-boxes were too small to tap.** `SelectCheckbox` on the task cards.
   A new `.tap-target` utility in `globals.css` gives a control a 40×40 invisible hit
   area on phones only, with no change to its size or to the layout. Verified: a tap
   14px above the box now hits it; on desktop the pseudo-element is `content: none`.
3. **Notes, from the earlier work in the same session:** the note toolbar wrapped to
   three rows on a phone (71px → 41px, one scrolling row), the `/` and `@` menus would
   have opened behind the on-screen keyboard (`visualViewport`), and the note title
   overflowed because it was a single-line input (now a wrapping textarea).

## ✅ Task Management — swept, fixed, verified both ways

Every fix below was seen at 375px before and after, and the desktop re-checked at
1280px. All of them are `max-sm:` / `sm:` / `@media` scoped; nothing changes above
640px. **`TaskCard` (`components/task-card.tsx`) is mobile-only** — it is rendered
solely inside the `sm:hidden` branch of `table-view.tsx`, so it cannot touch the web.

**The hub Tasks tab — chrome**

1. **The five filter pickers were ~900px off-screen.** Chips + Company/Person/
   Status/More/Group were one 1271px row inside 375px, scrolling sideways with a
   hidden scrollbar. Reachable and invisible. **On a phone the whole row is now
   chips + ONE "Filters" button** — see the next section. `sm:contents` on the
   wrappers restores the exact single row from `sm` up. (`task-filter-bar.tsx`)
2. **The header figures** wrapped to "…45% on track ·" with the dot left hanging
   and the view switcher jammed against "12 done this month". Now a 2×2 grid, dots
   only from `sm` up. (`tasks-section.tsx`)
3. **The view switcher** is a full-width segmented control on a phone — five 68px
   segments instead of a 34px cluster — with a HAIRLINE track, not a fill, so it
   does not out-weigh the page title on a flat header. (`view-switcher.tsx`)
4. **A 10px phantom band under the title**: the Focus/Browse wrapper rendered empty
   on the four views that don't have it, and an empty flex row still takes the gap.
5. **The quick-add row** had a decorative `+` seven pixels from the assignee `+`,
   between them squeezing the input to 174px. Decorative one hidden below `sm`;
   input is 212px. (`inline-add-task.tsx`)

## Round 2 — the owner's own two notes

He looked at round 1 and said the mobile filters "just feel a lot and not
appealing", and that the hero at the top "doesn't feel right, both in mobile and
web — text feels too tight to the borders". Both were right, and the second one
turned out to be a bug that had nothing to do with the phone.

**⚠️ The page header was a filled card in DARK MODE ONLY, and nobody had noticed.**
`section[data-page-header]` in globals.css says "flat: transparent, no radius, a
bottom rule, `padding: 0 0 10px`". But these headers still carry `.glass`, and the
flat-surface rewrite reads `… .glass, .glass-refract, .dark .glass { … }`.
**`.dark .glass` is two classes and outranks one element + one attribute**, so in
dark mode `--bg-elev` won and painted a 1005px band — with the zero side padding
still in force, which put the title ONE PIXEL from the edge of a box it was never
meant to be in. Light mode was always correct, which is why it survived. Fixed by
adding `.dark section[data-page-header]` to the same rule (+ `2px` top padding, it
was flush against the top of the main column). **This was on every page header in
the app.**

**The filters are now one row on a phone: the counting chips, and a "Filters"
button.** The five pickers live in a `BottomSheet` — one tappable row per group
showing what is currently picked, opening its own list inline, one at a time.
Picking navigates and closes the sheet. The button carries a count of what is on
and turns accent when it is. Round 1's two-row fix made everything visible but
left FOUR bands of chrome above the first task; this leaves two.
- `OptionList` gained `autoFocusSearch` — right in a mouse-opened popover, wrong
  in a sheet where it throws the keyboard over the list you just asked to see.
- The chip strip ends against the button, so it carries `.chip-scroll-fade`
  (globals.css, phones only). Cut hard it read "In progress 1" when the count is
  16, which looks like a broken number rather than "keep scrolling".

**⚠️ `?company=` meant two different things and one of them was broken.**
`company-drawer.tsx` reads it as a company ID; the Tasks screen uses it as the
company FILTER and puts a NAME in it. The drawer took "MES Ltd" for an id, asked
`/api/company-detail` for it, and threw **"Couldn't load company."** over the page
— so filtering tasks by company failed with an error dialog every single time, on
the phone AND the desktop. An id is digits and a name is not, so that is now the
test. Verified both ways: `?company=MES Ltd` filters silently, `?company=3` still
opens Terra Green Ltd's drawer. `?person=` / `?task=` have no such clash.

**List view** — the card carried a ruled-off footer holding two 26px avatars at one
end and a `…` at the other with ~300px of nothing between, on every card. Avatars
and `…` moved onto the status row; the rule now sits above the update line where it
belongs. One row shorter per card.

**Cards view** — titles were `truncate` in a 263px column ("Clifford Machinery
Update - Weekl…"), now two lines below `sm`. The no-badge grid spacer rendered as a
stray "·" in the phone's flex row. **And each company group capped at 23rem and
scrolled inside itself** — on a phone that showed two and a half cards and sliced
the third across the middle, inside a nested scroller with no bar. The cap now
lives in `.card-group-scroll` (globals.css) behind `min-width: 640px`.

**Board view** — columns snap on a phone (`max-sm:snap-x snap-proximity`).

**Calendar view** — the header stacked "AUGUST 2026 · 21 DUE THIS MONTH" into four
lines beside the nav; the count is hidden below `sm`. **The month grid was 630px of
empty boxes** with the one task in it rendered as "( C…" in a 53px cell. Phones now
get **dots** (one per task, coloured, "+N" over six) and 68px cells, so the month
fits one screen; tapping a day opens the existing agenda sheet, which reads well.

**Timeline view** — entry headers gave the task title ~96px beside the actor pill,
time and `…`; they stack below `sm`. The sticky day heading was `bg-bg/80` finished
off by a `backdrop-blur` that Desk switched off, so entries read straight through
it — solid on a phone. In Schedule, `OC-040` broke across two lines at its hyphen
and "· Tue 11 Aug" after "Tue 11"; both are `shrink-0` now.

**`/task/new`** — the `EnterHint` ("Enter to create · Shift/Alt+Enter…") took three
lines of keycaps on a phone that has no Enter key, which then forced "Create task"
to break across two lines. Hidden below `sm` (in `form-keys.tsx`, so every form
gets it). "More details" was a bare text node — a wrappable flex item — and stacked
as "MORE"/"DETAILS".

**`/task/[code]` — the worst one on the page.** ⚠️ `RecordPage`'s header is
"identity left, actions right, wrap if you must", but it could never wrap: `flex-1`
gives the identity a flex-basis of ZERO, so the line never overflowed and nothing
ever moved to a second row — the identity just took whatever the buttons left it.
On a phone that was **64px**, and a task record opened with its title set one word
per line, six lines tall, over a company name broken across three. `max-sm:basis-full`
on the identity is what pushes the actions onto their own row. **This fixes every
record page** — People, Documents, Assets, Vendors, Commitments. Its tab strip also
overflowed (5 tabs = 357px in 343px); it scrolls below `sm`.

## Round 3 — the launcher, the last Task Management defects, and People started

**The "Go to" launcher (the nav pill's grid icon) was unusable on a phone.** One
`p-4` box, no height cap, no overflow rule: with 26 destinations it grew to
**1218px inside an 812px screen**, centred, so its own title and close button sat
203px ABOVE the top edge and Settings, ORI Automation and the whole Preferences
row fell off the bottom — with no way to scroll to any of them. It is now a fixed
header, a scrolling middle and a fixed footer; on a phone it sits on the bottom
edge, full width, with a grabber. The 85svh cap is NOT phone-only — a 1280×800
window overflowed the same way, and a cap costs nothing on a window tall enough.

**The three I had left open on Tasks are now closed:**
- `pillColor()` returns real colours. The tokens hold an HSL triplet, so
  `var(--danger)` was invalid and painted nothing — on exactly the overdue /
  due-soon / Critical rows whose colour carries the warning. `dotColor` is gone;
  there is one function again.
- **The board's column headings.** Sticky was never the answer: `overflow-x: auto`
  makes the row a scroll container on both axes, so `sticky top-0` resolved
  against a box with no vertical overflow. From `sm` up the board is bounded and
  each column is a flex column — heading outside the scroll, cards in a
  `flex-1 min-h-0 overflow-y-auto` body. Columns still stretch, so an empty
  column is still a full-size drop target. **Still open on a phone**: the board
  starts ~460px down and a nested scroller that far down fights the page scroll.
- **The 640–767px double chip row.** `railOwnsFilters` stood the bar's chips down
  at `md`, but RecordList appears at `sm` — so an iPad drew both. It is `sm` now.

**⚠️ `RecordList` drew rows with no name in them on a phone, and had all along.**
`gridFor()` listed every column's width at every width, but `hideBelow` hides a
cell with `display: none`. Two things then went wrong at once: the hidden
column's TRACK survives (People's hidden Manager 150px + Portal 86px ate 236px of
a 344px row, squeezing Name — a `minmax(0,1fr)` — to ZERO), and a `display:none`
element is not a grid item, so auto-placement shifted every later column up a
track (the open-task count landed in the manager's column). The People directory
in Compact was a list of bare numbers with no names. `gridFor` now publishes four
templates as custom properties and `[data-list-grid]` in globals.css picks one per
breakpoint. **At `lg` the template is identical to the old one, so the desktop is
untouched** — and Documents, Assets, Vendors and Commitments all get the fix.

## Round 5 (19 Aug) — the launcher again, and what the owner said about it

The round-3 fix above never reached master, so the owner met the 1390px menu in an
812px screen again. Rebuilt on the merged line, and then reshaped on his reading of
it:

- It is the kit's **`BottomSheet`** now, not a hand-rolled header/middle/footer
  inside a Radix dialog. Same shape, one implementation, and it brings
  drag-to-dismiss and the safe-area padding with it.
- **Pinned and Recent are no longer chip rows.** He said it plainly: they repeat
  pages that sit a short scroll below them. They are sections of the SAME list now
  — pinned first, recent next, the four nav groups after — and a page promoted into
  one is REMOVED from its group, so every destination appears exactly once.
- **Two columns.** 23 single-file rows is two and a half phone screens; 1302px of
  scrolling became 808px. Labels wrap rather than truncate so "Assets, Tools &
  Vendors" survives in a half-width tile.
- Tapping the icon again closes it, and a tap cancels the pending hover-open.

⚠️ **Every `border-<colour>` utility in the app is inert** — `globals.css:187` has an
unlayered `* { border-color: … }` and unlayered CSS beats layered utilities. Found
while styling the launcher's tiles; recorded in `open_issues.md`. **Carry state on
background and text, not border colour.**

## `/people` — started

- **Header** now carries `data-page-header` + `data-decor` like every other page,
  so it is a title and a rule rather than a 229px rounded slab, and the mark sits
  beside the title instead of on a line of its own. Browse | Attention is a
  full-width segmented control under it on a phone. 229px → 158px.
- **Five bands of chrome became two.** Search, then Company/Type/Location, then
  Comfortable|Compact + Group + Select, then TWO wrapped rows of chips — the first
  person did not appear until 530px down. Now: search, then one scrolling chip row
  ending in a **Filters** button (`PeopleFilterSheet`, same shape as the Tasks
  sheet) with the count of pickers that are off their default. First person at
  400px.
- **`FilterChips` kept its labels.** It deliberately dropped them below `sm` and
  showed icon + count alone — eight anonymous chips, "✂ 2", "🔥 7", "🛡 30", and
  the `title` that explained each one does not exist on a touch screen. Labels at
  every width; the row scrolls instead of wrapping.
- **`FilterChips` kept its labels** at every width; the row scrolls instead of
  wrapping. It used to drop labels below `sm`, leaving eight anonymous chips.
- **The Filters button sits on the SEARCH row, not with the chips.** The chips are
  Browse-only, and down there Attention mode had no way to reach Company or Type
  at all.
- **A person's NAME wraps rather than truncates** on a phone. "Mr Gangadhar
  Mathankar" needed 177px and had 176, so it read "Mr Gangadhar Mathan…".
- **The company is dropped from a card's meta line when the list is grouped BY
  company** (`hideCompany`, the same convention the Tasks list already uses). Every
  card was repeating the name written across the top of its own housing, and on a
  phone that repetition is what pushed the ROLE into an ellipsis.
- **The bulk bar is a full-width bar on a phone, not a pill.** Count + three
  buttons come to ~445px; inside a 375px pill the label was crushed into a 43px
  column four lines tall — "2 / selected / · 2 with / portal".
- **A person's Tasks tab** put code · title · company · status on one line. The
  company and status are `shrink-0`, so the TITLE was the only thing that could
  give — "TBS and B…", "Dormat Co…" — while "Furaha Innovation Ltd" sat there in
  full. Title on its own line, company + status underneath.
- Group housings on People have NO height cap, so none of the Tasks-style card
  slicing. Attention mode reads well as-is.

**Still to look at on `/people`**: the Documents and Notes tabs on the record, and
the Edit form — its 2-column grid gives each field ~155px at 375px, so a long
value shows as "TRA and Governme…". Editable, not broken; worth a decision.

⚠️ **Screenshot workflow note.** The Browser pane crops ~20% off the right of the
emulated viewport, so a 375px capture only showed ~300px and looked "zoomed". The
way round it: `document.body.style.transform = "scale(0.78)"` with
`transformOrigin: "top left"` before capturing — layout still computes at 375 CSS,
only the painting shrinks. ⚠️ Remove it before measuring (rects come back scaled)
and remember it makes `position: fixed` resolve against the body, so floating bars
appear inline in the shot.

## Round 4 — the owner's corrections

**⚠️ The hero cards are cards again, and `data-page-header` is OFF the Tasks and
People headers ON PURPOSE. Do not put it back.**

Round 2 read "text feels too tight to the borders" as "this should not be a card"
and made both headers flat. Wrong call — he wanted the card, just not the text
jammed against its edge. The real story: `section[data-page-header]` is Desk's
"a title and a rule, not a card" contract and it forces `background: transparent`
AND `padding: 0 0 10px`; these two headers are the ONLY ones in the app carrying
`.glass elevated rounded-3xl p-4 sm:p-5`, so the contract and the card fought, and
in dark mode `.dark .glass` painted the surface anyway — a card with zero side
padding. Removing the attribute lets the card's own `p-4 sm:p-5` apply and the
argument ends. Every other `data-page-header` in the app (`PageHeader`, `Hero`,
the portal heroes) has no surface classes, so the contract still means what it
says there.

**Chip rows were having their top edge shaved off.** A chip's border is a `ring`,
which is a BOX-SHADOW — it paints outside the element's box, and a scroller with
`overflow-x: auto` clips it. The rows had `pb-0.5` and no top padding, so every
chip lost its upper border and the row read as mis-aligned against the search box.
`py-1` on both (Tasks and `FilterChips`).

**Controls that were too small to hit**, all given `.tap-target` (a 40px hit area
on phones only, no visual change): the group-housing collapse toggles (24px tall),
the ✕ on a secondary-manager chip in the person form (**12×12**), and "Add company"
(14px tall). Browse | Attention was 26px and is now ~34px — it is the directory's
primary switch.

⚠️ "Delete permanently" in the person's Danger zone is 18px and was LEFT that way.
A destructive action that is hard to hit by accident on a phone is a feature.

⚠️ **A JSX comment must be `{/* … */}`.** A bare `/* … */` between JSX children is
a TEXT NODE: one went out in this round and rendered the whole explanation onto the
Tasks page above the chip row. Caught by looking, not by `tsc` — it type-checks
perfectly.

## `/companies` — the hub, the drawer and the record (19 Aug)

**Hub.** The four tabs came to ~417px of labels in a 351px row, so the strip scrolled
with no scrollbar and no fade and **Roles sat off the edge as a bare icon**. Four equal
segments filling the width on a phone; icons stand down below `sm` to buy the room. The
company card was 184px tall × thirteen — mark and risk pill on one band, name on
another, a four-figure strip with every label stacked above its value on a third. Now
mark + name on one line, risk and total on the next, figures reading across: **184px →
105px, 2,400px of scrolling → 1,400px**. Risk is a dot and a word, not a pill.

**Departments · Sites · Roles.** The three row actions were **32px and one of them is
Delete, 4px from Merge** — now 40px below `sm`. Departments' meta line was three bare
icon+number pairs ("👥 2 🏢 2 ☑ 0") where Sites and Roles already say "0 work · 0 living
here" and "2 people"; it says the words on a phone now. ⚠️ **The words alone made it
worse** — the line does not truncate, so it overflowed its column and painted underneath
the action icons. It needs `flex-wrap` as well as the labels. Look at both together.

**The record's tab strip** (`RecordPage`, so this reaches every record in the app): six
tabs = 405px in a 343px column. An earlier round made it scroll rather than clip and
stopped there, which left **Org unreachable-looking and nothing to say the strip moved**.
It now scrolls the ACTIVE tab into view on load — landing on `?tab=org` from a link used
to show a strip with nothing selected, the same defect the portal nav pill had — and
`data-tab-edge` fades only the side that still has tabs on it.

**Checked and NOT defects** (measured before believing the screenshot):
- The reference lists' apparent inner scrollbar is the page's own; there is no nested
  scroller to trap the page scroll.
- The record Tasks tab's chip row overhangs its column by 16px — that is its deliberate
  `-mx-4 px-4` edge-to-edge bleed, and it is clipped before the viewport
  (`body.scrollWidth === 375`). The page does not drag sideways.
- A screenshot that looked identical after scrolling was a STALE FRAME; `scrollTop` had
  moved 1000px. Re-measure before chasing.

**All six record tabs are done.** Profile's form reads well as it was — single column,
full-width fields. Notes has a good empty state. On **Timeline**, the four stat tiles were
four-across at ~80px each ("UPDA…", "STAT…", "COMP…", "ESCA…" — four numbers with nothing
saying what they counted) and are two-across below `sm`; a thread's title was the only
shrinkable thing between a `shrink-0` code chip and a `shrink-0` event count, so it wraps
now rather than truncating. On **Tasks**, the chip row (780px in a 375px window) finally
got `.chip-scroll-fade`.

⚠️ **Do not retry giving that Timeline title its own line — three ways were tried.**
`basis-full` loses to `flex-1`'s own flex-basis; `sm:flex-1` changes nothing because with
shrink at 1 the item shrinks to fit instead of wrapping; `shrink-0` makes it overflow the
row. It needs the markup restructured and is not worth it — the title reads in full.

⚠️ **The company DRAWER disagrees with everything around it.** Tap MES Ltd: the card says
Open 30, the record page says "30 open · 49 total", the drawer says **17**. On Akasaki the
card says 10 and the drawer says **0 — "No open tasks, everything here is done."** The
drawer counts the company's own tasks; the card and page count tasks reaching it through
its people. Both defensible, not one tap apart. **Owner's decision, not a sweep fix.**

⚠️ **Data, not code: Akasaki Middle East LLC's `legal_name` is "V1 Intertrade Limited"**
(Reg 139898389) — the name of a different company in the portfolio. Akasaki's prefix is
`V1`, so it looks like a mix-up at entry. Untouched.

⚠️ **The app splash can trap the user.** Its "hard safety net" is a `setTimeout` in
`app-splash-controller.tsx`, so when the chunk carrying that controller fails to load the
overlay stays at `opacity: 1`, `z-index: 100`, `pointer-events: auto` with no way out.
Seen under memory pressure; a CSS-only fade would make it robust. Not fixed.

## ⚠️ Found, NOT fixed — they are not mobile-only

Left alone on purpose. Each is real and worth a decision from the owner.

- **The board still loses its column heading on a PHONE** — see round 3. The desk
  is fixed; the phone would need a nested scroller 460px down the page, which is
  worse than the problem.
- **Bulk-select bar is six unlabelled icons** with `title` tooltips, which a touch
  screen never shows. Same failure as the People chips had, and the same fix
  (labels) would work — it just needs the room finding.

## Not started at all

`/companies` and every tab · `/documents` · `/hrms/*` (Tax & Legal, Commitments,
Applications, Attendance, Supplies, Cleaning, Assets & Vendors) · `/calendar` ·
`/chat` · `/outbox` · `/brief` · `/insights` · `/settings` (its rail is the most
likely to be cramped) · `/approvals` · `/announcements` · `/activity` · `/notes`
and `/notes/[id]`.

**The staff portal is no longer on this list** — every page a DIRECTOR can reach was
swept on 19 Aug; see `memory/portal.md`, "Mobile sweep — 19 Aug 2026". Still unseen
there, because a director cannot reach them: the staff/HR home `/portal`, the manager
`/portal/team`, `/portal/cleaning`, and a chat thread. They need a staff or manager
login.

Home · the command palette · the bottom nav pill were passed on geometry alone by
the first attempt. **Treat them as unchecked.**

Left over on `/people` itself: the **Documents and Notes tabs** on a person record,
and the **Edit form's 2-column grid**, which gives each field ~155px at 375px so a
long job title reads "TRA and Governme…". Editable, not broken — his call.

**Method notes from the `/companies` pass, all of them mistakes worth not repeating:**
three times a "defect" was a measurement error — `.flex-wrap` matched 25 unrelated
elements including the page header; a screenshot that looked unchanged after scrolling was
a STALE FRAME (`scrollTop` had moved 1000px); and a layout claim was made from the class
list rather than the computed style. **Measure the specific rows, and check which page you
are actually on.** Also: a `{/* … */}` comment placed directly after `return (` is not a
comment — it parses as an object literal and breaks the build. That is the mirror image of
the bare `/* … */` trap already noted above.

**⚠️ Sweep against a PRODUCTION BUILD, not the dev server.** `npm run build` + `npm start`
commits **222 MB**; the dev server commits **9.2 GB** once it has walked the app, which
exhausted the machine's commit limit and produced ChunkLoadErrors, connection resets and a
stuck splash that all looked like app bugs. See the auto-memory
`dev-server-memory-pressure`. Look at everything against the build, list the defects, then
one dev session to fix them.

**Wherever you resume, the shared shells are already fixed** (`RecordList`'s grid
template, `RecordPage`'s header, `FilterChips`, `BottomSheet` filter sheets), so
every converted list and record starts from a better place than Tasks did. Look
anyway.

## Things noticed but NOT yet judged

- **38–44 visible elements at 10px** on a typical page. Defensible on a desk, small on
  a phone. A `@media (max-width: 639px)` bump of `.text-\[10px\]` to 11px would be
  surgical — but **look first** and decide whether it actually reads badly.
- **121 controls under 28px on the Tasks list.** Only the tick-box has been dealt
  with. The rest are inline meta buttons (17px) and card rows (22–26px).
- **`user-scalable=no, maximum-scale=1`** is set in the viewport meta. It stops iOS
  zooming when a small field is focused (so the many <16px inputs are safe) but it
  also **blocks pinch-to-zoom on Android**. Deliberate trade — the owner's call, left
  alone.
- The drag handle in the note editor is hover-driven and inert on touch.

## State of the code

| | |
|---|---|
| Branch | `claude/start-server-c65256` in the `notes-phase-3-preview-0cc4c6` worktree, level with `master` before the merge. **NOT pushed** |
| Committed | `2b0851a` the launcher rework, then **`b6f1b01`** merging `eefc420` (the whole sweep, rounds 1–4) into the master line |
| Merge conflicts | Two, both the same bug fixed twice: `gridFor()` in `record-list.tsx` (kept the Tailwind-utility version — the `[data-list-grid]` media queries in globals.css are the route Lightning CSS silently drops, so that block was deleted rather than left looking alive) and the launcher in `top-pill.tsx` (kept the new one) |
| Uncommitted | Nothing |
| Checks | `tsc` clean, 42 test files / 684 tests pass |
| Worktree setup | Needs its own `npm install` and a copy of `.env.local` from the main repo. ⚠️ A `node_modules` JUNCTION does not work — Turbopack rejects it ("Symlink points out of the filesystem root") |

⚠️ **The owner uses the app while you work.** A note that appears mid-session is
probably his — read a row before deleting it. One of his was destroyed this way.

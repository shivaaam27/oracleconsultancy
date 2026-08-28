# Desk — the COS Design System (flat, grey, dense; ERPNext-shaped)

**The design language is called "Desk"** — ERPNext's own word for its working
interface, because that is exactly what this borrows. When the owner says *"make
X look like the rest of the system,"* it means: build it from the rules below.
**Every new page, dialog, pop-up, panel or feature defaults to Desk — without
being asked.**

> **Replaced Aurora (liquid glass) in Stage 1 of the ERPNext redesign, Aug 2026.**
> Aurora was Apple-inspired: translucent, rounded, atmospheric. It is gone — the
> owner uses ERPNext daily and asked for COS in that shape. The old language
> survives only in git history and as *class names* (`.glass`, `.elevated`) that
> now resolve to flat surfaces, so 94 components needed no edit.
> Programme + remaining stages: `memory/erpnext_redesign_plan.md`.

## 0. Desk at a glance

Seven rules. If a screen obeys these it belongs.

1. **Flat.** No glass, no blur, no glow, no gradient, no atmospheric wash. One
   surface: a solid fill with a hairline edge.
2. **Grey page, white content.** `#f4f5f6` behind, `#ffffff` for anything you can
   read or act on. Dark mode: `#15181b` behind, `#1c2126` in front.
3. **Crisp corners.** 4px on chips and badges, 6px on controls, 8px on cards.
   **Nothing is a pill.**
4. **Dense.** 13px body text; 9px list rows (4px on Compact). Whitespace is not
   how this system breathes — the grid is.
5. **Hairlines do the separating.** A shadow means "this floats above the page"
   (menus, popovers, the nav pill) and nothing else.
6. **One blue** (`#2490ef`) for what you can act on. Colour that *means*
   something — red, amber, green, violet — is kept separate from it and used as
   text and small dots, not as blocks of fill.
7. **Every screen works the same way.** List → record → sidebar → history. The
   uniformity is the product.

### Applying Desk to a new page, dialog or panel

- Page opens with a heading and a rule: `<section data-page-header>`, with any
  figures line as `data-page-header-meta`. Never a rounded hero card.
- Content sits on `bg-bg-elev` with `border border-border` and `rounded-xl`.
- Lists: tag rows `data-list-row` and the column strip `data-list-head`, and they
  inherit the 9px/4px rhythm and the quiet uppercase header automatically.
- Fields are visible boxes — a white fill and a hairline — so you can see where
  you may type before you touch it.
- Buttons: filled blue for the primary action, hairline + white for the rest.
- Status is text and small dots, never a coloured block.
- Reach for the kit (`ui.tsx`, `surface-kit.tsx`, `BottomSheet`, `Combobox`,
  `FluidSelect`, `EntityDrawer`) before writing anything new.

### The consistency contract

Anything you build inherits, with no work on your part:

- the palette, in both themes, from ~120 token lines in `globals.css`;
- flat surfaces — `.glass`, `.vibrancy`, `.elevated`, `.nav-frost`, `.glass-menu`
  all resolve to the one surface;
- square corners — `rounded-full` is squared globally (see §3);
- the type scale — `text-xs`…`text-3xl` are ERPNext's sizes;
- the density switch — `data-density="compact"` on `<html>`, from the nav pill;
- reduced-motion and increased-contrast handling.

### ⚠️ The Command Centre home is a deliberate exception — do NOT flatten it

The rules above govern the **list and record screens**. The home page (`/`) keeps
its warmer treatment — the aurora-lit hero, the soft-tinted company heat tiles,
the rounded cards and the hover lift — because **the owner asked for it back**
(16 Aug 2026). Offered the flat grey version of home, his answer was:

> *"revert it back. i loved the way it was just that it wasnt fitting well. i want
> erpnext but modern one."*

So what home borrows from ERPNext is its **ORGANISATION**, not its paint:

1. page hero, then
2. a row of **number cards** — Open tasks · Overdue · Due today · Approvals ·
   People · Documents, every figure a door (`CommandRooms` in `command-deck.tsx`),
3. the "Now" strip (today's diary),
4. then the working panels — Needs you beside Company health,
5. then activity, controls and the engine bar.

The complaint that started it was **fit, not decoration**: `CommandWall` capped
the page at 880px and centred it, so a wide monitor showed dead grey down both
sides. Home now uses the full working width like every other screen.

**Before restyling anything on a "make it look like ERPNext" instruction, ask
whether the problem is the LAYOUT or the LOOK.** Fix the layout first and show
him. The rest of the app staying flat is settled; whether it also gets the modern
treatment back is an open question he parked as "home first, then decide".

## 1. Principles

- **Businesslike, not beautiful.** This is a tool for a working day. Nothing
  decorative earns its place.
- **Uniform beats bespoke.** A screen that behaves like the last screen is worth
  more than a screen that is cleverer than the last screen.
- **Density is respect.** More on screen means less scrolling and fewer clicks.
- **Glanceable.** Worst-first ordering, real numbers, and every number a door.
- **Calm motion.** 120–240ms, opacity and small translations only. No springs,
  no drifting blobs, no parallax. Reduced-motion is honoured everywhere.
- **Accessible by default.** Hairlines strengthen under `prefers-contrast: more`;
  focus is a 2px accent outline; hit areas stay ≥ 32px even in Compact.

## 2. Surfaces (there is only one)

| | |
|---|---|
| **Page** | `bg-bg` — the grey field everything sits on |
| **Surface** | `bg-bg-elev` + `border border-border` — cards, lists, panels, dialogs |
| **Inset** | `bg-bg-subtle` — table header strips, striping, quiet rows |
| **Floating** | surface + `--shadow-md` — menus, popovers, the nav pill only |

The old three-tier material system (glass / elevated / wash) is retired. The
class names still exist and are safe to use; they all mean "surface".

## 3. Tokens (`src/app/globals.css`)

One file, one place. Change a token and every screen changes.

```
light   page #f4f5f6   surface #ffffff   surface-alt #fafbfc
        line #e2e6e9   ink #1f272e   ink-muted #6b757d   ink-subtle #8d99a6
        accent #2490ef   accent-soft #eaf3fd
        red #d13d3d   amber #b7791f   green #2f9461

dark    page #15181b   surface #1c2126   surface-alt #20262c
        line #2c343b   ink #e7ebee   ink-muted #9aa5ae   ink-subtle #78838c
        accent #4aa3f5   accent-soft #17293b
        red #f07171   amber #dda44b   green #5cc08a

radius  4px chips · 6px controls · 8px cards
type    11 · 12.5 · 13 · 16 · 18 · 22 · 26px   (Compact drops a notch)
rows    9px padding · 4px on Compact
```

Colours are stored as bare HSL triplets (`208 19% 15%`) and consumed as
`hsl(var(--fg))`, so alpha variants (`bg-accent/10`) keep working.

**Square corners.** `rounded-full` is a hard-coded 9999px that no token can
reach, and pages carry ~250 of them, so `globals.css` squares it globally.
Exempted, deliberately: status dots and the live "ping" (small *empty* elements,
matched by an exact size token), spinners, and anything marked `data-switch`
(a toggle only reads as a toggle when it is a capsule).

## 4. CSS utilities worth knowing

- `.glass` / `.vibrancy` / `.elevated` — the one flat surface (legacy names).
- `.glass-menu` / `.nav-frost` / `.org-pop` — surface + the floating shadow.
- `data-page-header` / `-meta` — page heading and figures line.
- `data-list-row` / `data-list-head` — list rhythm and column strip.
- `data-decor` — marks a purely decorative element; it is hidden outright.
- `.bare-field` — opts a field out of the box treatment (its ROW owns the edge).
- `.slim-scroll`, `.scroll-fade-y`, `.no-scrollbar` — scroll-housing helpers.
- `.tabular` — tabular figures; use for every number in a column.

## 5. Density

Comfortable (default) and Compact, from the toggle in the nav pill and the portal
preferences. It sets `data-density` on `<html>`, so **every** screen honours it:
Compact drops the type a notch and roughly halves row padding. Build lists from
`data-list-row` and you get this free.

Whether Compact should become the default is still the owner's call.

## 6. Motion

`--dur-fast 120ms · --dur-base 160ms · --dur-slow 240ms`. Opacity and small
translations only. `Reveal` (`components/reveal.tsx`) is the one entrance
animation and honours both the OS setting and the portal's manual
`data-motion="reduced"`. Do not hand-roll `motion.*`.

## 7. The two shells (Stage 2 — use these for any list or record)

**Every list is `RecordList`** (`components/record-list.tsx`) and **every record
is `RecordPage`** (`components/record-page.tsx`). Do not hand-build either.

```tsx
<RecordList
  rows={rows} rowKey={r => r.id} onRowClick={r => open(r)}
  filters={rail}                       // left rail, grouped, with counts
  columns={[{ key, label, width, sortHref, sorted, render }]}
  selectionSlot={r => <Checkbox …/>}   // ticking raises your bulk bar
  subRow={r => …}                      // optional context line (folds in Compact)
  rowActions={r => …}                  // hover-revealed, never shifts columns
  total={all.length}                   // footer reads "N of M shown"
/>
```

Rules that come with it: **sorting and filtering are URLs, not component state**
(the server stays the source of truth and every view is a shareable link); an
empty value sorts last, never first; and a column sort runs before any group sort
so rows keep their order inside groups.

Two more things the list owns, both free once you pass the prop:

- **`listKey="task"`** turns on the **column chooser** — a Columns button that
  hides/shows columns and remembers the choice per list. The first column is
  never hideable; it is the record's identity.
- **`bulkActions={[…]}`** turns on **ticking**: a box per row, select-all in the
  header, and a bar reading "N selected" with the actions and a Clear. A screen
  that already owns its selection passes `selectionSlot` instead, which wins.

`RecordPage` is header (code · status · title · actions) → tabs → collapsible
sections in a 2-column field grid → right sidebar → activity last. **`RecordBody`**
is the same body without the header, for records that live inside a drawer;
`RecordSidebarBlock` is one titled block in the right column.

**A record is a PAGE with its own URL** (`/task/CODE`), reached through
`taskHref()`. Never link `?task=` — that is the legacy drawer path.

### Layout and navigation

- The working area uses the **full screen width**, capped at 1600px. Pages do
  NOT set their own `max-w-*` — that was the old centred-column rule and it left
  dead grey down both sides. Exceptions, deliberately narrow: `/ask`, `/brief`,
  the person pack, `/design`, `/task/new`.
- From `lg` up the **persistent left sidebar** (`desk-sidebar.tsx`) is the
  navigation: 208px, collapsible to 56px, grouped Work · Records · Registers ·
  System, built from `NAV_ROUTES`. It publishes `--desk-sidebar` on `<html>` and
  `main`'s gutter follows it. Below `lg`, the bottom pill.

Both are layout-only and know nothing about tasks or people. In Stage 3 their
props come straight from `EntityDef`, which is why they are shaped this way.

## 8. Components

Reuse before inventing: `Card`, `Surface`, `Button`, `Badge`, `Pill`, `Switch`,
`SwitchRow`, `CaretInput`/`CaretTextarea` (`ui.tsx`); `CommandWall`, `Hero`,
`Panel`, `CockpitModule`, `SectionLabel`, `TONE` (`surface-kit.tsx`);
`BottomSheet`, `Combobox`, `FluidSelect`, `EntityDrawer`, `InsightPopover`,
`ReferenceAdmin`, `PasskeyManager`, `useSwipeRow`.

### ⚠️ ONE CONTROL BOX, ONE TYPE SCALE (settled Aug 2026, measured)

**Every control in COS is the same box: `h-8` (32px) · `rounded-md` (6px) ·
`text-sm`.** A text field, `Select`, `FluidSelect`, `Combobox`, `SearchInput`,
an action button. Declared once as **`CONTROL_BOX` / `FIELD` / `FIELD_NUM` in
`ui.tsx`** — change one and you have changed them all, which is the point.

It was measured, not decided by taste. Before this rule, a single dialog held
**four control heights (26 · 28 · 32 · 36px)**, **four type sizes (11.5 · 12 ·
12.5 · 16px)** and the kit itself carried **three radii (6 · 8 · 12px)**.

**⚠️ NEVER WRITE `text-[Npx]` FOR BODY TEXT. Use `text-xs` / `text-sm` /
`text-base`.** The scale is wired to the density tokens — `--text-sm` is 12.5px
on Comfortable and 12px on Compact — so a pixel literal silently opts out of
the density system, which is why Compact was not actually denser and why no two
modules agreed on a size. **2,619 literals in fourteen distinct sizes** were
collapsed onto the scale in one sweep. 14px and up is a heading or a tile
figure, where the size is a deliberate statement, and is left alone.

**⚠️ THE TWO BUGS THIS FIXED WERE THE SAME SHAPE, and it is the one to watch
for: a container that sets no `font-size`, so anything inside it falls back to
the browser's 16px default.**
- `Combobox`'s input had no size at all — *every* typeable dropdown in COS
  rendered at 16px, a head taller than the field beside it.
- `RecordList`'s row had no size — any cell that did not set its own rendered
  at 16px, which was most cells on most lists.

Both are fixed by setting the size on the **container**, so a child inherits
the right size for free and can never leak the default again. If you build a
new list or a new field wrapper, set the type size on the wrapper.

**The exceptions, and they are narrow:**
### ⚠️ ONE SHAPE FOR A SECONDARY ACTION (28 Aug 2026, measured)

**`ACTION_BOX` / `ACTION_ICON` / `ACTION_DANGER` in `ui.tsx`.** The small buttons
inside a panel — "Add someone", "Message all in chat", "Delete task", and the
square icon buttons beside them.

They were **four different shapes side by side**. One person's row on the portal
task page carried a **green** filled WhatsApp button, a **blue** filled email
button, a **grey** filled chat button and a bare-ringed X — four treatments
inside 120px, with two blue chips above and below them. The owner's words: *"the
buttons, green button and other shapes feel different then the general system."*

- **One resting shape**: a hairline on the page's own surface. **Colour only on
  hover**, where it says what the thing will do.
- ⚠️ **A soft colour fill on an ordinary action spends the colour on nothing.**
  Desk has one blue and keeps semantic colour for meaning. Three equal actions do
  not become clearer by being three colours.
- ⚠️ **A destructive action is quiet at rest and solid only on the CONFIRM** —
  that is the single place the red is earned.
- **One primary per row, and the rest identical.** The task page's action row was
  a solid blue button, a soft-green filled one and a white outlined one — three
  treatments for three peers. Complete and Remind are the same shape now; the
  green survives on the **tick**, not as a block behind the words.
- ⚠️ **The `Switch` IS green, and that is the system's own control** — the iPhone
  toggle used everywhere. Leave it. The rule is about buttons that invented their
  own colour, not about the kit.

- A control **inside a grid row** may use `CONTROL_BOX_SM` (`h-7`, `text-xs`) —
  a hundred of them in a column need the room. It still takes a kit type size.
- An inline **add-link chip** (`+ Raw material`) is a chip, not a control: 24px,
  `text-xs`, 4px radius, per rule 3 above.

### ⚠️ AN ANCHORED MENU IS PORTALLED. ALWAYS. (settled Aug 2026, measured)

**Every pop-up menu anchored to a field goes through `useAnchoredMenu()`
(`lib/use-anchored-menu.ts`)** — `Combobox`, `PersonPicker`, `AttendeePicker`,
`DateTimeField`, `DocLinkPicker`. `FluidSelect` carries its own equivalent and
predates the hook. **Do not write another one by hand.**

The same bug was written six times, and it has TWO halves that must both be
fixed or the second one bites:

1. **Clipping.** A menu written as an `absolute` child of its field is cut off
   by ANY ancestor that scrolls or hides overflow — a bottom sheet, a drawer, a
   panel, a card. Photographed on "Start a batch": the option list ran past the
   bottom of the sheet and was chopped mid-row, so half the choices could not be
   reached. **A dropdown inside a dialog is the normal case in COS.**
2. **Stacking.** Portalling fixes the clipping and immediately puts the menu
   BEHIND the sheet, because it is now a sibling of every overlay. It needs
   `zIndex: MENU_Z` (1000) — a Tailwind `z-[60]` class was the first attempt and
   lost to the bottom sheet at `z-[91]`. The highest class-based z anywhere is
   140.

The hook also **flips the menu up when there is no room below**, clamps its
height to the space available (so it scrolls inside itself instead of running off
screen), re-places on scroll *with capture* — a sheet body is an inner scroller —
and measures with `layoutRect`, not `getBoundingClientRect`, so a browser zoom
cannot make it open over its own field.

⚠️ **AND THE OUTSIDE-CLICK TEST MUST USE `isInside()`.** The menu is no longer a
child of the field, so a naive "did the click land in my wrapper" check treats
choosing an option as clicking away and closes the list before the choice lands.

### Dropdowns — two controls, one rule (settled Aug 2026)

There is **no third option, and never a bare `<select>`.** Pick by where it sits:

| Where it sits | Use | Why |
|---|---|---|
| A fixed list **inside a form** | **`Select`** (`ui.tsx`) | Native, so it submits with FormData and gives the OS wheel picker on a phone |
| A fixed list in a **toolbar or filter** | **`FluidSelect`** | Nothing is being submitted; a portalled popover with check marks and colour `dot`s, never clipped by a scroll container |
| Anything you can **type into, or invent a new value for** | **`Combobox`** | The typeable field — ERPNext's Link field, in effect |

All three look **identical by construction** — the one control box above:
`h-8`, `text-sm`, `rounded-md`, hairline border, same hover and focus ring. A
filter dropdown beside a form dropdown beside a text field must not read as
three different products. They now share the constants in `ui.tsx`, so this is
enforced by construction rather than by everyone remembering.

**Traps:**
- `Select` renders a positioning `<div>` around the native element. A caller that
  needs `flex-1` must pass **`wrapperClassName`**, not `className`, or the row
  collapses. Not knowing this is why people kept writing raw `<select>`s.
- A `<select size={n}>` with n > 1 is a **list**, not a dropdown. Leave it native;
  the global CSS explicitly exempts it.
- There is a safety-net rule in `globals.css` that styles any stray bare
  `<select>` to match. It is a net, not the mechanism — don't rely on it.

*History: there were 36 raw `<select>` elements across 22 files, each with its
own hand-written box classes, alongside all three components. They were all
converted; the only survivor is one deliberate multi-row list on the Assets
assign dialog.*

### Print / PDF (`@media print` in `globals.css`)
The **Director Brief** prints via the browser (no PDF library): dark tokens are
re-mapped to light, chrome is hidden (`.fixed`, `.print-hidden`), `.print-only`
content is revealed, the page wrapper is flattened so content paginates, and
`.report-table` repeats its headers with `break-inside: avoid` per company.

### Typography
Inter, self-hosted via `next/font`. Neutral letter-spacing (the old look tightened
it), `text-wrap: balance` on headings and `pretty` on paragraphs.

## 9. How to extend

1. Look for an existing token, utility or component. There usually is one.
2. If you need a new colour, add a **token** — never a raw hex in a component.
3. If you need a new surface, you don't: use `bg-bg-elev` + `border-border`.
4. New list? `data-list-row` / `data-list-head`.
5. New page? `data-page-header` and the field/button rules in §0.
6. Then update this file. A rule that isn't written down doesn't survive.

## 10. The living gallery — `/design`

`src/app/design/page.tsx` renders the tokens, surfaces, controls and gestures on
one page. Use it to eyeball consistency before rolling a change across the app.
**It still demonstrates several Aurora-era ideas and needs rewriting** — that is
tracked as part of the redesign programme, not a bug.

## 11. The signals engine (the "nervous system") — `src/lib/signals.ts`

The single producer of operational signals: `gatherHomeSignals(rows, todos)`
derives the command cards, focus queue, pulse metrics and portfolio health from
the portfolio's raw state (tasks, documents, drafts, meetings, statutory
obligations, compliance scores, person packs, to-dos). **Home, the command bar,
the Director Brief and Automation must read from this one source** — do not
re-derive "what needs attention" anywhere else. It is side-effect-light (no
persistence; callers persist trend via `recordHealthPoint`). The normalized
signal shape is `Signal` (an alias of `CommandAction`: `id/title/detail/href/
actionLabel/tone/count/automationAction?`).

### Touch hygiene (learned on real iPhones)
- Long-press / swipe rows carry `select-none`; globally `.select-none` also sets
  `-webkit-touch-callout: none` + `-webkit-user-select: none` so iOS doesn't
  highlight text or pop the "Copy / Look Up" menu mid-gesture.
- `SnoozeSheet` gives presets (Tomorrow / In 3 days / Next week) plus a date
  picker; peek menus open it instead of a fixed "Snooze 1 week".
- Inbox cards swipe (right = File it, left = Dismiss) only when not editing, so
  the textarea keeps full touch.

### The phone is 375px — three rules a list must obey (swept Aug 2026)

A phone row gives a `RecordList` about **311px of grid** (375 less the page and
card padding). Everything below was a real defect found by walking the staff
portal at that width; each fix is in a shared file, so every list — admin and
portal — inherits it.

1. **A hidden column must give its TRACK back.** `hideBelow` hides the cell with
   `display:none`, and a display:none cell still leaves its grid track behind.
   `gridFor()` in `record-list.tsx` therefore writes **four templates** — base /
   sm / md / lg — as CSS variables that the `RL_GRID` utilities pick between.
   ⚠️ It is Tailwind utilities, not a class in `globals.css`: a plain
   `grid-template-columns: var(…)` rule there is silently dropped by Lightning
   CSS (verified — the rule never reached the browser).
2. **Fixed widths do not shrink, so the NAME goes first.** Task was
   `1fr + 150 + 116 + 80`; on a phone the name column resolved to **28px** and the
   list rendered as status and date with no task on it. Add up a new list's fixed
   widths: past ~200px, mark everything that is not the name and not the key
   figure `hideBelow: "sm"` (see the note at the top of `lib/entity-view.ts`).
3. **A floating row action covers the column it floats over.** `rowActions` is
   hover-revealed on a mouse and always visible on touch — floated, it sat on top
   of the right-hand column and hid every "14d overdue" on the board. Below `md`
   the same element rides **in the flow**, on the context line; from `md` up it
   goes absolute and floats as before.

## 12. Scroll housing (named pattern)

**"Scroll housing"** = wrap a scrollable list/grid in a soft bordered panel so the
cards read as a *contained* list, not loose floating tiles. When the owner says
"give this a scroll housing" / "house this", apply it. First built on the board's
Needs-you + Health columns (`components/director-board-client.tsx`).

- **Outer housing:** `rounded-3xl bg-bg-subtle/40 p-1.5 ring-1 ring-border/70`
- **Inner scroll area:** `slim-scroll scroll-fade-y max-h-[42rem] overflow-y-auto
  overscroll-contain px-1.5 py-1.5` (+ `space-y-2` for a list, or `grid
  grid-cols-2 gap-2` for tiles)
- `.scroll-fade-y` (globals.css) — masks the top/bottom edges so content fades in/out
  as it scrolls (no hard cut).
- `.slim-scroll` (globals.css) — the subtle overlay scrollbar (thumb appears on hover).
- The inner `px` padding keeps each card's ring/shadow off the clip edge (prevents
  left-edge clipping).
- ⚠️ **A housing that exists only because two columns sit side by side must
  RELEASE below that breakpoint.** Stacked on a phone it becomes a 672px scroller
  inside an 812px screen with `overscroll-contain`, so a finger inside the list
  cannot move the page. The board's two housings are `lg:max-h-[42rem]
  lg:overflow-y-auto lg:overscroll-contain` and use **`.scroll-fade-y-lg`** — the
  mask has to go with the scrolling, or the first and last row sit dimmed for
  nothing.

## 13. Board list ordering — "worst first, always" (`app/portal/(app)/board/page.tsx`)

Both board columns are ordered so the item needing attention **most** sits at the
top, and the order updates itself as the numbers change — no manual re-ordering.

- **Needs you** (the overdue/at-risk task list): overdue tasks first, and within them
  the **earliest deadline = the most days overdue leads** (then soon-due by nearest
  date). A task climbing to the highest overdue count auto-rises to the top.
- **Company health** (the heat tiles): sorted by **highest overdue count first**, then
  risk band, then most open work. So if a healthy company (e.g. PES) later gathers
  overdues, its tile automatically moves up to wherever its number ranks.

Forward rule: any new "attention" list on the board sorts by overdue-severity first,
computed from live figures — never a fixed/manual order.

### Task-list ordering (universal — `components/portal-tasks-command.tsx`)
The same worst-first principle governs the shared portal task list (Home, Tasks tab,
every role). Within each group: **Overdue = most days overdue first** (earliest
deadline), **Due soon = soonest first**, **In progress / open = most recent first**,
**Done = most recently finished**. Company-grouped view uses one mixed comparator
(overdue → soon → recent → done-last). The Home task list is wrapped in a **scroll
housing** (`houseList` prop) so a growing list scrolls in place instead of running
the page long; the full Tasks tab uses natural page scroll.

## §14 · Command Centre control language (THE standard — follow on every CC page)

Set on the Tasks page and now the CC-wide standard. When building or redesigning
ANY Command Centre surface, reuse these exactly — do not invent new button/icon
styles. (This is the CC layer on top of Desk above.)

- **Buttons are rounded-RECTANGLES, not pills** — `rounded-lg`, roomy padding
  (chips `px-3 py-1.5`; primary `px-3.5 py-2`). Never `rounded-full`. This rule
  predates the redesign and is now enforced globally in `globals.css`: even the
  segmented toggles (Comfortable|Compact, Focus|Browse), which used to be the one
  exception, are squared.
- **Icons: outline lucide only. No emoji in UI chrome.** ~13–15px in buttons,
  matching the nav-pill icon weight.
- **Filter / counting chips:** one horizontal row (`-mx-4 overflow-x-auto` on
  mobile, wraps `sm:`); each chip `rounded-lg px-3 py-1.5 text-xs font-medium
  ring-1`, count in `<b className="tabular">`; active = `bg-accent text-accent-fg
  ring-accent`; soft tone variants for danger/warn/info.
- **Dropdowns:** `FluidSelect` with `buttonClassName="rounded-lg border
  border-border bg-bg-elev px-3 py-1.5 text-xs font-medium"`. Overflow menus:
  Radix DropdownMenu, `glass glass-menu elevated rounded-2xl`, check-marked items.
- **Aligned rails:** give repeated controls fixed widths (e.g. status
  `w-[150px]`, date `w-[116px]`) so every row's controls line up in a column.
- **Housings:** `rounded-2xl ring-1 ring-border/60` with a tinted header band
  (`bg-bg-subtle/60`); collapsed = a clean slim bar; long lists cap ~5 rows with
  internal `scroll-fade-y slim-scroll`; company logos via `CompanyAvatar`.
- **Icon-badge rows** (day-sheets, overlay lists): tinted `h-8 w-8 rounded-lg`
  badge (kind colour ~14% via `color-mix`) + outline icon, title + quiet
  sublabel, optional trailing `ExternalLink`; row = `flex items-center gap-2.5
  rounded-xl bg-bg-elev px-3 py-2 ring-1 ring-border/60`.
- **Hero strip:** now a plain page header — `<section data-page-header>` (a title
  and a rule, no card), `<EYEBROW> · live` dot,
  greeting/title, avatar or segmented tabs, then a slim stats/KPI pill. Stacks
  `flex-col sm:flex-row` on mobile. **The hero NEVER carries an "add"/create
  button** — put the primary create action below (e.g. above the search,
  full-width on mobile / beside the search on desktop, via `flex flex-col-reverse
  sm:flex-row`), or in the nav-pill `+`. Keep the top card calm/informational.
- **KPI / stat pills:** render each stat as a whole unit
  (`inline-flex items-baseline gap-1.5` → bold `tabular` number + muted label) in
  a `flex flex-wrap gap-x-5 gap-y-1.5` row. NO inline `·` separators — they strand
  a leading dot when a line wraps on mobile. Keep labels short ("unacknowledged",
  not "haven't acknowledged"). Compact select labels too ("Companies"/"Types",
  not "All companies"/"All types") so filter rows fit a phone.
- **Mobile rules:** hero actions wrap to their own row via the `sm:contents`
  trick; single-column grids MUST be `grid-cols-1` (Tailwind's = `minmax(0,1fr)`)
  or content overflows and gets clipped; admin `<main>` top padding uses
  `pt-[max(1.5rem,env(safe-area-inset-top))]` for the installed-PWA notch.
- **Deadline editing:** always the portalled `components/deadline-editor.tsx`
  popover (real-date quick-picks + current-deadline strip).

Reusable CC components: `command-hero`, `command-deck` (NeedsYou / CompanyHeat /
CommandRooms), `home-control-bar`, `task-filter-bar`, `task-form-fields`,
`cards-view` (CardsView / FocusQueue), `deadline-editor`, plus shared
`FluidSelect`, `CompanyAvatar`, `useSwipeRow`. Full running log +
mockups-per-page: `memory/command_centre_unification.md`.

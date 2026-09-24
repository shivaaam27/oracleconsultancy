# Studio redesign — the plan, and where it stands

Branch **`studiotask`** (not pushed; deploys are master-only). Started 24 Sept 2026.

## What it is
The owner showed two screenshots of the Superpower health app and asked for COS
to look and work like them: a big title, two equal summary cards (dark, with
textures, rings and arcs), then full-width rows or the record. On Tasks the right
card is the **update card**: unread summary until a row is clicked, then that
task's latest update and a box to post straight away; ↗ opens the full task.

**The mockup is the specification.** Source in `design/studio-mockup/` (README
there), published canvas https://claude.ai/artifact/KtgVP9gLJr4yAcceLwJtxt
(6 pages, 32 boards). `boards/Plan.dc.html` = the 9 phases,
`boards/Coverage.dc.html` = every page and where each feature went,
`boards/FeatureMap.dc.html` = Tasks in detail.

## The rules the owner signed up to
- **One phase at a time; audit each one** — type check, tests, and look at it
  in the browser — before starting the next.
- **Every page is switched on by itself** (Settings → General → "New look",
  setting `ui.studioPages`, ids in `src/lib/studio.ts`). A page nobody switched
  on renders exactly as before. A page can only be switched on once `ready: true`.
- **Saving does not change.** New screens call the same actions/cores as today.
  One-field edits get a thin wrapper over `updateTaskCore` (a PATCH), never a
  second way of writing.
- **One database change in the whole plan:** the ☆ "pin a task to the top".

## Phases
0 Groundwork ✅ · 1 Tasks ✅ · 2 Footer navigation ✅ · 3 Home ✅ · 4 Work pages (Recurring ✅ Calendar ✅) ·
5 Records · 6 Operations · 7 System · 8 Staff portal & phone.

### Phase 0 — built 24 Sept 2026
- `src/lib/studio.ts` — page ids, phases, `ready`, parse/serialise the switch list (tested).
- `src/lib/studio-nav.ts` — the footer's page order, DERIVED from `nav.ts`, with
  longest-path matching and wrap-around (tested).
- `src/components/studio/kit.tsx` — StudioScope, StudioHeader, StudioCardRow,
  StudioCard (dark/light + textures), CardHead, BigNumber, Ring, Arc, Dot,
  StudioPill, `stBtn` button looks.
- `globals.css` — `.studio` tokens (light + dark), `st-tex-*` textures,
  `st-pop`/`st-rise`/`st-draw` animations (reduced-motion safe). **Scoped to
  `.studio`** — nothing outside a switched-on page can pick them up.
- `layout.tsx` — Geist + Geist Mono loaded as CSS variables only.
- Settings → General → **New look** card (lists what is coming, by phase).

### Phase 1 — Tasks, built 24 Sept 2026
Switch: Settings → General → New look → Tasks (`ui.studioPages` holds `tasks`).
It turns on BOTH the list (`/?tab=tasks`) and the record (`/task/CODE`).
- **Same data, new frame.** `tasks-section.tsx` computes everything once; a
  Studio branch before the old `return` renders `StudioTasks`
  (`src/components/studio/tasks/`) around the SAME body components. Board,
  Calendar, Timeline and Cards are unchanged inside the new frame.
- Top: two equal cards — `InsightsCard` (3 slides: Overview / By company / By
  person, every number a link) and `UpdateCard` (idle = unread + today's fresh
  three; picked = summary, latest update, quick post, Complete/Escalate/Remind,
  ⤢ to the full record). Picking is `StudioPickProvider` state — it does NOT
  change the URL; Esc clears it.
- Rows: `RecordList variant="studio"` (looks only — same columns engine,
  sorting, bulk, export) + `activeKey`. The task table gains a 7-day pulse and
  latest-update column in Studio only; its filter rail moves into the
  **Filters** panel (`FiltersButton`) and the lenses into the bottom
  `StudioSearchBar` (live search, 300ms, replace-not-push, typing ref).
- Record: `TaskRecord` `studio` prop — dark band (actions), light chips
  (status, priority, deadline, repeats), tabs; Conversation beside a rail
  (decision strip, people, facts, **Waiting on** = `StudioBlocker` — the first
  admin screen for `setTaskBlocker`, Repeats, links, similar). All other tabs
  reuse the existing blocks. Admin can now edit/take down an update
  (`adminEditUpdate` / `adminDeleteUpdate`).
- Switch off = byte-for-byte the old page: every change is behind `studio`.

### Phase 1, second pass — made to match the mockup (24 Sept 2026)
The owner put the mockup beside the real page: "does it look the same? no".
Compared side by side (mockup served locally — launch.json `studio-mockup`,
`#Main.dc.html`, `#Expanded.dc.html`) and closed every visible gap:
- Rows: no tick column (the box sits in the left margin, shown on hover/when
  ticked), status = dot + word (`StudioStatusCell`), tinted round faces,
  two-line latest update, deadline as coloured words, ☆ on the right. No hover
  icons. Export/Columns are two small icons at the end of the header row.
- ☆ is ONE settings row (`ui.starredTasks`, `toggleTaskStar`) — no migration.
  Starred rows lead the list (not while grouped).
- Quick-add is the list's first row (`RecordList lead`), a quiet dashed line
  that opens its chips once you are in it.
- Bottom bar: search · "Filter by company +" · All / On track / Due soon /
  Late. "On track" is new (`flag=on-track`: neither late nor due soon).
  Quiet, Unread and Done moved to the Filters panel, nothing lost.
- The record: three columns — Details (click a value; status/priority/
  deadline/waiting-on change in place, the rest open the full form), the
  conversation (`PortalConversation variant="studio"`: bubbles oldest-first,
  writing box at the foot with starter phrases; the portal is unchanged), and
  People / Share / Similar. The Desk decision box is gone in Studio.
- Studio keeps circles (`.studio .rounded-full`) and its own 12/13/14px type
  scale whatever the Desk density.
- The list keeps the owner's 2 Sept order (most recently touched first) — the
  mockup's deadline order was only its sample data.

### The task page, third pass (24 Sept 2026, owner's screenshots)
- Fits the screen: `components/studio/use-fit-frame.ts` sizes the three
  columns to the room left in the frame; each scrolls inside itself, the
  page does not. Conversation: thread scrolls, writing box pinned at the foot.
- Details edit IN PLACE (`studio/tasks/details.tsx`): every value becomes its
  own control on click. Writes go through `patchTaskField` (actions.ts) →
  `updateTaskCore` — a PATCH, audited, Undo toast. Moving the company follows
  the task to its new code. The full form is "Change several fields at once".
- `StudioChoiceMenu` (cells.tsx) is THE Studio pick-list — status, priority,
  risk, category, escalation, company all use it.
- ⚠️ Desk controls inside Studio take Studio's look by REDEFINING DESK'S
  TOKENS on `.studio`, the footer, the Go-to panel and — while a Studio page
  is showing — every direct child of <body> (that is where pop-ups portal).
  Do not fork FluidSelect/DatePopover/Combobox; they follow the tokens.
- `data-field-label` on Desk form labels lets Studio drop the capitals.
- `components/date-input.tsx`: a form date field on DatePopover — use it
  instead of `<input type="date">` anywhere.

### Create — "+ New" and the new task, BUILT (24 Sept 2026)
- Footer "+ New {word}" opens `studio/quick-add.tsx`: one card, a tab per
  `creatables()` entry, opening on the tab that fits the page. The Task tab
  (`QuickTaskPane`) is complete; the other tabs say which phase brings their
  card and hand on to the existing form. The task pane stays MOUNTED while
  other tabs show, so a half-typed task survives.
- `/task/new` with Tasks on = `StudioNewTaskPage` (the record page as a
  draft, fits the frame). Carried over from the card via the address
  (title, companyId, assignees, deadline, priority, instructions).
- ONE writer: `createTaskStudio` → `createTaskCore`, then the instructions as
  the first update (optionally pinned), then "Also create in" copies. A
  repeat whose next turn is not today is saved as a rule (as the old form).
  The toast offers Undo (or "Send the message" when "Tell them now" is on).
- ⚠️ `@modal/(.)task/new` intercepts EVERY in-app link to /task/new and
  shows the old form as a modal. With Tasks on it renders `LoadThisPage`,
  a full load of the same address, which the interception does not catch.
- ⚠️ globals.css's unlayered `input { color; border; background }` beats
  utility classes — a light input on a dark surface needs inline style.
- ⚠️ Use the company's `code_prefix` for "Sets the code" — never the name
  (Furaha Innovation is CC).

### Phase 3 — Home, built 24 Sept 2026
Switch: Settings → New look → Home. `_hub/studio-home.tsx` (server: every
figure, from `getAllTasks`, with Tasks' own meaning of late/due soon) +
`components/studio/home/studio-home.tsx` (layout only). Fits the frame.
- Hero: a bar per open task (quiet → moving → due soon → late, most late at
  the far right), height by priority; each bar opens its task (back = Home).
  Live announcements ride in the hero line (the old banner is gone).
- Due card: Today (tasks + today's diary) / This week.
- Three turning cards (‹ ›, dots, swipe, ←/→): Tasks (late · waiting on
  someone · no updates yet), People (team load gauge · who carries most ·
  finished this month), Companies & the day (health · where the work is ·
  Run the day · What ORI did). "Send the Director Brief" asks twice — it
  reaches people outside COS.
- NOT carried over (reachable elsewhere): the ask bar (⌘K), the number
  cards for people/documents (Go to), the activity feed (Activity log),
  the controls panel (Settings).
- The "+ New" card went DARK and dotted (owner: the white one "feels not
  part of the newer design system"); "Keep open" became "Create and add
  another" (also Ctrl+Enter). QuickAdd board updated to match.

### Home finished, Ask and Notifications redesigned (24 Sept 2026)
- Home's leftovers are slides now: Tasks → "Latest activity"; People →
  "Team today" (leave, approvals, birthdays) and "Documents" (expiring soon
  first, then most recently expired); Companies & the day → "Controls held"
  (automations, director outreach, AI, email — the same actions, optimistic,
  rolled back on failure). Controls/Run-the-day scroll inside their card.
- ASK (mockup board Ask): the ⌘K palette with `studio` on the provider
  (layout passes `studioShell`) — a dark dotted sheet rising from the footer,
  big input, "Search · Ask · Do" tag that reads the typing, "Try asking"
  cards (STUDIO_PROMPTS) beside Recent/Quick actions when empty. The engine
  (search, ORI, commands, preview) is untouched. Footer: "Ask or search ⌘K".
- NOTIFICATIONS (mockup board Notifications): `NotificationBell
  variant="studio"` renders `studio/notifications-panel.tsx` — same rows,
  polling and actions; dark panel, Needs you / Activity, filter chips, ORI's
  digests folded into one row, per-row Open · Reply (task conversation) ·
  Mark read · Dismiss. No Snooze: /api/notifications/act only serves portal
  people, so the admin panel shows only what works.
- ⚠️ `.studio { color: var(--st-ink) }` is UNLAYERED — a dark surface that
  carries the `studio` class needs an inline `color`, or inherited text is
  drawn dark on dark (every name in the notification panel was invisible).
- ⚠️ Python heredocs: `` inside a normal string became a BACKSPACE byte
  in a regex. Write JS regexes with the Write tool, or check with `od -c`.

### Create & edit — the pattern (designed 24 Sept 2026)
Boards QuickAdd / NewTask / CreateEdit on the canvas (Tasks & Home page).
The pattern: ONE "+ New" card with a tab per record (Task, Note, Event,
Person, Document, Company, Announcement) asking only the essentials; "Open
the full …" turns it into the record page itself as an unsaved draft — adding
and editing are one screen; editing is always in place. Each record type gets
it in its own phase (Task in 1, Note/Event/Announcement in 4, Person/Company/
Document/Asset in 5, registers in 6). Awaiting the owner's yes before building.

### Phase 2 — footer navigation, built 24 Sept 2026
Switch: Settings → New look → Footer navigation (`nav`). Replaces the desk
sidebar AND the floating pill, on every admin page (the portal and sign-in
screens are untouched — HideOnPortal).
- `components/studio/shell.tsx` + `shell-server.tsx`: the frame, the footer
  (next deadline · Home · ‹ page › · Settings · ⌘K · bell · + New) and the
  Go-to panel (every page, grouped, type to filter, Enter goes).
- ⚠️ THE PANEL IS AN ILLUSION. The document still scrolls; a fixed,
  click-through ring with a 100vmax dark box-shadow paints everything outside
  a rounded rectangle. Making `main` a scroll box would break every "back to
  where you were" in COS (they read window.scrollY).
- Everything keys off `body:has([data-studio-frame])` in globals.css: page
  colour, main's padding, `--page-foot` / `--page-top`, and sticky bars
  (`data-sticky-top`, `data-sticky-foot`, `data-savebar`) clearing the frame.
- ⚠️ `scrollbar-gutter: stable` is now on `<html>` too: since `overflow-x:
  clip`, the VIEWPORT scrolls, not body, so the old body-only gutter no longer
  reserved anything.
- `CreateMenu variant="footer"` opens upwards; `NotificationBell` takes a
  `triggerClassName`.

## Also on this branch
- `9957091d` — the Companies hub / company page / drawer counted a task under
  every company its PEOPLE work for (Jitesh, Shivam, Pulin are in 8–12 each), so
  V1 showed 59 open instead of 11. Now `src/lib/company-kpis.ts` counts a task
  once, under its filed company. Independent of the redesign — can go to master alone.

## Traps met so far
- ⚠️ **"WHITE BORDERS" = globals.css's `* { border-color: hsl(var(--border)) }`.**
  It is UNLAYERED, so it beats every Tailwind border-colour utility (they live
  in @layer utilities) — across all of COS, `border-[#…]`/`border-accent/30`
  quietly draw Desk grey. Studio surfaces (`.studio`, `[data-studio-foot]`,
  `[data-studio-goto]`) are now excluded from it and get a layered default
  instead. Left alone for Desk on purpose (changing it re-colours every page).
  A Studio pop-over portalled to <body> must carry `studio` or one of those
  attributes, or its borders go grey.
- ⚠️ **The dev server sometimes misses a file edit** (seen after a production
  build in the same session): the served CSS stayed old even after a restart.
  Check the served stylesheet for your new selector before believing a visual;
  a fresh append to the file woke the watcher.
- ⚠️ **`position: sticky` never worked anywhere in COS** until Phase 1:
  `overflow-x: hidden` on `body` makes body a scroll box that never scrolls, so
  sticky stuck to body, not the screen. Now `overflow-x: clip` (globals.css).
  This also brought the Settings save bar and the bulk-select bar back to life.
- Below `lg` the old floating nav pill owns the foot of the screen — anything
  sticky at the bottom must ride above it (~4.75rem) until Phase 2 replaces it.
- The pane forces a light render: use `resize_window colorScheme: dark` to see
  dark mode, not just the `.dark` class.
- The Browser pane returns **blank screenshots when the pane is hidden** — check
  `tabs_context`; read the page text instead, or ask the owner to show the pane.
- The admin side needs the owner's sign-in on localhost too; ask, never type it.

## Search and notifications follow the theme; reply from a notification (24 Sept 2026)

- **`.st-sheet` is the theme-following sheet** (`globals.css`): `--sh-bg/fg/sub/muted/
  field/field-line/card/hover/line/chip-line/on-bg/on-fg/pink-*` with a light set and a
  `.dark .st-sheet` set, plus `.st-sheet-dots`. The Ask/search palette and the
  notifications panel use it — they were fixed dark before. **The quick-add card and the
  Go-to panel are still fixed dark** (not asked yet).
- **Search results (Studio only, Desk unchanged)**: a chip per kind found, with counts
  (All · Tasks · People · Documents …). "All" shows each group capped to its best 4
  (documents 3) with "Show all N →", laid out two to a row (`.st-results-grid`, groups
  marked `data-half`); a chip shows one kind in full. Answers, Create and the page lists
  appear only under All. Typing again resets to All. Group titles are quiet
  sentence-case, not uppercase bands; the top match is a plain card, not teal.
- **Notifications: Open / Mark read / Dismiss are real** (`/api/notifications`
  `read`/`dismiss`). **Reply now posts in place**: `replyToTaskByCode()` in
  `task/actions.ts` → `addTaskUpdateCore` (admin-gated), so it lands on the task's
  conversation like any update. Enter posts, Shift+Enter new line, Esc cancels.

## Search stripped down; every footer sheet follows the theme (24 Sept 2026)

The owner: search "is getting complicated and a lot … strip it down so search
acts as search of the whole system but smarter without opening so many things".
- **Studio search is its own component now**: `src/components/studio/search.tsx`
  (`StudioSearch`). It only RENDERS — the one `/api/search` call, recent pages
  and the ORI hand-off stay in `CommandPaletteProvider`, which renders it when
  `studio` is set. The Desk palette is untouched (its Studio branches removed).
- Empty: 4 recent tasks, 4 recent/pinned pages, 3 ORI questions. Typing: ONE
  ranked list of 8 (a strong person/company match leads, then pages named, then
  tasks and records by score; max 4 of a kind), a quiet row of kinds with counts
  (Tab / Shift+Tab steps through them), and "Ask ORI" last — FIRST when the text
  reads as a question or instruction. No preview pane, hero card, match badges,
  history switch, Create group or page directory.
- `cmdk` runs with `shouldFilter={false}`: the server already filtered, and
  cmdk's own filter was hiding task rows whose title didn't contain the words
  (a task found by its assignee) — the empty "Tasks" group in his screenshot.
- A hairline runs under the box while the server looks (`searching` state in
  the provider); the last results stay put so nothing jumps.
- Studio skips the Desk-only extras on open: the GSAP stagger, `/api/pulse`,
  `/api/ai-usage` and the per-hover `/api/entity-glance`.
- **Quick add ("+ New") and the Go-to panel follow the theme too** (`.st-sheet`).
  `.st-dark-chip` reads `var(--sh-fg, #F2F2F0)`, so it still works on the new
  task page's dark band, which is a PAGE element and stays dark on purpose.

## Phase 4 — Recurring, built 24 Sept 2026

- `/task/recurring` renders `StudioRecurring` (`src/components/studio/recurring/`)
  when the `recurring` switch is on. Restyled, not rewired: the same four actions
  in `task/recurring-actions.ts`, the same `RecurringTaskSheet`.
- Cards: **This week** (rule count, "All live"/"N switched off", a bar per day
  Mon–Sun of how many live rules make a task that day, today in white) and
  **Next up** (soonest runs; one title on one day across companies folds into
  "× N companies"). Click a row → the right card becomes that rule (Edit,
  Switch off, Remove — the phone's only Remove, as the row's bin hides below sm).
- **`nextOccurrences()`** in `lib/recurring-task-rules.ts` (tested) is built on
  `occursToday`, the function the job itself asks, and skips today once
  `lastFiredAt` is at/after today's 09:00 — so the page can't promise a day the
  job won't act on. The list sorts by it; switched-off rules sink.
- Company and All/Weekly/Monthly go through `useUrlFilters` (`company`, `repeats`).
- Remove asks twice (the bin turns red: "press again").
- **`StudioSheet`** (`src/components/studio/sheet.tsx`) is THE pop-up for a form
  on a Studio page — the quick-add card's look (`.st-sheet`, from the footer,
  Esc/click-outside). `RecurringTaskSheet` takes `studio` to use it; the portal
  keeps BottomSheet. Reuse it for Announcements/Events/Outbox forms.

## Phase 4 — Calendar, built 24 Sept 2026

- `CalendarBoard` takes `studio` (page reads the `calendar` switch). ONE
  component, two frames: every hook, filter, view, the EventForm and every save
  are shared; `if (studio) return …` sits after the last hook.
- Header: Companies · Types (StudioMenu, via `url.hrefFor` — still `co`/`type`
  in the address) · More (search, source, need invites, meetings only, hide
  repeats, manage categories) | Agenda/Month/Week/Day · ‹ period › Today ·
  + New event. Studio opens on **Month** (the mockup); Desk keeps Agenda.
- Cards: **Today** (events then layer items, time in a mono box, Finished/On
  now) and **Next 7 days** (count of events + layer items, a bar per day,
  today white; a bar opens that day).
- Month and Week have a Studio look (`studio` prop): day tiles, today a black
  disc, `StudioEventChip`/`StudioOverlayChip`. `STUDIO_LAYER` holds the mockup's
  layer colours (Desk's OVERLAY_META tones collapse to ink inside `.studio`).
  Agenda/Day and the phone month are the Desk components on Studio tokens.
- Rail: Layers legend (Events + each layer, click toggles) and the live
  announcement (dark card, ack bar, Manage →). The Events/Announcements tab is
  gone in Studio — Announcements gets its own Studio page.

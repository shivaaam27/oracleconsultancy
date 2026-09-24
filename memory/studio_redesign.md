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
0 Groundwork ✅ · 1 Tasks ✅ · 2 Footer navigation · 3 Home · 4 Work pages ·
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

## Also on this branch
- `9957091d` — the Companies hub / company page / drawer counted a task under
  every company its PEOPLE work for (Jitesh, Shivam, Pulin are in 8–12 each), so
  V1 showed 59 open instead of 11. Now `src/lib/company-kpis.ts` counts a task
  once, under its filed company. Independent of the redesign — can go to master alone.

## Traps met so far
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

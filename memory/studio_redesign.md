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
0 Groundwork ✅ · 1 Tasks · 2 Footer navigation · 3 Home · 4 Work pages ·
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

## Also on this branch
- `9957091d` — the Companies hub / company page / drawer counted a task under
  every company its PEOPLE work for (Jitesh, Shivam, Pulin are in 8–12 each), so
  V1 showed 59 open instead of 11. Now `src/lib/company-kpis.ts` counts a task
  once, under its filed company. Independent of the redesign — can go to master alone.

## Traps met so far
- The Browser pane returns **blank screenshots when the pane is hidden** — check
  `tabs_context`; read the page text instead, or ask the owner to show the pane.
- The admin side needs the owner's sign-in on localhost too; ask, never type it.

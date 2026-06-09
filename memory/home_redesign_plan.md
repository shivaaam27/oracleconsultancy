# Home page redesign — "Mission Control" (BUILT 2026-06-10)

STATUS: Built, verified in preview, pushed. New component
`src/components/home-mission-control.tsx` (client) replaces the old
`home-intelligence.tsx` (deleted). `cos-home.tsx` now builds a unified `QueueItem[]`
with `group` tags + `CompanyGauge[]` + overall `health`. NeedsAttentionPanel dropped from
Home (still used by /documents). Recent movement feed removed. Aurora keyframes
(`aurora-a`/`aurora-b`) added to globals.css. Both gauge variants shipped behind an
Overall / By company toggle for the owner to choose later.

---
# (original plan below)


Owner is non-technical. Goal: the Home page (`/`) is too long, messy, repetitive, and
worsens on mobile. Redesign it to be shorter, calmer to scan, and visually **futuristic**
while matching the new pop-up / drawer design language (`drawer-kit.tsx`, `glass`/`elevated`).

Decisions locked with owner (2026-06-10):
- **Vibe: Full futuristic** — animated gradient mesh, glowing tone edges, motion, a
  "portfolio health" gauge centrepiece. Must stay readable; respect `prefers-reduced-motion`.
- **Scope: Plan first, no code yet** — review this doc before building.

## Current state (the problem)
`src/app/page.tsx` → `CosHome` (`src/app/_hub/cos-home.tsx`) stacks 3 heavy blocks:
1. `HomeActions`
2. `NeedsAttentionPanel` (`src/components/needs-attention-panel.tsx`, 273 lines) — its own alert UI
3. `HomeIntelligence` (`src/components/home-intelligence.tsx`) — hero + "Today's command" +
   10-tile "Portfolio pulse" + up to 4 secondary command cards + 12-item "Focus queue" +
   7-item "Recent movement".

Root issue = **redundancy**: overdue/expiring/compliance items surface in ~4 places in 4
visual languages. On mobile every grid collapses to 1 col → ~5 screens of repeating cards.

## Target layout (consolidate ~6 zones → 4)
1. **HERO STRIP** — greeting + date + city. Pulse becomes a thin inline metric *rail*
   (horizontal-scroll on mobile), not a 10-tile grid. One slim "portfolio health %" gauge
   (reuse `ProgressTrack` from drawer-kit). Numbers tick up on load.
2. **THE ONE THING** (lead command) + **AT A GLANCE** rail beside it. NeedsAttentionPanel
   folds in here / into the queue — kill it as a separate block. + "Plan my day" button.
3. **FOCUS QUEUE** = the single hero list. Segmented filter (All · Tasks · Documents ·
   People · Statutory · Drafts) reusing the segmented toggle pattern from `/hrms/assets`.
   Secondary command cards + needs-attention items all merge into this one stream.
   Default 6 visible, "Show all" expands. This is the only long scroll.
4. **FOOTER** — pulse extras + Recent movement, collapsed by default.

**Principle: one signal, one place.** Each fact (an overdue task, an expiring doc) appears
exactly once at one altitude.

## Futuristic skin (reuse owned primitives — don't reinvent)
- Aurora hero: lean into existing radial-blur glows in `home-intelligence.tsx`; add a slow
  drifting gradient mesh (framer-motion, reduced-motion safe).
- Live ticker numbers (animate counts on mount).
- Glass depth tiers: hero = `glass elevated`; queue rows = flat `bg-bg-elev` → real hierarchy
  instead of "everything is a card" flatness.
- Tone as a quiet left-edge accent bar on rows, not a full coloured icon chip everywhere.
- Time-aware hero gradient/greeting shifts warm→cool by hour (already compute `greeting(h)`).

## Mobile
- Metric rail swipes horizontally (no stacking).
- "The One Thing" + "At a glance" = swipeable card pair.
- Footer collapsed behind a tap.
- Target: ~5 screens → ~1.5 before the Focus Queue.

## Build approach (when approved)
- Data assembly in `cos-home.tsx` largely reusable; main work is a new presentational
  component (replace/refactor `home-intelligence.tsx`) + retiring `NeedsAttentionPanel` as a
  standalone block (fold its derivations into the unified queue).
- Verify with `npm exec tsc -- --noEmit`; check mobile + desktop in preview.

## Owner decisions (2026-06-10)
- **Drop "Recent movement" feed** entirely — remove from Home (rarely actioned, adds length).
- **Health gauge: build BOTH** a single overall portfolio % gauge AND per-company mini-gauges,
  so owner can compare in the real UI and pick one later. Keep both behind a simple toggle or
  show both initially; do not delete either until owner decides.

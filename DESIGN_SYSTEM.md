# Aurora — the COS Design System (liquid glass, web, Apple-inspired)

**The design language is called "Aurora."** When the owner says *"make X Aurora"* /
*"this popup should be Aurora"* / *"redesign the documents page in Aurora,"* it means:
build it from the Aurora kit below so it looks and behaves like the rest of the system.
**Every new page, dialog, pop-up, search surface, panel or feature defaults to Aurora —
without being asked.** (Mirrored as a standing rule in `CLAUDE.md`.)

A living reference for the COS visual + interaction system. It is **Apple-inspired,
not a clone**: we follow Apple's *rules* (architecture + accessibility) and rebuild
the *behaviour* with web tech (CSS `backdrop-filter`, layered materials, framer-motion).
True iOS 26 `glassEffect` APIs don't exist on the web, so this is a faithful
approximation that works cross-browser **including iPhone Safari**.

Keep this file updated whenever the system changes — it's how we keep improving.

---

## 0. Aurora at a glance

**In one breath:** liquid-glass surfaces · one cool-blue accent · **centred, never
edge-to-edge** · **no hard boxes** (soft panels + hairlines + whitespace) · iPhone-style
toggles · concentric radius ladder · calm, reduced-motion-safe motion · quietly **alive**
(heartbeat, count-ups, world-accent tints) · glanceable; every number is a door; observe + act.

### The Aurora kit — reuse, never reinvent
- **Layout:** `CommandWall` (centred max-width column; reserved side rails) wraps a
  screen; `Hero` (aurora-washed header); `Panel` / **`CockpitModule`** for every section
  (soft, no hard border); `Reveal` for staggered entrance.
- **Controls:** `Button` (Apple-like press/rim), the shared **`Switch`** (iPhone toggle,
  `ui.tsx`), `FluidSelect` / `Combobox`, `SearchField`.
- **Status + data:** the `TONE` map (6 tones: danger/warn/success/accent/info/muted),
  `Badge` / `Pill` / `TrendChip` / `Stat`, `InsightPopover` for hover detail. Status shows
  as small dots / text, **never loud coloured blocks**.
- **Overlays:** `EntityDrawer` (hero + tab-morph + sticky actions) for any drawer/inspector;
  glass dialogs (Radix + `.glass .glass-menu elevated rounded-3xl`, `popIn`, centred).
- **Per-domain colour:** the 7 world accents (`lib/worlds.ts`) tint world surfaces + the pill.
- **Alive (use sparingly, always meaningful):** `CockpitLive` heartbeat, count-ups, live
  activity feed, world-accent tints. Never looping/busy.

### Applying Aurora to a new …
- **Page** → wrap in `CommandWall`; lead with a `Hero`; sections as `CockpitModule`s in a
  single calm column; `Reveal`-stagger; British-English copy; `force-dynamic` if live.
- **Pop-up / dialog** → Radix Dialog with `.glass glass-menu elevated rounded-3xl`, centred,
  `popIn`; quiet title + close; content as soft rows, not nested boxes.
- **Search** → `SearchField` / the ⌘K palette language; results as soft rows with TONE dots.
- **Toggle / control** → the shared `Switch`; status as dots/text.
- **List / directory page** → the canonical rhythm is **stat strip → search + filter chips
  → rows → drawer**. Use the shared pieces, do not re-roll them:
  - `StatStrip` (`ui.tsx`) — glanceable header metrics (2 cols mobile, one row from `sm`).
    Built on `Stat` (tinted icon tile + tone-coloured number).
  - `FilterChips` (`filter-chips.tsx`) — status filters that **collapse to icon + count on
    mobile** (the active chip keeps its label) and show full labels from `sm` up. Every chip
    needs a self-explanatory icon + `title`/`aria-label`.
  - `EntityCard` (`entity-card.tsx`) — the floating glass list-row shell: brand-tinted left
    rail, hover-to-accent ring, selectable state, full pointer/keyboard activation. Compose
    row content as children (leading slot · `min-w-0 flex-1` body · trailing meta). People's
    directory (`person-card.tsx`) is the reference implementation.
- **Never** → hard-bordered box-soup, loud colour fills, edge-to-edge width, a bespoke
  one-off when a kit piece exists, or motion that ignores reduced-motion.

### The consistency contract (what you can rely on across every page)
Pages differ in their middles — that's fine. These never vary, and that's what makes the
app feel like one system:
1. **Frame** — centred max-width column + `PageHeader` (title · sub · action) + the single
   nav pill. Same margins, same header, same place the `+` lives.
2. **Tokens only, one accent** — colours/spacing/radius come from `globals.css`; never a
   hardcoded hex (only exception: company brand rails). One cool-blue accent. Status as
   dots/small text, never blocks.
3. **Reuse the kit** — before building a row, chip, stat, drawer, toggle or dialog, check
   for the kit piece above. A one-off is only justified when no piece fits — and then it
   should become a new kit piece, not stay local.

The rest of this file is the detailed reference behind the kit.

---

## 1. Principles (from Apple's HIG / Liquid Glass guidance)

1. **Glass is for the navigation/overlay layer only** — never on content (tables,
   cards, lists, media). Content stays solid; glass floats above it.
2. **No glass-on-glass.**
3. **Tint = call-to-action**, not decoration. One confident accent.
4. **Gentle blur** — clarity + translucency, not heavy frost. Content reads through.
5. **Concentric corners** — nested shapes step down in radius.
6. **Accessibility is non-negotiable** — honour Reduce Transparency / Increase
   Contrast / Reduce Motion; never override them.
7. **Motion rests in steady states** — spring transitions, press feedback, morphs;
   no looping animation.

---

## 2. The three tiers

| Tier | What | Treatment | Examples |
|---|---|---|---|
| **1 — Glass chrome** | Floating navigation/overlays | `.glass` (frosted + specular + depth; `.glass-refract` on Chromium) | Command palette, task inspector, capture wizard, bottom pill, Assist menu, sheets, mobile sidebar |
| **2 — Solid content** | Data surfaces | `.elevated` (lit rim + soft shadow, **no blur**), `rounded-xl` (12px) | Cards, tables, list rows, stats |
| **3 — Atmospheric wash** | Header colour/light | `.wash-accent` (subtle accent gradient behind content) | COS Home hero |

---

## 3. Tokens (`src/app/globals.css`)

**Colour** (light + dark, adaptive):
- Accent: cool professional blue (`--accent`, light `214 88% 52%`, dark `213 94% 62%`).
- Semantic: `--success / --warn / --danger / --info` (+ `-soft`).
- Surfaces: `--bg / --bg-elev / --bg-subtle / --bg-muted`.

**Glass material:**
- `--glass-tint` (light `…/0.44`, dark `…/0.55`) — translucent fill, readable.
- `--glass-border`, `--glass-rim` (specular top highlight).
- `--blur-sm 6 / --blur-md 9 / --blur-lg 16` (gentle).

**Radius (concentric ladder):** `--radius-sm 6 · md 8 · lg 10 · xl 12 · 2xl 16`.
Panels/sheets = 16 → cards/tables = 12 → controls = 10/8.

**Motion:** `--ease-spring`, `--ease-out`, `--dur-fast/base/slow`. JS presets in
`src/lib/motion.ts` (`spring`, `springSoft`, `springSnappy`, `easeOut`, `fadeUp`, `popIn`).

---

## 4. CSS utilities

- `.glass` — layered glass material (Tier 1). Sheen is a layered background
  gradient (works on fixed/sticky/static; never overrides `position`).
- `.glass-refract` — adds Chromium-only SVG edge refraction when `html[data-refract="1"]`.
- `.elevated` — Tier-2 lit rim + soft depth (no frost).
- `.wash-accent` — Tier-3 accent header wash.
- `.btn-primary-rim` / `.btn-rim` — control highlight materials.
- `svg.lucide { stroke-width: 1.75 }` — lighter, SF-Symbols-like icons.

**Accessibility media queries (mandatory):**
- `@media (prefers-reduced-transparency: reduce)` → all glass becomes opaque, no blur.
- `@media (prefers-contrast: more)` → stronger borders + text.
- `@media (prefers-reduced-motion)` → transitions neutralised (+ `<MotionConfig reducedMotion="user">`).

---

## 5. Components (where each is used)

| Component | File | Purpose / used by |
|---|---|---|
| `Button` / `LinkButton` / `IconButton` | `components/ui.tsx` | All buttons. Press compression, focus ring, `loading`, rim materials. |
| `Card`, `Surface`, `TableShell`, `Badge`, `Stat`, `PageHeader`, `EmptyState`, `SearchInput`, inputs | `components/ui.tsx` | Tier-2 content surfaces + form bits. **`SearchInput`** = leading magnifier + system border/bg + accent focus ring (use for page search bars). |
| `Segmented`, `Pill`, `SearchField`, `Toolbar`, `ListRow`, `Sheet` | `components/macos.tsx` | macOS primitives. Segmented has a `layoutId` morph indicator. |
| `TopPill` / `NavLens` / `HrmsLauncher` | `components/top-pill.tsx` | The single bottom nav pill (all breakpoints). Tabs: Home · Director Brief · Task Management · Workbook · **HRMS** + page-action `+` · Search · Theme. **`HrmsLauncher`** = the HRMS icon opens a centred "Go to" dashboard (Radix Dialog) of all secondary destinations (replaced the old "More" sheet + per-tab popovers). Draggable liquid-glass lens. |
| `LiquidGlassDefs` | `components/liquid-glass.tsx` | Squircle displacement map + SVG filters (`#cos-liquid-glass` backdrop, `#cos-lens-refract` element); flips `data-refract` on Chromium. |
| `SwipeRow` | `components/swipe-row.tsx` | iOS swipe actions (configurable). Used by `AttentionList`. |
| `PeekPreview` + `useLongPress` | `components/peek-preview.tsx`, `lib/use-long-press.ts` | Long-press peek & pop. Used by the Tasks table; reusable for People/Notes/Meetings. |
| `WelcomeHero` | `components/welcome-hero.tsx` | COS Home Tier-3 wash header + inline KPIs. |
| **`EntityDrawer`** | `components/entity-drawer.tsx` | **The reusable cockpit shell** — rounded-3xl glass dialog, status-tinted hero glow, glass segmented tab pill (`layoutId` morph), all-tabs-mounted body (instant switching, active tab fades in), sticky action bar. **Adopted by person + task + company drawers.** Build every new drawer/pop-up on this. Props: `title` (sr-only Dialog.Title), `tone`, `hero`, `tabs[]`, `activeTab`/`onTabChange`, `actionBar`, `loading`/`error`. |
| **`drawer-kit`** | `components/drawer-kit.tsx` | Shared drawer primitives: `IconButton`, `ProgressTrack`, `SectionPulse`, `StatusChip`, `DrawerRow` (hover-revealed actions), `EmptyState` (celebratory all-clear), `SectionCard`, `DefGrid`, `GroupLabel`. Use these inside `EntityDrawer` tabs — don't hand-roll rows/cards. |
| **`surface-kit`** | `components/surface-kit.tsx` | Page-level surfaces: `Hero`, `Panel`, `SectionLabel`, `TrendChip`, and the `TONE`/`Tone` severity colour map (`danger/warn/accent/success/muted/info`). First adopter = Home Mission Control. Reuse `TONE` for any severity-coloured UI. |

---

## 6. Interactions

- **Swipe** (configurable in Settings → Swipe actions): Complete · Escalate · Snooze ·
  Archive · Delete · Open · Add update · Nothing. Stored in `lib/settings.ts`
  (`swipeRightAction` / `swipeLeftAction`); applied on save. All undoable.
- **Long-press peek & pop**: hold a row → preview card + quick actions; tap to open.
  Haptic fires where supported (Android); iOS Safari is a silent no-op (no Vibration API).
- **Bottom sheets**: mobile capture wizard has a grabber + drag-to-dismiss.
- **Morphing**: segmented control active pill slides (`layoutId`).

---

## 7. Honest web limits (don't regress on these)

- Native `glassEffect` / `GlassEffectContainer` don't exist on web — we approximate.
- **Real refraction is Chromium-only** (SVG `feDisplacementMap` as `backdrop-filter`);
  Safari/iPhone fall back to layered glass. Refraction must never be load-bearing.
- **Haptics**: no Vibration API on iOS Safari. **Pressure**: modern iPhones have no
  3D Touch, so "press harder" is impossible — we use press *duration* instead.

---

## 8. How to extend (the playbook)

- New overlay? Use `.glass` (+ `.glass-refract` if it floats over content). Keep it
  Tier-1 only.
- New content surface? Use `Card` / `.elevated`, `rounded-xl`, never glass.
- New control? Use `Button` / `Segmented` / `Pill`; honour the focus ring + press.
- New colour? Tint **only** primary actions (and per-company identity later).
- New gesture? Reuse `SwipeRow` / `PeekPreview` / `useLongPress`.
- Always re-test with Reduce Transparency / Contrast / Motion on.

---

## 9. The living gallery — `/design`

`src/app/design/page.tsx` (sidebar → **Design**) renders every token, surface,
control and gesture on one page: colour swatches, the three surface tiers, the
radius ladder, all button variants/sizes, badges, `FluidSelect`, and live demos
of `SwipeRow`, `PeekPreview` and `SnoozeSheet`. Use it to eyeball consistency and
try ideas before rolling them across the app. Keep it in sync when primitives change.

### Dropdowns — `FluidSelect`
`src/components/fluid-select.tsx` is the one fluid menu: a glass popover with a
spring pop-in, check-marked selection, optional colour `dot`, and outside-click /
Escape dismissal. It renders its menu in a **portal with fixed positioning**
(clamped to the viewport) so it can never be trapped behind a `glass`/transform
stacking context or clipped. `FilterSelect` wraps it to drive a URL search param
(Tasks filters); People filters and `InlineEdit` menus use the same look. Prefer
it over native `<select>` everywhere.

### Print / PDF (`@media print` in `globals.css`)
The **Director Brief** prints via the browser (no PDF library). Print rules:
re-map dark surface/text tokens to light (clean white document from any theme),
hide chrome (`.fixed`, `.print-hidden`), reveal `.print-only` content, flatten the
framer-motion page wrapper (`.page-flow { display:contents }`) so content
**paginates across pages**, and style the `.report-table` (repeating headers,
`break-inside: avoid` per company, fresh page for the detailed report). Mark
on-screen-only controls with `print-hidden`; mark PDF-only sections `print-only`.

### Typography
Base body has smoothing + tuned letter-spacing; headings use `text-wrap: balance`
and paragraphs `text-wrap: pretty` for even, orphan-free wrapping system-wide.

## 10. The signals engine (the "nervous system") — `src/lib/signals.ts`

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

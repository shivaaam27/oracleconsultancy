# COS Design System — Liquid Glass (web, Apple-inspired)

A living reference for the COS visual + interaction system. It is **Apple-inspired,
not a clone**: we follow Apple's *rules* (architecture + accessibility) and rebuild
the *behaviour* with web tech (CSS `backdrop-filter`, layered materials, framer-motion).
True iOS 26 `glassEffect` APIs don't exist on the web, so this is a faithful
approximation that works cross-browser **including iPhone Safari**.

Keep this file updated whenever the system changes — it's how we keep improving.

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
| `Card`, `Surface`, `TableShell`, `Badge`, `Stat`, `PageHeader`, `EmptyState`, inputs | `components/ui.tsx` | Tier-2 content surfaces + form bits. |
| `Segmented`, `Pill`, `SearchField`, `Toolbar`, `ListRow`, `Sheet` | `components/macos.tsx` | macOS primitives. Segmented has a `layoutId` morph indicator. |
| `Sidebar` / `SidebarContent` | `components/sidebar.tsx` | Desktop rail + (reused) mobile drawer. |
| `LiquidGlassDefs` | `components/liquid-glass.tsx` | Generates the squircle displacement map + SVG filter; flips `data-refract` on Chromium. |
| `SwipeRow` | `components/swipe-row.tsx` | iOS swipe actions (configurable). Used by `AttentionList`. |
| `PeekPreview` + `useLongPress` | `components/peek-preview.tsx`, `lib/use-long-press.ts` | Long-press peek & pop. Used by the Tasks table; reusable for People/Notes/Meetings. |
| `WelcomeHero` | `components/welcome-hero.tsx` | COS Home Tier-3 wash header + inline KPIs. |

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
Escape dismissal. `FilterSelect` wraps it to drive a URL search param (Tasks
filters); the People filters and `InlineEdit` menus use the same look. Prefer it
over native `<select>` everywhere.

### Touch hygiene (learned on real iPhones)
- Long-press / swipe rows carry `select-none`; globally `.select-none` also sets
  `-webkit-touch-callout: none` + `-webkit-user-select: none` so iOS doesn't
  highlight text or pop the "Copy / Look Up" menu mid-gesture.
- `SnoozeSheet` gives presets (Tomorrow / In 3 days / Next week) plus a date
  picker; peek menus open it instead of a fixed "Snooze 1 week".
- Inbox cards swipe (right = File it, left = Dismiss) only when not editing, so
  the textarea keeps full touch.

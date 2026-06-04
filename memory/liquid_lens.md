---
name: liquid-lens
description: "The draggable liquid-glass lens on the mobile/desktop nav pill"
metadata:
  node_type: memory
  type: project
---

# Liquid lens (nav pill)

An Apple-"Liquid Glass"-style draggable lens on the floating nav pill. Source: `NavLens` inside `src/components/top-pill.tsx`; SVG filters in `src/components/liquid-glass.tsx`.

## Behaviour

- **Drag** a glass capsule across the nav slots (Home → Task Management → Companies → Workbook → Search). It follows the finger, **squishes with velocity**, **snaps to the nearest slot** with a soft spring, and on **release navigates** to that slot (tap still navigates normally).
- The gesture only claims **deliberate horizontal drags** (>8px) via pointer-capture, so taps, the Companies long-press, the More dropdown, the action `+`, Search and Theme all keep working. Vertical/`touch-action: pan-y` lets the page scroll.
- Slot centres are measured per drag-start from `[aria-label="…"]` elements.

## Optics

- The lens is **clear, lightly-frosted glass** — nothing is painted inside (no clone/icon), so there is nothing to double up. The real icon shows softly through; a bright specular rim + a velocity-lagging glare sit on top.
- **Morph + chromatic aberration on the border**: two coloured rims (cyan / rose) separate with drag velocity and re-converge to a clean rim at rest.
- **True content refraction is Chromium-only.** `liquid-glass.tsx` generates an edge-concentrated squircle displacement map and two SVG filters: `#cos-liquid-glass` (backdrop-filter, Chromium — bends the live nav content in place) and `#cos-lens-refract` (an element `filter` with displacement + RGB channel split that also works in Safari). `data-refract="1"` is set only on Chromium. On **iOS/Safari** the live backdrop can't be SVG-displaced (WebKit limitation), so the lens reads as frosted glass + chromatic morphing border.
- Respects **Reduce Motion / Reduce Transparency** → a plain solid `bg-accent-soft` highlight, no optics.

## History / gotchas

- An earlier version painted a magnified accent icon ("loupe") and later a content clone inside the lens — both caused **icon doubling**. The current version paints nothing inside; that is intentional. Do not re-add an in-lens icon/clone without solving doubling (perfect overlap) first.
- Light-mode frost must stay **light** (white tint), not the old dark fill.

"use client";

// ─────────────────────────────────────────────────────────────────────────────
// FILL THE SCREEN — the one place that decides how tall a panel should be.
//
// The problem it solves, in the owner's words: "there is dead space, i wonder
// why". A list of three rows left two-thirds of a 1000px window as bare grey,
// and every list in COS did it, because a card is only as tall as its contents.
// ERPNext's list fills its working area; ours now does too.
//
// The temptation is a constant — `calc(100dvh - 11rem)` — and it is always
// wrong, because it is a GUESS at the height of the chrome above. The note sheet
// carried exactly that guess and was out by 140px on a desktop. So: measure.
//
// ⚠️ THREE THINGS IT GETS RIGHT, and each of them cost a bug somewhere:
//
//  1. It measures the element's own top in DOCUMENT space, so the answer is the
//     same whether or not the page happens to be scrolled. (An element's own
//     height cannot move its own top, so there is no feedback loop.)
//
//  2. It subtracts whatever comes AFTER the element inside <main> — a totals
//     strip, a second panel, a footnote. Without this, a page with anything
//     below the list pushes that content off the bottom of the window.
//     ⚠️ Measured by WALKING THE FOLLOWING SIBLINGS, not by comparing the
//     element's bottom with <main>'s. The obvious version is wrong on every
//     list in COS: the filter rail sits BESIDE the card and is usually taller,
//     so main's bottom is set by the rail and "after" came out as 103px of
//     nothing. A sibling to the left is not content below.
//
//  3. It only reclaims <main>'s bottom padding from `xl` up. Below that the
//     padding is holding the floating nav pill off the content and is NOT ours
//     to take; from `xl` the pill is gone and the padding is nothing but more
//     grey.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, type RefObject } from "react";

/**
 * How much page there is AFTER this element, up to `stop`.
 *
 * Walks up the tree adding the height of each following sibling. Deliberately
 * NOT `stop.bottom - el.bottom`: a filter rail beside the element is taller than
 * it and would be counted as content below.
 *
 * ⚠️ "FOLLOWING" IN THE MARKUP IS NOT "BELOW" ON THE SCREEN, and that cost the
 * note sheet 560px of its height. A note's links rail comes AFTER the paper in
 * the DOM but sits BESIDE it in a flex row from `xl` up, so counting it left the
 * paper 443px tall in a 1080px window with a field of grey under it — the exact
 * dead space this hook exists to remove. So each sibling is only counted if it
 * genuinely starts below this element. The same test does the right thing on a
 * narrow screen, where that rail stacks underneath and IS content below.
 */
function trailingHeight(el: HTMLElement, stop: Element | null): number {
  const box = el.getBoundingClientRect();
  // Below, or beside? A sibling laid out BESIDE this element starts level with
  // its top; one laid out BELOW starts at its bottom. The midpoint separates the
  // two cleanly, and leaves room for a below-sibling pulled up by a negative
  // margin (`-mt-1.5` and friends are common here) without mistaking a rail for
  // a footer.
  const divide = box.top + box.height / 2;
  let node: HTMLElement | null = el;
  let total = 0;
  while (node && node !== stop) {
    for (let sib = node.nextElementSibling; sib; sib = sib.nextElementSibling) {
      const r = sib.getBoundingClientRect();
      if (r.height === 0) continue;
      if (r.top >= divide) total += r.height;
    }
    node = node.parentElement;
  }
  return total;
}

/** Breathing room left under the panel once it is sized. One hairline's worth. */
const GAP = 14;
/** The width at which the floating nav pill gives way to the sidebar. */
const WIDE = "(min-width: 1280px)";

export type FillMode =
  /** A pane: it IS this tall, and it scrolls inside itself. */
  | "exact"
  /** A card: it is at LEAST this tall, and grows with its contents. */
  | "min";

export function useFillViewport(
  ref: RefObject<HTMLElement | null>,
  {
    mode = "min",
    minimum = 320,
    enabled = true,
    /** Re-measure when these change — a tab switch, a mode toggle. */
    deps = [] as unknown[],
  }: { mode?: FillMode; minimum?: number; enabled?: boolean; deps?: unknown[] } = {},
) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const clear = () => {
      el.style.height = "";
      el.style.minHeight = "";
      el.style.marginBottom = "";
    };

    if (!enabled) { clear(); return; }

    const fit = () => {
      // Measure from a clean slate: a height we set last time would otherwise be
      // counted as part of what comes after us.
      clear();

      const rect = el.getBoundingClientRect();
      const main = el.closest("main");
      const pad = main ? parseFloat(getComputedStyle(main).paddingBottom) || 0 : 0;

      // Everything after this element inside <main>. See trailingHeight above
      // for why this is not a bottom-minus-bottom subtraction.
      const trail = trailingHeight(el, main);

      const wide = window.matchMedia(WIDE).matches;
      const reclaim = wide ? Math.max(0, pad - GAP) : 0;

      const target = Math.max(
        minimum,
        window.innerHeight - rect.top - trail - (pad - reclaim),
      );

      if (reclaim > 0 && trail === 0) el.style.marginBottom = `${-reclaim}px`;
      if (mode === "exact") el.style.height = `${target}px`;
      else el.style.minHeight = `${target}px`;
    };

    fit();
    window.addEventListener("resize", fit);
    return () => {
      window.removeEventListener("resize", fit);
      clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ref, mode, minimum, enabled, ...deps]);
}

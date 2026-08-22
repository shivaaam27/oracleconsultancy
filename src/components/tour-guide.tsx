"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";
import { X } from "lucide-react";
import type { Tour, TourStep } from "@/lib/tours";
import { layoutRect, type LayoutRect } from "@/lib/zoom";

/* ═══════════════════════════════════════════════════════════════════════
 * Tour guide — Aurora-native guided walkthrough engine.
 *
 *  • Spotlight: dims the screen, cuts a glowing hole over the target element
 *    (found by its `data-tour="…"` tag), and floats a glass bubble beside it
 *    with step dots + Back / Next / Skip.
 *  • Anchoring is computed from getBoundingClientRect (no extra dependency) and
 *    re-measured on scroll/resize, so it tracks the floating, draggable nav pill.
 *  • Reduced-motion safe two ways (OS query + the portal's manual
 *    data-motion="reduced" toggle).
 *
 * TourRunner picks the first unseen tour whose `route` matches the current
 * pathname, runs it, then calls `onSeen(key, version)` so it is never shown
 * again. Definitions come from the `tours` table (see lib/tours.ts).
 * ═══════════════════════════════════════════════════════════════════════ */

const PAD = 8; // spotlight ring padding around the target
const GAP = 14; // distance from target to bubble
const BUBBLE_W = 288;

function useReduced(): boolean {
  const prefers = useReducedMotion();
  const [manual, setManual] = useState(false);
  useEffect(() => {
    setManual(document.documentElement.getAttribute("data-motion") === "reduced");
  }, []);
  return !!prefers || manual;
}

function findTarget(tag: string): HTMLElement | null {
  return document.querySelector(`[data-tour="${CSS.escape(tag)}"]`);
}

type Pos = { top: number; left: number };

/** Place the bubble beside a target rect, honouring the preferred side and
 *  clamping to the viewport. The rect is a `layoutRect` — see `lib/zoom.ts`; a
 *  raw `getBoundingClientRect()` would place the bubble 20% off on the portal. */
function placeBubble(rect: LayoutRect, bubbleH: number, placement: TourStep["placement"]): Pos {
  const vw = rect.viewportWidth;
  const vh = rect.viewportHeight;
  const spaceAbove = rect.top;
  const spaceBelow = vh - rect.bottom;
  // Resolve "auto": prefer the side with more room (vertical first).
  let side = placement && placement !== "auto" ? placement : spaceBelow >= spaceAbove ? "bottom" : "top";
  if (side === "top" && spaceAbove < bubbleH + GAP && spaceBelow > spaceAbove) side = "bottom";
  if (side === "bottom" && spaceBelow < bubbleH + GAP && spaceAbove > spaceBelow) side = "top";

  let top: number;
  let left: number;
  if (side === "top") {
    top = rect.top - bubbleH - GAP;
    left = rect.left + rect.width / 2 - BUBBLE_W / 2;
  } else if (side === "bottom") {
    top = rect.bottom + GAP;
    left = rect.left + rect.width / 2 - BUBBLE_W / 2;
  } else if (side === "left") {
    top = rect.top + rect.height / 2 - bubbleH / 2;
    left = rect.left - BUBBLE_W - GAP;
  } else {
    top = rect.top + rect.height / 2 - bubbleH / 2;
    left = rect.right + GAP;
  }
  // Clamp inside the viewport with an 8px margin.
  left = Math.max(8, Math.min(left, vw - BUBBLE_W - 8));
  top = Math.max(8, Math.min(top, vh - bubbleH - 8));
  return { top, left };
}

function Spotlight({ tour, onSeen }: { tour: Tour; onSeen: (key: string, version: number) => void }) {
  const reduce = useReduced();
  const [steps, setSteps] = useState<TourStep[] | null>(null);
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<LayoutRect | null>(null);
  const [pos, setPos] = useState<Pos | null>(null);
  const bubbleRef = useRef<HTMLDivElement>(null);

  // Keep the latest steps/index in refs so the measure + listeners can stay
  // identity-stable (mounted once) — recreating them every render made the
  // scroll listener and scrollIntoView retrigger each other in a loop.
  const stepsRef = useRef<TourStep[] | null>(null);
  const indexRef = useRef(0);
  stepsRef.current = steps;
  indexRef.current = index;

  // Resolve which steps actually have an element on the page. Poll a few times
  // (pages behind Suspense mount their content late), then conclude. If nothing
  // is ever found we don't show AND don't burn the "seen" flag — try next visit.
  useEffect(() => {
    let tries = 0;
    let timer: ReturnType<typeof setTimeout>;
    const attempt = () => {
      const valid = tour.steps.filter((s) => findTarget(s.target));
      if (valid.length > 0) {
        setSteps(valid);
        return;
      }
      if (++tries >= 8) {
        setSteps([]); // gave up — render nothing, leave it unseen
        return;
      }
      timer = setTimeout(attempt, 400);
    };
    timer = setTimeout(attempt, 600);
    return () => clearTimeout(timer);
  }, [tour]);

  const finish = useCallback(() => {
    onSeen(tour.key, tour.version);
  }, [onSeen, tour.key, tour.version]);

  // Measure the current target + place the bubble. Stable identity (reads from
  // refs), so the scroll/resize listeners never need to be re-bound.
  const measure = useCallback(() => {
    const s = stepsRef.current;
    if (!s || s.length === 0) return;
    const el = findTarget(s[indexRef.current].target);
    if (!el) return; // target briefly absent — keep the last position, try again
    const r = layoutRect(el as HTMLElement);
    // offsetHeight is ALREADY a layout pixel, so it needs no conversion — which is
    // exactly why the two must not be mixed with a raw client rect.
    const bubbleH = bubbleRef.current?.offsetHeight ?? 150;
    setRect(r);
    setPos(placeBubble(r, bubbleH, s[indexRef.current].placement));
  }, []);

  // On step change: bring the target into view, then measure once it settles.
  useLayoutEffect(() => {
    if (!steps || steps.length === 0) return;
    findTarget(steps[index].target)?.scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" });
    const t = setTimeout(measure, reduce ? 0 : 300);
    return () => clearTimeout(t);
  }, [steps, index, measure, reduce]);

  // Re-measure on scroll/resize — bound once.
  useEffect(() => {
    window.addEventListener("scroll", measure, { passive: true, capture: true });
    window.addEventListener("resize", measure);
    return () => {
      window.removeEventListener("scroll", measure, { capture: true });
      window.removeEventListener("resize", measure);
    };
  }, [measure]);

  // Keyboard: Esc skips, arrows step.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = stepsRef.current;
      if (e.key === "Escape") finish();
      if (e.key === "ArrowRight") setIndex((i) => (s && i < s.length - 1 ? i + 1 : i));
      if (e.key === "ArrowLeft") setIndex((i) => (i > 0 ? i - 1 : i));
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [finish]);

  // Resolved to zero valid steps → render nothing (and don't mark seen).
  if (steps && steps.length === 0) return null;
  if (!steps || !rect || !pos) return null;

  const step = steps[index];
  const last = index === steps.length - 1;

  return createPortal(
    <div className="fixed inset-0 z-[120]" aria-live="polite">
      {/* Dim everything, cut a glowing hole over the target. The hole is
          pointer-events-none so the highlighted control stays tappable. */}
      <div
        className="pointer-events-none absolute rounded-2xl ring-2 ring-accent transition-all duration-200"
        style={{
          top: rect.top - PAD,
          left: rect.left - PAD,
          width: rect.width + PAD * 2,
          height: rect.height + PAD * 2,
          boxShadow: "0 0 0 9999px rgba(8, 12, 20, 0.58)",
        }}
      />

      {/* The coaching bubble — single element, content swaps per step (no keyed
          AnimatePresence: that stalled mid-exit under rapid re-measure). */}
      <motion.div
        ref={bubbleRef}
        initial={reduce ? false : { opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 420, damping: 32 }}
        className="absolute glass glass-menu elevated rounded-2xl p-4 shadow-pill transition-all duration-200"
        style={{ top: pos.top, left: pos.left, width: BUBBLE_W }}
      >
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <p className="text-[15px] font-semibold tracking-tight">{step.title}</p>
              <p className="mt-1 text-base leading-relaxed text-fg-muted">{step.body}</p>
            </div>
            <button
              type="button"
              onClick={finish}
              aria-label="Skip tour"
              className="-mr-1 -mt-1 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-fg-subtle transition-colors hover:bg-bg-muted hover:text-fg"
            >
              <X size={15} />
            </button>
          </div>

          <div className="mt-3.5 flex items-center justify-between gap-3">
            {/* Step dots */}
            <div className="flex items-center gap-1.5" aria-hidden>
              {steps.map((_, i) => (
                <span
                  key={i}
                  className={
                    i === index
                      ? "h-1.5 w-4 rounded-full bg-accent transition-all"
                      : "h-1.5 w-1.5 rounded-full bg-border transition-all"
                  }
                />
              ))}
            </div>
            <div className="flex items-center gap-1.5">
              {index > 0 && (
                <button
                  type="button"
                  onClick={() => setIndex((i) => i - 1)}
                  className="rounded-full px-3 py-1.5 text-base font-medium text-fg-muted transition-colors hover:bg-bg-muted hover:text-fg"
                >
                  Back
                </button>
              )}
              <button
                type="button"
                onClick={() => (last ? finish() : setIndex((i) => i + 1))}
                className="rounded-full bg-fg px-4 py-1.5 text-base font-semibold text-bg transition-opacity hover:opacity-90"
              >
                {last ? "Done" : "Next"}
              </button>
            </div>
          </div>
        </motion.div>
    </div>,
    document.body,
  );
}

/** Picks the first unseen tour whose route matches the current page and runs it.
 *  Mounts once (e.g. in the portal layout); it self-selects per route. Also
 *  honours a replay breadcrumb: the profile "Replay tour" control stashes a key
 *  in sessionStorage and navigates here; we fetch that tour fresh and launch it
 *  imperatively, independent of completions or the unseen-tours prop. */
export function TourRunner({
  tours,
  onSeen,
  fetchReplay,
}: {
  tours: Tour[];
  onSeen: (key: string, version: number) => Promise<void> | void;
  fetchReplay?: (key: string) => Promise<Tour | null>;
}) {
  const pathname = usePathname();
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [override, setOverride] = useState<Tour | null>(null);

  // Replay handshake: read the breadcrumb, fetch that tour, and launch it once
  // we're on its host page.
  useEffect(() => {
    const key = sessionStorage.getItem("cos:replayTour");
    if (!key || !fetchReplay) return;
    let cancelled = false;
    void fetchReplay(key).then((tour) => {
      if (cancelled || !tour) return;
      sessionStorage.removeItem("cos:replayTour");
      setDismissed((prev) => {
        const next = new Set(prev);
        for (const k of next) if (k.startsWith(`${tour.key}@`)) next.delete(k);
        return next;
      });
      setOverride(tour);
    });
    return () => {
      cancelled = true;
    };
  }, [pathname, fetchReplay]);

  const handleSeen = useCallback(
    (key: string, version: number) => {
      setDismissed((prev) => new Set(prev).add(`${key}@${version}`));
      setOverride((cur) => (cur && cur.key === key ? null : cur));
      void onSeen(key, version);
    },
    [onSeen],
  );

  // A replay in flight for this page wins; otherwise the first unseen tour here.
  const active =
    (override && override.route === pathname ? override : null) ??
    tours.find((t) => t.route === pathname && !dismissed.has(`${t.key}@${t.version}`));

  if (!active) return null;
  return <Spotlight key={`${active.key}@${active.version}`} tour={active} onSeen={handleSeen} />;
}

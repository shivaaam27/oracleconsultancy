"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/cn";

const GAP = 8; // distance between trigger and panel
const MARGIN = 10; // min distance from the viewport edge

type Coords = { top: number; left: number; originX: number; originY: number };

/**
 * A small floating insight panel that opens on hover (desktop) or tap (touch).
 *
 * Positioning is deliberately CONSISTENT so it never feels random: it always
 * opens BELOW the trigger and flips above only when there genuinely isn't room;
 * it's clamped to the viewport so it never overflows; and it grows out of the
 * trigger (transform-origin anchored to the hovered element). Rendered through a
 * portal so it never clips inside overflow-scroll rails. Reduced-motion safe.
 */
export function InsightPopover({
  content,
  children,
  className,
  align = "center",
}: {
  content: ReactNode;
  children: ReactNode;
  className?: string;
  align?: "center" | "start" | "end";
}) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<Coords | null>(null);
  const [shown, setShown] = useState(false); // drives the grow-in transition
  const triggerRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const id = useId();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  // Measure the trigger AND the real panel, then place with collision + clamp.
  const place = useCallback(() => {
    const trigger = triggerRef.current;
    const panel = panelRef.current;
    if (!trigger || !panel) return;
    const t = trigger.getBoundingClientRect();
    const pw = panel.offsetWidth;
    const ph = panel.offsetHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // Horizontal anchor on the trigger, then the panel's left edge so that
    // anchor lines up — clamped so the panel never leaves the viewport.
    const anchorX = align === "start" ? t.left : align === "end" ? t.right : t.left + t.width / 2;
    let left = align === "start" ? t.left : align === "end" ? t.right - pw : anchorX - pw / 2;
    left = Math.max(MARGIN, Math.min(left, vw - pw - MARGIN));

    // Always below; flip above only when below won't fit and above fits better.
    const roomBelow = vh - t.bottom;
    const placeAbove = roomBelow < ph + GAP + MARGIN && t.top > roomBelow;
    const top = placeAbove ? Math.max(MARGIN, t.top - GAP - ph) : t.bottom + GAP;

    // Grow from the edge/point nearest the trigger.
    const originX = Math.max(0, Math.min(pw, anchorX - left));
    const originY = placeAbove ? ph : 0;

    setCoords({ top, left, originX, originY });
  }, [align]);

  const show = useCallback(() => {
    setShown(false);
    setOpen(true);
  }, []);
  const hide = useCallback(() => {
    setOpen(false);
    setShown(false);
    setCoords(null);
  }, []);

  // Place after the panel has mounted (so we can measure it), then trigger the
  // grow-in on the next frame. useLayoutEffect avoids a one-frame flash.
  useLayoutEffect(() => {
    if (!open) return;
    place();
    const raf = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(raf);
  }, [open, place]);

  useEffect(() => {
    if (!open) return;
    const onScroll = () => hide();
    const onResize = () => place();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && hide();
    const onDown = (e: PointerEvent) => {
      if (
        !triggerRef.current?.contains(e.target as Node) &&
        !panelRef.current?.contains(e.target as Node)
      ) {
        hide();
      }
    };
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onDown);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onDown);
    };
  }, [open, hide, place]);

  return (
    <>
      <div
        ref={triggerRef}
        className={cn("inline-flex cursor-help", className)}
        onMouseEnter={show}
        onMouseLeave={hide}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          open ? hide() : show();
        }}
        aria-describedby={open ? id : undefined}
      >
        {children}
      </div>
      {mounted && open
        ? createPortal(
            <div
              ref={panelRef}
              id={id}
              role="tooltip"
              className="pointer-events-auto fixed z-[120] w-60 rounded-2xl glass-menu p-3 shadow-pill ring-1 ring-border/70 motion-reduce:!transition-none motion-reduce:!transform-none"
              style={{
                top: coords?.top ?? 0,
                left: coords?.left ?? 0,
                transformOrigin: coords ? `${coords.originX}px ${coords.originY}px` : "center",
                opacity: shown ? 1 : 0,
                transform: shown ? "scale(1)" : "scale(0.95)",
                transition: "opacity 0.14s ease-out, transform 0.16s cubic-bezier(0.22, 1, 0.36, 1)",
                visibility: coords ? "visible" : "hidden",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {content}
            </div>,
            document.body
          )
        : null}
    </>
  );
}

/** A consistent body for metric/trend insights: title, big value, optional
 *  previous-vs-now delta line, and an optional breakdown list. */
export function InsightBody({
  title,
  value,
  caption,
  rows,
}: {
  title: string;
  value?: ReactNode;
  caption?: ReactNode;
  rows?: Array<{ label: string; value: ReactNode; tone?: string }>;
}) {
  return (
    <div className="space-y-2">
      <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-fg-muted">{title}</div>
      {value !== undefined && <div className="text-2xl font-semibold tabular leading-none">{value}</div>}
      {caption && <div className="text-xs text-fg-muted leading-snug">{caption}</div>}
      {rows && rows.length > 0 && (
        <div className="space-y-1 border-t border-border/50 pt-2">
          {rows.map((r) => (
            <div key={r.label} className="flex items-center justify-between gap-3 text-xs">
              <span className="text-fg-muted">{r.label}</span>
              <span className={cn("font-semibold tabular", r.tone)}>{r.value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

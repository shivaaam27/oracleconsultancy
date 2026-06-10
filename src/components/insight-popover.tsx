"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/cn";

/**
 * A small floating insight panel that opens on hover (desktop) or tap (touch).
 * Rendered through a portal and positioned with fixed coords from the trigger,
 * so it never clips inside overflow-scroll rails. Closes on outside tap, scroll,
 * Escape, or pointer-leave (hover mode). Reduced-motion safe.
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
  const [coords, setCoords] = useState<{ top: number; left: number; placeAbove: boolean } | null>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const id = useId();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const place = () => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const placeAbove = r.top > window.innerHeight * 0.5;
    const left = align === "start" ? r.left : align === "end" ? r.right : r.left + r.width / 2;
    setCoords({ top: placeAbove ? r.top - 8 : r.bottom + 8, left, placeAbove });
  };

  const show = () => {
    place();
    setOpen(true);
  };
  const hide = () => setOpen(false);

  useEffect(() => {
    if (!open) return;
    const onScroll = () => hide();
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
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onDown);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onDown);
    };
  }, [open]);

  const translate = align === "start" ? "0" : align === "end" ? "-100%" : "-50%";

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
      {mounted && open && coords
        ? createPortal(
            <div
              ref={panelRef}
              id={id}
              role="tooltip"
              className="pointer-events-auto fixed z-[120] w-60 animate-[fadeIn_0.14s_ease-out] rounded-2xl glass-menu p-3 shadow-pill ring-1 ring-border/70"
              style={{
                top: coords.top,
                left: coords.left,
                transform: `translate(${translate}, ${coords.placeAbove ? "-100%" : "0"})`,
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

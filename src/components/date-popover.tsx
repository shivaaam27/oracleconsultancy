"use client";

import { CONTROL_SHELL } from "@/components/ui";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CalendarClock, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { useAnchored } from "@/lib/use-anchored";
import { cn } from "@/lib/cn";

/* Aurora date picker — a styled trigger (matches the FluidSelect pill) that opens
 * a glass month-grid calendar with quick options. Replaces the raw browser
 * <input type="date"> so deadlines look like every other dropdown. Value is a
 * local "yyyy-mm-dd" string (or null); onChange emits the same, "" clears. */

// One shared control edge — see CONTROL_SHELL in ui.tsx.
const fieldShell = CONTROL_SHELL;
const pad = (n: number) => String(n).padStart(2, "0");
const toKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const WEEK = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function parse(value: string | null): Date | null {
  if (!value) return null;
  const [y, m, d] = value.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

/** Days (Mon-first) laid out as a 6×7 grid for the given month. */
function monthGrid(view: Date): (Date | null)[] {
  const first = new Date(view.getFullYear(), view.getMonth(), 1);
  const lead = (first.getDay() + 6) % 7; // 0=Mon
  const daysInMonth = new Date(view.getFullYear(), view.getMonth() + 1, 0).getDate();
  const cells: (Date | null)[] = [];
  for (let i = 0; i < lead; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(view.getFullYear(), view.getMonth(), d));
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

export function DatePopover({
  value, label, tone = "text-fg-muted", onChange, compact = false, block = false, triggerClassName,
}: {
  value: string | null;
  label?: string | null;
  tone?: string;
  onChange: (v: string) => void;
  compact?: boolean;
  block?: boolean;
  /** Override the trigger's shell + size classes so the picker can match the
   *  surrounding form fields (e.g. the full-size Aurora field box). When set it
   *  replaces the default `fieldShell + sz` — pass everything the button needs. */
  triggerClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = useMemo(() => parse(value), [value]);
  const today = useMemo(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }, []);
  const [view, setView] = useState<Date>(() => selected ?? today);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const anchor = useAnchored(triggerRef, open);

  useEffect(() => {
    if (!open) return;
    setView(selected ?? today);
    function onDoc(e: MouseEvent) {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") setOpen(false); }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onKey); };
  }, [open, selected, today]);

  const sz = compact ? "px-2.5 py-1.5 text-xs" : "px-3 py-2 text-sm";
  const text = selected ? selected.toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "No date";
  const cells = monthGrid(view);

  function pick(d: Date) { onChange(toKey(d)); setOpen(false); }
  const quick = [
    { label: "Today", d: () => today },
    { label: "Tomorrow", d: () => { const x = new Date(today); x.setDate(x.getDate() + 1); return x; } },
    { label: "+1 week", d: () => { const x = new Date(selected ?? today); x.setDate(x.getDate() + 7); return x; } },
    { label: "+1 month", d: () => { const x = new Date(selected ?? today); x.setMonth(x.getMonth() + 1); return x; } },
  ];

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={triggerClassName
          ? cn("inline-flex items-center gap-1.5", block && "w-full", triggerClassName)
          : cn(fieldShell, "inline-flex items-center gap-1.5 transition-colors hover:bg-bg-muted", block && "w-full", sz)}
      >
        <CalendarClock size={compact ? 12 : 13} className={cn("shrink-0", tone)} />
        <span className={cn(block && "min-w-0 flex-1 truncate text-left", label && (tone.includes("danger") || tone.includes("warn")) ? tone : "text-fg")}>{label ?? text}</span>
        <ChevronDown size={compact ? 12 : 13} className="shrink-0 text-fg-subtle" />
      </button>

      {open && anchor && typeof document !== "undefined" && createPortal(
        <div
          ref={menuRef}
          className="fixed z-[120] w-[16rem] overflow-hidden rounded-2xl org-pop elevated p-2.5 shadow-lg"
          style={{
            left: Math.min(anchor.left, window.innerWidth - 272),
            // A modal dialog (Radix) sets body{pointer-events:none}; this menu is
            // portaled to body, so re-enable clicks on it explicitly.
            pointerEvents: "auto",
            ...(anchor.openUp ? { bottom: anchor.bottomOffset + 6 } : { top: anchor.top + 6 }),
          }}
        >
          {/* Month header + navigation */}
          <div className="flex items-center justify-between px-1 pb-2">
            <button type="button" onClick={() => setView(new Date(view.getFullYear(), view.getMonth() - 1, 1))} className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-fg-muted hover:bg-bg-muted hover:text-fg transition-colors" aria-label="Previous month">
              <ChevronLeft size={16} />
            </button>
            <span className="text-base font-semibold text-fg">{MONTHS[view.getMonth()]} {view.getFullYear()}</span>
            <button type="button" onClick={() => setView(new Date(view.getFullYear(), view.getMonth() + 1, 1))} className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-fg-muted hover:bg-bg-muted hover:text-fg transition-colors" aria-label="Next month">
              <ChevronRight size={16} />
            </button>
          </div>

          {/* Weekday row */}
          <div className="grid grid-cols-7 gap-0.5 px-0.5">
            {WEEK.map((w) => <span key={w} className="py-1 text-center text-xs font-medium uppercase tracking-wide text-fg-subtle">{w}</span>)}
          </div>
          {/* Days */}
          <div className="grid grid-cols-7 gap-0.5 px-0.5">
            {cells.map((d, i) => {
              if (!d) return <span key={i} />;
              const isSel = selected != null && toKey(d) === toKey(selected);
              const isToday = toKey(d) === toKey(today);
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => pick(d)}
                  className={cn(
                    "inline-flex h-8 items-center justify-center rounded-lg text-sm transition-colors",
                    isSel ? "bg-accent font-semibold text-accent-fg" : "text-fg hover:bg-bg-muted",
                    !isSel && isToday && "font-semibold text-accent ring-1 ring-accent/40",
                  )}
                >
                  {d.getDate()}
                </button>
              );
            })}
          </div>

          {/* Quick chips */}
          <div className="mt-2 grid grid-cols-2 gap-1 border-t border-border/60 pt-2">
            {quick.map((q) => (
              <button key={q.label} type="button" onClick={() => pick(q.d())} className="rounded-lg bg-bg-subtle/70 px-2 py-1.5 text-xs font-medium ring-1 ring-border/60 transition-colors hover:text-accent hover:ring-accent/40">
                {q.label}
              </button>
            ))}
          </div>
          {value && (
            <button type="button" onClick={() => { onChange(""); setOpen(false); }} className="mt-1 w-full rounded-lg px-2 py-1.5 text-xs text-fg-muted transition-colors hover:bg-danger-soft/50 hover:text-danger">
              Clear date
            </button>
          )}
        </div>,
        document.body,
      )}
    </>
  );
}

"use client";

import { cn } from "@/lib/cn";
import { motion } from "framer-motion";
import { useId, useRef, type ReactNode } from "react";
import { springSnappy } from "@/lib/motion";

/* ═══════════════════════════════════════════════════════════════════════
 * macOS design-system primitives
 * The shared building blocks for the redesign: dense, precise, hairline-led.
 * Phases 1–6 compose pages out of these so everything feels consistent.
 * ═══════════════════════════════════════════════════════════════════════ */

/* ── Segmented control (Finder/Mail view switcher) ───────────────────── */
export type SegmentOption<T extends string> = { value: T; label: string; icon?: ReactNode };

export function Segmented<T extends string>({
  value, onChange, options, size = "md", className,
}: {
  value: T;
  onChange: (v: T) => void;
  options: SegmentOption<T>[];
  size?: "sm" | "md";
  className?: string;
}) {
  const pad = size === "sm" ? "px-2.5 py-0.5 text-xs" : "px-3 py-1 text-xs";
  const groupId = useId();
  const btnRefs = useRef<(HTMLButtonElement | null)[]>([]);
  // Arrow-key roving (proper tablist behaviour); selection follows focus.
  function onKeyDown(e: React.KeyboardEvent, idx: number) {
    let next = idx;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") next = (idx + 1) % options.length;
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = (idx - 1 + options.length) % options.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = options.length - 1;
    else return;
    e.preventDefault();
    onChange(options[next].value);
    btnRefs.current[next]?.focus();
  }
  return (
    <div role="tablist" className={cn("inline-flex items-center gap-0.5 p-0.5 rounded-lg bg-bg-muted/70 border border-border", className)}>
      {options.map((o, i) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            ref={(el) => { btnRefs.current[i] = el; }}
            role="tab"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            onKeyDown={(e) => onKeyDown(e, i)}
            type="button"
            onClick={() => onChange(o.value)}
            className={cn(
              "relative inline-flex items-center gap-1.5 rounded-md transition-colors whitespace-nowrap",
              pad,
              active ? "text-fg font-medium" : "text-fg-muted hover:text-fg"
            )}
          >
            {active && (
              <motion.span
                layoutId={`segmented-${groupId}`}
                transition={springSnappy}
                className="absolute inset-0 rounded-md bg-bg-elev shadow-sm glass-rim"
              />
            )}
            <span className="relative z-10 inline-flex items-center gap-1.5">{o.icon}{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}


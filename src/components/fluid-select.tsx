"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, Check } from "lucide-react";
import { cn } from "@/lib/cn";
import { spring } from "@/lib/motion";

export type FluidOption = { value: string; label: string; dot?: string };

/**
 * A fluid, design-system dropdown — a glass popover with a spring pop-in,
 * check-marked selection and keyboard/outside-click dismissal. Replaces native
 * <select> wherever a "liquid" menu is wanted. Presentational only: the caller
 * owns what `onSelect` does (navigate, mutate, etc.).
 */
export function FluidSelect({
  value,
  options,
  onSelect,
  placeholder = "Select…",
  align = "left",
  className,
  buttonClassName,
}: {
  value: string;
  options: FluidOption[];
  onSelect: (value: string) => void;
  placeholder?: string;
  align?: "left" | "right";
  className?: string;
  buttonClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLSpanElement>(null);
  const current = options.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onKey); };
  }, [open]);

  return (
    <span ref={wrapRef} className={cn("relative inline-block", className)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={cn(
          "inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border border-border bg-bg-elev text-fg",
          "hover:bg-bg-muted btn-rim transition-colors select-none whitespace-nowrap",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring/60",
          buttonClassName
        )}
      >
        {current?.dot && <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ backgroundColor: current.dot }} />}
        <span className={cn(!current && "text-fg-muted")}>{current ? current.label : placeholder}</span>
        <ChevronDown size={13} className={cn("opacity-50 transition-transform", open && "rotate-180")} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: -2 }}
            transition={spring}
            style={{ transformOrigin: align === "right" ? "top right" : "top left" }}
            role="listbox"
            className={cn(
              "absolute z-[70] mt-1.5 min-w-[200px] max-h-[60vh] overflow-y-auto p-1.5",
              "glass rounded-xl shadow-lg",
              align === "right" ? "right-0" : "left-0"
            )}
          >
            {options.map((opt) => {
              const active = opt.value === value;
              return (
                <button
                  key={opt.value || "__all"}
                  type="button"
                  role="option"
                  aria-selected={active}
                  onClick={() => { onSelect(opt.value); setOpen(false); }}
                  className={cn(
                    "w-full flex items-center gap-2 text-left text-sm px-2.5 py-2 rounded-lg transition-colors",
                    active ? "bg-accent/12 text-fg font-medium" : "text-fg-muted hover:bg-bg-muted hover:text-fg"
                  )}
                >
                  {opt.dot && <span className="inline-block w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: opt.dot }} />}
                  <span className="flex-1 truncate">{opt.label}</span>
                  {active && <Check size={14} className="text-accent shrink-0" />}
                </button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </span>
  );
}

"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
 *
 * The menu is rendered in a portal with fixed positioning so it can never be
 * trapped behind a `glass`/`transform` stacking context or clipped by an
 * `overflow-hidden` ancestor, and it's clamped to the viewport on mobile.
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
  const [mounted, setMounted] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; minWidth: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const current = options.find((o) => o.value === value);

  useEffect(() => setMounted(true), []);

  const place = () => {
    const r = btnRef.current?.getBoundingClientRect();
    if (!r) return;
    const menuW = Math.max(r.width, 200);
    let left = align === "right" ? r.right - menuW : r.left;
    left = Math.max(8, Math.min(left, window.innerWidth - menuW - 8));
    setPos({ top: r.bottom + 6, left, minWidth: r.width });
  };

  useLayoutEffect(() => { if (open) place(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [open]);

  useEffect(() => {
    if (!open) return;
    const reposition = () => place();
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (btnRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <span className={cn("relative inline-block", className)}>
      <button
        ref={btnRef}
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

      {mounted && createPortal(
        <AnimatePresence>
          {open && pos && (
            <motion.div
              ref={menuRef}
              initial={{ opacity: 0, scale: 0.96, y: -4 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.97, y: -2 }}
              transition={spring}
              role="listbox"
              style={{
                position: "fixed",
                top: pos.top,
                left: pos.left,
                minWidth: Math.max(pos.minWidth, 200),
                zIndex: 1000,
                transformOrigin: align === "right" ? "top right" : "top left",
              }}
              className="max-h-[60vh] overflow-y-auto p-1.5 glass glass-menu rounded-xl shadow-lg"
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
        </AnimatePresence>,
        document.body
      )}
    </span>
  );
}

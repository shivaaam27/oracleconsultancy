"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, Check } from "lucide-react";
import { cn } from "@/lib/cn";
import { spring } from "@/lib/motion";
import { layoutRect } from "@/lib/zoom";

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
  const [pos, setPos] = useState<{ top?: number; bottom?: number; left: number; minWidth: number; maxHeight: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const optsRef = useRef<(HTMLButtonElement | null)[]>([]);
  const current = options.find((o) => o.value === value);

  // On open, move focus to the selected option so the keyboard can drive the menu.
  useEffect(() => {
    if (!open) return;
    const idx = Math.max(0, options.findIndex((o) => o.value === value));
    const id = requestAnimationFrame(() => optsRef.current[idx]?.focus());
    return () => cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Arrow / Home / End roving focus within the open menu.
  function onMenuKeyDown(e: React.KeyboardEvent) {
    const els = optsRef.current.filter(Boolean) as HTMLButtonElement[];
    if (els.length === 0) return;
    const cur = els.findIndex((el) => el === document.activeElement);
    if (e.key === "ArrowDown") { e.preventDefault(); els[Math.min(els.length - 1, (cur < 0 ? -1 : cur) + 1)]?.focus(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); els[Math.max(0, (cur < 0 ? els.length : cur) - 1)]?.focus(); }
    else if (e.key === "Home") { e.preventDefault(); els[0]?.focus(); }
    else if (e.key === "End") { e.preventDefault(); els[els.length - 1]?.focus(); }
  }

  useEffect(() => setMounted(true), []);

  const place = () => {
    const el = btnRef.current;
    if (!el) return;
    // LAYOUT pixels, not `getBoundingClientRect()` / `window.inner*`: these numbers
    // become CSS lengths, and on the portal (zoom 0.8) the visual ones make the menu
    // open over its own trigger. See `lib/zoom.ts`.
    const r = layoutRect(el);
    const menuW = Math.max(r.width, 200);
    let left = align === "right" ? r.right - menuW : r.left;
    left = Math.max(8, Math.min(left, r.viewportWidth - menuW - 8));
    // Open below by default; flip above when there isn't enough room below and
    // there's more above. Either way the menu height is clamped to the available
    // space so it can never run off-screen — it just scrolls inside.
    const margin = 8;
    const spaceBelow = r.viewportHeight - r.bottom - margin;
    const spaceAbove = r.top - margin;
    const openUp = spaceBelow < 220 && spaceAbove > spaceBelow;
    const maxHeight = Math.max(140, Math.min(r.viewportHeight * 0.6, openUp ? spaceAbove : spaceBelow));
    setPos(
      openUp
        ? { bottom: r.bottomOffset + 6, left, minWidth: r.width, maxHeight }
        : { top: r.bottom + 6, left, minWidth: r.width, maxHeight }
    );
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
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { setOpen(false); btnRef.current?.focus(); } };
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
        onKeyDown={(e) => { if ((e.key === "ArrowDown" || e.key === "ArrowUp") && !open) { e.preventDefault(); setOpen(true); } }}
        aria-haspopup="listbox"
        aria-expanded={open}
        /* Deliberately the SAME box as the kit `Select` (ui.tsx): h-9, pl-3/pr-8,
           text-sm, rounded-lg, hairline border, same hover and focus ring. The
           two controls do different jobs — this one is for toolbars, that one for
           form fields — but a filter dropdown and a form dropdown sitting near
           each other must not look like two different products. */
        className={cn(
          "relative inline-flex h-9 w-full items-center gap-1.5 px-3 text-sm rounded-lg border border-border bg-bg-elev text-fg",
          "hover:border-border-strong transition-colors select-none whitespace-nowrap",
          "focus-visible:outline-none focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent-ring/60",
          buttonClassName
        )}
      >
        {current?.dot && <span className="inline-block w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: current.dot }} />}
        <span className={cn("min-w-0 flex-1 truncate text-left", !current && "text-fg-muted")}>{current ? current.label : placeholder}</span>
        {/* In FLOW, not absolutely placed.

            It used to sit `absolute right-2.5`, with `pr-8` on the button holding
            a gutter open for it. But `pr-8` is a class, and a caller passing its
            own `px-*` replaces it through tailwind-merge — the gutter vanishes and
            the chevron lands ON TOP of the label. The new-task sheet passes
            `px-3.5`, so on a phone Priority read as "Medium" with the arrow across
            the last letters. The label beside this is `flex-1`, so the chevron
            still sits hard right; it simply cannot be overlapped now. */}
        <ChevronDown
          size={14}
          className={cn(
            "pointer-events-none ml-auto shrink-0 text-fg-subtle transition-transform",
            open && "rotate-180"
          )}
        />
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
              onKeyDown={onMenuKeyDown}
              style={{
                position: "fixed",
                top: pos.top,
                bottom: pos.bottom,
                left: pos.left,
                minWidth: Math.max(pos.minWidth, 200),
                maxHeight: pos.maxHeight,
                zIndex: 1000,
                // A modal dialog (Radix) sets body{pointer-events:none}; this menu is
                // portaled to body, so re-enable clicks on it explicitly.
                pointerEvents: "auto",
                transformOrigin:
                  (pos.bottom != null ? "bottom" : "top") + (align === "right" ? " right" : " left"),
              }}
              className="overflow-y-auto overscroll-contain p-1.5 org-pop rounded-xl shadow-lg"
            >
              {options.map((opt, i) => {
                const active = opt.value === value;
                return (
                  <button
                    key={opt.value || "__all"}
                    ref={(el) => { optsRef.current[i] = el; }}
                    type="button"
                    role="option"
                    tabIndex={-1}
                    aria-selected={active}
                    onClick={() => { onSelect(opt.value); setOpen(false); btnRef.current?.focus(); }}
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

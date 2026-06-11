"use client";

import { cn } from "@/lib/cn";
import { Search, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useId, useRef, type ComponentProps, type ReactNode } from "react";
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
  const pad = size === "sm" ? "px-2.5 py-0.5 text-[11px]" : "px-3 py-1 text-xs";
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

/* ── Pill (compact status/meta label — denser than Badge) ────────────── */
const pillTones = {
  neutral: "bg-bg-muted text-fg-muted",
  accent: "bg-accent-soft text-fg",
  success: "text-emerald-700 dark:text-emerald-300 bg-emerald-500/12",
  warn: "text-amber-700 dark:text-amber-300 bg-amber-500/12",
  danger: "text-red-700 dark:text-red-300 bg-red-500/12",
  info: "text-sky-700 dark:text-sky-300 bg-sky-500/12",
};
export type PillTone = keyof typeof pillTones;

export function Pill({
  tone = "neutral", dot = false, className, children,
}: {
  tone?: PillTone; dot?: boolean; className?: string; children: ReactNode;
}) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium leading-4 whitespace-nowrap", pillTones[tone], className)}>
      {dot && <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70" />}
      {children}
    </span>
  );
}

/* ── Search field (Spotlight-style) ──────────────────────────────────── */
export function SearchField({
  value, onChange, placeholder = "Search", autoFocus, className, onKeyDown,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  className?: string;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
}) {
  return (
    <div className={cn("relative", className)}>
      <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-fg-subtle pointer-events-none" />
      <input
        value={value}
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        className="w-full h-8 rounded-lg bg-bg-subtle border border-border pl-8 pr-7 text-sm focus:outline-none focus:border-accent focus:bg-bg-elev"
      />
      {value && (
        <button type="button" onClick={() => onChange("")} aria-label="Clear" className="absolute right-2 top-1/2 -translate-y-1/2 text-fg-subtle hover:text-fg">
          <X size={13} />
        </button>
      )}
    </div>
  );
}

/* ── Toolbar (window-chrome top bar) ─────────────────────────────────── */
export function Toolbar({
  title, subtitle, leading, children, className,
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  leading?: ReactNode;
  children?: ReactNode; // trailing actions
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-3 px-4 h-12 border-b border-border bg-bg-elev/80 backdrop-blur-md", className)}>
      {leading}
      {(title || subtitle) && (
        <div className="min-w-0">
          {title && <div className="text-sm font-semibold tracking-tight truncate leading-tight">{title}</div>}
          {subtitle && <div className="text-[11px] text-fg-muted truncate leading-tight">{subtitle}</div>}
        </div>
      )}
      {children && <div className="ml-auto flex items-center gap-2">{children}</div>}
    </div>
  );
}

/* ── List row (dense, clickable) ─────────────────────────────────────── */
export function ListRow({
  selected, className, ...p
}: { selected?: boolean } & ComponentProps<"button">) {
  return (
    <button
      type="button"
      className={cn(
        "w-full text-left px-3 py-2 border-b border-border/50 transition-colors",
        selected ? "bg-accent/10" : "hover:bg-bg-muted/50",
        className
      )}
      {...p}
    />
  );
}

/* ── Sheet (centred dialog or right inspector) ───────────────────────── */
export function Sheet({
  open, onClose, side = "center", className, children, labelledBy,
}: {
  open: boolean;
  onClose: () => void;
  side?: "center" | "right";
  className?: string;
  children: ReactNode;
  labelledBy?: string;
}) {
  const isRight = side === "right";
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={onClose}
            className="fixed inset-0 z-[80] bg-black/40 backdrop-blur-sm"
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby={labelledBy}
            initial={isRight ? { x: "100%" } : { opacity: 0, y: 18, scale: 0.98 }}
            animate={isRight ? { x: 0 } : { opacity: 1, y: 0, scale: 1 }}
            exit={isRight ? { x: "100%" } : { opacity: 0, y: 12, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 360, damping: 32 }}
            className={cn(
              "fixed z-[81] bg-bg-elev border-border shadow-2xl flex flex-col",
              isRight
                ? "right-0 top-0 bottom-0 w-full sm:max-w-md border-l"
                : "inset-x-0 bottom-0 sm:inset-0 sm:m-auto sm:h-fit sm:max-w-lg rounded-t-2xl sm:rounded-2xl border max-h-[88svh]",
              className
            )}
          >
            {children}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

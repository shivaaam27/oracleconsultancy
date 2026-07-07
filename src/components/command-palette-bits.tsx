"use client";
import { Command } from "cmdk";
import { useCallback, useRef, type ComponentPropsWithoutRef } from "react";
import { cn } from "@/lib/cn";

// Magnetic hover — the element leans a few px toward the cursor and springs back
// on leave. No-op on touch (no cursor). The CSS `transition-transform` does the
// springback. (GSAP targets the group/stagger wrappers, not these elements, so
// there's no transform conflict.)
export function useMagnetic<T extends HTMLElement>(strength = 0.25) {
  const ref = useRef<T | null>(null);
  const frame = useRef(0);
  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (e.pointerType === "touch") return;
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const dx = (e.clientX - (r.left + r.width / 2)) * strength;
    const dy = (e.clientY - (r.top + r.height / 2)) * strength;
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => { if (ref.current) ref.current.style.transform = `translate(${dx}px, ${dy}px)`; });
  }, [strength]);
  const onPointerLeave = useCallback(() => { if (ref.current) ref.current.style.transform = ""; }, []);
  return { ref, onPointerMove, onPointerLeave };
}

export function MagneticItem({ className, children, ...props }: ComponentPropsWithoutRef<typeof Command.Item>) {
  const m = useMagnetic<HTMLDivElement>(0.08);
  return (
    <Command.Item
      ref={m.ref}
      onPointerMove={m.onPointerMove}
      onPointerLeave={m.onPointerLeave}
      className={cn("transition-transform duration-150 ease-out", className)}
      {...props}
    >
      {children}
    </Command.Item>
  );
}

export function MagneticChip({ onClick, className, children }: { onClick?: () => void; className?: string; children: React.ReactNode }) {
  const m = useMagnetic<HTMLButtonElement>(0.12);
  return (
    <button
      type="button"
      ref={m.ref}
      onClick={onClick}
      onPointerMove={m.onPointerMove}
      onPointerLeave={m.onPointerLeave}
      className={cn("transition-transform duration-150 ease-out", className)}
    >
      {children}
    </button>
  );
}

/** Render a full-text "found inside" excerpt, bolding the «…»-marked hit. */
export function HighlightSnippet({ text }: { text: string }) {
  const parts = text.split(/(«[^»]*»)/g).filter(Boolean);
  return (
    <span className="mt-0.5 block truncate text-[11px] text-fg-subtle">
      <span className="opacity-60">“</span>
      {parts.map((p, i) =>
        p.startsWith("«")
          ? <mark key={i} className="rounded bg-accent/15 px-0.5 text-accent">{p.slice(1, -1)}</mark>
          : <span key={i}>{p}</span>,
      )}
      <span className="opacity-60">”</span>
    </span>
  );
}

/** Tiny "why it matched" tag — so the list is trustworthy at a glance. "name" is
 *  the obvious default (hidden); "meaning" (semantic) and "inside" (found in the
 *  document body) are the interesting ones worth surfacing. */
export function WhyTag({ kind }: { kind?: "name" | "inside" | "meaning" }) {
  if (kind !== "meaning" && kind !== "inside") return null;
  const meta = kind === "meaning"
    ? { label: "meaning", cls: "bg-[#a78bfa]/15 text-[#b9a5fb]" }
    : { label: "inside", cls: "bg-warn-soft/70 text-warn" };
  return (
    <span className={cn("shrink-0 self-start mt-0.5 rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide hidden sm:inline", meta.cls)}>
      {meta.label}
    </span>
  );
}

/** Multi-line version of HighlightSnippet — renders a whole passage, bolding
 *  every «…»-marked hit. Used by the in-place document reader. */
export function HighlightBlock({ text }: { text: string }) {
  const parts = text.split(/(«[^»]*»)/g).filter(Boolean);
  return (
    <span className="block text-[13px] leading-relaxed text-fg whitespace-pre-wrap">
      {parts.map((p, i) =>
        p.startsWith("«")
          ? <mark key={i} className="rounded bg-accent/20 px-0.5 text-accent">{p.slice(1, -1)}</mark>
          : <span key={i}>{p}</span>,
      )}
    </span>
  );
}

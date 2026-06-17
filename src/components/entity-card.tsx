"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * The canonical Aurora list-row shell: a self-contained floating glass card
 * with a brand-tinted left rail, hover-to-accent ring, selectable state, and
 * full pointer/keyboard activation. Lay the row contents out yourself as
 * children (usually a leading slot, a `min-w-0 flex-1` body, then trailing
 * meta). Reuse this for People / Tasks / Documents / Assets rows so every
 * directory feels the same.
 */
export function EntityCard({
  onActivate,
  accentColor,
  selected = false,
  dim = false,
  className,
  children,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerLeave,
  onPointerCancel,
}: {
  onActivate: () => void;
  /** Brand colour for the left rail; falls back to a neutral hairline. */
  accentColor?: string | null;
  selected?: boolean;
  dim?: boolean;
  className?: string;
  children: ReactNode;
  onPointerDown?: (e: React.PointerEvent) => void;
  onPointerMove?: (e: React.PointerEvent) => void;
  onPointerUp?: (e: React.PointerEvent) => void;
  onPointerLeave?: (e: React.PointerEvent) => void;
  onPointerCancel?: (e: React.PointerEvent) => void;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onActivate}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onActivate(); } }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerLeave}
      onPointerCancel={onPointerCancel}
      onContextMenu={(e) => e.preventDefault()}
      className={cn(
        "group relative flex items-center gap-3 pl-4 pr-3.5 py-3 rounded-2xl bg-bg-elev ring-1 ring-border overflow-hidden cursor-pointer select-none transition-all",
        "hover:ring-accent/40 hover:bg-bg-subtle/30",
        selected && "ring-2 ring-accent bg-accent-soft/25",
        dim && "opacity-60",
        className
      )}
    >
      <span aria-hidden className="absolute left-0 top-2 bottom-2 w-[3px] rounded-r"
        style={{ background: accentColor || "var(--color-border-strong)" }} />
      {children}
    </div>
  );
}

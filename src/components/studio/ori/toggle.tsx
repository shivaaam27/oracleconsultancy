"use client";

import { Loader2 } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * The mockup's switch (34×20, black when on). It reads the sheet palette when it
 * sits in one (`--sh-on-bg`) and the page's ink otherwise, so it follows light
 * and dark in both places.
 */
export function OriToggle({ on, onChange, label, busy = false, disabled = false }: {
  on: boolean;
  onChange: (v: boolean) => void;
  label: string;
  busy?: boolean;
  disabled?: boolean;
}) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} disabled={disabled || busy}
      onClick={(e) => { e.stopPropagation(); onChange(!on); }}
      className={cn("relative inline-block h-5 w-[34px] shrink-0 rounded-full transition-colors duration-200 disabled:cursor-default",
        on ? "bg-[var(--sh-on-bg,var(--st-ink))]" : "bg-[var(--st-track-off)]", busy && "opacity-60")}>
      <span className={cn("absolute top-0.5 grid h-4 w-4 place-items-center rounded-full shadow-[0_1px_2px_rgba(0,0,0,0.2)] transition-[left] duration-200",
        on ? "left-4 bg-[var(--sh-on-fg,var(--st-surface))]" : "left-0.5 bg-white")}>
        {busy && <Loader2 size={10} className="animate-spin text-[#8E9197]" />}
      </span>
    </button>
  );
}

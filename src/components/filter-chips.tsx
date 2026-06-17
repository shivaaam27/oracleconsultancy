"use client";

import type { ComponentType } from "react";
import { Filter } from "lucide-react";
import { cn } from "@/lib/cn";
import { CountPill } from "./ui";

export type FilterChipTone = "default" | "danger" | "warn";

export type FilterChipItem<K extends string> = {
  key: K;
  label: string;
  icon: ComponentType<{ size?: number; className?: string }>;
  count: number;
  tone?: FilterChipTone;
};

/**
 * Canonical Aurora filter row: icon + count chips that collapse to icon-only on
 * mobile (the active chip always shows its label, so you know what's applied)
 * and expand to full labels from sm up. Reuse this for any list page's status
 * filters instead of hand-rolling chips.
 */
export function FilterChips<K extends string>({
  items,
  value,
  onChange,
  className,
}: {
  items: Array<FilterChipItem<K>>;
  value: K;
  onChange: (key: K) => void;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      <Filter size={11} className="text-fg-subtle" />
      {items.map(({ key, label, icon: Icon, count, tone = "default" }) => {
        const active = value === key;
        const tint = active
          ? tone === "danger" ? "bg-danger-soft/70 ring-2 ring-danger/40 text-danger"
            : tone === "warn" ? "bg-warn-soft/70 ring-2 ring-warn/40 text-warn"
            : "bg-accent-soft/70 ring-2 ring-accent/40 text-accent"
          : count === 0 ? "bg-bg-subtle/40 ring-1 ring-border/60 text-fg-subtle"
          : tone === "danger" ? "bg-danger-soft/50 ring-1 ring-danger/25 text-danger hover:ring-2"
          : tone === "warn" ? "bg-warn-soft/50 ring-1 ring-warn/25 text-warn hover:ring-2"
          : "bg-bg-subtle/60 ring-1 ring-border/60 text-fg-muted hover:ring-2 hover:ring-border";
        return (
          <button
            key={key}
            type="button"
            onClick={() => onChange(key)}
            title={`${label} · ${count}`}
            aria-label={`${label} (${count})`}
            aria-pressed={active}
            className={cn(
              "inline-flex items-center gap-1.5 py-1.5 text-xs rounded-full transition-all backdrop-blur-md hover:shadow-sm",
              active ? "pl-2 pr-3" : "px-2 sm:pl-2 sm:pr-3",
              tint
            )}
          >
            <Icon size={13} className="shrink-0" />
            <CountPill count={count} tone="inherit" />
            <span className={cn("font-medium", active ? "inline" : "hidden sm:inline")}>{label}</span>
          </button>
        );
      })}
    </div>
  );
}

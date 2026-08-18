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
 * Canonical filter row: icon + count + label chips.
 *
 * ⚠️ These used to drop their LABELS below `sm` and show icon + count alone,
 * on the theory that the active chip's label was enough to tell you what was
 * applied. On the People directory that produced eight anonymous chips —
 * "✂ 2", "⏱ 0", "🔥 7", "⏳ 1", "🛡 30" — wrapped over two rows, and the
 * `title` tooltip that explained each one does not exist on a touch screen.
 * A filter you cannot name is a filter you cannot use.
 *
 * They keep their labels at every width now and the row scrolls sideways on a
 * phone instead of wrapping, which is both shorter and legible. From `sm` up it
 * wraps as before.
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
    <div
      className={cn(
        // See the note in task-filter-bar.tsx: `py-1` because a chip's ring is a
        // box-shadow and `overflow-x: auto` clips it — top edge first.
        "chip-scroll-fade -ml-4 flex items-center gap-1.5 overflow-x-auto py-1 pl-4",
        "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        "sm:ml-0 sm:flex-wrap sm:overflow-visible sm:py-0 sm:pl-0",
        className,
      )}
    >
      <Filter size={11} className="shrink-0 text-fg-subtle" />
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
              "inline-flex shrink-0 items-center gap-1.5 rounded-full py-1.5 pl-2 pr-3 text-xs transition-all backdrop-blur-md hover:shadow-sm",
              tint
            )}
          >
            <Icon size={13} className="shrink-0" />
            <CountPill count={count} tone="inherit" />
            <span className="whitespace-nowrap font-medium">{label}</span>
          </button>
        );
      })}
    </div>
  );
}

"use client";

import { useState } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";

export type MultiOption = { value: string; label: string; dot?: string };

/**
 * The one multi-select used by every Brief filter — month, company and person —
 * so they read as one control repeated, not three different widgets.
 *
 * Trigger deliberately mirrors FluidSelect's (same border/height/radius); the
 * menu is a Radix DropdownMenu of checkbox rows. Ticks are held locally and
 * handed back on CLOSE via `onApply`, so choosing four things costs one
 * round-trip instead of four.
 */
export function MultiSelect({
  value,
  options,
  onApply,
  allLabel,
  noun,
  className,
  disabled = false,
}: {
  value: string[];
  options: MultiOption[];
  onApply: (next: string[]) => void;
  /** Shown when nothing is ticked, e.g. "All companies" / "Everyone". */
  allLabel: string;
  /** Plural for the count label, e.g. "companies" → "3 companies". */
  noun: string;
  className?: string;
  disabled?: boolean;
}) {
  const [picked, setPicked] = useState<string[]>(value);

  function handleOpenChange(open: boolean) {
    if (open) {
      setPicked(value); // re-open in sync with what's actually applied
      return;
    }
    const a = [...picked].sort().join(",");
    const b = [...value].sort().join(",");
    if (a !== b) onApply(picked);
  }

  const toggle = (v: string) =>
    setPicked((prev) => (prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v]));

  const label =
    value.length === 0
      ? allLabel
      : value.length === 1
        ? options.find((o) => o.value === value[0])?.label ?? `1 ${noun}`
        : `${value.length} ${noun}`;

  // One selection shows its colour on the trigger, matching FluidSelect.
  const soleDot = value.length === 1 ? options.find((o) => o.value === value[0])?.dot : undefined;

  return (
    <DropdownMenu.Root onOpenChange={handleOpenChange}>
      <DropdownMenu.Trigger
        disabled={disabled}
        className={cn(
          "inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border border-border bg-bg-elev text-fg",
          "hover:bg-bg-muted btn-rim transition-colors select-none whitespace-nowrap",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring/60",
          "disabled:opacity-50 disabled:pointer-events-none",
          value.length > 0 && "border-accent text-accent",
          className
        )}
      >
        {soleDot && <span className="inline-block h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: soleDot }} />}
        <span className="min-w-0 flex-1 truncate text-left">{label}</span>
        <ChevronDown size={13} className="opacity-50" />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="start"
          sideOffset={6}
          className="z-[60] max-h-[55vh] min-w-[13rem] max-w-[min(20rem,calc(100vw-2rem))] overflow-y-auto rounded-2xl glass glass-menu elevated p-1.5"
        >
          {options.map((o) => {
            const on = picked.includes(o.value);
            return (
              <DropdownMenu.CheckboxItem
                key={o.value}
                checked={on}
                // Keep the menu open so several can be ticked in one go.
                onSelect={(e) => e.preventDefault()}
                onCheckedChange={() => toggle(o.value)}
                className={cn(
                  "flex cursor-pointer items-center gap-2 rounded-xl px-2.5 py-1.5 text-xs outline-none",
                  "hover:bg-bg-muted/60 focus:bg-bg-muted/60",
                  on ? "font-medium text-accent" : "text-fg-muted"
                )}
              >
                <span
                  className={cn(
                    "flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[5px] ring-1",
                    on ? "bg-accent text-accent-fg ring-accent" : "ring-border"
                  )}
                >
                  {on && <Check size={10} strokeWidth={3} />}
                </span>
                {o.dot && <span className="inline-block h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: o.dot }} />}
                <span className="min-w-0 truncate">{o.label}</span>
              </DropdownMenu.CheckboxItem>
            );
          })}
          {picked.length > 0 && (
            <>
              <DropdownMenu.Separator className="my-1 h-px bg-border/60" />
              <DropdownMenu.Item
                onSelect={(e) => e.preventDefault()}
                onClick={() => setPicked([])}
                className="cursor-pointer rounded-xl px-2.5 py-1.5 text-xs text-fg-muted outline-none hover:bg-bg-muted/60"
              >
                Clear
              </DropdownMenu.Item>
            </>
          )}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

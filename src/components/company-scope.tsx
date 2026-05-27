"use client";

import { useState, useTransition } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Check, X, Globe2 } from "lucide-react";
import { cn } from "@/lib/cn";
import { setCompanyScope } from "@/app/scope-actions";
import type { ScopeOption } from "@/lib/scope";

type Props = {
  options: ScopeOption[];
  current: ScopeOption | null;
};

export function CompanyScope({ options, current }: Props) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [query, setQuery] = useState("");

  const filtered = query
    ? options.filter((o) => o.name.toLowerCase().includes(query.toLowerCase()))
    : options;

  const select = (id: number | null) => {
    start(async () => {
      await setCompanyScope(id);
      setOpen(false);
      setQuery("");
    });
  };

  return (
    <DropdownMenu.Root open={open} onOpenChange={setOpen}>
      <DropdownMenu.Trigger asChild>
        <button
          className={cn(
            "shrink-0 inline-flex items-center gap-1.5 h-8 pl-2 pr-2.5 rounded-full text-[12px] transition-colors outline-none",
            current
              ? "bg-accent-soft text-fg hover:opacity-90"
              : "text-fg-muted hover:text-fg hover:bg-bg-muted/60",
            pending && "opacity-60"
          )}
          aria-label="Company scope"
          title={current ? `Scoped to ${current.name}` : "All companies"}
        >
          {current ? (
            <>
              <span
                className="inline-block w-2 h-2 rounded-full"
                style={{ backgroundColor: current.accent || "var(--accent)" }}
                aria-hidden
              />
              <span className="font-medium truncate max-w-[120px]">{current.name}</span>
              {current.overdue > 0 && (
                <span className="text-[10px] tabular text-danger font-semibold">
                  {current.overdue}
                </span>
              )}
            </>
          ) : (
            <>
              <Globe2 size={12} />
              <span className="hidden md:inline">All companies</span>
            </>
          )}
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          sideOffset={10}
          align="end"
          className="z-[60] w-[300px] vibrancy-strong rounded-xl shadow-lg overflow-hidden text-sm"
          // Don't auto-close when clicking inside the filter input
          onCloseAutoFocus={(e) => e.preventDefault()}
        >
          <div className="p-2 border-b border-border" onKeyDown={(e) => e.stopPropagation()}>
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter companies…"
              className="w-full px-2 py-1.5 text-sm rounded-md bg-bg-subtle outline-none focus:ring-1 focus:ring-accent"
            />
          </div>
          <div className="max-h-[360px] overflow-y-auto p-1">
            <DropdownMenu.Item
              onSelect={(e) => {
                e.preventDefault();
                select(null);
              }}
              className={cn(
                "w-full flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer outline-none data-[highlighted]:bg-bg-muted",
                !current && "bg-bg-muted"
              )}
            >
              <Globe2 size={13} className="text-fg-muted" />
              <span className="flex-1">All companies</span>
              {!current && <Check size={13} className="text-accent" />}
            </DropdownMenu.Item>
            <div className="h-px bg-border my-1 mx-1" />
            {filtered.length === 0 && (
              <div className="px-2 py-3 text-xs text-fg-subtle text-center">No matches.</div>
            )}
            {filtered.map((o) => {
              const active = current?.id === o.id;
              return (
                <DropdownMenu.Item
                  key={o.id}
                  onSelect={(e) => {
                    e.preventDefault();
                    select(o.id);
                  }}
                  className={cn(
                    "w-full flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer outline-none data-[highlighted]:bg-bg-muted",
                    active && "bg-bg-muted"
                  )}
                >
                  <span
                    className="inline-block w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: o.accent || "var(--accent)" }}
                    aria-hidden
                  />
                  <span className="flex-1 truncate">{o.name}</span>
                  <span className="text-[10px] text-fg-subtle tabular shrink-0">
                    {o.open} open
                  </span>
                  {o.overdue > 0 && (
                    <span className="text-[10px] tabular text-danger font-semibold shrink-0">
                      {o.overdue}!
                    </span>
                  )}
                  {active && <Check size={13} className="text-accent shrink-0" />}
                </DropdownMenu.Item>
              );
            })}
          </div>
          {current && (
            <div className="border-t border-border p-1">
              <DropdownMenu.Item
                onSelect={(e) => {
                  e.preventDefault();
                  select(null);
                }}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer outline-none text-fg-muted data-[highlighted]:bg-bg-muted data-[highlighted]:text-fg"
              >
                <X size={13} /> Clear scope
              </DropdownMenu.Item>
            </div>
          )}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

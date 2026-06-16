"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Archive, Check, RotateCcw, SlidersHorizontal, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { SearchInput } from "@/components/ui";
import { FluidSelect, type FluidOption } from "@/components/fluid-select";

/* The consolidated task toolbar (T-redesign): one row inside the header card —
 * search, a Company dropdown (filters the list in place), a Filters popover for
 * Priority/Status, and a Show-closed toggle. Replaces the old standalone
 * TaskFilters bar. Preserves every URL param so saved views keep working. */

type Props = {
  view: string;
  q: string;
  company?: string;
  priority?: string;
  status?: string;
  showClosed: boolean;
  closedCount: number;
  companies: Array<{ id: number; name: string }>;
  priorities: string[];
  statuses: string[];
};

export function TaskToolbar(props: Props) {
  const { view, q, company, priority, status, showClosed, closedCount, companies, priorities, statuses } = props;
  const router = useRouter();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);
  const popRef = useRef<HTMLDivElement>(null);

  function go(mut: (p: URLSearchParams) => void, scroll = false) {
    const p = new URLSearchParams(searchParams.toString());
    p.set("tab", "tasks");
    mut(p);
    router.push(`/?${p.toString()}`, { scroll });
  }
  const setParam = (key: string, value: string) =>
    go((p) => (value ? p.set(key, value) : p.delete(key)));

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (popRef.current && !popRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const narrowing = [priority, status].filter(Boolean).length;
  const companyOptions: FluidOption[] = [
    { value: "", label: "All companies" },
    ...companies.map((c) => ({ value: c.name, label: c.name })),
  ];
  // Shared height/shape so search · company · filters · closed line up cleanly.
  const ctrlCls = "h-9 rounded-xl";

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Search (table/board views) — kit SearchInput (matches /people, /documents) */}
      {(view === "table" || view === "board") && (
        <form
          className="relative flex-1 min-w-[180px]"
          onSubmit={(e) => {
            e.preventDefault();
            const v = (new FormData(e.currentTarget).get("q") as string) || "";
            setParam("q", v.trim());
          }}
        >
          <SearchInput
            name="q"
            defaultValue={q}
            placeholder="Search task, code, or person…"
            aria-label="Search tasks"
          />
        </form>
      )}

      {/* Company — Aurora glass dropdown that filters the list in place */}
      <FluidSelect
        value={company || ""}
        options={companyOptions}
        onSelect={(v) => setParam("company", v)}
        placeholder="All companies"
        buttonClassName={cn(ctrlCls, "bg-bg-subtle/70 border-border/60")}
      />

      {/* Filters popover — Priority + Status */}
      <div ref={popRef} className="relative">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className={cn(
            "inline-flex items-center gap-1.5 px-3 text-sm transition-shadow ring-1",
            ctrlCls,
            narrowing > 0 ? "bg-accent-soft/60 ring-accent/30 text-accent" : "bg-bg-subtle/70 ring-border/60 text-fg-muted hover:ring-border"
          )}
        >
          <SlidersHorizontal size={14} />
          Filters
          {narrowing > 0 && (
            <span className="inline-flex items-center justify-center min-w-[17px] h-[17px] px-1 rounded-full bg-accent text-accent-fg text-[10px] font-semibold tabular">
              {narrowing}
            </span>
          )}
        </button>

        {open && (
          <div className="absolute right-0 top-full mt-2 z-50 w-64 max-w-[calc(100vw-2rem)] rounded-2xl glass elevated ring-1 ring-border p-3 space-y-3">
            <PillGroup label="Priority">
              <Pill active={!priority} onClick={() => setParam("priority", "")}>All</Pill>
              {priorities.map((p) => (
                <Pill key={p} active={priority === p} onClick={() => setParam("priority", p)}>{p}</Pill>
              ))}
            </PillGroup>
            <PillGroup label="Status">
              <Pill active={!status} onClick={() => setParam("status", "")}>All</Pill>
              {statuses.map((s) => (
                <Pill key={s} active={status === s} onClick={() => setParam("status", s)}>{s}</Pill>
              ))}
            </PillGroup>
            {narrowing > 0 && (
              <button
                type="button"
                onClick={() => go((p) => { p.delete("priority"); p.delete("status"); })}
                className="inline-flex items-center gap-1.5 text-xs text-fg-muted hover:text-fg"
              >
                <RotateCcw size={12} /> Clear filters
              </button>
            )}
          </div>
        )}
      </div>

      {/* Show closed */}
      <button
        type="button"
        onClick={() => go((p) => (showClosed ? p.delete("closed") : p.set("closed", "1")))}
        className={cn(
          "inline-flex items-center gap-1.5 h-9 px-3 rounded-xl text-sm ring-1 transition-shadow",
          showClosed ? "bg-bg-muted ring-border text-fg" : "bg-bg-subtle/70 ring-border/60 text-fg-muted hover:ring-border"
        )}
      >
        {showClosed ? <Check size={14} className="text-accent" /> : <Archive size={14} />}
        Closed ({closedCount})
      </button>
    </div>
  );
}

function PillGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-[11px] uppercase tracking-wider text-fg-subtle">{label}</label>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

function Pill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "px-2.5 py-1 rounded-full text-xs transition-colors",
        active ? "bg-accent text-accent-fg font-medium" : "bg-bg-subtle/70 text-fg-muted hover:text-fg hover:bg-bg-muted"
      )}
    >
      {children}
    </button>
  );
}

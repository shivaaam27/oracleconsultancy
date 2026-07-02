"use client";

import { useEffect, useRef, useState } from "react";
import { Building2, Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";

/* Director scope picker for Settings — pick NONE (whole portfolio) or one/more
 * companies (a company director). Submits the chosen ids as repeated hidden
 * `directorCompanyIds` inputs so the server action reads them with getAll(). Only
 * meaningful when the role is Director (the action ignores it otherwise). */

export function DirectorScopePicker({
  companies, selected, className,
}: {
  companies: { id: number; name: string }[];
  selected: number[];
  className?: string;
}) {
  const [ids, setIds] = useState<number[]>(selected);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); }
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") setOpen(false); }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onKey); };
  }, [open]);

  const byId = new Map(companies.map((c) => [c.id, c.name]));
  const label = ids.length === 0 ? "All companies" : ids.length === 1 ? (byId.get(ids[0]) ?? "1 company") : `${ids.length} companies`;

  function toggle(id: number) {
    setIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  }

  return (
    <div ref={ref} className={cn("relative", className)}>
      {ids.map((id) => <input key={id} type="hidden" name="directorCompanyIds" value={id} />)}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Director scope"
        title="If Director: leave none for all companies, or pick one or more"
        className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-bg-elev px-2.5 text-xs text-fg ring-1 ring-border hover:ring-accent/40 transition-colors"
      >
        <Building2 size={13} className="shrink-0 text-fg-muted" />
        <span className="max-w-[9rem] truncate">{label}</span>
        <ChevronDown size={13} className={`shrink-0 text-fg-muted transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute z-30 mt-1.5 max-h-64 w-56 overflow-y-auto rounded-xl bg-bg-elev p-1 ring-1 ring-border shadow-lg">
          <button
            type="button"
            onClick={() => setIds([])}
            className={cn("flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs transition-colors hover:bg-bg-muted/60", ids.length === 0 ? "text-accent" : "text-fg")}
          >
            <span className={cn("inline-flex h-4 w-4 shrink-0 items-center justify-center rounded ring-1", ids.length === 0 ? "bg-accent text-accent-fg ring-accent" : "ring-border")}>
              {ids.length === 0 && <Check size={11} />}
            </span>
            All companies (portfolio)
          </button>
          <div className="my-1 h-px bg-border/60" />
          {companies.map((c) => {
            const on = ids.includes(c.id);
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => toggle(c.id)}
                className={cn("flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs transition-colors hover:bg-bg-muted/60", on ? "text-accent" : "text-fg")}
              >
                <span className={cn("inline-flex h-4 w-4 shrink-0 items-center justify-center rounded ring-1", on ? "bg-accent text-accent-fg ring-accent" : "ring-border")}>
                  {on && <Check size={11} />}
                </span>
                {c.name}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

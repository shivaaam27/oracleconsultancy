"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Building2, ChevronDown, Check, Search, X } from "lucide-react";

type Company = { id: number; name: string };

// The full-size Aurora field box (matches the task composer's other fields so
// every control on a form is the same height).
const selectBtn = "flex w-full items-center justify-between rounded-xl bg-bg-subtle ring-1 ring-border px-3.5 py-3 text-sm transition-colors hover:ring-accent/40";

/** A compact, searchable company chooser. Multi-select by default (ticks + chips);
 *  `single` mode picks exactly one and closes. Shared by the portal task composer,
 *  the paste-multiple composer and the event/meeting form so a company picker looks
 *  and behaves identically everywhere. */
export function CompanyMultiSelect({
  companies, value, onChange, single = false, buttonClassName = selectBtn,
}: {
  companies: Company[];
  value: number[];
  onChange: (ids: number[]) => void;
  single?: boolean;
  buttonClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); }
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") setOpen(false); }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onKey); };
  }, [open]);

  const byId = useMemo(() => new Map(companies.map((c) => [c.id, c.name])), [companies]);
  const selected = value.filter((id) => byId.has(id));
  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return companies;
    return companies.filter((c) => c.name.toLowerCase().includes(term));
  }, [companies, q]);

  function toggle(id: number) {
    if (single) { onChange([id]); setOpen(false); return; }
    onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);
  }

  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)} className={buttonClassName}>
        <span className="flex min-w-0 items-center gap-2">
          <Building2 size={15} className="shrink-0 text-fg-muted" />
          <span className={selected.length ? "text-fg" : "text-fg-muted"}>
            {selected.length === 0 ? (single ? "Choose a company…" : "Choose one or more…") : selected.length === 1 ? byId.get(selected[0]) : `${selected.length} companies`}
          </span>
        </span>
        <ChevronDown size={15} className={`shrink-0 text-fg-muted transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {selected.length > 1 && (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {selected.map((id) => (
            <span key={id} className="inline-flex items-center gap-1 rounded-full bg-accent-soft px-2.5 py-1 text-xs text-accent ring-1 ring-accent/25">
              {byId.get(id)}
              <button type="button" onClick={() => toggle(id)} aria-label={`Remove ${byId.get(id)}`} className="hover:opacity-70">
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
      )}

      {open && (
        <div className="absolute z-30 mt-1.5 w-full overflow-hidden rounded-xl bg-bg-elev ring-1 ring-border shadow-lg">
          <label className="relative block border-b border-border/60">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-muted" />
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search companies…" className="w-full bg-transparent py-2.5 pl-8 pr-3 text-sm placeholder:text-fg-muted focus:outline-none" />
          </label>
          <ul className="max-h-60 overflow-y-auto py-1">
            {filtered.length === 0 && <li className="px-3 py-2 text-xs text-fg-muted">No matches.</li>}
            {filtered.map((c) => {
              const on = value.includes(c.id);
              return (
                <li key={c.id}>
                  <button type="button" onClick={() => toggle(c.id)} className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-bg-muted/60 ${on ? "text-accent" : "text-fg"}`}>
                    <span className={`inline-flex h-4 w-4 shrink-0 items-center justify-center rounded ring-1 ${on ? "bg-accent text-accent-fg ring-accent" : "ring-border"}`}>
                      {on && <Check size={11} />}
                    </span>
                    {c.name}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

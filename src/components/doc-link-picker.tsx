"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Link2, Search } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * DocLinkPicker — a searchable "Link…" control for attaching a saved document to a
 * requirement / pipeline case / commitment. Replaces the native <select> (which was
 * an un-searchable wall of options once a company had 15–20+ documents): a compact
 * trigger opens a typeahead-filtered list anchored to the app. Reused by the company
 * + person statutory checklists and the doc-link control.
 */
export function DocLinkPicker({
  docs,
  onPick,
  disabled,
  label = "Link…",
  placeholder = "Search documents…",
  triggerClassName,
}: {
  docs: Array<{ id: number; title: string }>;
  onPick: (id: number) => void;
  disabled?: boolean;
  label?: string;
  placeholder?: string;
  triggerClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (s ? docs.filter((d) => d.title.toLowerCase().includes(s)) : docs).slice(0, 80);
  }, [q, docs]);

  return (
    <div ref={wrapRef} className="relative inline-block">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "inline-flex items-center gap-1 rounded-md bg-bg-subtle px-1.5 py-1 text-[11px] text-fg-muted ring-1 ring-border transition-colors hover:bg-bg-muted disabled:opacity-50",
          triggerClassName,
        )}
      >
        <Link2 size={11} /> {label} <ChevronDown size={11} className="text-fg-subtle" />
      </button>
      {open && (
        <div className="absolute left-0 z-50 mt-1 w-64 max-w-[80vw] overflow-hidden rounded-xl bg-bg-elev p-1 shadow-lg ring-1 ring-border">
          <div className="flex items-center gap-1.5 border-b border-border/60 px-2 py-1">
            <Search size={12} className="shrink-0 text-fg-subtle" />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={placeholder}
              className="w-full bg-transparent py-0.5 text-xs outline-none placeholder:text-fg-subtle"
            />
          </div>
          <ul className="max-h-56 overflow-auto py-1">
            {filtered.length === 0 && (
              <li className="px-2 py-2 text-[11px] text-fg-subtle">No documents match.</li>
            )}
            {filtered.map((d) => (
              <li key={d.id}>
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    setOpen(false);
                    setQ("");
                    onPick(d.id);
                  }}
                  className="block w-full truncate rounded-md px-2 py-1.5 text-left text-xs text-fg transition-colors hover:bg-bg-muted/60"
                >
                  {d.title}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

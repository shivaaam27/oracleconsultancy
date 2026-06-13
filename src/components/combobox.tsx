"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * Typeable combobox: a text input with an app-styled, properly-anchored
 * suggestion list that also accepts brand-new values. Replaces native
 * <datalist>, whose popup mis-renders in embedded browsers.
 *
 * Uncontrolled by design (defaultValue + a `name` for form submission), so
 * external DOM writes (e.g. AI scan-to-fill) keep working. `onCommit` fires
 * when an option is picked or Enter is pressed — used by the bulk actions.
 */
export function Combobox({
  name, options, defaultValue = "", placeholder, className, onCommit, onInput, clearOnCommit = false,
}: {
  name?: string;
  options: string[];
  defaultValue?: string;
  placeholder?: string;
  className?: string;
  onCommit?: (value: string) => void;
  /** Fires on every keystroke (for controlled-ish callers like the notes folder). */
  onInput?: (value: string) => void;
  clearOnCommit?: boolean;
}) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [query, setQuery] = useState(defaultValue);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = q ? options.filter((o) => o.toLowerCase().includes(q)) : options;
    return base.slice(0, 60);
  }, [query, options]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => { if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const commit = (value: string) => {
    if (inputRef.current) inputRef.current.value = clearOnCommit ? "" : value;
    setQuery(clearOnCommit ? "" : value);
    setOpen(false);
    onCommit?.(value);
  };

  return (
    <div ref={wrapRef} className="relative">
      <input
        ref={inputRef}
        name={name}
        defaultValue={defaultValue}
        placeholder={placeholder}
        autoComplete="off"
        className={cn(className, "pr-7")}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); setHighlight(0); onInput?.(e.target.value); }}
        onFocus={() => { if (inputRef.current) setQuery(inputRef.current.value); setOpen(true); }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setHighlight((h) => Math.min(h + 1, filtered.length - 1)); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setHighlight((h) => Math.max(h - 1, 0)); }
          else if (e.key === "Enter") {
            if (open && filtered[highlight]) { e.preventDefault(); commit(filtered[highlight]); }
            else if (onCommit) { e.preventDefault(); commit((e.target as HTMLInputElement).value.trim()); }
          } else if (e.key === "Escape") { setOpen(false); }
        }}
      />
      <ChevronDown size={14} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-fg-subtle" />
      {open && filtered.length > 0 && (
        <ul className="absolute left-0 right-0 z-50 mt-1 max-h-56 overflow-auto rounded-xl bg-bg-elev ring-1 ring-border shadow-lg py-1">
          {filtered.map((o, i) => (
            <li key={o}>
              <button
                type="button"
                onMouseDown={(e) => { e.preventDefault(); commit(o); }}
                onMouseEnter={() => setHighlight(i)}
                className={cn("block w-full truncate px-3 py-1.5 text-left text-sm transition-colors", i === highlight ? "bg-accent-soft text-accent" : "text-fg hover:bg-bg-muted/60")}
              >
                {o}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

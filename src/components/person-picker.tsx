"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { X, UserPlus, Check } from "lucide-react";
import { cn } from "@/lib/cn";

export type PickerPerson = { id: number; name: string };

/**
 * Accountable-person picker. Selected people render as removable chips; the
 * text box searches EXISTING people first. Typing a name that doesn't match
 * anyone shows an explicit "Add … as a new person" option — creating a person
 * is a deliberate choice, never an accident of free typing.
 *
 * Form integration: emits one hidden input (default name "accountable") with
 * the selected names comma-separated, matching what the server actions already
 * parse via splitNames + getOrCreatePersonSb. No server changes needed.
 */
export function PersonPicker({
  people,
  name = "accountable",
  defaultNames = [],
  placeholder = "Search people…",
  onChange,
}: {
  people: PickerPerson[];
  name?: string;
  defaultNames?: string[];
  placeholder?: string;
  /** Controlled callback — receives the selected names comma-separated. Lets
   *  state-driven forms (e.g. the Capture Wizard) read selections without a
   *  <form>. The hidden input is still emitted for form-action usage. */
  onChange?: (csv: string) => void;
}) {
  const [selected, setSelected] = useState<string[]>(defaultNames.filter(Boolean));

  // Mirror selections to the controlled callback (skips the initial mount so it
  // doesn't clobber a parent value it was just seeded from).
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) { mounted.current = true; return; }
    onChangeRef.current?.(selected.join(", "));
  }, [selected]);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const selectedLower = useMemo(() => new Set(selected.map((s) => s.toLowerCase())), [selected]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const pool = people.filter((p) => !selectedLower.has(p.name.toLowerCase()));
    if (!q) return pool.slice(0, 8);
    return pool.filter((p) => p.name.toLowerCase().includes(q)).slice(0, 8);
  }, [people, query, selectedLower]);

  // Offer "add new" only when the typed name matches no existing person exactly.
  const trimmed = query.trim();
  const exactExists = people.some((p) => p.name.toLowerCase() === trimmed.toLowerCase());
  const canAddNew = trimmed.length >= 2 && !exactExists && !selectedLower.has(trimmed.toLowerCase());

  const options: Array<{ key: string; label: string; isNew: boolean; value: string }> = [
    ...matches.map((p) => ({ key: `p-${p.id}`, label: p.name, isNew: false, value: p.name })),
    ...(canAddNew ? [{ key: "new", label: trimmed, isNew: true, value: trimmed }] : []),
  ];

  function add(value: string) {
    setSelected((s) => (s.some((x) => x.toLowerCase() === value.toLowerCase()) ? s : [...s, value]));
    setQuery("");
    setHighlight(0);
    inputRef.current?.focus();
  }
  function remove(value: string) {
    setSelected((s) => s.filter((x) => x !== value));
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") { e.preventDefault(); if (!open) { setOpen(true); setHighlight(0); } else { setHighlight((h) => Math.min(h + 1, options.length - 1)); } }
    else if (e.key === "ArrowUp") { e.preventDefault(); setHighlight((h) => Math.max(h - 1, 0)); }
    else if (e.key === "Enter") {
      // Never submit the form from this box — Enter picks the highlighted option.
      e.preventDefault();
      const opt = options[highlight] ?? options[0];
      if (open && opt) add(opt.value);
    } else if (e.key === "Backspace" && query === "" && selected.length > 0) {
      remove(selected[selected.length - 1]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div className="relative">
      <input type="hidden" name={name} value={selected.join(", ")} />
      <div
        className={cn(
          "w-full min-h-9 px-2 py-1.5 text-sm rounded-lg border border-border bg-bg-elev",
          "flex flex-wrap items-center gap-1.5 cursor-text",
          "focus-within:border-accent focus-within:ring-1 focus-within:ring-accent/40"
        )}
        onClick={() => inputRef.current?.focus()}
      >
        {selected.map((n) => (
          <span key={n} className="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-full bg-accent/10 text-accent text-xs font-medium">
            {n}
            <button
              type="button"
              aria-label={`Remove ${n}`}
              onClick={(e) => { e.stopPropagation(); remove(n); }}
              className="h-4 w-4 inline-flex items-center justify-center rounded-full hover:bg-accent/20"
            >
              <X size={10} />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); setHighlight(0); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onKeyDown={onKeyDown}
          placeholder={selected.length === 0 ? placeholder : ""}
          className="flex-1 min-w-[120px] bg-transparent outline-none border-none p-0 text-sm placeholder:text-fg-subtle"
        />
      </div>

      {open && options.length > 0 && (
        <ul className="absolute z-50 mt-1 w-full max-h-56 overflow-y-auto rounded-xl border border-border bg-bg-elev shadow-lg p-1">
          {options.map((opt, i) => (
            <li key={opt.key}>
              <button
                type="button"
                onMouseDown={(e) => { e.preventDefault(); add(opt.value); }}
                onMouseEnter={() => setHighlight(i)}
                className={cn(
                  "w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-left text-sm transition-colors",
                  i === highlight ? "bg-bg-muted" : "hover:bg-bg-muted/60",
                  opt.isNew && "text-accent"
                )}
              >
                {opt.isNew ? <UserPlus size={13} className="shrink-0" /> : <Check size={13} className="shrink-0 opacity-0" />}
                {opt.isNew ? (
                  <span>
                    Add <b>“{opt.label}”</b> as a new person
                  </span>
                ) : (
                  opt.label
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

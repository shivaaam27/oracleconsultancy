"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Search, X } from "lucide-react";
import { useAnchored } from "@/lib/use-anchored";

export type PickerPerson = { id: number; name: string };

/**
 * Searchable, collapsible multi-select for people. Replaces the long flat grid
 * of checkboxes/chips that became unusable once HR/directors see every person.
 *
 * - Controlled: pass `value` (selected ids) + `onChange`.
 * - Form use: pass `name` and it renders a hidden input per selection so the
 *   ids submit with a normal <form action=…> post (same shape as the old
 *   `name="workingIds"` checkboxes).
 */
export function PeoplePicker({
  people,
  value,
  onChange,
  name,
  placeholder = "Search people…",
  emptyLabel = "Select people",
}: {
  people: PickerPerson[];
  value: number[];
  onChange: (ids: number[]) => void;
  name?: string;
  placeholder?: string;
  emptyLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const anchor = useAnchored(triggerRef, open);

  // Close on outside click / Escape. The menu is portalled out of `ref`, so the
  // outside-click test must also spare the menu itself.
  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      const tgt = e.target as Node;
      if (ref.current?.contains(tgt) || menuRef.current?.contains(tgt)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const byId = useMemo(() => new Map(people.map((p) => [p.id, p.name])), [people]);
  const selected = value.filter((id) => byId.has(id));

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return people;
    return people.filter((p) => p.name.toLowerCase().includes(term));
  }, [people, q]);

  function toggle(id: number) {
    onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);
  }

  return (
    <div ref={ref} className="relative">
      {/* Hidden inputs so the selection posts with a normal form. */}
      {name && selected.map((id) => <input key={id} type="hidden" name={name} value={id} />)}

      {/* Trigger */}
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 rounded-xl bg-bg-subtle ring-1 ring-border px-3 py-2.5 text-left text-sm hover:ring-accent/40 transition-colors"
      >
        <span className={selected.length ? "text-fg" : "text-fg-muted"}>
          {selected.length ? `${selected.length} selected` : emptyLabel}
        </span>
        <ChevronDown size={15} className={`ml-auto shrink-0 text-fg-muted transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {/* Selected chips (always visible, removable) */}
      {selected.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {selected.map((id) => (
            <span key={id} className="inline-flex items-center gap-1 rounded-full bg-accent-soft text-accent ring-1 ring-accent/25 px-2.5 py-1 text-xs">
              {byId.get(id)}
              <button type="button" onClick={() => toggle(id)} aria-label={`Remove ${byId.get(id)}`} className="hover:opacity-70">
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Dropdown panel — portalled to <body> with fixed positioning so an
          `overflow-hidden` ancestor (swipe cards, list panels) can't clip it.
          z-[100] keeps it ABOVE the BottomSheet (z-91) it's often opened inside —
          a lower z left the menu stranded behind the sheet's glass. */}
      {open && anchor && typeof document !== "undefined" && createPortal(
        <div
          ref={menuRef}
          className="fixed z-[100] rounded-xl bg-bg-elev ring-1 ring-border shadow-lg overflow-hidden"
          style={{
            left: anchor.left,
            width: anchor.width,
            ...(anchor.openUp
              ? { bottom: anchor.bottomOffset + 6 }
              : { top: anchor.top + 6 }),
          }}
        >
          <label className="relative block border-b border-border/60">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-muted" />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={placeholder}
              className="w-full bg-transparent pl-8 pr-3 py-2.5 text-sm placeholder:text-fg-muted focus:outline-none"
            />
          </label>
          <ul className="overflow-y-auto py-1" style={{ maxHeight: anchor.maxHeight }}>
            {filtered.length === 0 && <li className="px-3 py-2 text-xs text-fg-muted">No matches.</li>}
            {filtered.map((p) => {
              const on = value.includes(p.id);
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => toggle(p.id)}
                    className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-bg-muted/60 ${on ? "text-accent" : "text-fg"}`}
                  >
                    <span className={`inline-flex h-4 w-4 shrink-0 items-center justify-center rounded ring-1 ${on ? "bg-accent text-accent-fg ring-accent" : "ring-border"}`}>
                      {on && <Check size={11} />}
                    </span>
                    {p.name}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>,
        document.body,
      )}
    </div>
  );
}

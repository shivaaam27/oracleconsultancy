"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { menuStyle, useAnchoredMenu } from "@/lib/use-anchored-menu";
import { Select } from "./ui";
import { ChevronDown, Link2, Search } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * DocLinkPicker — a searchable "Link…" control for attaching a saved document to a
 * requirement / pipeline case / commitment. Replaces the native <Select> (which was
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
  /* ⚠️ Portalled through the one hook — it is used on the event form, which is
     a bottom sheet, so an `absolute` panel was clipped. */
  const { anchorRef: wrapRef, menuRef, pos, mounted, isInside } =
    useAnchoredMenu<HTMLDivElement, HTMLDivElement>(open);

  useEffect(() => {
    if (!open) return;
    // ⚠️ Includes the PORTALLED panel — see `isInside`.
    const onDoc = (e: MouseEvent) => { if (!isInside(e.target as Node)) setOpen(false); };
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
          // h-7 / rounded-full so it matches the chips and the "Attach a file"
          // button it sits beside; it used to be 3px shorter than both.
          "inline-flex h-7 items-center gap-1 rounded-full bg-bg-subtle px-2.5 text-xs text-fg-muted ring-1 ring-border transition-colors hover:bg-bg-muted disabled:opacity-50",
          triggerClassName,
        )}
      >
        <Link2 size={11} /> {label} <ChevronDown size={11} className="text-fg-subtle" />
      </button>
      {mounted && open && pos && createPortal(
        <div ref={menuRef} style={menuStyle(pos, "min(80vw, 20rem)")}
          className="overflow-auto rounded-md bg-bg-elev p-1 shadow-lg ring-1 ring-border">
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
              <li className="px-2 py-2 text-xs text-fg-subtle">No documents match.</li>
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
        </div>,
        document.body,
      )}
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Building2, Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";
import { useAnchoredMenu, menuStyle } from "@/lib/use-anchored-menu";

/* Director scope picker for Settings — pick NONE (whole portfolio) or one/more
 * companies (a company director). Submits the chosen ids as repeated hidden
 * `directorCompanyIds` inputs so the server action reads them with getAll(). Only
 * meaningful when the role is Director (the action ignores it otherwise). */

export function DirectorScopePicker({
  companies, selected, className, onChange, fill,
}: {
  companies: { id: number; name: string }[];
  selected: number[];
  className?: string;
  /** Stretch to the space given, instead of shrink-wrapping the chosen label.
   *  The access list needs it so Save and Revoke line up down every row —
   *  "PES Ltd" and "All companies" are 60px apart otherwise. */
  fill?: boolean;
  /** Optional: for callers that submit through a server-action CALL rather than
   *  a form post (the People drawer). Forms keep using the hidden inputs. */
  onChange?: (ids: number[]) => void;
}) {
  const [ids, setIdsRaw] = useState<number[]>(selected);
  // Every caller is an event handler, so reading `ids` here is current — and it
  // keeps `onChange` OUT of the state updater, which React may run twice.
  const setIds = (next: number[] | ((cur: number[]) => number[])) => {
    const value = typeof next === "function" ? next(ids) : next;
    setIdsRaw(value);
    onChange?.(value);
  };
  const [open, setOpen] = useState(false);
  /* ⚠️ PORTALLED, per the house rule — this list used to be an `absolute` child
     of the field. In the People drawer it sits inside a card with
     `overflow-hidden` inside a scrolling panel: measured 256px tall with only
     134px visible, so more than half the companies were unreachable. */
  const { anchorRef, menuRef, pos, mounted, place, isInside } = useAnchoredMenu<HTMLDivElement, HTMLDivElement>(open);

  useEffect(() => {
    if (!open) return;
    // ⚠️ The test must include the MENU: it is no longer a child of the field,
    // so a naive "inside my wrapper?" check would treat picking a company as
    // clicking away and close the list before the choice lands.
    function onDoc(e: MouseEvent) { if (!isInside(e.target as Node)) setOpen(false); }
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") setOpen(false); }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onKey); };
  }, [open, isInside]);

  const byId = new Map(companies.map((c) => [c.id, c.name]));
  const label = ids.length === 0 ? "All companies" : ids.length === 1 ? (byId.get(ids[0]) ?? "1 company") : `${ids.length} companies`;

  function toggle(id: number) {
    setIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  }

  return (
    <div ref={anchorRef} className={cn("relative", className)}>
      {ids.map((id) => <input key={id} type="hidden" name="directorCompanyIds" value={id} />)}
      <button
        type="button"
        onClick={() => { setOpen((o) => !o); place(); }}
        aria-label="Director scope"
        title="If Director: leave none for all companies, or pick one or more"
        className={cn(
          "inline-flex h-8 items-center gap-1.5 rounded-lg bg-bg-elev px-2.5 text-xs text-fg ring-1 ring-border hover:ring-accent/40 transition-colors",
          fill && "w-full",
        )}
      >
        <Building2 size={13} className="shrink-0 text-fg-muted" />
        <span className={cn("truncate", fill ? "flex-1 text-left" : "max-w-[9rem]")}>{label}</span>
        <ChevronDown size={13} className={`shrink-0 text-fg-muted transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {mounted && open && pos && createPortal(
        <div
          ref={menuRef}
          style={menuStyle(pos, "min(92vw, 20rem)")}
          className="overflow-y-auto rounded-xl bg-bg-elev p-1 ring-1 ring-border shadow-lg"
        >
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
        </div>,
        document.body,
      )}
    </div>
  );
}

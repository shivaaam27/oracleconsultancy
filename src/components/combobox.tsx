"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Plus, Loader2 } from "lucide-react";
import { cn } from "@/lib/cn";
import { menuStyle, useAnchoredMenu } from "@/lib/use-anchored-menu";

/**
 * Typeable combobox: a text input with an app-styled, properly-anchored
 * suggestion list that also accepts brand-new values. Replaces native
 * <datalist>, whose popup mis-renders in embedded browsers.
 *
 * Uncontrolled by design (defaultValue + a `name` for form submission), so
 * external DOM writes (e.g. AI scan-to-fill) keep working. `onCommit` fires
 * when an option is picked or Enter is pressed — used by the bulk actions.
 *
 * ⚠️ THE MENU IS PORTALLED TO THE BODY AND POSITIONED `fixed`, exactly as
 * `FluidSelect` does it, and that is not a detail. As an `absolute` child of the
 * field it was CLIPPED by any ancestor that scrolls or hides its overflow — a
 * bottom sheet, a panel, a card. Measured on the "Start a batch" sheet: the
 * option list ran past the bottom of the card and was cut off mid-row, so the
 * choices below the fold were unreachable. A dropdown inside a dialog is the
 * normal case here, not the exception.
 */
export function Combobox({
  name, options, defaultValue = "", placeholder, className, onCommit, onInput, clearOnCommit = false,
  onCreate, createNoun,
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
  /**
   * Makes this dropdown able to ADD to its own list — ERPNext's "+ Create a new
   * Item" inside a link field. When the typed text matches nothing, a create row
   * appears at the foot of the menu; choosing it saves the new entry and selects
   * it, without leaving the form.
   *
   * Return `{ ok: false, error }` and the message is shown in the menu.
   */
  onCreate?: (name: string) => Promise<{ ok: boolean; error?: string; name?: string }>;
  /** What is being created, for the menu wording: `+ Add category "CEMENT"`. */
  createNoun?: string;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [query, setQuery] = useState(defaultValue);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  /* ⚠️ ONE HOOK FOR EVERY ANCHORED MENU — see `lib/use-anchored-menu.ts`. It
     portals, positions `fixed`, flips up when there is no room below, clamps to
     the viewport, and sits above every overlay. Six components used to write
     this by hand and all six were clipped inside a sheet. */
  const { anchorRef: wrapRef, menuRef, pos, mounted, isInside } =
    useAnchoredMenu<HTMLDivElement, HTMLUListElement>(open);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = q ? options.filter((o) => o.toLowerCase().includes(q)) : options;
    return base.slice(0, 60);
  }, [query, options]);

  // ⚠️ The outside-click test goes through `isInside`, which knows about the
  // PORTALLED menu as well as the field. A naive "is it inside my wrapper"
  // check treats choosing an option as clicking away, and closes the list
  // before the choice can land.
  useEffect(() => {
    const onDoc = (e: MouseEvent) => { if (!isInside(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Offer to create only when there is something typed and no option matches it
  // exactly — otherwise the row would sit there inviting a duplicate.
  const typed = query.trim();
  const canCreate = Boolean(
    onCreate && typed && !options.some((o) => o.toLowerCase() === typed.toLowerCase()),
  );

  const create = async () => {
    if (!onCreate || !typed) return;
    setCreating(true);
    setCreateError(null);
    const res = await onCreate(typed);
    setCreating(false);
    if (!res.ok) { setCreateError(res.error ?? "Couldn't add that."); return; }
    // Show what was SAVED, which may have been tidied (upper-cased, spacing).
    commit(res.name ?? typed);
  };

  const commit = (value: string) => {
    if (inputRef.current) inputRef.current.value = clearOnCommit ? "" : value;
    setQuery(clearOnCommit ? "" : value);
    setOpen(false);
    onCommit?.(value);
  };

  return (
    /* ⚠️ `w-full min-w-0`, AND BOTH HALVES MATTER.
       An <input> with no width class falls back to the browser's default — about
       242px, from the ancient `size=20` attribute — and that width IGNORES the
       grid cell it sits in. Measured on the product sheet: three 135px cells
       each holding a 242px combobox, which overflowed the row, overflowed the
       form, and put a horizontal scrollbar inside the dialog. `min-w-0` is what
       lets it shrink below its content in a grid or flex track; `w-full` is what
       makes it fill the cell instead of guessing. */
    <div ref={wrapRef} className="relative w-full min-w-0">
      <input
        ref={inputRef}
        name={name}
        defaultValue={defaultValue}
        placeholder={placeholder}
        autoComplete="off"
        /* `w-full` FIRST so a caller can still override it — tailwind-merge
           keeps the last width class it sees. */
        /* ⚠️ THE BUG THIS FIXES: there was NO type size and NO height here, so
           the input fell back to the browser's 16px default — every typeable
           dropdown in COS rendered a head larger than the field beside it, and
           it showed up the moment two sat side by side on the recipe form.
           It is the same box as `Select` and `FluidSelect`, by construction. */
        className={cn("w-full min-w-0 h-8 rounded-md px-2.5 text-sm", className, "pr-7")}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); setHighlight(0); onInput?.(e.target.value); }}
        onFocus={() => { if (inputRef.current) setQuery(inputRef.current.value); setOpen(true); }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setHighlight((h) => Math.min(h + 1, filtered.length - 1)); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setHighlight((h) => Math.max(h - 1, 0)); }
          else if (e.key === "Enter") {
            if (open && filtered[highlight]) { e.preventDefault(); commit(filtered[highlight]); }
            else if (canCreate) { e.preventDefault(); void create(); }
            else if (onCommit) { e.preventDefault(); commit((e.target as HTMLInputElement).value.trim()); }
          } else if (e.key === "Escape") { setOpen(false); }
        }}
      />
      <ChevronDown size={14} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-fg-subtle" />
      {mounted && open && pos && (filtered.length > 0 || canCreate) && createPortal(
        <ul
          ref={menuRef}
          role="listbox"
          style={menuStyle(pos)}
          className="overflow-auto rounded-md bg-bg-elev ring-1 ring-border shadow-lg py-1"
        >
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
          {canCreate && (
            <li className={cn(filtered.length > 0 && "mt-1 border-t border-border pt-1")}>
              <button
                type="button"
                disabled={creating}
                onMouseDown={(e) => { e.preventDefault(); void create(); }}
                className="flex w-full items-center gap-1.5 px-3 py-1.5 text-left text-sm text-accent hover:bg-accent-soft disabled:opacity-60"
              >
                {creating ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
                <span className="truncate">
                  Add {createNoun ?? "entry"} <strong>{typed}</strong>
                </span>
              </button>
            </li>
          )}
          {createError && (
            <li className="px-3 py-1.5 text-xs text-danger">{createError}</li>
          )}
        </ul>,
        document.body,
      )}
    </div>
  );
}

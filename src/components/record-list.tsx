"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronDown, ChevronUp, ChevronsUpDown, Columns3, Check, Keyboard } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * RecordList — the ONE list screen (Stage 2 of the ERPNext redesign).
 *
 * Every list in COS should be this component: a left filter rail with live
 * counts, a toolbar, sortable columns, tickable rows that raise a bulk action
 * bar, and a footer that says how many of how many you are looking at.
 *
 * It is deliberately DUMB and prop-driven, and the props are shaped like the
 * metadata that will drive them in Stage 3 (`listColumns` / `filters` on an
 * EntityDef). Sorting and filtering are expressed as URLs, not internal state,
 * so the server component above it stays the single source of truth and every
 * view is a shareable link — the same contract the Tasks page already uses.
 *
 * See memory/erpnext_redesign_plan.md and DESIGN_SYSTEM.md.
 */

/** One column. `render` receives the whole row, so cells can be rich. */
export type RecordColumn<T> = {
  key: string;
  label: string;
  /** CSS grid track, e.g. "minmax(0,1fr)" or "140px". */
  width: string;
  align?: "left" | "right";
  /** Href that sorts by this column; omit to make the column unsortable. */
  sortHref?: string;
  /** Set when the list is currently sorted by this column. */
  sorted?: "asc" | "desc";
  /** Hide below `sm` / `md` — keeps a dense list usable on a phone. */
  hideBelow?: "sm" | "md" | "lg";
  render: (row: T) => ReactNode;
};

/** One entry in the left rail. Groups are separated by their `group` label. */
export type RecordFilter = {
  key: string;
  label: string;
  count?: number;
  href: string;
  active: boolean;
  group?: string;
  tone?: "danger" | "warn" | "info" | "success";
};

/** One action offered when rows are ticked. `run` gets the selected keys. */
export type BulkAction<T> = {
  label: string;
  icon?: ReactNode;
  tone?: "default" | "danger";
  run: (rows: T[]) => Promise<void> | void;
};

const TONE_TEXT: Record<string, string> = {
  danger: "text-danger",
  warn: "text-warn",
  info: "text-accent",
  success: "text-success",
};

/* ---------------------------------------------------------------- rail --- */

/**
 * The rail as a horizontal strip, for screens too narrow for a 184px column.
 *
 * ⚠️ Without this the rail is simply `hidden` below `md` — which means a phone
 * gets NO filters at all. That was survivable while every converted list was
 * admin-only and used on a desktop; it stopped being survivable when the staff
 * portal moved onto this shell, because a staff member has no Tasks tab and this
 * list on their home IS their only way to filter. Same filters, same counts,
 * same links — laid on their side.
 */
function FilterStrip({ filters }: { filters: RecordFilter[] }) {
  return (
    <nav
      aria-label="Filters"
      className="-mx-1 mb-2 flex gap-1.5 overflow-x-auto px-1 pb-1 md:hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {filters.map((f) => (
        <Link
          key={f.key}
          href={f.href}
          scroll={false}
          className={cn(
            "inline-flex shrink-0 items-center gap-1.5 rounded-md border px-2 py-1 text-[12px] transition-colors",
            f.active
              ? "border-accent/40 bg-accent-soft font-medium text-accent"
              : "border-border bg-bg-elev text-fg-muted"
          )}
        >
          <span className="whitespace-nowrap">{f.label}</span>
          {f.count !== undefined && (
            <span className={cn("tabular text-[11px]", !f.active && f.tone && TONE_TEXT[f.tone], f.active ? "text-accent" : "text-fg-subtle")}>
              {f.count}
            </span>
          )}
        </Link>
      ))}
    </nav>
  );
}

function FilterRail({ filters }: { filters: RecordFilter[] }) {
  const groups: { label: string | null; items: RecordFilter[] }[] = [];
  for (const f of filters) {
    const label = f.group ?? null;
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.items.push(f);
    else groups.push({ label, items: [f] });
  }
  return (
    <nav aria-label="Filters" className="space-y-3">
      {groups.map((g, i) => (
        <div key={g.label ?? i}>
          {g.label && (
            <p className="px-2 pb-1 text-[11px] font-medium uppercase tracking-[0.06em] text-fg-subtle">
              {g.label}
            </p>
          )}
          <ul>
            {g.items.map((f) => (
              <li key={f.key}>
                <Link
                  href={f.href}
                  scroll={false}
                  className={cn(
                    "flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-[13px] transition-colors",
                    f.active
                      ? "bg-accent-soft font-medium text-accent"
                      : "text-fg-muted hover:bg-bg-subtle hover:text-fg"
                  )}
                >
                  <span className="truncate">{f.label}</span>
                  {f.count !== undefined && (
                    <span className={cn("tabular text-[12px]", !f.active && f.tone && TONE_TEXT[f.tone], f.active ? "text-accent" : "text-fg-subtle")}>
                      {f.count}
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}

/* -------------------------------------------------------------- header --- */

function SortIcon({ sorted }: { sorted?: "asc" | "desc" }) {
  if (sorted === "asc") return <ChevronUp size={12} className="shrink-0" />;
  if (sorted === "desc") return <ChevronDown size={12} className="shrink-0" />;
  return <ChevronsUpDown size={12} className="shrink-0 opacity-0 transition-opacity group-hover/col:opacity-60" />;
}

const HIDE: Record<string, string> = {
  sm: "hidden sm:block",
  md: "hidden md:block",
  lg: "hidden lg:block",
};

/** Grid template for a column set — shared by the header and every row so they
 *  line up exactly. */
function gridFor<T>(columns: RecordColumn<T>[], hasSelection: boolean) {
  const cols = columns.map((c) => c.width).join(" ");
  return { gridTemplateColumns: hasSelection ? `28px ${cols}` : cols };
}

/**
 * The column header strip on its own.
 *
 * A list that is split into collapsible groups (People, grouped by company)
 * draws ONE header above the groups and then a headerless RecordList inside
 * each — otherwise the column names repeat down the page.
 */
export function RecordListHeader<T>({
  columns, hasSelection = false, className,
}: { columns: RecordColumn<T>[]; hasSelection?: boolean; className?: string }) {
  return (
    <div
      data-list-head
      style={gridFor(columns, hasSelection)}
      className={cn("grid items-center gap-x-3 rounded-t-xl border border-border bg-bg-subtle px-3", className)}
    >
      {hasSelection && <span />}
      {columns.map((c) => {
        const inner = (
          <span className={cn("group/col inline-flex items-center gap-1", c.align === "right" && "flex-row-reverse")}>
            {c.label}
            {c.sortHref && <SortIcon sorted={c.sorted} />}
          </span>
        );
        return (
          <div key={c.key} className={cn("min-w-0 truncate", c.align === "right" && "text-right", c.hideBelow && HIDE[c.hideBelow])}>
            {c.sortHref ? <Link href={c.sortHref} scroll={false} className="hover:text-fg">{inner}</Link> : inner}
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------ column chooser --- */

/**
 * Which columns you want to see, remembered per list (Stage 5).
 *
 * Only possible because the columns are metadata: the chooser lists them,
 * stores the hidden keys in this browser, and the list re-renders without them.
 * The FIRST column is never hideable — it is the record's identity, and a list
 * of blank rows helps nobody.
 */
function hiddenKey(listKey: string) {
  return `cos-cols-${listKey}`;
}

function useHiddenColumns(listKey?: string) {
  const [hidden, setHidden] = useState<string[]>([]);
  useEffect(() => {
    if (!listKey) return;
    try {
      const raw = localStorage.getItem(hiddenKey(listKey));
      if (raw) setHidden(JSON.parse(raw));
    } catch { /* private mode — show everything */ }
  }, [listKey]);
  function toggle(key: string) {
    setHidden((prev) => {
      const next = prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key];
      if (listKey) {
        try { localStorage.setItem(hiddenKey(listKey), JSON.stringify(next)); } catch { /* ignore */ }
      }
      return next;
    });
  }
  return { hidden, toggle };
}

function ColumnChooser<T>({
  columns, hidden, onToggle,
}: { columns: RecordColumn<T>[]; hidden: string[]; onToggle: (k: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title="Choose columns"
        className="inline-flex items-center gap-1.5 rounded-md border border-border bg-bg-elev px-2 py-1 text-[11px] font-medium text-fg-muted transition-colors hover:text-fg"
      >
        <Columns3 size={12} /> Columns
      </button>
      {open && (
        <>
          <span className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <span className="glass-menu absolute right-0 z-50 mt-1 block min-w-[180px] rounded-md p-1">
            {columns.map((c, i) => {
              const locked = i === 0;
              const on = !hidden.includes(c.key);
              return (
                <button
                  key={c.key}
                  type="button"
                  disabled={locked}
                  onClick={() => onToggle(c.key)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-[12px]",
                    locked ? "cursor-default text-fg-subtle" : "text-fg hover:bg-bg-subtle"
                  )}
                >
                  <span className={cn("flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-sm border",
                    on ? "border-accent bg-accent text-accent-fg" : "border-border-strong")}>
                    {on && <Check size={10} strokeWidth={3} />}
                  </span>
                  {c.label}
                </button>
              );
            })}
          </span>
        </>
      )}
    </span>
  );
}

/* ------------------------------------------------------------ keyboard --- */

/**
 * Keyboard navigation — the other half of why ERPNext feels fast.
 *
 * j/k (or ↑/↓) walk the rows, Enter opens, x ticks, / jumps to the search box,
 * Escape lets go, ? explains itself. Written ONCE here, so every converted list
 * has it: Tasks, People, Documents, Assets, Vendors, Commitments.
 *
 * Three things this has to get right, all of them the usual bugs:
 *
 * 1. NEVER swallow a key meant for a field. While you are typing in an input,
 *    a textarea, a select or a contenteditable, "x" is the letter x. Only
 *    Escape does anything there, and all it does is let go of the field.
 * 2. NEVER fire behind a dialog. Half these lists open one, and so does ⌘K —
 *    any `[role="dialog"]` on the page means the keys are not ours.
 * 3. NEVER let two lists answer the same key. /hrms/assets mounts Assets AND
 *    Vendors at once, so the handler asks whether it belongs to the FIRST
 *    list actually on screen; the hidden one stays quiet without either list
 *    knowing the other exists.
 */
function isTypingTarget(el: EventTarget | null): boolean {
  const t = el as HTMLElement | null;
  if (!t || !t.tagName) return false;
  return t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName);
}

/** Reduced motion, both ways COS expresses it: the OS setting and the portal's
 *  own toggle (`data-motion="reduced"` on <html>). */
function prefersCalm(): boolean {
  if (typeof window === "undefined") return true;
  return (
    document.documentElement.dataset.motion === "reduced" ||
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/** Is this the list the keys belong to? The first one that is actually rendered
 *  (a hidden tab has no offsetParent) wins. */
function isFrontList(el: HTMLElement | null): boolean {
  if (!el) return false;
  const all = Array.from(document.querySelectorAll<HTMLElement>("[data-record-list]"))
    .filter((n) => n.offsetParent !== null);
  return all.length === 0 ? false : all[0] === el;
}

const SHORTCUTS: { keys: string; what: string }[] = [
  { keys: "j / ↓", what: "Next row" },
  { keys: "k / ↑", what: "Previous row" },
  { keys: "Enter", what: "Open the highlighted record" },
  { keys: "x", what: "Tick the row for a bulk change" },
  { keys: "/", what: "Jump to the search box" },
  { keys: "Esc", what: "Let go" },
  { keys: "?", what: "This list" },
];

function ShortcutsCard({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-label="Keyboard shortcuts"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[320px] rounded-lg border border-border bg-bg-elev p-3 shadow-lg"
      >
        <p className="mb-2 flex items-center gap-1.5 text-[12px] font-semibold text-fg">
          <Keyboard size={13} className="text-fg-subtle" /> Keyboard
        </p>
        <ul className="space-y-1">
          {SHORTCUTS.map((s) => (
            <li key={s.keys} className="flex items-center justify-between gap-3 text-[12px]">
              <span className="text-fg-muted">{s.what}</span>
              <kbd className="rounded-sm border border-border bg-bg-subtle px-1.5 py-0.5 font-mono text-[11px] text-fg">
                {s.keys}
              </kbd>
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={onClose}
          className="mt-3 w-full rounded-md border border-border py-1 text-[12px] text-fg-muted hover:text-fg"
        >
          Close
        </button>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- list --- */

export function RecordList<T>({
  rows,
  columns,
  rowKey,
  rowHref,
  onRowClick,
  filters,
  toolbar,
  selectionSlot,
  bulkBar,
  subRow,
  rowActions,
  groupOf,
  total,
  shown,
  footerNote,
  empty,
  showHeader = true,
  showFooter = true,
  bare = false,
  listKey,
  bulkActions,
  className,
}: {
  rows: T[];
  columns: RecordColumn<T>[];
  rowKey: (row: T) => string | number;
  /** Makes the whole row a link. Ignored when `onRowClick` is given. */
  rowHref?: (row: T) => string;
  onRowClick?: (row: T) => void;
  /** Left rail. Omit for a list with no filters — the rail disappears entirely. */
  filters?: RecordFilter[];
  /** Search box, view switcher, saved views — anything above the table. */
  toolbar?: ReactNode;
  /** Per-row tick box (wire to your selection context). */
  selectionSlot?: (row: T) => ReactNode;
  /** Rendered above the list when a selection exists. */
  bulkBar?: ReactNode;
  /** Optional second line under the columns (context ERPNext wouldn't show, but
   *  the owner reads: company, latest update). Hidden in Compact until hover. */
  subRow?: (row: T) => ReactNode;
  /** Hover-revealed actions, overlaid right so they never shift the columns. */
  rowActions?: (row: T) => ReactNode;
  /** Return a heading to start a new group at this row. */
  groupOf?: (row: T) => string | null;
  total?: number;
  shown?: number;
  footerNote?: ReactNode;
  empty?: ReactNode;
  /** Off when a shared <RecordListHeader> is drawn above collapsible groups. */
  showHeader?: boolean;
  showFooter?: boolean;
  /** Drop the card frame — for a list rendered INSIDE an existing housing. */
  bare?: boolean;
  /** Turns on the column chooser and remembers the choice under this key
   *  (Stage 5). Omit for a list whose columns are not the user's business. */
  listKey?: string;
  /** Supplying these turns on built-in ticking: a box on every row, select-all
   *  in the header, and a bar of actions while anything is selected (Stage 5).
   *  A list that already owns its own selection passes `selectionSlot` instead. */
  bulkActions?: BulkAction<T>[];
  className?: string;
}) {
  const { hidden, toggle } = useHiddenColumns(listKey);
  const [picked, setPicked] = useState<Set<string | number>>(new Set());
  const [running, setRunning] = useState(false);
  const bulkOn = !!bulkActions?.length;
  const pickedRows = bulkOn ? rows.filter((r) => picked.has(rowKey(r))) : [];
  const allPicked = bulkOn && rows.length > 0 && rows.every((r) => picked.has(rowKey(r)));
  function togglePick(k: string | number) {
    setPicked((prev) => { const next = new Set(prev); if (next.has(k)) next.delete(k); else next.add(k); return next; });
  }
  // The caller's own tick box wins; otherwise the built-in one appears.
  const tick = selectionSlot ?? (bulkOn ? (row: T) => (
    <span className={cn("flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border transition-colors",
      picked.has(rowKey(row)) ? "border-accent bg-accent text-accent-fg" : "border-border-strong")}
      onClick={(e) => { e.stopPropagation(); togglePick(rowKey(row)); }}>
      {picked.has(rowKey(row)) && <Check size={11} strokeWidth={3} />}
    </span>
  ) : undefined);
  // The first column is the record's identity and is never hidden.
  const visibleColumns = columns.filter((c, i) => i === 0 || !hidden.includes(c.key));
  const gridStyle = gridFor(visibleColumns, !!tick);

  /* -------------------------------------------------- keyboard ---------- */
  const router = useRouter();
  const rootRef = useRef<HTMLDivElement>(null);
  const toolbarRef = useRef<HTMLSpanElement>(null);
  const rowRefs = useRef<(HTMLLIElement | null)[]>([]);
  const [cursor, setCursor] = useState<number | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);

  // Filtering changes the row count under the highlight; drop it rather than
  // leave it pointing at a row that has gone.
  useEffect(() => {
    setCursor((c) => (c === null ? null : c < rows.length ? c : null));
  }, [rows.length]);

  const move = useCallback((delta: number) => {
    setCursor((c) => {
      const next = c === null ? (delta > 0 ? 0 : rows.length - 1) : c + delta;
      if (next < 0 || next >= rows.length) return c;
      rowRefs.current[next]?.scrollIntoView({
        block: "nearest",
        behavior: prefersCalm() ? "auto" : "smooth",
      });
      return next;
    });
  }, [rows.length]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // A shortcut is a bare key. ⌘K, Ctrl+F and friends stay theirs.
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      if (isTypingTarget(e.target)) {
        // The one thing that works inside a field: Escape gets you out of it.
        if (e.key === "Escape") (e.target as HTMLElement).blur();
        return;
      }
      // Our own help card is a dialog, so check it before the dialog guard.
      if (helpOpen) {
        if (e.key === "Escape") { e.preventDefault(); setHelpOpen(false); }
        return;
      }
      if (document.querySelector('[role="dialog"]')) return;
      if (!isFrontList(rootRef.current)) return;

      // "?" is Shift+/ — and not every keyboard/layout reports it as "?", some
      // send "/" with shiftKey set. Take it either way, and before the "/" case
      // below or Shift+/ would just focus the search box.
      if (e.key === "?" || (e.key === "/" && e.shiftKey)) {
        e.preventDefault();
        setHelpOpen(true);
        return;
      }

      switch (e.key) {
        case "j": case "ArrowDown": e.preventDefault(); move(1); break;
        case "k": case "ArrowUp":   e.preventDefault(); move(-1); break;
        case "Enter": {
          if (cursor === null || !rows[cursor]) return;
          e.preventDefault();
          const row = rows[cursor];
          if (onRowClick) onRowClick(row);
          else if (rowHref) router.push(rowHref(row));
          break;
        }
        case "x": {
          if (cursor === null || !rows[cursor] || !bulkOn) return;
          e.preventDefault();
          togglePick(rowKey(rows[cursor]));
          break;
        }
        case "/": {
          // The search box belongs to the caller, not to us. Usually it is in
          // the toolbar we were handed — but not always: the Tasks list keeps
          // its search up in the page header, above this component entirely.
          // So fall back to the first field on the page that SAYS it searches,
          // rather than grabbing whatever input happens to be first (which on
          // Tasks would be the inline "add a task" box).
          const field =
            toolbarRef.current?.querySelector<HTMLInputElement>("input") ??
            document.querySelector<HTMLInputElement>(
              'input[type="search"], input[placeholder*="earch" i], input[aria-label*="earch" i]'
            );
          if (!field) return;
          e.preventDefault();
          field.focus();
          field.select?.();
          break;
        }
        case "Escape": setCursor(null); break;
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cursor, rows, rowHref, onRowClick, bulkOn, move, helpOpen, router, rowKey]);

  let lastGroup: string | null = null;

  return (
    <div ref={rootRef} data-record-list className={cn("flex gap-4", className)}>
      {helpOpen && <ShortcutsCard onClose={() => setHelpOpen(false)} />}
      {filters && filters.length > 0 && (
        <aside className="hidden w-[184px] shrink-0 md:block">
          <FilterRail filters={filters} />
        </aside>
      )}

      <div className="min-w-0 flex-1">
        {/* Below md the rail cannot fit beside the table, so it lies on its side
            above it rather than disappearing. */}
        {filters && filters.length > 0 && <FilterStrip filters={filters} />}
        {(toolbar || listKey) && (
          <div className="flex flex-wrap items-center gap-2">
            <span ref={toolbarRef} className="min-w-0 flex-1">{toolbar}</span>
            {listKey && <ColumnChooser columns={columns} hidden={hidden} onToggle={toggle} />}
          </div>
        )}
        {bulkBar}
        {bulkOn && pickedRows.length > 0 && (
          <div className="mt-2 flex flex-wrap items-center gap-2 rounded-md border border-accent/30 bg-accent-soft px-3 py-1.5 text-[12px]">
            <span className="font-medium text-accent">
              <b className="tabular">{pickedRows.length}</b> selected
            </span>
            <span className="ml-auto flex flex-wrap items-center gap-1.5">
              {bulkActions!.map((a) => (
                <button
                  key={a.label}
                  type="button"
                  disabled={running}
                  onClick={async () => {
                    setRunning(true);
                    try { await a.run(pickedRows); setPicked(new Set()); }
                    finally { setRunning(false); }
                  }}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium ring-1 transition-colors disabled:opacity-50",
                    a.tone === "danger"
                      ? "bg-bg-elev text-danger ring-border hover:bg-danger hover:text-white"
                      : "bg-bg-elev text-fg ring-border hover:bg-bg-subtle"
                  )}
                >
                  {a.icon}{a.label}
                </button>
              ))}
              <button type="button" onClick={() => setPicked(new Set())}
                className="rounded-md px-2 py-1 text-[11px] text-fg-muted hover:text-fg">
                Clear
              </button>
            </span>
          </div>
        )}

        <div className={cn(!bare && "mt-2 overflow-hidden rounded-xl border border-border bg-bg-elev")}>
          {showHeader && (
            <div
              data-list-head
              style={gridStyle}
              className="grid items-center gap-x-3 border-b border-border bg-bg-subtle px-3"
            >
              {tick && (
                <span>
                  {bulkOn && !selectionSlot && (
                    <button type="button" aria-label="Select all"
                      onClick={() => setPicked(allPicked ? new Set() : new Set(rows.map(rowKey)))}
                      className={cn("flex h-4 w-4 items-center justify-center rounded-sm border transition-colors",
                        allPicked ? "border-accent bg-accent text-accent-fg" : "border-border-strong")}>
                      {allPicked && <Check size={11} strokeWidth={3} />}
                    </button>
                  )}
                </span>
              )}
              {visibleColumns.map((c) => {
                const inner = (
                  <span className={cn("group/col inline-flex items-center gap-1", c.align === "right" && "flex-row-reverse")}>
                    {c.label}
                    {c.sortHref && <SortIcon sorted={c.sorted} />}
                  </span>
                );
                return (
                  <div
                    key={c.key}
                    className={cn("min-w-0 truncate", c.align === "right" && "text-right", c.hideBelow && HIDE[c.hideBelow])}
                  >
                    {c.sortHref ? (
                      <Link href={c.sortHref} scroll={false} className="hover:text-fg">
                        {inner}
                      </Link>
                    ) : (
                      inner
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {rows.length === 0 ? (
            <div className="px-3 py-10">{empty}</div>
          ) : (
            <ul className="divide-y divide-border">
              {rows.map((row, i) => {
                const key = rowKey(row);
                const group = groupOf?.(row) ?? null;
                const starts = group !== null && group !== lastGroup;
                if (starts) lastGroup = group;
                const cells = (
                  <div data-list-row className="group/row relative px-3">
                    <div style={gridStyle} className="grid items-center gap-x-3">
                      {tick && (
                        <span onClick={(e) => e.stopPropagation()}>{tick(row)}</span>
                      )}
                      {visibleColumns.map((c) => (
                        <div
                          key={c.key}
                          className={cn("min-w-0 truncate", c.align === "right" && "text-right", c.hideBelow && HIDE[c.hideBelow])}
                        >
                          {c.render(row)}
                        </div>
                      ))}
                    </div>
                    {/* In Compact the context line hides until hover, so the row
                        is one line but the detail is still a glance away. That
                        rule lives in globals.css, keyed on data-subrow. */}
                    {subRow && (
                      <div data-subrow className={cn("mt-0.5 min-w-0", tick && "pl-[2.4rem]")}>
                        {subRow(row)}
                      </div>
                    )}
                    {/* Row actions: hover-revealed on a mouse; ALWAYS shown on a
                        touch screen, where there is no hover and a hidden action
                        is simply an unreachable one. */}
                    {rowActions && (
                      <span
                        onClick={(e) => e.stopPropagation()}
                        className="absolute right-3 top-1.5 rounded-md bg-bg-elev pl-2 shadow-sm ring-1 ring-border transition-opacity focus-within:opacity-100 md:opacity-0 md:group-hover/row:opacity-100"
                      >
                        {rowActions(row)}
                      </span>
                    )}
                  </div>
                );
                return (
                  <Fragment key={key}>
                    {/* Group band (company, priority, urgency…).
                     *
                     * It STICKS to the top of the scroll area, because the whole
                     * point of a band is knowing which group you are looking at
                     * — and in a long list it used to scroll away, leaving rows
                     * with no heading. It also carries the count, so "Overdue" is
                     * never a heading you have to count yourself, and it is a
                     * shade darker than the rows so the eye reads it as a
                     * divider rather than another record. */}
                    {starts && (
                      <li className="sticky top-0 z-10 flex items-center gap-2 border-y border-border bg-bg-subtle px-3 py-1 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-fg-muted">
                        <span className="truncate">{group}</span>
                        <span className="tabular font-medium normal-case tracking-normal text-fg-subtle">
                          {rows.filter((r) => (groupOf?.(r) ?? null) === group).length}
                        </span>
                      </li>
                    )}
                    <li
                      ref={(el) => { rowRefs.current[i] = el; }}
                      aria-current={i === cursor ? "true" : undefined}
                      className={cn(
                        "transition-colors hover:bg-bg-subtle",
                        // The highlight is a left accent edge, not a fill: it has
                        // to read at a glance without fighting the status dots.
                        i === cursor && "bg-accent-soft/70 shadow-[inset_2px_0_0_0_var(--color-accent)]"
                      )}
                    >
                      {onRowClick ? (
                        <div role="button" tabIndex={0} onClick={() => onRowClick(row)}
                          onKeyDown={(e) => { if (e.key === "Enter") onRowClick(row); }}
                          className="cursor-pointer outline-none focus-visible:bg-bg-subtle">
                          {cells}
                        </div>
                      ) : rowHref ? (
                        <Link href={rowHref(row)} scroll={false} className="block">
                          {cells}
                        </Link>
                      ) : (
                        cells
                      )}
                    </li>
                  </Fragment>
                );
              })}
            </ul>
          )}

          {/* Footer: how many of how many — ERPNext tells you, always. */}
          {showFooter && rows.length > 0 && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border bg-bg-subtle px-3 py-1.5 text-[11px] text-fg-muted">
              <span>
                <b className="tabular font-semibold text-fg">{shown ?? rows.length}</b>
                {total !== undefined && total !== (shown ?? rows.length) ? <> of <b className="tabular font-semibold text-fg">{total}</b></> : null}
                {" "}shown
              </span>
              {footerNote && <span className="ml-auto">{footerNote}</span>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

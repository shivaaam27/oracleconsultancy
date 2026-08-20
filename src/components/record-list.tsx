"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ChevronDown, ChevronUp, ChevronsUpDown, Columns3, Check, Download, Keyboard, Search, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { useUrlFilters } from "@/lib/use-url-filters";
import { toCsv, listFileName, downloadCsv, nodeText } from "@/lib/csv";
import { useFillViewport } from "@/lib/use-fill-viewport";

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
  /** A figure for the totals row. Handed the rows ACTUALLY on screen — filtered
   *  and paged — because a total that silently covers rows you cannot see is
   *  worse than no total at all. */
  total?: (rows: T[]) => ReactNode;
  /**
   * The value this column exports.
   *
   * ⚠️ `render` returns React, so an export without this falls back to reading
   * the text out of the rendered cell — fine for a plain one, wrong for a
   * figure that was formatted with separators or a dash. Any column carrying a
   * NUMBER should give one, so the spreadsheet gets 98491500 rather than
   * "98,491,500" (which Excel reads as text and will not sum).
   */
  csv?: (row: T) => string | number | null;
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
            "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border px-2.5 text-[12px] transition-colors",
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

/** The width at which each `hideBelow` column comes back. */
const HIDE_AT = { sm: 640, md: 768, lg: 1024 } as const;

/** The four templates gridFor() writes, picked per breakpoint. Tailwind
 *  utilities rather than a class in globals.css: a plain
 *  `grid-template-columns: var(…)` rule there is silently DROPPED by Tailwind
 *  v4's Lightning CSS (verified — the rule never reached the browser), which is
 *  the same trap the CLAUDE.md note warns about. */
const RL_GRID = "grid-cols-[var(--rl-grid)] sm:grid-cols-[var(--rl-grid-sm)] md:grid-cols-[var(--rl-grid-md)] lg:grid-cols-[var(--rl-grid-lg)]";

/**
 * Grid template for a column set — shared by the header, every row and the
 * totals line, so a figure always sits under its own column.
 *
 * ⚠️ FOUR templates, one per breakpoint, and that is not over-engineering.
 *
 * `hideBelow` hides a CELL with `display: none`, but this template used to list
 * every column's width at every width. Two things then went wrong at once on a
 * narrow screen, and both were invisible until somebody looked at a real phone:
 *
 *  1. A hidden cell's TRACK survives. On the People directory in Compact, the
 *     hidden Manager (150px) and Portal (86px) tracks still ate 236px of a
 *     344px row, and Name — a `minmax(0,1fr)` — was squeezed to ZERO.
 *  2. A `display:none` element is not a grid item, so auto-placement moves
 *     everything after it UP a track. Open landed in Manager's 150px column.
 *
 * The result was a directory of people with no names in it: a column of bare
 * numbers, centred in the wrong place. The portal's task list showed status and
 * date with no task on them at all.
 *
 * So each breakpoint gets a template of exactly the columns visible AT that
 * breakpoint, published as custom properties and switched by the RL_GRID
 * utilities above. At `lg` the template is identical to the old single one, so
 * the desktop is untouched.
 */
function gridFor<T>(columns: RecordColumn<T>[], hasSelection: boolean) {
  const at = (w: number) => {
    const cols = columns
      .filter((c) => !c.hideBelow || HIDE_AT[c.hideBelow] <= w)
      .map((c) => c.width)
      .join(" ");
    return hasSelection ? `28px ${cols}` : cols;
  };
  return {
    "--rl-grid": at(0),
    "--rl-grid-sm": at(640),
    "--rl-grid-md": at(768),
    "--rl-grid-lg": at(1024),
  } as React.CSSProperties;
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
      className={cn(RL_GRID, "grid items-center gap-x-3 rounded-t-xl border border-border bg-bg-subtle px-3", className)}
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

/**
 * Download what is on screen.
 *
 * ⚠️ Exports the rows AFTER filtering, searching and sorting, and only the
 * columns still showing — what you are looking at is what you get. Exporting
 * the unfiltered table from a filtered screen is the kind of surprise that
 * makes somebody stop trusting the button.
 *
 * ⚠️ Paging is deliberately IGNORED: "Showing 100 of 251" means the other 151
 * are still part of what you filtered to, and an export that silently stopped
 * at 100 would be wrong in a way nobody would notice.
 */
function ExportButton<T>({
  rows, columns, name,
}: { rows: T[]; columns: RecordColumn<T>[]; name: string }) {
  return (
    <button
      type="button"
      title={`Download these ${rows.length} row${rows.length === 1 ? "" : "s"} as a spreadsheet`}
      onClick={() => {
        const headers = columns.map((c) => c.label);
        const body = rows.map((r) =>
          columns.map((c) => (c.csv ? c.csv(r) : nodeText(c.render(r)))));
        downloadCsv(listFileName(name), toCsv(headers, body));
      }}
      className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-bg px-2.5 text-[12px] font-medium text-fg-muted transition-colors hover:text-fg"
    >
      <Download size={12} /> Export
    </button>
  );
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
        className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-bg px-2.5 text-[12px] font-medium text-fg-muted transition-colors hover:text-fg"
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
  rows: allRows,
  columns,
  rowKey,
  rowHref,
  onRowClick,
  filters,
  toolbar,
  search,
  pageSize = 100,
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
  fillViewport = true,
  listKey,
  exportName,
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
  /**
   * Turns on a search box over these rows.
   *
   * ⚠️ The text lives in the URL, never in component state — the forward rule in
   * CLAUDE.md, and what lets a saved view remember a search. `param` namespaces
   * it when two lists share a page (Assets and Vendors already do this).
   */
  search?: {
    placeholder?: string;
    /** Query-string key. Defaults to `q`. */
    param?: string;
    match: (row: T, needle: string) => boolean;
  };
  /**
   * How many rows reach the page at once. 0 turns paging off.
   *
   * Default 100, which is what ERPNext settles on. A 251-line budget was
   * shipping 799 KB of HTML before this existed.
   */
  pageSize?: number;
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
  /**
   * Grow the card to the bottom of the window when the list is short.
   *
   * On by default for any list that draws its own card, because a three-row list
   * leaving two-thirds of the window as bare grey was the owner's "dead space".
   * A `bare` list is inside somebody else's housing and never fills. Pass false
   * for a card that is deliberately a small block on a busier page.
   */
  fillViewport?: boolean;
  /** Turns on the column chooser and remembers the choice under this key
   *  (Stage 5). Omit for a list whose columns are not the user's business. */
  listKey?: string;
  /** What the exported file is called. Defaults to the listKey. */
  exportName?: string;
  /** Supplying these turns on built-in ticking: a box on every row, select-all
   *  in the header, and a bar of actions while anything is selected (Stage 5).
   *  A list that already owns its own selection passes `selectionSlot` instead. */
  bulkActions?: BulkAction<T>[];
  className?: string;
}) {
  const { hidden, toggle } = useHiddenColumns(listKey);
  /* The card grows to the foot of the window; the ROWS take the slack, so the
     "N of M shown" strip stays pinned to the bottom of the panel the way
     ERPNext's does, rather than floating halfway up a field of white. */
  const card = useRef<HTMLDivElement>(null);
  useFillViewport(card, { mode: "min", enabled: !bare && fillViewport });

  /* ------------------------------------------- search, then paging ------ */
  // ⚠️ Filter BEFORE paging. The other way round pages the whole list and then
  // searches one page of it, which quietly hides matches.
  const searchParam = search?.param ?? "q";
  const { values: searchValues, set: setSearch } = useUrlFilters(
    { [searchParam]: "" } as Record<string, string>,
    { debounceKeys: [searchParam] },
  );
  const needle = (search ? searchValues[searchParam] : "").trim();
  const rows = useMemo(() => {
    if (!search || !needle) return allRows;
    const q = needle.toLowerCase();
    return allRows.filter((r) => search.match(r, q));
  }, [allRows, search, needle]);

  const [limit, setLimit] = useState(pageSize);
  // A new search starts at the top of its own results.
  useEffect(() => { setLimit(pageSize); }, [needle, pageSize]);
  // ⚠️ A row added optimistically can land outside the current page (the
  // budget sheet appends). Growing the limit with the list keeps it visible —
  // otherwise a line you just typed appears to have vanished.
  const grew = useRef(allRows.length);
  useEffect(() => {
    if (allRows.length > grew.current && pageSize > 0) setLimit((n) => Math.max(n, allRows.length));
    grew.current = allRows.length;
  }, [allRows.length, pageSize]);

  const paged = pageSize > 0 && rows.length > limit ? rows.slice(0, limit) : rows;
  const more = rows.length - paged.length;

  const [picked, setPicked] = useState<Set<string | number>>(new Set());
  const [running, setRunning] = useState(false);
  const bulkOn = !!bulkActions?.length;
  // Ticking, keyboard and rendering all work on what is ON SCREEN (`paged`).
  // Select-all takes the page, the way ERPNext takes the loaded rows.
  const pickedRows = bulkOn ? paged.filter((r) => picked.has(rowKey(r))) : [];
  const allPicked = bulkOn && paged.length > 0 && paged.every((r) => picked.has(rowKey(r)));
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
    setCursor((c) => (c === null ? null : c < paged.length ? c : null));
  }, [paged.length]);

  const move = useCallback((delta: number) => {
    setCursor((c) => {
      const next = c === null ? (delta > 0 ? 0 : paged.length - 1) : c + delta;
      if (next < 0 || next >= paged.length) return c;
      rowRefs.current[next]?.scrollIntoView({
        block: "nearest",
        behavior: prefersCalm() ? "auto" : "smooth",
      });
      return next;
    });
  }, [paged.length]);

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
          if (cursor === null || !paged[cursor]) return;
          e.preventDefault();
          const row = paged[cursor];
          if (onRowClick) onRowClick(row);
          else if (rowHref) router.push(rowHref(row));
          break;
        }
        case "x": {
          if (cursor === null || !paged[cursor] || !bulkOn) return;
          e.preventDefault();
          togglePick(rowKey(paged[cursor]));
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
  }, [cursor, paged, rowHref, onRowClick, bulkOn, move, helpOpen, router, rowKey]);

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
        {(toolbar || listKey || search) && (
          <div className="flex flex-wrap items-center gap-2">
            {search && (
              <label className="relative min-w-0 flex-1 sm:max-w-xs">
                <Search size={13} className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-fg-subtle" />
                <input
                  type="search"
                  value={searchValues[searchParam] ?? ""}
                  onChange={(e) => setSearch({ [searchParam]: e.target.value })}
                  placeholder={search.placeholder ?? "Search this list…"}
                  aria-label={search.placeholder ?? "Search this list"}
                  className="h-8 w-full rounded-md border border-border bg-bg pl-7 pr-7 text-[13px] outline-none placeholder:text-fg-subtle focus:border-accent"
                />
                {needle && (
                  <button type="button" onClick={() => setSearch({ [searchParam]: "" })}
                    aria-label="Clear the search"
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-fg-subtle hover:text-fg">
                    <X size={12} />
                  </button>
                )}
              </label>
            )}
            <span ref={toolbarRef} className={cn("min-w-0", search ? "" : "flex-1")}>{toolbar}</span>
            {/* Desktop affordances. Below `sm` the columns are folded by the
                breakpoint anyway (see gridFor), so the chooser would offer a
                choice the layout has already made — and on a phone the two of
                them wrapped the toolbar onto a third row. */}
            {listKey && (
              <span className="ml-auto hidden shrink-0 items-center gap-2 sm:flex">
                <ExportButton rows={rows} columns={visibleColumns} name={exportName ?? listKey} />
                <ColumnChooser columns={columns} hidden={hidden} onToggle={toggle} />
              </span>
            )}
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
                    "inline-flex h-7 items-center gap-1 rounded-md px-2 text-[11px] font-medium ring-1 transition-colors disabled:opacity-50",
                    a.tone === "danger"
                      ? "bg-bg-elev text-danger ring-border hover:bg-danger hover:text-white"
                      : "bg-bg-elev text-fg ring-border hover:bg-bg-subtle"
                  )}
                >
                  {a.icon}{a.label}
                </button>
              ))}
              <button type="button" onClick={() => setPicked(new Set())}
                className="inline-flex h-7 items-center rounded-md px-2 text-[11px] text-fg-muted hover:text-fg">
                Clear
              </button>
            </span>
          </div>
        )}

        <div
          ref={card}
          className={cn(!bare && "mt-2 flex flex-col overflow-hidden rounded-xl border border-border bg-bg-elev")}
        >
          {showHeader && (
            <div
              data-list-head
              style={gridStyle}
              className={cn(RL_GRID, "grid items-center gap-x-3 border-b border-border bg-bg-subtle px-3")}
            >
              {tick && (
                <span>
                  {bulkOn && !selectionSlot && (
                    <button type="button" aria-label="Select all"
                      onClick={() => setPicked(allPicked ? new Set() : new Set(paged.map(rowKey)))}
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
            <div className="flex flex-1 flex-col justify-center px-3 py-10">
              {/* A search that matches nothing is not an empty list — saying
                  "none yet" there sends someone hunting for data that is
                  sitting right behind the box they typed in. */}
              {needle ? (
                <p className="text-center text-[12px] text-fg-subtle">
                  Nothing matches “{needle}”.{" "}
                  <button type="button" onClick={() => setSearch({ [searchParam]: "" })}
                    className="text-accent hover:underline">Clear the search</button>
                </p>
              ) : empty}
            </div>
          ) : (
            <ul className="flex-1 divide-y divide-border">
              {paged.map((row, i) => {
                const key = rowKey(row);
                const group = groupOf?.(row) ?? null;
                const starts = group !== null && group !== lastGroup;
                if (starts) lastGroup = group;
                const cells = (
                  <div data-list-row className="group/row relative px-3">
                    <div style={gridStyle} className={cn(RL_GRID, "grid items-center gap-x-3")}>
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
                    {/* The second line: the context line, and — on a touch screen
                        — the row actions.

                        In Compact the context line hides until hover, so the row
                        is one line but the detail is still a glance away. That
                        rule lives in globals.css, keyed on data-subrow.

                        Row actions are hover-revealed on a mouse and ALWAYS shown
                        on a touch screen, where there is no hover and a hidden
                        action is simply an unreachable one. ⚠️ But floating them
                        over the row (which is what md+ does on hover) covers the
                        RIGHT-HAND COLUMN, and that column is usually the figure
                        the list is sorted by — on the portal board it hid every
                        "14d overdue" behind a Remind button. So below md they ride
                        in the flow at the end of this line instead; from md up the
                        same element goes absolute and floats as before.
                        ONE element, positioned two ways — never rendered twice. */}
                    {(subRow || rowActions) && (
                      <div className="mt-0.5 flex min-w-0 items-center gap-2">
                        {subRow && (
                          <div data-subrow className={cn("min-w-0 flex-1", tick && "pl-[2.4rem]")}>
                            {subRow(row)}
                          </div>
                        )}
                        {rowActions && (
                          <span
                            onClick={(e) => e.stopPropagation()}
                            className="ml-auto shrink-0 md:absolute md:right-3 md:top-1.5 md:rounded-md md:bg-bg-elev md:pl-2 md:shadow-sm md:ring-1 md:ring-border md:transition-opacity md:opacity-0 md:focus-within:opacity-100 md:group-hover/row:opacity-100"
                          >
                            {rowActions(row)}
                          </span>
                        )}
                      </div>
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
                      /* Sized like a HEADING, not like a caption. It was 10.5px in
                         `text-fg-muted`, which on the portal is 8.4px of grey once
                         the 0.8 zoom is applied — the owner could not read the
                         company and priority bands, and a band you can't read is
                         just a stripe. Now 12.5px semibold in full `text-fg`, with
                         the room to breathe. */
                      <li className="sticky top-0 z-10 flex items-center gap-2 border-y border-border bg-bg-subtle px-3 py-1.5 text-[12.5px] font-semibold uppercase tracking-[0.06em] text-fg">
                        <span className="truncate">{group}</span>
                        <span className="tabular text-[11.5px] font-medium normal-case tracking-normal text-fg-muted">
                          {paged.filter((r) => (groupOf?.(r) ?? null) === group).length}
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

          {/* The totals row, when any column asks for one. Aligned to the same
              grid as the rows, so a figure sits under its own column. */}
          {showFooter && paged.length > 0 && visibleColumns.some((c) => c.total) && (
            <div data-list-total className="border-t border-border bg-bg-subtle px-3 py-1.5">
              <div style={gridStyle} className={cn(RL_GRID, "grid items-center gap-x-3 text-[12px] font-medium")}>
                {tick && <span />}
                {visibleColumns.map((c) => (
                  <div key={c.key} className={cn("min-w-0 truncate", c.align === "right" && "text-right",
                    HIDE[c.hideBelow ?? ""] ?? "")}>
                    {c.total ? c.total(paged) : null}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Footer: how many of how many — ERPNext tells you, always. */}
          {showFooter && rows.length > 0 && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border bg-bg-subtle px-3 py-1.5 text-[11px] text-fg-muted">
              <span>
                <b className="tabular font-semibold text-fg">{shown ?? paged.length}</b>
                {" of "}
                <b className="tabular font-semibold text-fg">{total ?? allRows.length}</b>
                {" shown"}
                {needle && <span className="text-fg-subtle"> · matching “{needle}”</span>}
              </span>
              {more > 0 && (
                <span className="flex items-center gap-2">
                  <button type="button" onClick={() => setLimit((n) => n + pageSize)}
                    className="rounded-md border border-border bg-bg-elev px-2 py-0.5 text-[11px] text-fg hover:bg-bg-subtle">
                    Show {Math.min(more, pageSize)} more
                  </button>
                  <button type="button" onClick={() => setLimit(rows.length)}
                    className="text-[11px] text-accent hover:underline">
                    Show all {rows.length}
                  </button>
                </span>
              )}
              {footerNote && <span className="ml-auto">{footerNote}</span>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

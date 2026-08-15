"use client";

import Link from "next/link";
import { Fragment, useEffect, useState, type ReactNode } from "react";
import { ChevronDown, ChevronUp, ChevronsUpDown, Columns3, Check } from "lucide-react";
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

  let lastGroup: string | null = null;

  return (
    <div className={cn("flex gap-4", className)}>
      {filters && filters.length > 0 && (
        <aside className="hidden w-[184px] shrink-0 md:block">
          <FilterRail filters={filters} />
        </aside>
      )}

      <div className="min-w-0 flex-1">
        {(toolbar || listKey) && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="min-w-0 flex-1">{toolbar}</span>
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
              {rows.map((row) => {
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
                    {rowActions && (
                      <span
                        onClick={(e) => e.stopPropagation()}
                        className="absolute right-3 top-1.5 rounded-md bg-bg-elev pl-2 opacity-0 shadow-sm ring-1 ring-border transition-opacity focus-within:opacity-100 group-hover/row:opacity-100"
                      >
                        {rowActions(row)}
                      </span>
                    )}
                  </div>
                );
                return (
                  <Fragment key={key}>
                    {starts && (
                      <li className="bg-bg-subtle px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-fg-muted">
                        {group}
                      </li>
                    )}
                    <li className="transition-colors hover:bg-bg-subtle">
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

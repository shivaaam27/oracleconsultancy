"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Printer } from "lucide-react";
import { SearchInput } from "@/components/ui";
import {
  orderSuggestions, qty,
  type CzStockCount, type CzStockDay, type CzStockItem, type CzStockLocation,
  type CzStockMove,
} from "@/lib/cocozuri-stock-shared";
import { cn } from "@/lib/cn";

/* ------------------------------------------------------------------ *
 * What to make, and what to send.
 *
 * The workbook's `COCOZURI ORDER FORM` is a typed list — item, price, a
 * material code and a quantity somebody decided on. Nothing in it looks at what
 * actually sold, so every quantity is a memory of last time. This is the same
 * sheet worked out from the shelf's own history: what went out, what is left,
 * and therefore what is needed to carry the next fortnight.
 *
 * ⚠️ IT IS A SUGGESTION AND IT SAYS SO. Every figure is editable before it is
 * printed, because the shelf does not know about next week's order, a holiday
 * or a promotion — and a number presented as an instruction is one nobody
 * checks.
 * ------------------------------------------------------------------ */

export function CocozuriOrderForm({
  location, locations, items, days, counts, moves, from, to, coverDays, productNames,
}: {
  location: CzStockLocation;
  locations: CzStockLocation[];
  items: CzStockItem[];
  /** ⚠️ THE SHEET, and it is what says how many days were actually counted —
   *  the kitchen skips 7 to 10 August, and dividing by the calendar would halve
   *  every kitchen figure. */
  days: CzStockDay[];
  counts: CzStockCount[];
  /** ⚠️ THE LEDGER, and it is where what went out and what is on hand come
   *  from. Two sources, on purpose — see `orderSuggestions`. */
  moves: CzStockMove[];
  from: string;
  to: string;
  coverDays: number;
  productNames: Record<number, string>;
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [only, setOnly] = useState(true);
  /** itemId → the quantity as edited. The suggestion is only ever a start. */
  const [edited, setEdited] = useState<Record<number, string>>({});

  const nameOf = (it: CzStockItem) =>
    (it.productId != null ? productNames[it.productId] : null) ?? it.name;

  const rows = useMemo(
    () => orderSuggestions(items, location.id, moves, days, counts, { from, to, coverDays }),
    [items, location.id, moves, days, counts, from, to, coverDays],
  );

  const shown = useMemo(() => {
    const term = q.trim().toLowerCase();
    return rows
      .filter((r) => (only ? (r.suggested == null || r.suggested > 0) : true))
      .filter((r) => !term || nameOf(r.item).toLowerCase().includes(term));
  }, [rows, q, only, productNames]);

  const valueOf = (id: number, suggested: number | null) =>
    edited[id] ?? (suggested == null ? "" : String(suggested));

  const ordering = shown.filter((r) => Number(valueOf(r.item.id, r.suggested)) > 0);
  const totalUnits = ordering.reduce((t, r) => t + Number(valueOf(r.item.id, r.suggested) || 0), 0);

  const go = (next: { loc?: number; cover?: number }) =>
    router.push(`/cocozuri/order?loc=${next.loc ?? location.id}&cover=${next.cover ?? coverDays}`);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <div className="flex items-center gap-1 rounded-md border border-border p-0.5">
          {locations.map((l) => (
            <button key={l.id} type="button" onClick={() => go({ loc: l.id })}
              className={cn("h-7 rounded px-2.5 text-sm font-medium transition-colors",
                l.id === location.id ? "bg-accent text-accent-fg" : "text-fg-muted hover:text-fg")}>
              {l.name}
            </button>
          ))}
        </div>
        {/* ⚠️ Buttons, not a native `<select>` — CLAUDE.md bans them outright
            (their popup mis-renders against this design) and four choices do
            not need a menu anyway. */}
        <span className="flex items-center gap-1 text-xs text-fg-subtle">
          Enough for
          <span className="flex items-center gap-0.5 rounded-md border border-border p-0.5">
            {[7, 14, 21, 28].map((d) => (
              <button key={d} type="button" onClick={() => go({ cover: d })}
                className={cn("h-6 rounded px-2 text-sm font-medium transition-colors",
                  d === coverDays ? "bg-accent text-accent-fg" : "text-fg-muted hover:text-fg")}>
                {d}d
              </button>
            ))}
          </span>
        </span>
        <label className="flex items-center gap-1.5 text-xs text-fg-subtle">
          <input type="checkbox" checked={only} onChange={(e) => setOnly(e.target.checked)} />
          Only what needs ordering
        </label>
        <SearchInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find an item…"
          wrapperClassName="w-[13rem]" className="h-7 text-sm" />
        <span className="grow" />
        <button type="button" onClick={() => window.print()}
          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-2 text-sm text-fg-muted hover:text-fg">
          <Printer size={13} /> Print
        </button>
      </div>

      <p className="text-xs leading-relaxed text-fg-subtle print:text-fg-muted">
        Worked out from what actually went out between <strong className="text-fg-muted">{from}</strong> and{" "}
        <strong className="text-fg-muted">{to}</strong>, over the days that were counted — <strong className="text-fg-muted">{location.name}</strong> is
        not counted every day and dividing by the calendar would under-order everything. Every figure
        below is a suggestion; change any of them before printing.
      </p>

      <div className="overflow-x-auto rounded-lg border border-border bg-bg-elev">
        <div className="min-w-[42rem]">
          <div className="grid grid-cols-[minmax(9rem,1fr)_80px_90px_90px_100px] items-center gap-2 border-b border-border bg-bg-subtle px-3 py-1.5 text-xs font-medium uppercase tracking-[0.06em] text-fg-subtle">
            <span>Item</span>
            <span className="text-right">On hand</span>
            <span className="text-right">A day</span>
            <span className="text-right">Lasts</span>
            <span className="text-right">Order</span>
          </div>

          {shown.map((r) => {
            const cover = r.daysOfCover;
            return (
              <div key={r.item.id}
                className="grid grid-cols-[minmax(9rem,1fr)_80px_90px_90px_100px] items-center gap-2 border-b border-border px-3 py-1 last:border-0">
                <span className="min-w-0 truncate text-sm text-fg" title={nameOf(r.item)}>
                  {nameOf(r.item)}
                  <span className="ml-1.5 text-xs text-fg-subtle">{r.item.uom}</span>
                </span>
                <span className="text-right text-sm tabular text-fg-muted">{qty(r.onHand)}</span>
                <span className="text-right text-sm tabular text-fg-subtle">
                  {r.perDay == null ? "—" : r.perDay === 0 ? "0" : r.perDay.toFixed(1)}
                </span>
                {/* ⚠️ Three different things, said three different ways. */}
                <span className={cn("text-right text-sm tabular",
                  cover == null ? "text-fg-subtle"
                    : !Number.isFinite(cover) ? "text-fg-subtle"
                      : cover < 7 ? "text-danger" : cover < 14 ? "text-warn" : "text-fg-muted")}>
                  {cover == null ? "not known" : !Number.isFinite(cover) ? "—" : `${Math.floor(cover)}d`}
                </span>
                <input
                  value={valueOf(r.item.id, r.suggested)}
                  onChange={(e) => setEdited((s) => ({ ...s, [r.item.id]: e.target.value }))}
                  inputMode="decimal"
                  placeholder={r.suggested == null ? "?" : "0"}
                  aria-label={`Order quantity for ${nameOf(r.item)}`}
                  className="w-full rounded-md border border-border bg-bg px-1.5 py-1 text-right text-sm tabular outline-none focus:border-accent print:border-0"
                />
              </div>
            );
          })}

          {shown.length === 0 && (
            <p className="px-3 py-8 text-center text-sm text-fg-subtle">
              {rows.length === 0
                ? "No items on this location's list yet."
                : only
                  ? "Nothing needs ordering for this period."
                  : "Nothing matches that."}
            </p>
          )}

          <div className="grid grid-cols-[minmax(9rem,1fr)_80px_90px_90px_100px] items-center gap-2 border-t-2 border-border bg-bg-subtle px-3 py-1.5 text-sm font-semibold text-fg">
            <span>{ordering.length} line{ordering.length === 1 ? "" : "s"} to order</span>
            <span /><span /><span />
            <span className="text-right tabular">{qty(totalUnits)}</span>
          </div>
        </div>
      </div>

      {/* ⚠️ Named, not hidden. An item nobody has written down cannot be
          forecast, and a confident zero beside it is how a product quietly
          stops being made. */}
      {rows.some((r) => r.suggested == null) && (
        <p className="text-xs text-fg-subtle print:hidden">
          {rows.filter((r) => r.suggested == null).length} item
          {rows.filter((r) => r.suggested == null).length === 1 ? " has" : "s have"} too little history to
          judge — fewer than two days written down. They are listed with no figure rather than a zero.
        </p>
      )}
    </div>
  );
}

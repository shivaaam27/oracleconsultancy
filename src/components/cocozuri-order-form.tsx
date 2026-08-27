"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Printer, ShoppingCart } from "lucide-react";
import { useToast } from "@/components/toast";
import { purchaseFromOrderFormAction } from "@/app/cocozuri/actions";
import { SearchInput } from "@/components/ui";
import { CocozuriHelp } from "@/components/cocozuri-help";
import {
  MIN_DAYS_MEASURED, orderSuggestions, qty,
  type CzStockCount, type CzStockDay, type CzStockItem, type CzStockLocation,
  type CzStockMove,
} from "@/lib/cocozuri-stock-shared";
import { czDate } from "@/lib/cocozuri-shared";
import { belowReorder } from "@/lib/cocozuri-plan-shared";
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
  const [onlyLow, setOnlyLow] = useState(false);
  /** itemId → the quantity as edited. The suggestion is only ever a start. */
  const [edited, setEdited] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();

  const nameOf = (it: CzStockItem) =>
    (it.productId != null ? productNames[it.productId] : null) ?? it.name;

  const rows = useMemo(
    () => orderSuggestions(items, location.id, moves, days, counts, { from, to, coverDays }),
    [items, location.id, moves, days, counts, from, to, coverDays],
  );

  /* ⚠️ THE HALF OF STAGE C THAT HAS NEVER FIRED. `belowReorder()` was written
     and tested, the column and the write path existed — and no form could set a
     level, so nothing was ever reported low. Now that an item can carry one,
     this is where it earns its place: the rate above needs a WEEK of days
     written down before it will quote anything, so a material bought rarely
     gets no suggestion at all. "Never go below 5 kg" works from the moment
     somebody types it.

     ⚠️ NULL IS NOT NOUGHT — `belowReorder` skips an item with no level, because
     nobody has said what low means for it. */
  const low = useMemo(() => {
    const onHand = new Map(rows.map((r) => [r.item.id, r.onHand]));
    return new Map(belowReorder(rows.map((r) => r.item), onHand).map((r) => [r.item.id, r]));
  }, [rows]);

  /* ⚠️ THE LEVEL FILLS IN WHERE THE HISTORY CANNOT, and never overrides it.
     Where a rate exists it is the better answer — it knows how fast the stuff
     actually goes. Where there is no rate the shortfall to the level is the
     only real number on the row, and leaving the box empty is what had somebody
     typing it from memory.

     ⚠️ IT MUST BE DECLARED ABOVE `shown`, AND TYPESCRIPT WILL NOT TELL YOU.
     A `useMemo` callback runs DURING the render that declares it, not later, so
     a `const` arrow function defined below it is still in its temporal dead zone
     — the whole screen came down with "Cannot access 'suggestionFor' before
     initialization" while `tsc` stayed clean. */
  const suggestionFor = (r: { item: { id: number }; suggested: number | null }) =>
    r.suggested != null ? r.suggested : low.get(r.item.id)?.short ?? null;

  const shown = useMemo(() => {
    const term = q.trim().toLowerCase();
    return rows
      .filter((r) => (onlyLow ? low.has(r.item.id) : true))
      .filter((r) => (only ? (suggestionFor(r) == null || (suggestionFor(r) ?? 0) > 0) : true))
      .filter((r) => !term || nameOf(r.item).toLowerCase().includes(term));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, q, only, onlyLow, low, productNames]);

  const valueOf = (id: number, suggested: number | null) =>
    edited[id] ?? (suggested == null ? "" : String(suggested));

  const ordering = shown.filter((r) => Number(valueOf(r.item.id, suggestionFor(r))) > 0);

  /* ⚠️ EVERY LINE WITH A QUANTITY, NOT ONLY THE ONES ON SCREEN. Filtering to
     "only what needs ordering" or typing in the search box must not silently
     drop a quantity somebody has already typed against a hidden row. */
  const allOrdering = rows.filter((r) => Number(valueOf(r.item.id, suggestionFor(r))) > 0);

  async function raise() {
    setBusy(true);
    const res = await purchaseFromOrderFormAction({
      locationId: location.id,
      lines: allOrdering.map((r) => ({ itemId: r.item.id, qty: Number(valueOf(r.item.id, suggestionFor(r))) })),
      note: `Raised from the order form for ${location.name}, covering ${coverDays} days.`,
    });
    setBusy(false);
    if (!res.ok) { toast(res.error ?? "Could not raise it.", { tone: "danger" }); return; }
    /* ⚠️ Said, not hidden. A material nobody has ever bought comes across at a
       price of zero, and somebody has to fill it in before this can be
       approved — which is exactly the moment to mention it. */
    toast(
      res.unpriced && res.unpriced.length
        ? `${res.reference} raised as a draft. ${res.unpriced.length} line${res.unpriced.length === 1 ? " has" : "s have"} no price yet — fill them in before approving.`
        : `${res.reference} raised as a draft — check the prices, then approve it.`,
      { tone: "success" },
    );
    router.push(`/cocozuri/purchases`);
  }
  const totalUnits = ordering.reduce((t, r) => t + Number(valueOf(r.item.id, suggestionFor(r)) || 0), 0);

  /* ⚠️ `/cocozuri/order/materials`, NOT `/cocozuri/order`. Stage C moved the
     BUYING half here and left `/cocozuri/order` to the production plan — and
     this line was not moved with it, so every shelf button and every cover
     button threw you off "What to buy" onto "what to make today". The screen
     was unusable the moment you picked a shelf. */
  const go = (next: { loc?: number; cover?: number }) =>
    router.push(`/cocozuri/order/materials?loc=${next.loc ?? location.id}&cover=${next.cover ?? coverDays}`);

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
        {/* ⚠️ Offered only when something IS low — a toggle that can only ever
            show an empty list is a control that teaches somebody not to press
            it. The count is on the label, so it says what it will do. */}
        {low.size > 0 && (
          <label className="flex items-center gap-1.5 text-xs text-warn">
            <input type="checkbox" checked={onlyLow} onChange={(e) => setOnlyLow(e.target.checked)} />
            Only below their level ({low.size})
          </label>
        )}
        <SearchInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find an item…"
          wrapperClassName="w-[13rem]" className="h-8 text-sm" />
        <span className="grow" />
        <CocozuriHelp title="What to buy">
          <p>
            <strong>Demand is measured over the days actually written up, not over the
            calendar.</strong> The kitchen skips days; dividing by 30 regardless would halve every
            figure and under-order everything.
          </p>
          <p>
            <strong>A week of history is needed before a rate is quoted at all.</strong> Consumption
            is lumpy &mdash; a batch takes five kilos in a morning and none for a fortnight &mdash;
            and two days of it once suggested ordering 195,000 g of milk chocolate. A row with too
            little history says so rather than printing a dash that reads as &ldquo;this never
            sells&rdquo;.
          </p>
          <p>
            <strong>A reorder level is optional, and having none is not the same as nought.</strong>
            An item nobody has set a level for is never reported as low.
          </p>
          <p>
            <strong>Raising an order makes a draft purchase.</strong> Nothing moves and nothing
            posts until somebody approves it, so carrying a suggestion across commits nothing. Each
            line is prefilled with what that material has actually cost &mdash; a material never
            bought comes in at zero and is named, never quietly invented.
          </p>
        </CocozuriHelp>
        <button type="button" onClick={() => window.print()}
          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-2 text-sm text-fg-muted hover:text-fg print:hidden">
          <Printer size={13} /> Print
        </button>
        {/* ⚠️ THIS SCREEN USED TO END AT "Print". It worked out what to buy and
            then every line had to be typed again by hand into a purchase. It
            raises a DRAFT now — nothing moves and nothing is posted until
            somebody approves it, so carrying the suggestion across commits
            nothing. */}
        <button type="button" onClick={() => void raise()}
          disabled={busy || allOrdering.length === 0}
          title={allOrdering.length === 0 ? "Nothing has a quantity against it." : undefined}
          className="inline-flex h-8 items-center gap-1.5 rounded-md bg-accent px-2.5 text-sm font-medium text-accent-fg hover:opacity-90 disabled:opacity-50 print:hidden">
          {busy ? <Loader2 size={13} className="animate-spin" /> : <ShoppingCart size={13} />}
          Raise a purchase{allOrdering.length > 0 ? ` · ${allOrdering.length} line${allOrdering.length === 1 ? "" : "s"}` : ""}
        </button>
      </div>

      {/* ⚠️ The dates here were the raw `2026-07-29`, the one place in the module
          still printing an ISO date at a reader. Same format as every other
          screen now. The sentence is kept because it is not a description of the
          software — it says WHERE the figures came from, which is the only
          reason to trust or override them. */}
      <p className="text-xs leading-relaxed text-fg-subtle print:text-fg-muted">
        From what actually went out between <strong className="text-fg-muted">{czDate(from)}</strong> and{" "}
        <strong className="text-fg-muted">{czDate(to)}</strong>, over the days that were counted —{" "}
        <strong className="text-fg-muted">{location.name}</strong> is not counted every day, and dividing
        by the calendar would under-order everything. A rate needs at least{" "}
        <strong className="text-fg-muted">{MIN_DAYS_MEASURED} days</strong> written down before it is
        worth quoting — consumption is lumpy, and a batch taking five kilos in one morning is not a
        daily rate. Every figure below is a suggestion.
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
                  {/* ⚠️ SAYS WHY, rather than leaving three dashes to be read as
                      "nothing moves". "Nobody has written enough down" and "this
                      never sells" are opposite findings and used to look alike. */}
                  {r.perDay == null && (
                    <span className="ml-1.5 text-xs text-fg-subtle">
                      {r.daysMeasured === 0
                        ? "never written down"
                        : `only ${r.daysMeasured} day${r.daysMeasured === 1 ? "" : "s"} written down`}
                    </span>
                  )}
                  {/* ⚠️ The one fact that needs no history at all. */}
                  {low.has(r.item.id) && (
                    <span className="ml-1.5 text-xs text-warn">
                      below {qty(low.get(r.item.id)!.level)}
                    </span>
                  )}
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
                  value={valueOf(r.item.id, suggestionFor(r))}
                  onChange={(e) => setEdited((s) => ({ ...s, [r.item.id]: e.target.value }))}
                  inputMode="decimal"
                  placeholder={suggestionFor(r) == null ? "?" : "0"}
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

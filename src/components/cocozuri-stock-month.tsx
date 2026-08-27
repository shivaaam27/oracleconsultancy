"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ClipboardCheck, ClipboardList, Loader2 } from "lucide-react";
import { SearchInput } from "@/components/ui";
import { CocozuriHelp } from "@/components/cocozuri-help";
import { useToast } from "@/components/toast";
import { BottomSheet } from "@/components/bottom-sheet";
import {
  ledgerBalanceAt, monthRows, qty, salesRows,
  type CzStockCount, type CzStockDay, type CzStockItem, type CzStockLocation,
  type CzStockMove,
} from "@/lib/cocozuri-stock-shared";
import { czDate, money, priceInForce, type CzPrice } from "@/lib/cocozuri-shared";
import { recordStockCountAction } from "@/app/cocozuri/actions";
import { CocozuriCountSheet } from "@/components/cocozuri-count-sheet";
import { cn } from "@/lib/cn";

/* ------------------------------------------------------------------ *
 * The month: what moved, what should be there, what actually is.
 *
 * This is the workbook's month-end block — total IN · total OUT · total RETURN ·
 * BALANCE · PHY COUNT · VARIANCE · REMARKS — with three differences that matter:
 *
 *   ⚠️ The totals are a FILTER over a date range, not a hand-typed `=D5+H5+…`
 *      chain, so a day cannot be left out (fault #3: the shop's IN adds 29
 *      day-columns, OUT 30, RETURN only 26).
 *   ⚠️ The period comes from the address, not from a title somebody typed at the
 *      top of the sheet (fault #5: "MONTH: MAY 2026" over August's columns).
 *   ⚠️ Sales value joins on the product's ID, not its name (fault #4: stock says
 *      1,014 units left the shop in August and sales says 814).
 * ------------------------------------------------------------------ */

export function CocozuriStockMonth({
  location, locations, items, days, counts, moves, prices, from, to, productNames,
}: {
  location: CzStockLocation;
  locations: CzStockLocation[];
  items: CzStockItem[];
  days: CzStockDay[];
  counts: CzStockCount[];
  /** ⚠️ THE LEDGER. Every figure on this page is read from it (Stage 2); the
   *  day sheets are kept only to say how many days were actually counted. */
  moves: CzStockMove[];
  prices: CzPrice[];
  from: string;
  to: string;
  productNames: Record<number, string>;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [q, setQ] = useState("");
  const [only, setOnly] = useState<"all" | "moved" | "variance" | "uncounted">("all");
  const [taking, setTaking] = useState<{ item: CzStockItem; expected: number } | null>(null);
  const [takingAll, setTakingAll] = useState(false);

  const nameOf = (it: CzStockItem) =>
    (it.productId != null ? productNames[it.productId] : null) ?? it.name;

  const rows = useMemo(
    () => monthRows(items, location.id, moves, days, counts, from, to),
    [items, location.id, moves, days, counts, from, to],
  );

  // ⚠️ Valued at the price of the DAY each unit went out — `priceInForce`
  // already knows the price in force is the newest whose date has arrived.
  const sales = useMemo(
    () => salesRows(items, location.id, moves, from, to, (productId, on) =>
      priceInForce(prices, { productId, on: `${on}T23:59:59.999Z` })?.price ?? null),
    [items, location.id, moves, prices, from, to],
  );
  const salesById = useMemo(() => new Map(sales.map((s) => [s.item.id, s] as const)), [sales]);

  const shown = useMemo(() => {
    const term = q.trim().toLowerCase();
    return rows
      .filter((r) => {
        if (only === "moved") return r.daysWritten > 0;
        if (only === "variance") return r.variance != null && Math.abs(r.variance) > 0.0005;
        if (only === "uncounted") return r.count == null;
        return true;
      })
      .filter((r) => !term || nameOf(r.item).toLowerCase().includes(term));
  }, [rows, q, only, productNames]);

  const totals = shown.reduce(
    (t, r) => ({
      inQ: t.inQ + r.totalIn, outQ: t.outQ + r.totalOut, third: t.third + r.totalThird,
      value: t.value + (salesById.get(r.item.id)?.value ?? 0),
    }),
    { inQ: 0, outQ: 0, third: 0, value: 0 },
  );
  const withVariance = rows.filter((r) => r.variance != null && Math.abs(r.variance) > 0.0005);
  /** The first day anything in the catalogue has a price for. */
  const earliestPrice = useMemo(
    () => prices.reduce<string | null>((min, p) => {
      const d = p.effectiveFrom.slice(0, 10);
      return !min || d < min ? d : min;
    }, null),
    [prices],
  );
  const unpriced = shown.filter((r) => (salesById.get(r.item.id)?.units ?? 0) > 0 && salesById.get(r.item.id)?.value == null);

  const go = (next: { loc?: number; from?: string; to?: string }) =>
    router.push(`/cocozuri/stock/month?loc=${next.loc ?? location.id}&from=${next.from ?? from}&to=${next.to ?? to}`);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1 rounded-md border border-border p-0.5">
          {locations.map((l) => (
            <button key={l.id} type="button" onClick={() => go({ loc: l.id })}
              className={cn("h-7 rounded px-2.5 text-sm font-medium transition-colors",
                l.id === location.id ? "bg-accent text-accent-fg" : "text-fg-muted hover:text-fg")}>
              {l.name}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-1.5 text-xs text-fg-subtle">
          From
          <input type="date" value={from} onChange={(e) => e.target.value && go({ from: e.target.value })}
            className="h-8 rounded-md border border-border bg-bg px-2 text-sm text-fg outline-none focus:border-accent" />
        </label>
        <label className="flex items-center gap-1.5 text-xs text-fg-subtle">
          To
          <input type="date" value={to} onChange={(e) => e.target.value && go({ to: e.target.value })}
            className="h-8 rounded-md border border-border bg-bg px-2 text-sm text-fg outline-none focus:border-accent" />
        </label>
        <SearchInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find an item…"
          wrapperClassName="w-[13rem]" className="h-8 text-sm" />
        {/* ⚠️ THE WHOLE SHELF AT ONCE. The kitchen counts 75 lines and raw
            materials 171; one bottom sheet at a time is how a stock-take stops
            happening. Nothing is created and nothing is guessed — see
            `CocozuriCountSheet`. */}
        <span className="ml-auto" />
        <CocozuriHelp title="The month, and the count">
          <p>
            <strong>A count is the position at the END of its date.</strong> Movements on the
            count&rsquo;s own day are already inside it and are never added again. Get that a day
            out and every figure after a stock-take is wrong by that day&rsquo;s trade.
          </p>
          <p>
            An <strong>opening</strong> stock is therefore a count dated the day <em>before</em> the
            book starts.
          </p>
          <p>
            <strong>A count becomes the new truth.</strong> Everything after it carries forward from
            what was counted, not from what the book had said.
          </p>
          <p>
            <strong>A variance must be explained</strong> &mdash; a count that disagrees with the
            book and says nothing about why is a number nobody can act on. A count that agrees needs
            no reason.
          </p>
          <p>
            Counting the whole shelf at once is here because the kitchen has 75 lines and raw
            materials 171. One item at a time is how a stock-take stops happening.
          </p>
        </CocozuriHelp>
        <button type="button" onClick={() => setTakingAll(true)}
          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-sm text-fg-muted transition-colors hover:border-accent hover:text-accent">
          <ClipboardList size={13} /> Count everything
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-1">
        {([
          ["all", `All ${rows.length}`],
          ["moved", `Moved ${rows.filter((r) => r.daysWritten > 0).length}`],
          ["variance", `Variance ${withVariance.length}`],
          ["uncounted", `Not counted ${rows.filter((r) => r.count == null).length}`],
        ] as const).map(([k, label]) => (
          <button key={k} type="button" onClick={() => setOnly(k)}
            className={cn("h-8 rounded-md border px-2.5 text-sm transition-colors",
              only === k ? "border-accent bg-accent-soft text-accent" : "border-border text-fg-muted hover:text-fg",
              k === "variance" && withVariance.length > 0 && only !== k && "text-warn")}>
            {label}
          </button>
        ))}
      </div>

      {/* ⚠️ A variance nobody has explained is the state the workbook is in: it
          has a VARIANCE column and a REMARKS column beside it, and the remarks
          are empty. Recording a count here refuses to save without a reason. */}
      {withVariance.length > 0 && (
        <p className="flex items-start gap-2 rounded-md border border-warn/30 bg-warn/10 px-3 py-2 text-sm text-warn">
          <AlertTriangle size={13} className="mt-px shrink-0" />
          <span>
            <strong>{withVariance.length}</strong> item{withVariance.length === 1 ? "" : "s"} counted differently from
            what the book says. Each one carries the reason it was given.
          </span>
        </p>
      )}

      <div className="overflow-x-auto rounded-lg border border-border bg-bg-elev">
        <div className="min-w-[54rem]">
          <div className="grid grid-cols-[minmax(0,1fr)_70px_70px_70px_80px_80px_75px_75px_110px] items-center gap-2 border-b border-border bg-bg-subtle px-3 py-1.5 text-xs font-medium uppercase tracking-[0.06em] text-fg-subtle">
            <span>Item</span>
            <span className="text-right">Opening</span>
            <span className="text-right">In</span>
            <span className="text-right">Out</span>
            <span className="truncate text-right" title={location.thirdLabel}>{location.thirdLabel}</span>
            <span className="text-right">Book says</span>
            <span className="text-right">Counted</span>
            <span className="text-right">Variance</span>
            <span className="text-right">Sold for</span>
          </div>

          {shown.map((r) => {
            const s = salesById.get(r.item.id);
            const v = r.variance;
            return (
              <div key={r.item.id}
                className="grid grid-cols-[minmax(0,1fr)_70px_70px_70px_80px_80px_75px_75px_110px] items-center gap-2 border-b border-border px-3 py-1 last:border-0">
                <span className="min-w-0 truncate text-sm text-fg" title={r.count?.note ?? nameOf(r.item)}>
                  {nameOf(r.item)}
                  <span className="ml-1.5 text-xs text-fg-subtle">{r.item.uom}</span>
                </span>
                <span className="text-right text-sm tabular text-fg-muted">{qty(r.opening)}</span>
                <span className="text-right text-sm tabular text-fg-muted">{r.totalIn ? qty(r.totalIn) : "–"}</span>
                <span className="text-right text-sm tabular text-fg-muted">{r.totalOut ? qty(r.totalOut) : "–"}</span>
                <span className="text-right text-sm tabular text-fg-muted">{r.totalThird ? qty(r.totalThird) : "–"}</span>
                <span className={cn("text-right text-sm tabular", r.computed < 0 ? "text-danger" : "text-fg")}>{qty(r.computed)}</span>
                <button type="button" onClick={() => setTaking({ item: r.item, expected: ledgerBalanceAt(r.item.id, location.id, moves, counts, to).closing })}
                  className="text-right text-sm tabular text-fg-muted hover:text-accent"
                  title={r.count ? `Counted on ${czDate(r.count.countedOn)}` : "Record a count"}>
                  {r.count ? qty(r.count.qty) : "–"}
                </button>
                {/* ⚠️ "Nobody counted" is a dash, never a zero. A variance of
                    zero is a real finding; not having looked is not. */}
                <span className={cn("text-right text-sm tabular",
                  v == null ? "text-fg-subtle" : Math.abs(v) < 0.0005 ? "text-success" : v < 0 ? "text-danger" : "text-warn")}>
                  {v == null ? "–" : v > 0 ? `+${qty(v)}` : qty(v)}
                </span>
                <span className={cn("text-right text-sm tabular", s?.value == null ? "text-fg-subtle" : "text-fg-muted")}>
                  {s?.value == null ? (s && s.units > 0 ? "no price" : "–") : money(s.value)}
                </span>
              </div>
            );
          })}

          {shown.length === 0 && (
            <p className="px-3 py-8 text-center text-sm text-fg-subtle">Nothing matches that.</p>
          )}

          <div className="grid grid-cols-[minmax(0,1fr)_70px_70px_70px_80px_80px_75px_75px_110px] items-center gap-2 border-t-2 border-border bg-bg-subtle px-3 py-1.5 text-sm font-semibold text-fg">
            <span>{shown.length} items</span>
            <span />
            <span className="text-right tabular">{qty(totals.inQ)}</span>
            <span className="text-right tabular">{qty(totals.outQ)}</span>
            <span className="text-right tabular">{qty(totals.third)}</span>
            <span /><span /><span />
            <span className="text-right tabular">{money(totals.value)}</span>
          </div>
        </div>
      </div>

      {/* ⚠️ SAY THE CAUSE, NOT JUST THE SYMPTOM. "No price on record" sends
          somebody looking for a missing price; "every price starts on the 21st"
          points straight at the real problem, which is that the catalogue's
          prices were stamped with the day they were IMPORTED rather than the day
          they came into force. A total that quietly leaves things out is the
          fault this module exists to end, so it is never silent either way. */}
      {unpriced.length > 0 && (
        <p className="rounded-md border border-border bg-bg-subtle px-3 py-2 text-xs leading-relaxed text-fg-muted">
          <strong className="text-fg">{unpriced.length}</strong> item{unpriced.length === 1 ? "" : "s"} went out with no
          price in force on the day, so {unpriced.length === 1 ? "it is" : "they are"} not in that total — nothing here
          will invent a figure.
          {earliestPrice && to < earliestPrice && (
            <>
              {" "}
              <strong className="text-warn">The reason is that every price in the catalogue starts on {earliestPrice}</strong>,
              which is the day the price list was imported rather than the day it came into force. Until the dates on those
              prices are corrected, nothing before {earliestPrice} can be valued.
            </>
          )}
        </p>
      )}

      {takingAll && (
        <CocozuriCountSheet
          location={location}
          items={items}
          counts={counts}
          moves={moves}
          countedOn={to}
          nameOf={nameOf}
          onClose={() => setTakingAll(false)}
          onSaved={() => { setTakingAll(false); router.refresh(); }}
          onAdded={() => router.refresh()}
          toast={toast}
        />
      )}

      {taking && (
        <CountSheet
          item={taking.item}
          name={nameOf(taking.item)}
          expected={taking.expected}
          countedOn={to}
          existing={counts.find((c) => c.itemId === taking.item.id && c.countedOn === to) ?? null}
          onClose={() => setTaking(null)}
          onSaved={() => { setTaking(null); router.refresh(); }}
          toast={toast}
        />
      )}
    </div>
  );
}

/**
 * Recording a physical count.
 *
 * ⚠️ IT REFUSES TO SAVE A VARIANCE WITH NO REASON. That is the plan's own
 * wording — "enter the count, the variance is worked out and has to be
 * explained" — and it is the difference between a stock-take and a shrug. The
 * refusal is enforced server-side in `recordCount`, not only here.
 */
function CountSheet({
  item, name, expected, countedOn, existing, onClose, onSaved, toast,
}: {
  item: CzStockItem;
  name: string;
  expected: number;
  countedOn: string;
  existing: CzStockCount | null;
  onClose: () => void;
  onSaved: () => void;
  toast: (m: string, o?: { tone?: "success" | "danger" }) => void;
}) {
  const [value, setValue] = useState(existing ? String(existing.qty) : "");
  const [note, setNote] = useState(existing?.note ?? "");
  const [busy, setBusy] = useState(false);

  const counted = value.trim() === "" ? null : Number(value);
  const variance = counted == null || !Number.isFinite(counted) ? null : counted - expected;
  const needsReason = variance != null && Math.abs(variance) > 0.0005;

  async function save() {
    if (counted == null || !Number.isFinite(counted)) { toast("Type what was counted.", { tone: "danger" }); return; }
    setBusy(true);
    const res = await recordStockCountAction({ itemId: item.id, countedOn, qty: counted, note: note || null });
    setBusy(false);
    if (!res.ok) { toast(res.error ?? "Could not save the count.", { tone: "danger" }); return; }
    toast(
      res.variance && Math.abs(res.variance) > 0.0005
        ? `Counted. The book was out by ${res.variance > 0 ? "+" : ""}${qty(res.variance)}.`
        : "Counted, and it agrees with the book.",
      { tone: "success" },
    );
    onSaved();
  }

  return (
    <BottomSheet open onClose={onClose} title="Count the shelf" maxWidth="max-w-lg">
      <div className="flex flex-col gap-3 px-1 pb-2">
        <div>
          <p className="text-base font-medium text-fg">{name}</p>
          <p className="text-xs text-fg-subtle">Counted as at the end of {countedOn}</p>
        </div>

        <div className="flex items-center justify-between rounded-md border border-border bg-bg-subtle px-3 py-2 text-sm">
          <span className="text-fg-muted">The book says</span>
          <span className="tabular font-medium text-fg">{qty(expected)} {item.uom}</span>
        </div>

        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium uppercase tracking-[0.06em] text-fg-subtle">Actually on the shelf</span>
          <input value={value} onChange={(e) => setValue(e.target.value)} inputMode="decimal" autoFocus
            className="w-full rounded-md border border-border bg-bg px-2 py-1.5 text-base tabular outline-none focus:border-accent"
            placeholder="Count it and type the number" />
        </label>

        {variance != null && (
          <div className={cn("rounded-md border px-3 py-2 text-sm",
            Math.abs(variance) < 0.0005 ? "border-success/30 bg-success/10 text-success" : "border-warn/30 bg-warn/10 text-warn")}>
            {Math.abs(variance) < 0.0005
              ? "That agrees with the book."
              : `${variance > 0 ? "+" : ""}${qty(variance)} ${item.uom} against the book — ${variance < 0 ? "less on the shelf than there should be" : "more on the shelf than there should be"}.`}
          </div>
        )}

        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium uppercase tracking-[0.06em] text-fg-subtle">
            Why {needsReason && <span className="text-warn">— required</span>}
          </span>
          <input value={note} onChange={(e) => setNote(e.target.value)}
            className="w-full rounded-md border border-border bg-bg px-2 py-1.5 text-sm outline-none focus:border-accent"
            placeholder={needsReason ? "Breakages, samples, a delivery not written down…" : "Anything worth remembering"} />
          {needsReason && (
            <span className="text-xs text-fg-subtle">
              A count that finds a difference and says nothing is a number nobody can act on.
            </span>
          )}
        </label>

        <div className="flex items-center gap-2">
          <button type="button" onClick={() => void save()} disabled={busy || counted == null || (needsReason && !note.trim())}
            className="inline-flex h-8 items-center gap-1.5 rounded-md bg-accent px-3 text-sm font-medium text-accent-fg hover:opacity-90 disabled:opacity-50">
            {busy ? <Loader2 size={13} className="animate-spin" /> : <ClipboardCheck size={13} />} Save the count
          </button>
          <button type="button" onClick={onClose} className="h-8 rounded-md px-3 text-sm text-fg-muted hover:text-fg">Cancel</button>
        </div>

        <p className="text-xs leading-relaxed text-fg-subtle">
          A count is the position at the <strong>end</strong> of its date, and it becomes the new truth — everything
          after it is carried forward from what was counted, not from what the book said.
        </p>
      </div>
    </BottomSheet>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ChevronLeft, ChevronRight, Loader2, Save } from "lucide-react";
import { SearchInput } from "@/components/ui";
import { useToast } from "@/components/toast";
import {
  dayRows, previousDay, qty,
  type CzDayRow, type CzStockCount, type CzStockDay, type CzStockItem, type CzStockLocation,
} from "@/lib/cocozuri-stock-shared";
import { saveStockDayAction } from "@/app/cocozuri/actions";
import { cn } from "@/lib/cn";

/* ------------------------------------------------------------------ *
 * The day book: one location, one day.
 *
 * ⚠️ A DAY AT A TIME, NOT A MONTH ACROSS THE PAGE. The workbook lays a month out
 * sideways — four columns a day, thirty days, a hundred and twenty columns — and
 * that shape is the direct cause of fault #3: the totals at the far right are
 * hand-typed `=D5+H5+L5+…` chains, and the three chains disagree with each other
 * about how many days there were (the shop's IN adds 29, OUT 30, RETURN 26).
 * Nothing here is typed twice, so nothing can disagree.
 *
 * ⚠️ OPENING AND CLOSING ARE NOT TYPED AND CANNOT BE. Opening is yesterday's
 * close, closing is opening + in − out − the third column, both worked out as
 * you type. The only cells that accept anything are the three that record what
 * actually happened.
 * ------------------------------------------------------------------ */

const INPUT =
  "w-full rounded-md border border-border bg-bg px-1.5 py-1 text-right text-[12.5px] tabular outline-none focus:border-accent";

type Draft = Record<number, { i: string; o: string; t: string }>;

const asNum = (s: string) => (s.trim() === "" ? 0 : Number(s));

export function CocozuriStockDay({
  location, locations, items, days, counts, onDate, productNames,
}: {
  location: CzStockLocation;
  locations: CzStockLocation[];
  items: CzStockItem[];
  days: CzStockDay[];
  counts: CzStockCount[];
  onDate: string;
  /** productId → the catalogue's name. The stock sheet's own wording is only
   *  used where nothing is linked, so a merge cannot leave two names for one
   *  thing. */
  productNames: Record<number, string>;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<Draft>({});

  // ⚠️ Reset when the day or the location changes, or yesterday's numbers stay
  // in the boxes and get saved onto today.
  useEffect(() => { setDraft({}); }, [onDate, location.id]);

  const rows = useMemo(() => dayRows(items, days, counts, onDate), [items, days, counts, onDate]);

  const nameOf = (it: CzStockItem) =>
    (it.productId != null ? productNames[it.productId] : null) ?? it.name;

  const shown = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((r) => nameOf(r.item).toLowerCase().includes(term) || (r.item.category ?? "").toLowerCase().includes(term));
  }, [rows, q, productNames]);

  /** What is in the box, falling back to what is saved. */
  const cell = (r: CzDayRow, k: "i" | "o" | "t") => {
    const d = draft[r.item.id];
    if (d) return d[k];
    const v = k === "i" ? r.qtyIn : k === "o" ? r.qtyOut : r.qtyThird;
    return v === 0 ? "" : String(v);
  };

  const setCell = (r: CzDayRow, k: "i" | "o" | "t", v: string) =>
    setDraft((d) => ({
      ...d,
      [r.item.id]: {
        i: k === "i" ? v : (d[r.item.id]?.i ?? (r.qtyIn === 0 ? "" : String(r.qtyIn))),
        o: k === "o" ? v : (d[r.item.id]?.o ?? (r.qtyOut === 0 ? "" : String(r.qtyOut))),
        t: k === "t" ? v : (d[r.item.id]?.t ?? (r.qtyThird === 0 ? "" : String(r.qtyThird))),
      },
    }));

  /** Closing, live, from whatever is in the boxes right now. */
  const closingOf = (r: CzDayRow) =>
    r.opening + asNum(cell(r, "i")) - asNum(cell(r, "o")) - asNum(cell(r, "t"));

  const dirty = Object.keys(draft).length;
  const negative = shown.filter((r) => closingOf(r) < 0);

  async function save() {
    const touched = Object.entries(draft);
    if (touched.length === 0) { toast("Nothing has been changed.", { tone: "danger" }); return; }
    setBusy(true);
    const res = await saveStockDayAction({
      onDate,
      rows: touched.map(([id, v]) => ({
        itemId: Number(id),
        qtyIn: asNum(v.i), qtyOut: asNum(v.o), qtyThird: asNum(v.t),
      })),
    });
    setBusy(false);
    if (!res.ok) { toast(res.error ?? "Could not save the day.", { tone: "danger" }); return; }
    setDraft({});
    toast(
      res.cleared > 0
        ? `${res.written} item${res.written === 1 ? "" : "s"} saved, ${res.cleared} cleared.`
        : `${res.written} item${res.written === 1 ? "" : "s"} saved.`,
      { tone: "success" },
    );
    router.refresh();
  }

  const go = (date: string) => router.push(`/cocozuri/stock?loc=${location.id}&on=${date}`);

  return (
    <div className="space-y-3">
      {/* Which sheet, and which day. Both live in the address, so a day can be
          bookmarked and sent — the same rule as the ledger reports. */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1 rounded-md border border-border p-0.5">
          {locations.map((l) => (
            <button
              key={l.id}
              type="button"
              onClick={() => router.push(`/cocozuri/stock?loc=${l.id}&on=${onDate}`)}
              className={cn("h-7 rounded px-2.5 text-[12px] font-medium transition-colors",
                l.id === location.id ? "bg-accent text-accent-fg" : "text-fg-muted hover:text-fg")}
            >
              {l.name}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1">
          <button type="button" onClick={() => go(previousDay(onDate))} title="The day before"
            className="grid h-7 w-7 place-items-center rounded-md border border-border text-fg-muted hover:text-fg">
            <ChevronLeft size={14} />
          </button>
          <input type="date" value={onDate} onChange={(e) => e.target.value && go(e.target.value)}
            className="h-7 rounded-md border border-border bg-bg px-1.5 text-[12px] text-fg outline-none focus:border-accent" />
          <button type="button" onClick={() => { const d = new Date(`${onDate}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 1); go(d.toISOString().slice(0, 10)); }}
            title="The day after"
            className="grid h-7 w-7 place-items-center rounded-md border border-border text-fg-muted hover:text-fg">
            <ChevronRight size={14} />
          </button>
        </div>

        <SearchInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find an item…"
          wrapperClassName="w-[14rem]" className="h-7 text-[12px]" />

        <span className="grow" />

        <button type="button" onClick={() => void save()} disabled={busy || dirty === 0}
          className="inline-flex h-7 items-center gap-1.5 rounded-md bg-accent px-2.5 text-[12px] font-medium text-accent-fg hover:opacity-90 disabled:opacity-50">
          {busy ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
          {dirty ? `Save ${dirty} line${dirty === 1 ? "" : "s"}` : "Save"}
        </button>
      </div>

      {/* ⚠️ A closing balance below zero means more was recorded going out than
          was ever there. It is allowed to be typed — the numbers are what
          somebody actually counted — but never allowed to pass silently. */}
      {negative.length > 0 && (
        <p className="flex items-start gap-2 rounded-md border border-warn/30 bg-warn/10 px-3 py-2 text-[12px] text-warn">
          <AlertTriangle size={13} className="mt-px shrink-0" />
          <span>
            <strong>{negative.length}</strong> item{negative.length === 1 ? " closes" : "s close"} below zero — more has
            gone out than was ever there. Either the opening figure is wrong or a delivery has not been written down.
          </span>
        </p>
      )}

      {/* ⚠️ IT SCROLLS SIDEWAYS RATHER THAN CRUSHING THE ITEM NAME. Six columns
          of which five are fixed comes to 390px before the names start; on a
          375px phone `minmax(0,1fr)` resolved the ITEM column to ZERO and the
          sheet became six columns of numbers with nothing to say what they
          counted. Measured. A spreadsheet-shaped grid belongs in its own
          `overflow-x-auto` housing with a floor under it — the month page
          already does this, and the day book was the one that did not. */}
      <div className="overflow-x-auto rounded-lg border border-border bg-bg-elev">
        <div className="min-w-[38rem]">
        <div className="grid grid-cols-[minmax(9rem,1fr)_70px_80px_80px_80px_80px] items-center gap-2 border-b border-border bg-bg-subtle px-3 py-1.5 text-[10.5px] font-medium uppercase tracking-[0.06em] text-fg-subtle">
          <span>Item</span>
          <span className="text-right">Opening</span>
          <span className="text-right">In</span>
          <span className="text-right">Out</span>
          {/* ⚠️ The location's own word. RETURN in the shop, DA/SA/TA in the
              kitchen, DAMAGE in raw materials — read off the sheet, never
              translated into a guess. */}
          <span className="truncate text-right" title={location.thirdLabel}>{location.thirdLabel}</span>
          <span className="text-right">Closing</span>
        </div>

        <div>
          {shown.map((r) => {
            const closing = closingOf(r);
            const changed = draft[r.item.id] != null;
            return (
              <div key={r.item.id}
                className={cn("grid grid-cols-[minmax(9rem,1fr)_70px_80px_80px_80px_80px] items-center gap-2 border-b border-border px-3 py-1 last:border-0",
                  changed && "bg-accent-soft/40")}>
                <span className="min-w-0 truncate text-[12.5px] text-fg" title={nameOf(r.item)}>
                  {nameOf(r.item)}
                  <span className="ml-1.5 text-[11px] text-fg-subtle">{r.item.uom}</span>
                  {/* An item with no product cannot be valued in the sales
                      figures. Said quietly, but said. */}
                  {r.item.productId == null && (
                    <span className="ml-1.5 text-[10.5px] text-fg-subtle" title="Not linked to a product — it has no sales value">·  unlinked</span>
                  )}
                </span>
                <span className="text-right text-[12.5px] tabular text-fg-muted">{qty(r.opening)}</span>
                <input value={cell(r, "i")} onChange={(e) => setCell(r, "i", e.target.value)}
                  inputMode="decimal" className={INPUT} placeholder="–" aria-label={`In for ${nameOf(r.item)}`} />
                <input value={cell(r, "o")} onChange={(e) => setCell(r, "o", e.target.value)}
                  inputMode="decimal" className={INPUT} placeholder="–" aria-label={`Out for ${nameOf(r.item)}`} />
                <input value={cell(r, "t")} onChange={(e) => setCell(r, "t", e.target.value)}
                  inputMode="decimal" className={INPUT} placeholder="–" aria-label={`${location.thirdLabel} for ${nameOf(r.item)}`} />
                <span className={cn("text-right text-[12.5px] tabular font-medium",
                  closing < 0 ? "text-danger" : closing !== r.opening ? "text-fg" : "text-fg-muted")}>
                  {qty(closing)}
                </span>
              </div>
            );
          })}
          {shown.length === 0 && (
            <p className="px-3 py-8 text-center text-[12.5px] text-fg-subtle">
              {items.length === 0
                ? "No items on this location's list yet."
                : "Nothing matches that."}
            </p>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-border bg-bg-subtle px-3 py-1.5 text-[11.5px] text-fg-subtle">
          <span>{shown.length} of {items.length} items</span>
          <span>
            {rows.filter((r) => !r.untouched).length} written down for this day
            {dirty > 0 && <span className="text-accent"> · {dirty} unsaved</span>}
          </span>
        </div>
        </div>
      </div>
    </div>
  );
}

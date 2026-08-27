"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, BookOpen, Ban, Loader2, Plus, Store } from "lucide-react";
import { RecordList, type RecordFilter } from "@/components/record-list";
import { BottomSheet } from "@/components/bottom-sheet";
import { FIELD, SearchInput } from "@/components/ui";
import { FluidSelect } from "@/components/fluid-select";
import { useToast } from "@/components/toast";
import { czDate, money } from "@/lib/cocozuri-shared";
import { qty as qtyText, todayInDar, type CzStockLocation } from "@/lib/cocozuri-stock-shared";
import { typedNumberOr } from "@/lib/typed-number";
import {
  CZ_PAID_BY, counterBlockers, counterTotals, takings,
  type CzCounterSale, type CzPaidBy,
} from "@/lib/cocozuri-counter-shared";
import {
  cancelCounterSaleAction, postCounterSaleAction, recordCounterSaleAction,
  unpostCounterSaleAction,
} from "@/app/cocozuri/actions";

/* ------------------------------------------------------------------ *
 * The counter — a record of a sale, not a till.
 *
 * ⚠️ NOTHING HERE TAKES PAYMENT. The owner was explicit: "for now we won't
 * integrate a payment system here, just reports get digital." What this replaces
 * is the WhatsApp message and the paper sheet.
 *
 * ⚠️ AND RECORDING IT LATE IS NORMAL, not an exception — the person who sold it
 * and the person typing are usually different people, usually later.
 * ------------------------------------------------------------------ */

type Option = {
  itemId: number; name: string; uom: string;
  price: number | null; batchNo: string | null; lots: number; onHand: number;
};

type Row = CzCounterSale & {
  what: string;
  gross: number;
  grossLabel: string;
  paidLabel: string;
  booksState: "unposted" | "posted" | "reversed";
  booksLabel: string;
};

export function CocozuriCounter({
  sales, locations, customers, booksState, ready, reason, openNew,
}: {
  sales: CzCounterSale[];
  locations: CzStockLocation[];
  customers: { id: number; name: string }[];
  booksState: Record<number, "unposted" | "posted" | "reversed">;
  ready: boolean;
  reason: string | null;
  openNew?: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [q, setQ] = useState("");
  const [selling, setSelling] = useState(!!openNew);
  /* ⚠️ EVERY OTHER LIST IN THE MODULE HAS A RAIL, AND THIS ONE HAD NONE — so
     the counter's content started hard against the left edge while Invoices,
     Purchases and Products all indented past theirs. Same shape, same place. */
  const [status, setStatus] = useState<"recorded" | "cancelled" | null>(null);
  const rail: RecordFilter[] = [
    { key: "all", label: "All sales", count: sales.length, href: "#", active: status == null, onSelect: () => setStatus(null) },
    { key: "recorded", label: "Recorded", count: sales.filter((s) => s.status === "recorded").length, href: "#", active: status === "recorded", onSelect: () => setStatus("recorded"), group: "Status" },
    { key: "cancelled", label: "Cancelled", count: sales.filter((s) => s.status === "cancelled").length, href: "#", active: status === "cancelled", onSelect: () => setStatus("cancelled"), group: "Archive" },
  ];

  const [busy, setBusy] = useState(false);

  // ⚠️ The flag is consumed, or Back re-opens the sheet.
  useEffect(() => {
    if (openNew) window.history.replaceState(null, "", "/cocozuri/counter");
  }, [openNew]);

  async function run(label: string, fn: () => Promise<{ ok: boolean; error?: string }>) {
    setBusy(true);
    const res = await fn();
    setBusy(false);
    if (!res.ok) { toast(res.error ?? "That did not work.", { tone: "danger" }); return; }
    toast(label, { tone: "success" });
    router.refresh();
  }

  const rows: Row[] = useMemo(() => {
    const term = q.trim().toLowerCase();
    return sales
      .map((s) => {
        const t = counterTotals(s.lines, s.vatRate);
        const first = s.lines[0];
        const more = s.lines.length - 1;
        const state = booksState[s.id] ?? "unposted";
        return {
          ...s,
          what: first ? `${first.description}${more > 0 ? ` and ${more} more` : ""}` : "nothing listed",
          gross: t.gross,
          grossLabel: money(t.gross),
          paidLabel: CZ_PAID_BY.find((p) => p.key === s.paidBy)?.label ?? s.paidBy,
          booksState: state,
          booksLabel: state === "posted" ? "In the books" : state === "reversed" ? "Reversed" : "Not posted",
        };
      })
      .filter((s) => (status == null ? true : s.status === status))
      .filter((s) =>
        !term ||
        s.reference.toLowerCase().includes(term) ||
        s.what.toLowerCase().includes(term) ||
        (s.customerName ?? "").toLowerCase().includes(term) ||
        (s.soldBy ?? "").toLowerCase().includes(term));
  }, [sales, q, booksState, status]);

  const days = useMemo(() => takings(sales), [sales]);
  const total = rows.filter((r) => r.status === "recorded").reduce((s, r) => s + r.gross, 0);

  return (
    <>
      {/* ⚠️ THE TAKINGS SIT ON TOP, because this is the report that replaces the
          WhatsApp message: how much should be in the drawer, and how much came
          in by phone. One total answers neither question. */}
      {days.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-border bg-bg-elev">
          <div className="min-w-[36rem]">
            <div className="grid grid-cols-[110px_minmax(0,1fr)_110px_110px_110px] items-center gap-2 border-b border-border bg-bg-subtle px-3 py-1.5 text-xs font-medium uppercase tracking-[0.06em] text-fg-subtle">
              <span>Day</span>
              <span>Counter</span>
              <span className="text-right">In the drawer</span>
              <span className="text-right">By phone</span>
              <span className="text-right">Takings</span>
            </div>
            {days.slice(0, 10).map((d) => (
              <div key={`${d.onDate}#${d.locationId}`} className="grid grid-cols-[110px_minmax(0,1fr)_110px_110px_110px] items-center gap-2 border-b border-border px-3 py-1.5 last:border-0">
                <span className="text-sm text-fg-muted">{czDate(d.onDate)}</span>
                <span className="min-w-0 truncate text-sm text-fg">
                  {d.locationName ?? "?"}
                  <span className="ml-1.5 text-xs text-fg-subtle">
                    {d.sales} sale{d.sales === 1 ? "" : "s"} · {qtyText(d.pieces)} pieces
                  </span>
                </span>
                <span className="text-right text-sm tabular text-fg-muted">{d.cash > 0 ? money(d.cash) : "—"}</span>
                <span className="text-right text-sm tabular text-fg-muted">{d.online > 0 ? money(d.online) : "—"}</span>
                <span className="text-right text-sm font-medium tabular text-fg">{money(d.total)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <RecordList
        rows={rows}
        columns={[
          { key: "reference", label: "Ref", width: "105px", render: (r) => (
            <span className="truncate text-sm text-fg">{r.reference}</span>
          ) },
          { key: "onDate", label: "Day", width: "95px", render: (r) => (
            <span className="text-sm text-fg-muted">{czDate(r.onDate)}</span>
          ) },
          { key: "what", label: "What was sold", width: "minmax(0,1fr)", render: (r) => (
            <span className="min-w-0 truncate text-sm text-fg">
              {r.what}
              <span className="ml-1.5 text-xs text-fg-subtle">
                {r.locationName}
                {r.customerName ? ` · ${r.customerName}` : ""}
                {r.soldBy ? ` · ${r.soldBy}` : ""}
              </span>
              {r.status === "cancelled" && <span className="ml-1.5 text-xs text-fg-subtle">cancelled</span>}
            </span>
          ) },
          { key: "paidLabel", label: "How", width: "85px", hideBelow: "md", render: (r) => (
            <span className="text-sm text-fg-subtle">{r.paidLabel}</span>
          ) },
          { key: "booksLabel", label: "Books", width: "100px", hideBelow: "lg", render: (r) => (
            <span className={`text-sm ${r.booksState === "posted" ? "text-success" : "text-fg-muted"}`}>{r.booksLabel}</span>
          ) },
          { key: "grossLabel", label: "Amount", width: "110px", align: "right", render: (r) => (
            <span className={`text-sm tabular ${r.status === "cancelled" ? "text-fg-subtle line-through" : "text-fg"}`}>
              {r.grossLabel}
            </span>
          ) },
          { key: "act", label: "", width: "130px", align: "right", render: (r) => (
            r.status === "cancelled" ? <span className="text-xs text-fg-subtle">—</span> : (
              <span className="flex items-center justify-end gap-1">
                {r.booksState === "posted" ? (
                  <button type="button" disabled={busy} title="Take it back out of the books"
                    onClick={() => {
                      const why = window.prompt("Taking a sale back out of the books. Why?");
                      if (why == null) return;
                      void run("Taken back out — a reversal, not an erasure.", () => unpostCounterSaleAction(r.id, why));
                    }}
                    className="inline-flex h-7 items-center gap-1 rounded-md px-1.5 text-xs text-fg-subtle hover:text-fg disabled:opacity-60">
                    <BookOpen size={12} /> Unpost
                  </button>
                ) : (
                  <button type="button" disabled={busy || !ready} title={ready ? "Put the takings in the books" : reason ?? undefined}
                    onClick={() => void run("The takings are in the books.", () => postCounterSaleAction(r.id))}
                    className="inline-flex h-7 items-center gap-1 rounded-md px-1.5 text-xs text-fg-subtle hover:text-fg disabled:opacity-60">
                    <BookOpen size={12} /> Post
                  </button>
                )}
                <button type="button" disabled={busy} title="It did not happen"
                  onClick={() => {
                    const why = window.prompt("Cancelling puts the chocolate back on the shelf. Why?");
                    if (!why?.trim()) return;
                    void run("Cancelled — reversed, not erased.", () => cancelCounterSaleAction(r.id, why));
                  }}
                  className="inline-flex h-7 items-center rounded-md px-1.5 text-xs text-fg-subtle hover:text-danger disabled:opacity-60">
                  <Ban size={12} />
                </button>
              </span>
            )
          ) },
        ]}
        rowKey={(r) => r.id}
        listKey="cz_counter"
        filters={rail}
        total={sales.length}
        shown={rows.length}
        exportName="cocozuri-counter-sales"
        footerNote={total > 0 ? <span className="text-fg-muted">{money(total)} taken across the shown sales</span> : undefined}
        toolbar={
          <div className="flex flex-wrap items-center gap-2">
            <SearchInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="Reference, chocolate, who served…"
              wrapperClassName="w-[16rem]" className="text-sm" />
            <span className="grow" />
            <button type="button" onClick={() => setSelling(true)}
              className="inline-flex h-8 items-center gap-1.5 rounded-md bg-accent px-2.5 text-sm font-medium text-accent-fg hover:opacity-90">
              <Plus size={13} /> Write down a sale
            </button>
          </div>
        }
        empty={
          <div className="flex flex-col items-center gap-2 py-10 text-center">
            <Store size={20} className="text-fg-subtle" />
            <p className="text-base font-medium text-fg-muted">Nothing has been written down yet.</p>
            <p className="max-w-[34rem] text-sm text-fg-subtle">
              This is for what goes over a counter — the kitchen&apos;s bulk and custom orders, and
              the shop&apos;s walk-ins. Nothing takes payment here: write down what was sold and how
              the money came in, and the day&apos;s takings and the shelf both look after themselves.
            </p>
          </div>
        }
      />

      {selling && (
        <SellSheet locations={locations} customers={customers}
          onClose={() => setSelling(false)}
          onSold={() => { setSelling(false); router.refresh(); }} />
      )}
    </>
  );
}

/* ------------------------------------------------------------------ *
 * Writing one down
 * ------------------------------------------------------------------ */

function SellSheet({
  locations, customers, onClose, onSold,
}: {
  locations: CzStockLocation[];
  customers: { id: number; name: string }[];
  onClose: () => void;
  onSold: () => void;
}) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  // ⚠️ The KITCHEN is the main counter, not the shop — the owner said so.
  const [locationId, setLocationId] = useState<number>(
    locations.find((l) => /kitchen/i.test(l.name))?.id ?? locations[0]?.id ?? 0,
  );
  const [onDate, setOnDate] = useState(todayInDar());
  const [customerId, setCustomerId] = useState<number | null>(null);
  const [customerName, setCustomerName] = useState("");
  const [paidBy, setPaidBy] = useState<CzPaidBy>("cash");
  const [paymentRef, setPaymentRef] = useState("");
  const [soldBy, setSoldBy] = useState("");
  const [recordedBy, setRecordedBy] = useState("");
  const [options, setOptions] = useState<Option[]>([]);
  const [amounts, setAmounts] = useState<Record<number, string>>({});
  const [prices, setPrices] = useState<Record<number, string>>({});
  const [q, setQ] = useState("");

  // What that counter can sell, priced. ⚠️ Fetched, because the price depends on
  // the counter, the customer AND the day.
  useEffect(() => {
    if (!locationId) { setOptions([]); return; }
    let alive = true;
    setLoading(true);
    const url = `/api/cocozuri/counter-options?location=${locationId}&date=${onDate}${customerId ? `&customer=${customerId}` : ""}`;
    fetch(url)
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((d) => { if (alive) setOptions(d.items ?? []); })
      .catch(() => { if (alive) setOptions([]); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [locationId, customerId, onDate]);

  const lines = options
    .filter((o) => typedNumberOr(amounts[o.itemId]) > 0)
    .map((o) => ({
      itemId: o.itemId,
      qty: typedNumberOr(amounts[o.itemId]),
      unitPrice: prices[o.itemId] !== undefined && prices[o.itemId] !== ""
        ? typedNumberOr(prices[o.itemId])
        : (o.price ?? NaN),
      description: o.name,
    }));

  const blockers = counterBlockers({
    locationId: locationId || null, onDate, today: todayInDar(),
    lines: lines.map((l) => ({ itemId: l.itemId, qty: l.qty, unitPrice: l.unitPrice })),
  });
  const totals = counterTotals(lines.filter((l) => Number.isFinite(l.unitPrice)), 0);

  const shown = useMemo(() => {
    const term = q.trim().toLowerCase();
    const typed = options.filter((o) => typedNumberOr(amounts[o.itemId]) > 0);
    if (!term) return typed.length ? [...typed, ...options.filter((o) => !typed.includes(o))].slice(0, 400) : options.slice(0, 400);
    return options.filter((o) => o.name.toLowerCase().includes(term)).slice(0, 400);
  }, [options, q, amounts]);

  async function save() {
    setBusy(true);
    const res = await recordCounterSaleAction({
      locationId, onDate,
      customerId, customerName: customerName || null,
      paidBy, paymentRef: paymentRef || null,
      soldBy: soldBy || null, recordedBy: recordedBy || null,
      lines,
    });
    setBusy(false);
    if (!res.ok) { toast(res.error ?? "Could not record it.", { tone: "danger" }); return; }
    toast(`${res.reference} written down. The chocolate is off the shelf — post it to put the takings in the books.`, { tone: "success" });
    onSold();
  }

  return (
    <BottomSheet open onClose={onClose} title="Write down a sale" maxWidth="max-w-3xl">
      <div className="flex flex-col gap-3 px-1 pb-2">
        <div className="grid gap-3 sm:grid-cols-4">
          <Field label="Which counter">
            <FluidSelect value={String(locationId)} onSelect={(v) => setLocationId(Number(v))}
              options={locations.map((l) => ({ value: String(l.id), label: l.name }))} />
          </Field>
          <Field label="What day">
            <input type="date" value={onDate} onChange={(e) => setOnDate(e.target.value)} className={FIELD} />
          </Field>
          <Field label="Who served">
            <input value={soldBy} onChange={(e) => setSoldBy(e.target.value)} className={FIELD} placeholder="A name" />
          </Field>
          <Field label="Who is writing it down">
            <input value={recordedBy} onChange={(e) => setRecordedBy(e.target.value)} className={FIELD} placeholder="A name" />
          </Field>
        </div>

        <div className="grid gap-3 sm:grid-cols-4">
          <Field label="A customer we know">
            <FluidSelect
              value={customerId == null ? "" : String(customerId)}
              onSelect={(v) => setCustomerId(v ? Number(v) : null)}
              placeholder="A walk-in"
              options={[{ value: "", label: "A walk-in" }, ...customers.map((c) => ({ value: String(c.id), label: c.name }))]} />
          </Field>
          <Field label="Or just their name">
            <input value={customerName} onChange={(e) => setCustomerName(e.target.value)} className={FIELD}
              placeholder="Optional" disabled={customerId != null} />
          </Field>
          <Field label="How they paid">
            <FluidSelect value={paidBy} onSelect={(v) => setPaidBy(v as CzPaidBy)}
              options={CZ_PAID_BY.map((p) => ({ value: p.key, label: p.label }))} />
          </Field>
          <Field label="Payment reference">
            <input value={paymentRef} onChange={(e) => setPaymentRef(e.target.value)} className={FIELD}
              placeholder={paidBy === "online" ? "M-Pesa or transfer no." : "Optional"} />
          </Field>
        </div>

        {/* ⚠️ Said before anything is typed, so nobody expects a till. */}
        <p className="rounded-md border border-border bg-bg-subtle px-3 py-2 text-sm text-fg-muted">
          Nothing here takes payment — the money has already changed hands. Writing it down takes the
          chocolate off that counter&apos;s shelf and puts the sale in the day&apos;s takings. Recording
          it a day or two late is fine; type the day it actually happened.
        </p>

        <SearchInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a chocolate…" className="text-sm" />

        <div className="rounded-md border border-border">
          {/* ⚠️ THE LOT HAS ITS OWN COLUMN. Tucked after the name it truncated to
              `BA…` on every row — a lot number nobody can read is worse than none
              at all, because it looks like an answer. */}
          <div className="grid grid-cols-[minmax(0,1fr)_115px_75px_95px_85px] items-center gap-2 border-b border-border bg-bg-subtle px-2.5 py-1.5 text-xs font-medium uppercase tracking-[0.06em] text-fg-subtle">
            <span>Chocolate</span>
            <span>Lot out next</span>
            {/* ⚠️ "On the shelf" wrapped onto two lines in the column it has to
                fit; the shorter wording says the same thing on one. */}
            <span className="text-right">On shelf</span>
            <span className="text-right">Price each</span>
            <span className="text-right">Sold</span>
          </div>
          <div className="max-h-[20rem] overflow-y-auto">
            {loading && <p className="px-3 py-6 text-center text-sm text-fg-subtle">Reading that counter…</p>}
            {!loading && shown.map((o) => (
              <div key={o.itemId} className="grid grid-cols-[minmax(0,1fr)_115px_75px_95px_85px] items-center gap-2 border-b border-border px-2.5 py-1.5 last:border-0">
                <span className="min-w-0 truncate text-sm text-fg" title={o.name}>
                  {o.name}
                  {o.price == null && <span className="ml-1.5 text-xs text-warn">no price set</span>}
                </span>
                {/* ⚠️ WHICH LOT GOES NEXT, and it is a LABEL rather than a choice —
                    the lots are allocated first-expired-first-out against the
                    quantity actually SOLD at the moment it is written down, so a
                    sale big enough to span two is split into two movements there
                    rather than filed against whichever one this row happens to
                    name. `+1` says a second lot is behind it. */}
                <span className="min-w-0 truncate text-xs text-fg-subtle"
                  title={o.batchNo ? `${o.batchNo}${o.lots > 1 ? ` and ${o.lots - 1} more lot${o.lots > 2 ? "s" : ""} behind it` : ""}` : undefined}>
                  {o.batchNo ? <>{o.batchNo}{o.lots > 1 && <span className="text-fg-muted"> +{o.lots - 1}</span>}</> : "—"}
                </span>
                <span className={`text-right text-sm tabular ${o.onHand <= 0 ? "text-warn" : "text-fg-subtle"}`}>
                  {qtyText(o.onHand)}
                </span>
                <input
                  value={prices[o.itemId] ?? (o.price != null ? String(o.price) : "")}
                  onChange={(e) => setPrices((p) => ({ ...p, [o.itemId]: e.target.value }))}
                  inputMode="decimal" className={`${FIELD} text-right tabular`} placeholder="–"
                  aria-label={`Price of ${o.name}`} />
                <input
                  value={amounts[o.itemId] ?? ""}
                  onChange={(e) => setAmounts((a) => ({ ...a, [o.itemId]: e.target.value }))}
                  inputMode="decimal" className={`${FIELD} text-right tabular`} placeholder="–"
                  aria-label={`Sold of ${o.name}`} />
              </div>
            ))}
            {!loading && shown.length === 0 && (
              <p className="px-3 py-6 text-center text-sm text-fg-subtle">Nothing on that counter matches.</p>
            )}
          </div>
        </div>

        {lines.length > 0 && (
          <p className="rounded-md border border-border bg-bg-subtle px-3 py-2 text-sm text-fg-muted">
            <strong className="text-fg">{money(totals.gross)}</strong> across {lines.length} line
            {lines.length === 1 ? "" : "s"} · {qtyText(totals.pieces)} pieces.
          </p>
        )}

        {blockers.length > 0 && lines.length > 0 && (
          <p className="flex items-start gap-2 rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
            <AlertTriangle size={13} className="mt-px shrink-0" /> {blockers[0]}
          </p>
        )}

        <div className="flex items-center gap-2">
          <button type="button" onClick={() => void save()} disabled={busy || blockers.length > 0}
            className="inline-flex h-8 items-center gap-1.5 rounded-md bg-accent px-3 text-sm font-medium text-accent-fg hover:opacity-90 disabled:opacity-60">
            {busy ? <Loader2 size={13} className="animate-spin" /> : <Store size={13} />} Write it down
          </button>
          <button type="button" onClick={onClose} className="h-8 rounded-md px-3 text-sm text-fg-muted hover:text-fg">Cancel</button>
        </div>
      </div>
    </BottomSheet>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  /* ⚠️ `justify-end`, AND IT IS NOT COSMETIC. A grid cell stretches to the
     tallest row, so a label that wraps onto two lines pushed ITS control down
     while a one-line label left its control at the top — the boxes in one row
     sat at two different heights. Pushing label and control to the BOTTOM of
     the cell lines every control up whatever the labels do. */
  return (
    <label className="flex h-full flex-col justify-end gap-1">
      <span className="text-xs font-medium uppercase tracking-[0.06em] text-fg-subtle">{label}</span>
      {children}
    </label>
  );
}

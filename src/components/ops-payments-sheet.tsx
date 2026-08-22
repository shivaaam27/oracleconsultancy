"use client";

// ─────────────────────────────────────────────────────────────────────────────
// PAYMENTS — money going out, and what is still owed (Stage 7).
//
// This is the half of the business COS could not hold. The order line carried
// `supplier_payment_date` and nothing else, so a purchase was settled or it was
// not — while IMP PMT AND FREIGHT has been tracking amount paid, balance, due
// date, overdue-by, ageing band and advances against the same invoice across
// 353 rows.
//
// ⚠️ ONE PURCHASE, MANY PAYMENTS. A 40% advance and the balance later are two
// rows here, and the arithmetic is done on read.
//
// ⚠️ NOTHING IS REQUIRED BUT AN AMOUNT. Who, what for, and which invoice can
// all be filled in afterwards — that is how the sheet is really kept.
//
// ⚠️ This screen owns its list (see project-budget-sheet.tsx for why).
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useUrlFilters } from "@/lib/use-url-filters";
import { OpsTaxFields } from "@/components/ops-tax-fields";
import type { TaxRate } from "@/lib/ledger-tax-shared";
import { Loader2, Check, X, Pencil, Archive, Banknote } from "lucide-react";
import { cn } from "@/lib/cn";
import { FieldCell } from "@/components/ui";
import { RecordList } from "./record-list";
import { SavedViewsBar, type SavedView } from "./saved-views-bar";
import { Combobox } from "./combobox";
import { FluidSelect } from "./fluid-select";
import { MoneyInput } from "./money-input";
import { lineView, money, fmtDate, type OrderLine, type DespatchLite } from "@/lib/ops-orders-shared";
import { shipmentView, type Shipment } from "@/lib/ops-shipments-shared";
import {
  paymentTzs, purchaseDebt, shipmentDebt, payeeBalances, payableTotals,
  PAYMENT_KINDS, type Payment,
} from "@/lib/ops-payments-shared";
import { OpsPayables } from "./ops-payables";
import {
  createPaymentAction, updatePaymentAction, archivePaymentAction,
} from "@/app/ops/payment-actions";
import { createOpsRefAction } from "@/app/ops/actions";

type Suggest = { payees: string[]; kinds: string[]; references: string[] };

export function OpsPaymentsSheet({
  companyId, savedViews = [], payments: serverRows, lines, shipments, despatches,
  suggest, defaultExRate, taxRates = [],
}: {
  companyId: number;
  savedViews?: SavedView[];
  payments: Payment[];
  /** The purchases and shipments a payment can be set against, and which the
   *  balances are worked out from. */
  lines: OrderLine[];
  shipments: Shipment[];
  despatches: Array<{ id: number } & DespatchLite>;
  suggest: Suggest;
  defaultExRate: number;
  /** Withholding rates (Phase 3). Defaulted so a caller that forgets them
   *  simply shows "No withholding". */
  taxRates?: TaxRate[];
}) {
  const router = useRouter();
  const [rows, setRows] = useState(serverRows);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<number | null>(null);
  const [pending, start] = useTransition();
  const { values: view, hrefFor, query, dirty } = useUrlFilters(
    { state: "all", sort: "paid", dir: "desc", co: "" },
  );

  const seededFor = useRef(companyId);
  useEffect(() => {
    if (seededFor.current !== companyId) { seededFor.current = companyId; setRows(serverRows); }
  }, [companyId, serverRows]);

  const docById = useMemo(() => new Map(despatches.map((d) => [d.id, d])), [despatches]);
  const lineViews = useMemo(
    () => lines.map((l) => lineView(l, undefined, l.invoiceId === null ? null : docById.get(l.invoiceId) ?? null)),
    [lines, docById]);
  const shipViews = useMemo(() => shipments.map((s) => shipmentView(s)), [shipments]);

  const byLine = useMemo(() => {
    const m = new Map<number, Payment[]>();
    for (const p of rows) {
      if (p.orderLineId === null) continue;
      const b = m.get(p.orderLineId); if (b) b.push(p); else m.set(p.orderLineId, [p]);
    }
    return m;
  }, [rows]);
  const byShipment = useMemo(() => {
    const m = new Map<number, Payment[]>();
    for (const p of rows) {
      if (p.shipmentId === null) continue;
      const b = m.get(p.shipmentId); if (b) b.push(p); else m.set(p.shipmentId, [p]);
    }
    return m;
  }, [rows]);
  const loose = useMemo(
    () => rows.filter((p) => p.orderLineId === null && p.shipmentId === null), [rows]);

  const purchases = useMemo(
    () => lineViews
      .filter((v) => v.line.supplier?.trim() || v.purchaseTotalTzs !== null)
      .map((v) => purchaseDebt(v, byLine.get(v.line.id) ?? [])),
    [lineViews, byLine]);
  const shipDebts = useMemo(
    () => shipViews.map((v) => shipmentDebt(v, byShipment.get(v.shipment.id) ?? [])),
    [shipViews, byShipment]);
  const payees = useMemo(
    () => payeeBalances(purchases, shipDebts, loose), [purchases, shipDebts, loose]);
  const totals = useMemo(() => payableTotals(payees, purchases), [payees, purchases]);

  const counts = useMemo(() => ({
    all: rows.length,
    advances: rows.filter((p) => (p.kind ?? "").trim().toUpperCase() === "ADVANCE").length,
    loose: loose.length,
    unconverted: rows.filter((p) => paymentTzs(p) === null).length,
  }), [rows, loose]);

  const shown = useMemo(() => {
    const picked =
      view.state === "advances" ? rows.filter((p) => (p.kind ?? "").trim().toUpperCase() === "ADVANCE")
      : view.state === "loose" ? loose
      : view.state === "unconverted" ? rows.filter((p) => paymentTzs(p) === null)
      : rows;
    const dir = view.dir === "asc" ? 1 : -1;
    const val = (p: Payment): string | number | null => {
      switch (view.sort) {
        case "payee": return p.payee;
        case "amount": return paymentTzs(p);
        default: return p.paidDate ?? null;
      }
    };
    return [...picked].sort((a, b) => {
      const x = val(a), y = val(b);
      if (x === null && y === null) return 0;
      if (x === null) return 1;
      if (y === null) return -1;
      return (x < y ? -1 : x > y ? 1 : 0) * dir;
    });
  }, [rows, loose, view.state, view.sort, view.dir]);

  const sortHref = (key: string) =>
    hrefFor({ sort: key, dir: view.sort === key && view.dir === "desc" ? "asc" : "desc" });
  const sortedAs = (key: string): "asc" | "desc" | undefined =>
    view.sort === key ? (view.dir === "asc" ? "asc" : "desc") : undefined;

  // What a payment can be set against, named the way somebody would look for it.
  const lineOptions = useMemo(
    () => lineViews.map((v) => ({
      value: String(v.line.id),
      label: `${v.line.poNo} · ${v.line.description}`.slice(0, 60)
        + (v.line.supplier ? ` — ${v.line.supplier}` : ""),
    })), [lineViews]);
  const shipOptions = useMemo(
    () => shipments.map((s) => ({
      value: String(s.id),
      label: [s.blNo, s.supplier, s.clearingAgent].filter(Boolean).join(" · "),
    })), [shipments]);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-5">
        <Tile label="Still owed" value={money(totals.owed) ?? "—"}
          sub={totals.unknown > 0 ? `${totals.unknown} not costed`
            : `${totals.payees} payee${totals.payees === 1 ? "" : "s"}`}
          tone={totals.owed > 0 ? "warn" : undefined} />
        <Tile label="Paid so far" value={money(totals.paid) ?? "—"} sub={`${rows.length} payments`} />
        <Tile label="Paid in advance" value={money(totals.advance) ?? "—"}
          sub="before the goods came" />
        <Tile label="Over 90 days" value={String(totals.overdue90)}
          sub={totals.overdue90 > 0 ? "payees badly overdue" : "none that old"}
          tone={totals.overdue90 > 0 ? "danger" : undefined} />
        <Tile label="Not matched up" value={String(counts.loose)}
          sub="against no invoice"
          tone={counts.loose > 0 ? "warn" : undefined} />
      </div>

      <AddPayment
        companyId={companyId} suggest={suggest} defaultExRate={defaultExRate}
        lineOptions={lineOptions} shipOptions={shipOptions}
        onSaved={(p) => { setError(null); setRows((prev) => [p, ...prev]); router.refresh(); }}
        onError={setError}
      />

      {error && (
        <p role="alert" className="rounded-md border border-danger/30 bg-danger-soft px-2.5 py-1.5 text-sm text-danger">
          {error}
        </p>
      )}

      <OpsPayables rows={payees} totals={totals} companyId={companyId} />

      <SavedViewsBar
        initialViews={savedViews}
        currentQuery={query}
        hasFilters={dirty}
        basePath="/ops/payments"
        listKey="ops-payments"
      />

      <RecordList
        rows={shown}
        rowKey={(p) => p.id}
        exportName="Payments"
        listKey="ops-payments"
        total={shown.length}
        search={{
          placeholder: "Search payee, reference, what it was for…",
          param: "pq",
          match: (p, q) =>
            [p.payee, p.reference, p.kind, p.notes]
              .some((x) => (x ?? "").toLowerCase().includes(q)),
        }}
        filters={[
          { key: "all", label: "All payments", count: counts.all, href: hrefFor({ state: "all" }), active: view.state === "all" },
          { key: "advances", label: "Advances", count: counts.advances, href: hrefFor({ state: "advances" }), active: view.state === "advances" },
          { key: "loose", label: "Not matched up", count: counts.loose, href: hrefFor({ state: "loose" }), active: view.state === "loose", tone: "warn" },
          { key: "unconverted", label: "No rate on them", count: counts.unconverted, href: hrefFor({ state: "unconverted" }), active: view.state === "unconverted", tone: "danger" },
        ]}
        empty={
          <div className="py-6 text-center">
            <p className="text-base font-medium">No payments recorded yet</p>
            <p className="mt-1 text-sm text-fg-subtle">
              Record one every time money leaves — an advance, a balance, duty, freight. A purchase
              can take as many as it needs, and what is still owed follows from them.
            </p>
          </div>
        }
        columns={[
          {
            key: "paid", label: "Paid", width: "minmax(0,1fr)",
            sortHref: sortHref("paid"), sorted: sortedAs("paid"),
            csv: (p) => [p.paidDate?.slice(0, 10), p.payee, p.kind].filter(Boolean).join(" — "),
            render: (p) => (
              <span className="min-w-0">
                <span className="block truncate text-sm">
                  {p.payee ?? <span className="text-fg-subtle">nobody named</span>}
                  {p.kind && <span className="ml-1.5 text-xs text-fg-subtle">{p.kind}</span>}
                </span>
                <span className="block truncate text-xs text-fg-muted">
                  {[fmtDate(p.paidDate) ?? "no date", p.reference].filter(Boolean).join(" · ")}
                </span>
              </span>
            ),
          },
          {
            key: "against", label: "Against", width: "180px", hideBelow: "md",
            csv: (p) => {
              const l = lineViews.find((v) => v.line.id === p.orderLineId);
              const s = shipments.find((x) => x.id === p.shipmentId);
              return [l ? `PO ${l.line.poNo}` : null, s ? `BL ${s.blNo}` : null]
                .filter(Boolean).join(" + ") || null;
            },
            render: (p) => {
              const l = lineViews.find((v) => v.line.id === p.orderLineId);
              const s = shipments.find((x) => x.id === p.shipmentId);
              if (!l && !s) {
                return (
                  <span className="text-xs text-warn"
                    title="This payment is not against any purchase or shipment, so it is not taken off anything.">
                    not matched up
                  </span>
                );
              }
              return (
                <span className="min-w-0">
                  {l && <span className="block truncate text-sm">PO {l.line.poNo}</span>}
                  {s && <span className="block truncate text-xs text-fg-muted">BL {s.blNo}</span>}
                </span>
              );
            },
          },
          {
            key: "amount", label: "Amount", width: "150px", align: "right",
            sortHref: sortHref("amount"), sorted: sortedAs("amount"),
            csv: (p) => paymentTzs(p),
            render: (p) => {
              const tzs = paymentTzs(p);
              return (
                <span className="min-w-0">
                  <span className="tabular block truncate text-sm">
                    {/* ⚠️ A foreign payment with no rate is UNKNOWN in shillings
                        and says so, rather than being counted at face value. */}
                    {tzs === null ? <span className="text-danger">no rate</span> : money(tzs)}
                  </span>
                  <span className="block truncate text-xs text-fg-subtle">
                    {p.currency && p.currency !== "TZS"
                      ? `${p.currency} ${p.amount ?? ""}`.trim()
                      : "shillings"}
                  </span>
                </span>
              );
            },
            total: (onScreen) => (
              <span className="tabular">
                {money(onScreen.reduce((s, p) => s + (paymentTzs(p) ?? 0), 0))}
              </span>
            ),
          },
        ]}
        rowActions={(p) => (
          <span className="flex items-center gap-1">
            <button type="button" title="Open this payment"
              onClick={() => setEditing(editing === p.id ? null : p.id)}
              className="rounded p-1 text-fg-subtle hover:bg-bg-muted hover:text-fg">
              <Pencil size={13} />
            </button>
            <button type="button" title="Archive (never deleted)" disabled={pending}
              onClick={() => {
                if (!confirm(`Archive this payment of ${money(paymentTzs(p)) ?? "an unknown amount"}?`)) return;
                start(async () => {
                  const res = await archivePaymentAction(p.id, true);
                  if (!res.ok) { setError(res.error ?? "Couldn't archive."); return; }
                  setRows((prev) => prev.filter((r) => r.id !== p.id));
                  router.refresh();
                });
              }}
              className="rounded p-1 text-fg-subtle hover:bg-bg-muted hover:text-fg">
              <Archive size={13} />
            </button>
          </span>
        )}
        subRow={(p) =>
          editing === p.id ? (
            <div data-quick-update>
              <EditPayment
                companyId={companyId} payment={p} suggest={suggest} defaultExRate={defaultExRate}
                taxRates={taxRates}
                lineOptions={lineOptions} shipOptions={shipOptions}
                onDone={(patched) => {
                  setRows((prev) => prev.map((r) => (r.id === patched.id ? patched : r)));
                  setEditing(null);
                  router.refresh();
                }}
                onCancel={() => setEditing(null)}
                onError={setError}
              />
            </div>
          ) : null
        }
      />
    </div>
  );
}

function Tile({ label, value, sub, tone }: {
  label: string; value: string; sub?: string; tone?: "warn" | "danger";
}) {
  return (
    <div className="bg-bg-elev px-3 py-2">
      <p className="text-xs uppercase tracking-[0.04em] text-fg-subtle">{label}</p>
      <p className={cn("tabular mt-0.5 text-[15px]",
        tone === "warn" && "text-warn", tone === "danger" && "text-danger")}>{value}</p>
      {sub && <p className="text-xs text-fg-subtle">{sub}</p>}
    </div>
  );
}

const inputCls =
  "h-8 w-full rounded-md border border-border bg-bg px-2 text-base outline-none placeholder:text-fg-subtle focus:border-accent";


type Opt = { value: string; label: string };

/* ────────────────────────────────────────────────── money leaves ────────── */

function AddPayment({
  companyId, suggest, defaultExRate, lineOptions, shipOptions, onSaved, onError,
}: {
  companyId: number; suggest: Suggest; defaultExRate: number;
  lineOptions: Opt[]; shipOptions: Opt[];
  onSaved: (p: Payment) => void; onError: (e: string | null) => void;
}) {
  const [pending, start] = useTransition();
  const [payee, setPayee] = useState("");
  const [kind, setKind] = useState("");
  const [paidDate, setPaidDate] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("");
  const [exRate, setExRate] = useState("");
  const [reference, setReference] = useState("");
  const [orderLineId, setOrderLineId] = useState<number | null>(null);
  const [comboKey, setComboKey] = useState(0);
  const amountRef = useRef<HTMLInputElement | null>(null);

  const needsRate = currency !== "" && currency !== "TZS" && exRate === "";

  const save = () => {
    onError(null);
    if (!amount.trim()) { onError("Say how much was paid."); return; }
    start(async () => {
      const res = await createPaymentAction({
        companyId, payee, kind, paidDate, amount, currency, exRate, reference, orderLineId,
      });
      if (!res.ok) { onError(res.error ?? "Couldn't save."); return; }
      onSaved({
        id: res.id ?? -Date.now(), companyId,
        payee: payee || null, kind: kind || null, paidDate: paidDate || null,
        amount: amount.replace(/[\s,]/g, "") || null, currency: currency || null,
        exRate: exRate.replace(/[\s,]/g, "") || null, reference: reference || null,
        orderLineId, shipmentId: null, notes: null,
        // ⚠️ Empty until somebody sets a withholding rate on it. Null base means
        // the summary reports it as unknown rather than working the tax out on
        // the payment, which is the amount AFTER the tax was kept back.
        whtRateId: null, whtPercent: null, whtBase: null,
        archived: false,
      });
      // ⚠️ The payee, the date and the currency STAY — a morning's payments are
      // usually the same supplier on the same day. The amount does not.
      setAmount(""); setReference("");
      setComboKey((k) => k + 1);
      amountRef.current?.focus();
    });
  };

  return (
    <div className="rounded-lg border border-border bg-bg-elev p-3">
      <h3 className="mb-2 flex items-center gap-1.5 text-sm font-medium">
        <Banknote size={13} className="text-fg-subtle" /> Money has gone out
      </h3>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-12"
        onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); save(); } }}>
        <FieldCell className="sm:col-span-3" label="Paid to">
          <Combobox key={`p${comboKey}`} options={suggest.payees} defaultValue={payee}
            onCreate={(v) => createOpsRefAction(companyId, "supplier", v)} createNoun="supplier"
            placeholder="" onInput={setPayee} onCommit={setPayee} className={inputCls} />
        </FieldCell>
        <FieldCell className="sm:col-span-2" label="What for">
          <Combobox key={`k${comboKey}`}
            options={suggest.kinds.length ? suggest.kinds : PAYMENT_KINDS}
            defaultValue={kind} placeholder="" onInput={setKind} onCommit={setKind} className={inputCls} />
        </FieldCell>
        <FieldCell className="sm:col-span-2" label="Paid on">
          <input type="date" value={paidDate} onChange={(e) => setPaidDate(e.target.value)} className={inputCls} />
        </FieldCell>
        <FieldCell className="sm:col-span-2" label="Amount">
          <MoneyInput inputRef={amountRef} value={amount} onChange={setAmount} />
        </FieldCell>
        <FieldCell className="sm:col-span-1" label="Cur." hint="blank = shillings">
          <div className="flex gap-1">
            {["TZS", "USD"].map((c) => (
              <button key={c} type="button"
                onClick={() => setCurrency(currency === c ? "" : c)}
                className={cn("h-8 flex-1 rounded-md border text-xs",
                  currency === c ? "border-accent bg-accent-soft text-accent" : "border-border bg-bg text-fg-muted")}>
                {c}
              </button>
            ))}
          </div>
        </FieldCell>
        <FieldCell className="sm:col-span-2" label="Rate" hint="frozen here">
          <div className="flex gap-1">
            <input value={exRate} onChange={(e) => setExRate(e.target.value)} inputMode="decimal"
              className={cn(inputCls, "tabular text-right")} />
            {needsRate && defaultExRate > 0 && (
              <button type="button" onClick={() => setExRate(String(defaultExRate))}
                title="Use the rate set up on the Setup tab"
                className="h-8 shrink-0 rounded-md border border-border px-2 text-xs text-fg-muted hover:text-fg">
                {defaultExRate.toLocaleString("en-GB")}
              </button>
            )}
          </div>
        </FieldCell>
        <FieldCell className="sm:col-span-4" label="Reference" hint="proforma or BL number">
          <Combobox key={`r${comboKey}`} options={suggest.references} defaultValue={reference}
            placeholder="SAM00SOR2506148" onInput={setReference} onCommit={setReference} className={inputCls} />
        </FieldCell>
        <FieldCell className="sm:col-span-8" label="Against which purchase" hint="optional — can be matched up later">
          <FluidSelect
            value={orderLineId === null ? "" : String(orderLineId)}
            options={[{ value: "", label: "Not against a purchase" }, ...lineOptions]}
            onSelect={(v) => setOrderLineId(v === "" ? null : Number(v))}
            buttonClassName="h-8 w-full justify-between"
            className="w-full"
          />
        </FieldCell>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <button type="button" onClick={save} disabled={pending}
          className="inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-accent-fg disabled:opacity-60">
          {pending ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} Record it
        </button>
        <span className="text-xs text-fg-subtle">
          The payee, date and currency carry to the next payment. A purchase can take as many
          as it needs — an advance now, the balance later.
        </span>
      </div>
      {needsRate && (
        <p className="mt-1 text-xs text-warn">
          Paid in {currency} with no rate — this will not be counted in the shilling totals until
          one is entered.
        </p>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────── correcting one ─────────── */

function EditPayment({
  companyId, payment, suggest, defaultExRate, lineOptions, shipOptions, taxRates = [],
  onDone, onCancel, onError,
}: {
  companyId: number; payment: Payment; suggest: Suggest; defaultExRate: number;
  taxRates?: TaxRate[];
  lineOptions: Opt[]; shipOptions: Opt[];
  onDone: (p: Payment) => void; onCancel: () => void; onError: (e: string | null) => void;
}) {
  const [pending, start] = useTransition();
  const [f, setF] = useState({
    payee: payment.payee ?? "", kind: payment.kind ?? "",
    paidDate: payment.paidDate?.slice(0, 10) ?? "",
    amount: payment.amount ?? "", currency: payment.currency ?? "",
    exRate: payment.exRate ?? "", reference: payment.reference ?? "",
    notes: payment.notes ?? "",
    whtBase: payment.whtBase ?? "",
  });
  // ⚠️ Separate from `f`: the rate id is a number and the percent is frozen
  // when picked, neither of which a string-keyed setter handles.
  const [wht, setWht] = useState({
    rateId: payment.whtRateId, percent: payment.whtPercent, inclusive: null as boolean | null,
  });
  const [orderLineId, setOrderLineId] = useState<number | null>(payment.orderLineId);
  const [shipmentId, setShipmentId] = useState<number | null>(payment.shipmentId);
  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));
  const needsRate = f.currency !== "" && f.currency !== "TZS" && String(f.exRate) === "";

  const submit = () =>
    start(async () => {
      onError(null);
      const res = await updatePaymentAction(payment.id, {
        ...f, orderLineId, shipmentId,
        whtRateId: wht.rateId, whtPercent: wht.percent, whtBase: f.whtBase || null,
      });
      if (!res.ok) { onError(res.error ?? "Couldn't save."); return; }
      // ⚠️ Coerce FIRST. A Postgres `numeric` comes back from PostgREST as a
      // JSON NUMBER, so `v.trim` is not a function the second time a valued row
      // is opened. Same trap `money-input.tsx` documents.
      const clean = (v: string | number | null) => {
        const s = v === null || v === undefined ? "" : String(v);
        return s.trim() === "" ? null : s.replace(/[\s,]/g, "");
      };
      onDone({
        ...payment,
        payee: f.payee || null, kind: f.kind || null, paidDate: f.paidDate || null,
        amount: clean(f.amount), currency: f.currency || null, exRate: clean(f.exRate),
        reference: f.reference || null, notes: f.notes || null,
        whtRateId: wht.rateId, whtPercent: wht.percent, whtBase: clean(f.whtBase),
        orderLineId, shipmentId,
      });
    });

  return (
    <div className="space-y-3 rounded-md border border-accent/30 bg-bg-subtle p-3"
      onKeyDown={(e) => { if (e.key === "Escape") onCancel(); }}>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-12">
        <FieldCell className="sm:col-span-3" label="Paid to">
          <Combobox options={suggest.payees} defaultValue={f.payee}
            onCreate={(v) => createOpsRefAction(companyId, "supplier", v)} createNoun="supplier"
            placeholder="" onInput={(v) => set("payee", v)} onCommit={(v) => set("payee", v)} className={inputCls} />
        </FieldCell>
        <FieldCell className="sm:col-span-2" label="What for">
          <Combobox options={suggest.kinds.length ? suggest.kinds : PAYMENT_KINDS}
            defaultValue={f.kind} placeholder=""
            onInput={(v) => set("kind", v)} onCommit={(v) => set("kind", v)} className={inputCls} />
        </FieldCell>
        <FieldCell className="sm:col-span-2" label="Paid on">
          <input type="date" value={f.paidDate} onChange={(e) => set("paidDate", e.target.value)} className={inputCls} />
        </FieldCell>
        <FieldCell className="sm:col-span-2" label="Amount">
          <MoneyInput value={f.amount} onChange={(v) => set("amount", v)} />
        </FieldCell>
        <FieldCell className="sm:col-span-1" label="Cur.">
          <div className="flex gap-1">
            {["TZS", "USD"].map((c) => (
              <button key={c} type="button"
                onClick={() => set("currency", f.currency === c ? "" : c)}
                className={cn("h-8 flex-1 rounded-md border text-xs",
                  f.currency === c ? "border-accent bg-accent-soft text-accent" : "border-border bg-bg text-fg-muted")}>
                {c}
              </button>
            ))}
          </div>
        </FieldCell>
        <FieldCell className="sm:col-span-2" label="Rate">
          <div className="flex gap-1">
            <input value={f.exRate} onChange={(e) => set("exRate", e.target.value)} inputMode="decimal"
              className={cn(inputCls, "tabular text-right")} />
            {needsRate && defaultExRate > 0 && (
              <button type="button" onClick={() => set("exRate", String(defaultExRate))}
                className="h-8 shrink-0 rounded-md border border-border px-2 text-xs text-fg-muted hover:text-fg">
                {defaultExRate.toLocaleString("en-GB")}
              </button>
            )}
          </div>
        </FieldCell>
        <FieldCell className="sm:col-span-4" label="Reference">
          <Combobox options={suggest.references} defaultValue={f.reference} placeholder=""
            onInput={(v) => set("reference", v)} onCommit={(v) => set("reference", v)} className={inputCls} />
        </FieldCell>
        <FieldCell className="sm:col-span-4" label="Against a purchase">
          <FluidSelect
            value={orderLineId === null ? "" : String(orderLineId)}
            options={[{ value: "", label: "Not against a purchase" }, ...lineOptions]}
            onSelect={(v) => setOrderLineId(v === "" ? null : Number(v))}
            buttonClassName="h-8 w-full justify-between" className="w-full"
          />
        </FieldCell>
        <FieldCell className="sm:col-span-4" label="Against a shipment" hint="duty, clearing, freight">
          <FluidSelect
            value={shipmentId === null ? "" : String(shipmentId)}
            options={[{ value: "", label: "Not against a shipment" }, ...shipOptions]}
            onSelect={(v) => setShipmentId(v === "" ? null : Number(v))}
            buttonClassName="h-8 w-full justify-between" className="w-full"
          />
        </FieldCell>
        <FieldCell className="sm:col-span-4" label="Withheld on" hint="what they invoiced">
          <MoneyInput value={f.whtBase} onChange={(v) => set("whtBase", v)} />
        </FieldCell>
        <FieldCell className="sm:col-span-4" label="Notes">
          <input value={f.notes} onChange={(e) => set("notes", e.target.value)} className={inputCls} />
        </FieldCell>
      </div>

      {/* ── withholding (Phase 3) ────────────────────────────────────────────
          ⚠️ Worked out on "Withheld on" above — what the supplier INVOICED —
          not on the amount that left the bank. Those differ by the tax itself,
          so using the payment would understate it every time. */}
      <div className="border-t border-border pt-2">
        <OpsTaxFields
          rates={taxRates}
          side="wht"
          value={wht}
          onChange={setWht}
          amount={f.whtBase}
          currency={f.currency || "TZS"}
          label="Withholding"
          inputCls={inputCls}
        />
      </div>

      <div className="flex items-center gap-2">
        <button type="button" onClick={submit} disabled={pending}
          className="inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-accent-fg disabled:opacity-60">
          {pending ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} Save
        </button>
        <button type="button" onClick={onCancel}
          className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs text-fg-muted hover:text-fg">
          <X size={13} /> Cancel
        </button>
        <span className="text-xs text-fg-subtle">
          Every change is recorded — what it was, what it became, and who changed it.
        </span>
      </div>
    </div>
  );
}

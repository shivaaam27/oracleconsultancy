"use client";

// ─────────────────────────────────────────────────────────────────────────────
// ORDER LINES — the POS STATUS sheet, rebuilt (Stage 2).
//
// ⚠️ NOTHING IS FILLED IN FOR YOU. Not the currency, not the status, not the
// date, not the exchange rate. The rate has a one-click chip offering the
// default from Setup — offering, not filling — and every other box starts
// empty. A figure on this screen was either typed by a person or worked out in
// front of you from figures that were.
//
// Two ways in, because the workbook is used both ways:
//   · the strip at the top takes a line in eight boxes, Enter saves and returns
//     to the PO box, so a page of a purchase order can be typed straight through
//   · the row opens for everything else — the buying side, the status, the
//     invoice — which is filled in days or weeks later
//
// ⚠️ This screen OWNS its list. See the long note in project-budget-sheet.tsx:
// rapid `router.refresh()` calls race and a stale one wins, which loses lines
// while somebody is typing fast.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useUrlFilters } from "@/lib/use-url-filters";
import { Loader2, Plus, Check, X, Pencil, Archive, ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";
import { RecordList } from "./record-list";
import { Combobox } from "./combobox";
import { MoneyInput } from "./money-input";
import {
  lineView, orderTotals, money, pct, fmtDate, lineFlag, FLAG_LABEL, ORDER_KINDS,
  type OrderLine, type LineView,
} from "@/lib/ops-orders-shared";
import {
  createOrderLineAction, updateOrderLineAction, archiveOrderLineAction,
} from "@/app/ops/order-actions";
import { setLineShipmentAction } from "@/app/ops/shipment-actions";
import { setLineInvoiceAction } from "@/app/ops/invoice-actions";
import { FluidSelect } from "./fluid-select";

type Suggest = {
  clients: string[];
  costCentres: string[];
  suppliers: string[];
  origins: string[];
  statuses: string[];
  /** Descriptions already typed — the "middle path" on items. */
  descriptions: string[];
  /** Whoever has been named in "pending with" before. */
  pendingWith: string[];
  uoms: string[];
};

export function OpsOrdersSheet({
  companyId, lines: serverLines, suggest, defaultExRate, flag, shipments = [], despatches = [],
}: {
  companyId: number;
  lines: OrderLine[];
  suggest: Suggest;
  /** Every open shipment, so a line can be put on one. Nothing is copied onto
   *  the line — it points, and reads the ETA and duty from there. */
  shipments?: Array<{ id: number; blNo: string }>;
  /** Every delivery note / invoice, so a line can be put on one AND can read
   *  whether it has gone out and been billed. ⚠️ Nothing is copied onto the
   *  line — those facts live on the document (Stage 5). */
  despatches?: Array<{
    id: number; label: string;
    deliveredDate: string | null; invoiceNo: string | null; invoiceDate: string | null;
  }>;
  /** From Setup. OFFERED on a chip; never written into the box by itself. */
  defaultExRate: number;
  /** Which group the filter rail is showing (the server read it too). */
  flag: string;
}) {
  const router = useRouter();

  /**
   * ⚠️ The rail, the sort and the search share ONE query string.
   *
   * The first version hand-wrote `/ops?flag=overdue` on every rail link, which
   * threw away whatever was typed in the search box and the company you were
   * looking at. `hrefFor` patches one key and keeps the rest — the same way the
   * projects list has always done it.
   */
  const { values: view, hrefFor } = useUrlFilters(
    { flag: "all", sort: "received", dir: "desc", co: "" },
  );
  const [rows, setRows] = useState(serverLines);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<number | null>(null);
  const [pending, start] = useTransition();

  // Re-seed only when the company changes — not on every prop change, which is
  // the stale-refresh payload that loses rows.
  const seededFor = useRef(companyId);
  useEffect(() => {
    if (seededFor.current !== companyId) {
      seededFor.current = companyId;
      setRows(serverLines);
    }
  }, [companyId, serverLines]);

  const docById = useMemo(
    () => new Map(despatches.map((d) => [d.id, d])), [despatches]);
  // ⚠️ `lineView(l)` alone would report every line as never delivered and never
  // invoiced: since Stage 5 those two facts live on the document the line
  // points at, and the lookup is the caller's job.
  const views = useMemo(
    () => rows.map((l) => lineView(l, undefined, l.invoiceId === null ? null : docById.get(l.invoiceId) ?? null)),
    [rows, docById]);

  const shown = useMemo(() => {
    const picked = flag === "all" ? views : views.filter((v) => lineFlag(v) === flag);
    const dir = view.dir === "asc" ? 1 : -1;
    // ⚠️ Nulls always sink, whichever way the column is sorted. A line nobody
    // has priced is not "the cheapest", and a line with no due date is not the
    // most urgent thing on the page.
    const val = (v: LineView): number | string | null => {
      switch (view.sort) {
        case "due": return v.line.dueDate ?? null;
        case "sale": return v.saleTotalTzs;
        case "margin": return v.margin;
        case "po": return v.line.poNo;
        default: return v.line.receivedDate ?? null;
      }
    };
    return [...picked].sort((a, b) => {
      const x = val(a), y = val(b);
      if (x === null && y === null) return 0;
      if (x === null) return 1;
      if (y === null) return -1;
      return (x < y ? -1 : x > y ? 1 : 0) * dir;
    });
  }, [views, flag, view.sort, view.dir]);

  /** A column header link: same column flips the direction, a new one starts descending. */
  const sortHref = (key: string) =>
    hrefFor({ sort: key, dir: view.sort === key && view.dir === "desc" ? "asc" : "desc" });
  const sortedAs = (key: string): "asc" | "desc" | undefined =>
    view.sort === key ? (view.dir === "asc" ? "asc" : "desc") : undefined;
  const totals = useMemo(() => orderTotals(shown), [shown]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: views.length, overdue: 0, "due-soon": 0, open: 0, invoiced: 0 };
    for (const v of views) c[lineFlag(v)] = (c[lineFlag(v)] ?? 0) + 1;
    return c;
  }, [views]);

  return (
    <div className="space-y-3">
      <Summary totals={totals} />

      <AddLine
        companyId={companyId}
        suggest={suggest}
        defaultExRate={defaultExRate}
        onSaved={(line) => { setError(null); setRows((p) => [line, ...p]); router.refresh(); }}
        onError={setError}
      />

      {error && (
        <p role="alert" className="rounded-md border border-danger/30 bg-danger-soft px-2.5 py-1.5 text-[12px] text-danger">
          {error}
        </p>
      )}

      <RecordList
        rows={shown}
        rowKey={(v) => v.line.id}
        listKey="ops-orders"
        /* The denominator is what this VIEW holds, not every line in the
           company — "9 of 140" while looking at 28 overdue ones reads wrong. */
        total={shown.length}
        search={{
          placeholder: "Search PO, item, client, supplier…",
          param: "oq",
          match: (v, q) =>
            [v.line.poNo, v.line.description, v.line.client, v.line.supplier,
             v.line.quotationNo, v.line.profNo, v.line.costCentre,
             v.line.pendingWith, v.line.remarks]
              .some((x) => (x ?? "").toLowerCase().includes(q)),
        }}
        filters={[
          { key: "all", label: "All lines", count: counts.all, href: hrefFor({ flag: "all" }), active: flag === "all" },
          { key: "overdue", label: "Overdue", count: counts.overdue, href: hrefFor({ flag: "overdue" }), active: flag === "overdue", tone: "danger" },
          { key: "due-soon", label: "Due soon", count: counts["due-soon"], href: hrefFor({ flag: "due-soon" }), active: flag === "due-soon", tone: "warn" },
          { key: "open", label: "Open", count: counts.open, href: hrefFor({ flag: "open" }), active: flag === "open" },
          { key: "invoiced", label: "Invoiced", count: counts.invoiced, href: hrefFor({ flag: "invoiced" }), active: flag === "invoiced", tone: "success" },
        ]}
        empty={
          <div className="py-6 text-center">
            <p className="text-[13px] font-medium">No order lines yet</p>
            <p className="mt-1 text-[12px] text-fg-subtle">
              Add the first one above. Nothing is imported — every line is typed.
            </p>
          </div>
        }
        columns={[
          {
            key: "item", label: "PO / item", width: "minmax(0,1fr)",
            sortHref: sortHref("po"), sorted: sortedAs("po"),
            render: (v) => (
              <span className="min-w-0">
                <span className="block truncate text-[12px]">
                  <span className="font-mono text-fg-muted">{v.line.poNo}</span>{" "}
                  {v.line.description}
                </span>
                <span className="block truncate text-[11px] text-fg-muted">
                  {[v.line.client, v.line.costCentre, v.line.supplier, v.line.kind]
                    .filter(Boolean).join(" · ") || "—"}
                </span>
              </span>
            ),
          },
          {
            key: "due", label: "Due", width: "120px", hideBelow: "md",
            sortHref: sortHref("due"), sorted: sortedAs("due"),
            render: (v) => {
              const f = lineFlag(v);
              return (
                <span className="min-w-0">
                  <span className="block truncate text-[12px]">{fmtDate(v.line.dueDate) ?? "—"}</span>
                  <span className={cn("block text-[11px]",
                    f === "overdue" ? "text-danger" : f === "due-soon" ? "text-warn" : "text-fg-subtle")}>
                    {v.overdueDays === null
                      ? FLAG_LABEL[f]
                      : v.overdueDays > 0 ? `${v.overdueDays} days late` : `in ${-v.overdueDays} days`}
                  </span>
                </span>
              );
            },
          },
          {
            key: "sale", label: "Sale", width: "130px", align: "right",
            sortHref: sortHref("sale"), sorted: sortedAs("sale"),
            render: (v) => (
              <span className="tabular text-[12px]">
                {/* Unknown stays a dash. A line nobody has priced has no value. */}
                {v.saleTotalTzs === null ? "—" : money(v.saleTotalTzs)}
              </span>
            ),
            total: (rowsOnScreen) => (
              <span className="tabular">
                {money(rowsOnScreen.reduce((s, v) => s + (v.saleTotalTzs ?? 0), 0))}
              </span>
            ),
          },
          {
            key: "margin", label: "Margin", width: "120px", align: "right", hideBelow: "lg",
            sortHref: sortHref("margin"), sorted: sortedAs("margin"),
            render: (v) => (
              <span className={cn("tabular text-[12px]",
                v.margin !== null && v.margin < 0 ? "text-danger" : "text-fg-muted")}>
                {v.margin === null ? "—" : `${money(v.margin)}${v.marginPct !== null ? ` · ${pct(v.marginPct, 0)}` : ""}`}
              </span>
            ),
            total: (rowsOnScreen) => (
              <span className="tabular text-fg-muted">
                {money(rowsOnScreen.reduce((s, v) => s + (v.margin ?? 0), 0))}
              </span>
            ),
          },
          {
            key: "status", label: "Status", width: "140px", hideBelow: "md",
            render: (v) => (
              <span className="min-w-0">
                <span className="block truncate text-[12px]">{v.line.status ?? "—"}</span>
                {v.line.pendingWith && (
                  <span className="block truncate text-[11px] text-fg-subtle">
                    with {v.line.pendingWith}
                  </span>
                )}
              </span>
            ),
          },
        ]}
        rowActions={(v) => (
          <span className="flex items-center gap-1">
            <button type="button" title="Open this line"
              onClick={() => setEditing(editing === v.line.id ? null : v.line.id)}
              className="rounded p-1 text-fg-subtle hover:bg-bg-muted hover:text-fg">
              <Pencil size={13} />
            </button>
            <button type="button" title="Archive (never deleted)" disabled={pending}
              onClick={() => {
                if (!confirm(`Archive ${v.line.poNo} — ${v.line.description}?`)) return;
                start(async () => {
                  const res = await archiveOrderLineAction(v.line.id, true);
                  if (!res.ok) { setError(res.error ?? "Couldn't archive."); return; }
                  setRows((p) => p.filter((r) => r.id !== v.line.id));
                  router.refresh();
                });
              }}
              className="rounded p-1 text-fg-subtle hover:bg-bg-muted hover:text-fg">
              <Archive size={13} />
            </button>
          </span>
        )}
        /* ⚠️ `data-quick-update` keeps this visible: Compact density hides
           `[data-subrow]` except on hover, which puts the fields out of reach. */
        subRow={(v) =>
          editing === v.line.id ? (
            <div data-quick-update>
              <EditLine
                line={v.line}
                suggest={suggest}
                shipments={shipments}
                despatches={despatches}
                onDone={(patched) => {
                  setRows((p) => p.map((r) => (r.id === patched.id ? patched : r)));
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

/* ─────────────────────────────────────────────────────────────── summary ─── */

function Summary({ totals }: { totals: ReturnType<typeof orderTotals> }) {
  return (
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-4">
      <Tile label="Lines" value={String(totals.lines)}
        sub={`${totals.orders} order${totals.orders === 1 ? "" : "s"}`} />
      <Tile label="Sale value" value={money(totals.sale) ?? "—"}
        /* ⚠️ Said out loud. A total that quietly drops what it could not price
           is the workbook's own habit. */
        sub={totals.unpriced > 0 ? `${totals.unpriced} line${totals.unpriced === 1 ? "" : "s"} not priced yet` : "in shillings"} />
      <Tile label="Margin" value={money(totals.margin) ?? "—"}
        tone={totals.margin < 0 ? "danger" : undefined}
        sub="where both sides are known" />
      <Tile label="Overdue" value={String(totals.overdue)}
        tone={totals.overdue > 0 ? "warn" : undefined}
        sub={`${totals.invoiced} invoiced`} />
    </div>
  );
}

function Tile({ label, value, sub, tone }: {
  label: string; value: string; sub?: string; tone?: "danger" | "warn";
}) {
  return (
    <div className="bg-bg-elev px-3 py-2">
      <p className="text-[11px] uppercase tracking-[0.04em] text-fg-subtle">{label}</p>
      <p className={cn("tabular mt-0.5 text-[15px]",
        tone === "danger" && "text-danger", tone === "warn" && "text-warn")}>{value}</p>
      {sub && <p className="text-[11px] text-fg-subtle">{sub}</p>}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────── add a line ─ */

const inputCls =
  "h-8 w-full rounded-md border border-border bg-bg px-2 text-[13px] outline-none placeholder:text-fg-subtle focus:border-accent";

function AddLine({
  companyId, suggest, defaultExRate, onSaved, onError,
}: {
  companyId: number;
  suggest: Suggest;
  defaultExRate: number;
  onSaved: (line: OrderLine) => void;
  onError: (e: string | null) => void;
}) {
  const [pending, start] = useTransition();
  // The PO and the client stay between saves: a purchase order is typed a page
  // at a time, and every line on it shares both.
  const [poNo, setPoNo] = useState("");
  const [client, setClient] = useState("");
  const [description, setDescription] = useState("");
  const [qty, setQty] = useState("");
  const [uom, setUom] = useState("");
  const [price, setPrice] = useState("");
  const [currency, setCurrency] = useState("");
  const [exRate, setExRate] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [receivedDate, setReceivedDate] = useState("");
  const [justSaved, setJustSaved] = useState<string | null>(null);
  const [comboKey, setComboKey] = useState(0);
  const poRef = useRef<HTMLInputElement | null>(null);

  const save = () => {
    onError(null);
    if (!poNo.trim()) { onError("Give the line a PO number."); return; }
    if (!description.trim()) { onError("Say what the line is for."); return; }
    start(async () => {
      const res = await createOrderLineAction({
        companyId, poNo, description, client, qty, uom,
        saleUnitPrice: price, saleCurrency: currency, exRate,
        dueDate, receivedDate,
      });
      if (!res.ok) { onError(res.error ?? "Couldn't save the line."); return; }
      setJustSaved(description.trim());
      onSaved({
        id: res.id ?? -Date.now(), companyId, poNo: poNo.trim(), description: description.trim(),
        client: client || null, costCentre: null,
        receivedDate: receivedDate || null, dueDate: dueDate || null,
        qty: qty.replace(/[\s,]/g, "") || null, uom: uom || null,
        saleCurrency: currency || null,
        saleUnitPrice: price.replace(/[\s,]/g, "") || null,
        exRate: exRate.replace(/[\s,]/g, "") || null,
        kind: null, quotationNo: null, quotedUnitBp: null, lcFactor: null, source: null,
        supplier: null, origin: null, profNo: null, purchaseDate: null, purchaseCurrency: null,
        purchaseQty: null, purchaseUnitPrice: null, supplierPaymentDate: null,
        status: null, pendingWith: null, remarks: null, invoiceId: null, deliveredQty: null,
        shipmentId: null, archived: false,
      });
      // Clear the line, keep the header: PO, client, currency, rate and dates
      // belong to the whole order, the rest to this item.
      setDescription(""); setQty(""); setPrice(""); setComboKey((k) => k + 1);
      setTimeout(() => setJustSaved(null), 2000);
      poRef.current?.focus();
    });
  };

  return (
    <div className="rounded-lg border border-border bg-bg-elev p-3">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-[12px] font-medium">Add a line</h3>
        {justSaved && (
          <span className="inline-flex items-center gap-1 text-[11px] text-success">
            <Check size={12} /> saved {justSaved.slice(0, 28)}
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-12"
        onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); save(); } }}>
        <Cell className="sm:col-span-2" label="PO number" hint="stays for the next line">
          <input ref={poRef} value={poNo} onChange={(e) => setPoNo(e.target.value)}
            placeholder="24235" className={cn(inputCls, "font-mono")} />
        </Cell>
        <Cell className="sm:col-span-2" label="Client" hint="stays">
          <Combobox key={`c${comboKey}`} options={suggest.clients} defaultValue={client}
            placeholder="who ordered" onInput={setClient} onCommit={setClient} className={inputCls} />
        </Cell>
        <Cell className="sm:col-span-4" label="Item" hint="suggests what you have typed before">
          <Combobox key={`d${comboKey}`} options={suggest.descriptions} defaultValue={description}
            placeholder="what it is" onInput={setDescription} onCommit={setDescription} className={inputCls} />
        </Cell>
        <Cell className="sm:col-span-1" label="Qty">
          <input value={qty} onChange={(e) => setQty(e.target.value)} inputMode="decimal"
            placeholder="" className={cn(inputCls, "tabular text-right")} />
        </Cell>
        <Cell className="sm:col-span-1" label="Unit">
          <Combobox key={`u${comboKey}`} options={suggest.uoms} defaultValue={uom}
            placeholder="" onInput={setUom} onCommit={setUom} className={inputCls} />
        </Cell>
        <Cell className="sm:col-span-2" label="Unit price">
          <MoneyInput value={price} onChange={setPrice} placeholder="" />
        </Cell>

        <Cell className="sm:col-span-2" label="Currency" hint="blank = shillings">
          <div className="flex gap-1">
            {["TZS", "USD"].map((c) => (
              <button key={c} type="button"
                onClick={() => setCurrency(currency === c ? "" : c)}
                className={cn("h-8 flex-1 rounded-md border text-[11px]",
                  currency === c ? "border-accent bg-accent-soft text-accent" : "border-border bg-bg text-fg-muted")}>
                {c}
              </button>
            ))}
          </div>
        </Cell>
        <Cell className="sm:col-span-2" label="Exchange rate" hint="only if not in shillings">
          <div className="flex gap-1">
            <input value={exRate} onChange={(e) => setExRate(e.target.value)} inputMode="decimal"
              placeholder="" className={cn(inputCls, "tabular text-right")} />
            {/* ⚠️ OFFERED, not filled in. One press puts the Setup default in;
                leaving it alone leaves the box empty. */}
            {defaultExRate > 0 && exRate === "" && (
              <button type="button" onClick={() => setExRate(String(defaultExRate))}
                title="Use the rate from Setup"
                className="shrink-0 rounded-md border border-border px-1.5 text-[11px] text-fg-muted hover:border-accent hover:text-accent">
                {defaultExRate.toLocaleString("en-GB")}
              </button>
            )}
          </div>
        </Cell>
        <Cell className="sm:col-span-2" label="PO received" hint="stays">
          <input type="date" value={receivedDate} onChange={(e) => setReceivedDate(e.target.value)}
            className={inputCls} />
        </Cell>
        <Cell className="sm:col-span-2" label="Due" hint="stays">
          <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)}
            className={inputCls} />
        </Cell>
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        <button type="button" onClick={save} disabled={pending}
          className="inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-accent-fg disabled:opacity-60">
          {pending ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />} Add line
        </button>
        <span className="text-[11px] text-fg-subtle">
          <kbd className="rounded border border-border px-1">Enter</kbd> saves and starts the next
          item on the same PO. The buying side, the status and the invoice are filled in on the
          line itself, later.
        </span>
      </div>
    </div>
  );
}

function Cell({ label, hint, className, children }: {
  label: string; hint?: string; className?: string; children: React.ReactNode;
}) {
  return (
    <label className={cn("block min-w-0", className)}>
      <span title={hint ? `${label} — ${hint}` : label}
        className="mb-1 flex h-4 items-center gap-1 overflow-hidden text-[10px] uppercase tracking-[0.04em] text-fg-subtle">
        <span className="shrink-0">{label}</span>
        {hint && <span className="truncate normal-case tracking-normal opacity-60">{hint}</span>}
      </span>
      {children}
    </label>
  );
}

/* ───────────────────────────────────────────────────────────── the rest ──── */

function EditLine({
  line, suggest, shipments, despatches, onDone, onCancel, onError,
}: {
  line: OrderLine;
  suggest: Suggest;
  shipments: Array<{ id: number; blNo: string }>;
  despatches: Array<{ id: number; label: string }>;
  onDone: (patched: OrderLine) => void;
  onCancel: () => void;
  onError: (e: string | null) => void;
}) {
  const [pending, start] = useTransition();
  const [f, setF] = useState({
    poNo: line.poNo, description: line.description,
    client: line.client ?? "", costCentre: line.costCentre ?? "",
    receivedDate: line.receivedDate?.slice(0, 10) ?? "", dueDate: line.dueDate?.slice(0, 10) ?? "",
    qty: line.qty ?? "", uom: line.uom ?? "",
    saleCurrency: line.saleCurrency ?? "", saleUnitPrice: line.saleUnitPrice ?? "",
    exRate: line.exRate ?? "", kind: line.kind ?? "",
    quotationNo: line.quotationNo ?? "", quotedUnitBp: line.quotedUnitBp ?? "",
    lcFactor: line.lcFactor ?? "", source: line.source ?? "",
    supplier: line.supplier ?? "", origin: line.origin ?? "", profNo: line.profNo ?? "",
    purchaseDate: line.purchaseDate?.slice(0, 10) ?? "",
    purchaseCurrency: line.purchaseCurrency ?? "", purchaseQty: line.purchaseQty ?? "",
    purchaseUnitPrice: line.purchaseUnitPrice ?? "",
    supplierPaymentDate: line.supplierPaymentDate?.slice(0, 10) ?? "",
    status: line.status ?? "", pendingWith: line.pendingWith ?? "", remarks: line.remarks ?? "",
    deliveredQty: line.deliveredQty ?? "",
  });
  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));
  const [openSale, setOpenSale] = useState(false);
  const [shipmentId, setShipmentId] = useState<number | null>(line.shipmentId);
  const [invoiceId, setInvoiceId] = useState<number | null>(line.invoiceId);

  const submit = () =>
    start(async () => {
      onError(null);
      const res = await updateOrderLineAction(line.id, f);
      if (!res.ok) { onError(res.error ?? "Couldn't save."); return; }
      // ⚠️ Coerce FIRST. A Postgres `numeric` comes back from PostgREST as a JSON
      // NUMBER, not a string, even though the row type says `string | null` —
      // so the second time a priced row is opened, `v.trim` is not a function
      // and the whole panel dies in the error boundary. The same trap is
      // documented at the top of `money-input.tsx`.
      const clean = (v: string | number | null) => {
        const s = v === null || v === undefined ? "" : String(v);
        return s.trim() === "" ? null : s.replace(/[\s,]/g, "");
      };
      onDone({
        ...line,
        poNo: f.poNo.trim(), description: f.description.trim(),
        client: f.client || null, costCentre: f.costCentre || null,
        receivedDate: f.receivedDate || null, dueDate: f.dueDate || null,
        qty: clean(f.qty), uom: f.uom || null,
        saleCurrency: f.saleCurrency || null, saleUnitPrice: clean(f.saleUnitPrice),
        exRate: clean(f.exRate), kind: f.kind || null,
        quotationNo: f.quotationNo || null, quotedUnitBp: clean(f.quotedUnitBp),
        lcFactor: clean(f.lcFactor), source: f.source || null,
        supplier: f.supplier || null, origin: f.origin || null, profNo: f.profNo || null,
        purchaseDate: f.purchaseDate || null, purchaseCurrency: f.purchaseCurrency || null,
        purchaseQty: clean(f.purchaseQty), purchaseUnitPrice: clean(f.purchaseUnitPrice),
        supplierPaymentDate: f.supplierPaymentDate || null,
        status: f.status || null, pendingWith: f.pendingWith || null, remarks: f.remarks || null,
        deliveredQty: clean(f.deliveredQty),
      });
    });

  return (
    <div className="space-y-3 rounded-md border border-accent/30 bg-bg-subtle p-3"
      onKeyDown={(e) => { if (e.key === "Escape") onCancel(); }}>

      {/* what we bought, and from whom — the half the strip does not ask for */}
      <Section title="What it cost us">
        <Cell className="sm:col-span-3" label="Supplier">
          <Combobox options={suggest.suppliers} defaultValue={f.supplier} placeholder=""
            onInput={(v) => set("supplier", v)} onCommit={(v) => set("supplier", v)} className={inputCls} />
        </Cell>
        <Cell className="sm:col-span-2" label="Origin">
          <Combobox options={suggest.origins} defaultValue={f.origin} placeholder=""
            onInput={(v) => set("origin", v)} onCommit={(v) => set("origin", v)} className={inputCls} />
        </Cell>
        <Cell className="sm:col-span-2" label="Local / import">
          <div className="flex gap-1">
            {ORDER_KINDS.map((k) => (
              <button key={k} type="button" onClick={() => set("kind", f.kind === k ? "" : k)}
                className={cn("h-8 flex-1 rounded-md border px-1 text-[10px]",
                  f.kind === k ? "border-accent bg-accent-soft text-accent" : "border-border bg-bg text-fg-muted")}>
                {k}
              </button>
            ))}
          </div>
        </Cell>
        <Cell className="sm:col-span-1" label="Qty" hint="its own">
          <input value={f.purchaseQty} onChange={(e) => set("purchaseQty", e.target.value)}
            inputMode="decimal" className={cn(inputCls, "tabular text-right")} />
        </Cell>
        <Cell className="sm:col-span-2" label="Unit cost">
          <MoneyInput value={f.purchaseUnitPrice} onChange={(v) => set("purchaseUnitPrice", v)} />
        </Cell>
        <Cell className="sm:col-span-2" label="Currency">
          <div className="flex gap-1">
            {["TZS", "USD"].map((c) => (
              <button key={c} type="button"
                onClick={() => set("purchaseCurrency", f.purchaseCurrency === c ? "" : c)}
                className={cn("h-8 flex-1 rounded-md border text-[11px]",
                  f.purchaseCurrency === c ? "border-accent bg-accent-soft text-accent" : "border-border bg-bg text-fg-muted")}>
                {c}
              </button>
            ))}
          </div>
        </Cell>
        <Cell className="sm:col-span-3" label="Proforma no.">
          <input value={f.profNo} onChange={(e) => set("profNo", e.target.value)} className={inputCls} />
        </Cell>
        <Cell className="sm:col-span-3" label="Quotation no.">
          <input value={f.quotationNo} onChange={(e) => set("quotationNo", e.target.value)} className={inputCls} />
        </Cell>
        <Cell className="sm:col-span-2" label="Quoted buy price">
          <MoneyInput value={f.quotedUnitBp} onChange={(v) => set("quotedUnitBp", v)} />
        </Cell>
        <Cell className="sm:col-span-2" label="LC factor" hint="freight + duty">
          <input value={f.lcFactor} onChange={(e) => set("lcFactor", e.target.value)}
            inputMode="decimal" placeholder="1.32" className={cn(inputCls, "tabular text-right")} />
        </Cell>
        <Cell className="sm:col-span-2" label="Ordered on">
          <input type="date" value={f.purchaseDate} onChange={(e) => set("purchaseDate", e.target.value)} className={inputCls} />
        </Cell>
        <Cell className="sm:col-span-2" label="Supplier paid">
          <input type="date" value={f.supplierPaymentDate} onChange={(e) => set("supplierPaymentDate", e.target.value)} className={inputCls} />
        </Cell>
      </Section>

      <Section title="Where it has got to">
        <Cell className="sm:col-span-3" label="Status">
          <Combobox options={suggest.statuses} defaultValue={f.status} placeholder=""
            onInput={(v) => set("status", v)} onCommit={(v) => set("status", v)} className={inputCls} />
        </Cell>
        <Cell className="sm:col-span-3" label="Pending with" hint="person or department">
          <Combobox options={suggest.pendingWith} defaultValue={f.pendingWith} placeholder=""
            onInput={(v) => set("pendingWith", v)} onCommit={(v) => set("pendingWith", v)} className={inputCls} />
        </Cell>
        <Cell className="sm:col-span-2" label="Delivered qty" hint="only if part of it went">
          <input value={f.deliveredQty} onChange={(e) => set("deliveredQty", e.target.value)}
            inputMode="decimal" className={cn(inputCls, "tabular text-right")} />
        </Cell>
        <Cell className="sm:col-span-4" label="Delivery / invoice" hint="what it went out on">
          {/* ⚠️ Saved on the spot, like the shipment. And it copies NOTHING:
              the delivery date, the invoice number and what was billed stay on
              the document — one invoice covers many lines, which is why it is a
              record of its own (Stage 5). */}
          <FluidSelect
            value={invoiceId === null ? "" : String(invoiceId)}
            options={[{ value: "", label: "Not despatched yet" },
              ...despatches.map((d) => ({ value: String(d.id), label: d.label }))]}
            onSelect={(v) => {
              const next = v === "" ? null : Number(v);
              setInvoiceId(next);
              void setLineInvoiceAction(line.id, next);
            }}
            buttonClassName="h-8 w-full justify-between"
            className="w-full"
          />
        </Cell>
        <Cell className="sm:col-span-2" label="Cost centre">
          <Combobox options={suggest.costCentres} defaultValue={f.costCentre} placeholder=""
            onInput={(v) => set("costCentre", v)} onCommit={(v) => set("costCentre", v)} className={inputCls} />
        </Cell>
        <Cell className="sm:col-span-4" label="Shipment" hint="its ETA and duty come from there">
          {/* ⚠️ Saved on the spot rather than with the rest of the form: putting
              a line on a shipment is one decision, and it must not wait behind
              a form somebody may abandon. */}
          <FluidSelect
            value={shipmentId === null ? "" : String(shipmentId)}
            options={[{ value: "", label: "Not on a shipment" },
              ...shipments.map((s) => ({ value: String(s.id), label: s.blNo }))]}
            onSelect={(v) => {
              const next = v === "" ? null : Number(v);
              setShipmentId(next);
              void setLineShipmentAction(line.id, next);
            }}
            buttonClassName="h-8 w-full justify-between"
            className="w-full"
          />
        </Cell>
        <Cell className="sm:col-span-12" label="Remarks">
          <input value={f.remarks} onChange={(e) => set("remarks", e.target.value)}
            placeholder="anything worth remembering about this line" className={inputCls} />
        </Cell>
      </Section>

      {/* the sale half is already on the strip, so it folds away here */}
      <button type="button" onClick={() => setOpenSale((v) => !v)}
        className="inline-flex items-center gap-1 text-[12px] text-fg-muted hover:text-fg">
        <ChevronDown size={13} className={cn("transition-transform", openSale && "rotate-180")} />
        {openSale ? "Hide" : "Correct"} the sale side — PO, client, quantity, price, dates
      </button>

      {openSale && (
        <Section title="The sale">
          <Cell className="sm:col-span-2" label="PO number">
            <input value={f.poNo} onChange={(e) => set("poNo", e.target.value)} className={cn(inputCls, "font-mono")} />
          </Cell>
          <Cell className="sm:col-span-3" label="Client">
            <Combobox options={suggest.clients} defaultValue={f.client} placeholder=""
              onInput={(v) => set("client", v)} onCommit={(v) => set("client", v)} className={inputCls} />
          </Cell>
          <Cell className="sm:col-span-4" label="Item">
            <input value={f.description} onChange={(e) => set("description", e.target.value)} className={inputCls} />
          </Cell>
          <Cell className="sm:col-span-1" label="Qty">
            <input value={f.qty} onChange={(e) => set("qty", e.target.value)}
              inputMode="decimal" className={cn(inputCls, "tabular text-right")} />
          </Cell>
          <Cell className="sm:col-span-2" label="Unit price">
            <MoneyInput value={f.saleUnitPrice} onChange={(v) => set("saleUnitPrice", v)} />
          </Cell>
          <Cell className="sm:col-span-2" label="Currency">
            <div className="flex gap-1">
              {["TZS", "USD"].map((c) => (
                <button key={c} type="button"
                  onClick={() => set("saleCurrency", f.saleCurrency === c ? "" : c)}
                  className={cn("h-8 flex-1 rounded-md border text-[11px]",
                    f.saleCurrency === c ? "border-accent bg-accent-soft text-accent" : "border-border bg-bg text-fg-muted")}>
                  {c}
                </button>
              ))}
            </div>
          </Cell>
          <Cell className="sm:col-span-2" label="Exchange rate" hint="frozen on this line">
            <input value={f.exRate} onChange={(e) => set("exRate", e.target.value)}
              inputMode="decimal" className={cn(inputCls, "tabular text-right")} />
          </Cell>
          <Cell className="sm:col-span-2" label="PO received">
            <input type="date" value={f.receivedDate} onChange={(e) => set("receivedDate", e.target.value)} className={inputCls} />
          </Cell>
          <Cell className="sm:col-span-2" label="Due">
            <input type="date" value={f.dueDate} onChange={(e) => set("dueDate", e.target.value)} className={inputCls} />
          </Cell>
          <Cell className="sm:col-span-1" label="Unit">
            <input value={f.uom} onChange={(e) => set("uom", e.target.value)} className={inputCls} />
          </Cell>
        </Section>
      )}

      <div className="flex items-center gap-2">
        <button type="button" onClick={submit} disabled={pending}
          className="inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-accent-fg disabled:opacity-60">
          {pending ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} Save
        </button>
        <button type="button" onClick={onCancel}
          className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs text-fg-muted hover:text-fg">
          <X size={13} /> Cancel
        </button>
        <span className="text-[11px] text-fg-subtle">
          Every change is recorded — what it was, what it became, and who changed it.
        </span>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 text-[11px] font-medium text-fg-muted">{title}</p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-12">{children}</div>
    </div>
  );
}

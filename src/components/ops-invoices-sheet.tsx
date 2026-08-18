"use client";

// ─────────────────────────────────────────────────────────────────────────────
// DELIVERY & BILLING — what went out, what was billed, what is still owed.
//
// This replaces the Deliveries sheet, which was abandoned about nine months ago
// (579 rows, nothing after November 2025) while POS STATUS carried on. It was
// abandoned because it repeats itself: 197 POs across those rows, the reference
// and the value copied down every line of a group, and no way to record a
// part-delivery at all.
//
// ⚠️ ONE DOCUMENT, MANY LINES. Typed once here; the order lines point at it.
//
// ⚠️ NOTHING IS FILLED IN. A delivery note with a date and no invoice is a real
// record and saves — that is the whole point of splitting the sheet's single
// "INV/DEL DATE" column in two.
//
// ⚠️ This screen owns its list (see project-budget-sheet.tsx for why).
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useUrlFilters } from "@/lib/use-url-filters";
import { Loader2, Check, X, Pencil, Archive, Truck } from "lucide-react";
import { cn } from "@/lib/cn";
import { RecordList } from "./record-list";
// The same saved-view bar Projects, Assets, Documents and Commitments use —
// a saved view is just a query string, which is why every filter on this
// screen goes through `useUrlFilters` (CLAUDE.md, the forward rule).
import { SavedViewsBar, type SavedView } from "./saved-views-bar";
import { Combobox } from "./combobox";
import { MoneyInput } from "./money-input";
import { lineView, money, fmtDate, type OrderLine } from "@/lib/ops-orders-shared";
import {
  invoiceView, invoiceTotals, poBalances, balanceTotals,
  type Invoice, type InvoiceView,
} from "@/lib/ops-invoices-shared";
import { PoBalances } from "./ops-po-balances";
import {
  createInvoiceAction, updateInvoiceAction, archiveInvoiceAction,
} from "@/app/ops/invoice-actions";
// ⚠️ Every dropdown that maps to a Setup list can ADD to it from inside the
// menu — ERPNext's "+ Create a new Item". The owner asked for this twice:
// "do not build a dropdown that dead-ends into a setup screen".
import { createOpsRefAction } from "@/app/ops/actions";

type Suggest = {
  clients: string[];
  statuses: string[];
  pendingWith: string[];
};

export function OpsInvoicesSheet({
  companyId, savedViews = [], invoices: serverRows, lines, suggest, defaultExRate,
}: {
  companyId: number;
  /** Views the owner has saved for this list. */
  savedViews?: SavedView[];
  invoices: Invoice[];
  /** The order lines, so a document can be valued from what is ON it rather
   *  than from a figure copied onto every row. */
  lines: OrderLine[];
  suggest: Suggest;
  defaultExRate: number;
}) {
  const router = useRouter();
  const [rows, setRows] = useState(serverRows);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<number | null>(null);
  const [pending, start] = useTransition();
  const { values: view, hrefFor, query, dirty } = useUrlFilters(
    { state: "all", sort: "delivered", dir: "desc", co: "" },
  );

  const seededFor = useRef(companyId);
  useEffect(() => {
    if (seededFor.current !== companyId) { seededFor.current = companyId; setRows(serverRows); }
  }, [companyId, serverRows]);

  const byId = useMemo(() => new Map(rows.map((r) => [r.id, r])), [rows]);

  // Every line, with the document it went out on — the one lookup everything
  // else on this screen is built from.
  const lineViews = useMemo(
    () => lines.map((l) => lineView(l, undefined, l.invoiceId === null ? null : byId.get(l.invoiceId) ?? null)),
    [lines, byId]);

  const linesOf = useMemo(() => {
    const m = new Map<number, typeof lineViews>();
    for (const v of lineViews) {
      const id = v.line.invoiceId;
      if (id === null) continue;
      const b = m.get(id);
      if (b) b.push(v); else m.set(id, [v]);
    }
    return m;
  }, [lineViews]);

  const views = useMemo(
    () => rows.map((r) => invoiceView(r, linesOf.get(r.id) ?? [])), [rows, linesOf]);
  const viewById = useMemo(() => new Map(views.map((v) => [v.invoice.id, v])), [views]);

  const balances = useMemo(
    () => poBalances(lineViews, (v) =>
      v.line.invoiceId === null ? null : viewById.get(v.line.invoiceId) ?? null),
    [lineViews, viewById]);
  const balTotals = useMemo(() => balanceTotals(balances), [balances]);

  const counts = useMemo(() => ({
    all: views.length,
    awaiting: views.filter((v) => v.delivered && !v.billed).length,
    billed: views.filter((v) => v.billed).length,
    empty: views.filter((v) => v.lineCount === 0).length,
    odd: views.filter((v) => v.difference !== null).length,
  }), [views]);

  const shown = useMemo(() => {
    const picked =
      view.state === "awaiting" ? views.filter((v) => v.delivered && !v.billed)
      : view.state === "billed" ? views.filter((v) => v.billed)
      : view.state === "empty" ? views.filter((v) => v.lineCount === 0)
      : view.state === "odd" ? views.filter((v) => v.difference !== null)
      : views;
    const dir = view.dir === "asc" ? 1 : -1;
    // Nulls sink either way: a document with no date is not the most urgent.
    const val = (v: InvoiceView): string | number | null => {
      switch (view.sort) {
        case "invoice": return v.invoice.invoiceNo;
        case "value": return v.billedTzs;
        case "waiting": return v.unbilledDays;
        default: return v.invoice.deliveredDate ?? null;
      }
    };
    return [...picked].sort((a, b) => {
      const x = val(a), y = val(b);
      if (x === null && y === null) return 0;
      if (x === null) return 1;
      if (y === null) return -1;
      return (x < y ? -1 : x > y ? 1 : 0) * dir;
    });
  }, [views, view.state, view.sort, view.dir]);

  const totals = useMemo(() => invoiceTotals(views), [views]);
  const sortHref = (key: string) =>
    hrefFor({ sort: key, dir: view.sort === key && view.dir === "desc" ? "asc" : "desc" });
  const sortedAs = (key: string): "asc" | "desc" | undefined =>
    view.sort === key ? (view.dir === "asc" ? "asc" : "desc") : undefined;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-4">
        <Tile label="Gone out" value={String(totals.delivered)}
          sub={`${totals.documents} document${totals.documents === 1 ? "" : "s"}`} />
        <Tile label="Billed" value={money(totals.billedValue) ?? "—"}
          sub={`${totals.billed} invoice${totals.billed === 1 ? "" : "s"}`} />
        <Tile label="Out, not billed" value={money(totals.awaitingValue) ?? "—"}
          sub={totals.awaitingBilling > 0 ? `${totals.awaitingBilling} waiting` : "nothing waiting"}
          tone={totals.awaitingBilling > 0 ? "warn" : undefined} />
        <Tile label="Still to bill" value={money(balTotals.outstanding) ?? "—"}
          sub={balTotals.unknown > 0 ? `${balTotals.unknown} order${balTotals.unknown === 1 ? "" : "s"} not known` : "across all orders"}
          tone={balTotals.outstanding > 0 ? "warn" : undefined} />
      </div>

      <AddInvoice
        companyId={companyId} suggest={suggest}
        onSaved={(d) => { setError(null); setRows((p) => [d, ...p]); router.refresh(); }}
        onError={setError}
      />

      {error && (
        <p role="alert" className="rounded-md border border-danger/30 bg-danger-soft px-2.5 py-1.5 text-[12px] text-danger">
          {error}
        </p>
      )}

      <PoBalances rows={balances} totals={balTotals} companyId={companyId} />

      <SavedViewsBar
        initialViews={savedViews}
        currentQuery={query}
        hasFilters={dirty}
        basePath="/ops/invoices"
        listKey="ops-invoices"
      />

      <RecordList
        rows={shown}
        rowKey={(v) => v.invoice.id}
        exportName="Delivery and billing"
        listKey="ops-invoices"
        total={shown.length}
        search={{
          placeholder: "Search delivery note, invoice, client…",
          param: "iq",
          match: (v, q) =>
            [v.invoice.deliveryNoteNo, v.invoice.invoiceNo, v.invoice.client,
             v.invoice.status, v.invoice.pendingWith, v.invoice.notes]
              .some((x) => (x ?? "").toLowerCase().includes(q)),
        }}
        filters={[
          { key: "all", label: "Everything", count: counts.all, href: hrefFor({ state: "all" }), active: view.state === "all" },
          { key: "awaiting", label: "Out, not billed", count: counts.awaiting, href: hrefFor({ state: "awaiting" }), active: view.state === "awaiting", tone: "warn" },
          { key: "billed", label: "Billed", count: counts.billed, href: hrefFor({ state: "billed" }), active: view.state === "billed", tone: "success" },
          { key: "empty", label: "No lines on it", count: counts.empty, href: hrefFor({ state: "empty" }), active: view.state === "empty" },
          { key: "odd", label: "Value disagrees", count: counts.odd, href: hrefFor({ state: "odd" }), active: view.state === "odd", tone: "danger" },
        ]}
        empty={
          <div className="py-6 text-center">
            <p className="text-[13px] font-medium">Nothing has gone out yet</p>
            <p className="mt-1 text-[12px] text-fg-subtle">
              Add a delivery note when goods leave, then put its order lines on it. The invoice
              number goes on the same record when you bill for it.
            </p>
          </div>
        }
        columns={[
          {
            key: "delivered", label: "Went out", width: "minmax(0,1fr)",
            csv: (v) => [v.invoice.deliveryNoteNo, v.invoice.deliveredDate?.slice(0, 10), v.invoice.client].filter(Boolean).join(" — "),
            sortHref: sortHref("delivered"), sorted: sortedAs("delivered"),
            render: (v) => (
              <span className="min-w-0">
                <span className="block truncate text-[12px]">
                  <span className="font-mono">{v.invoice.deliveryNoteNo ?? v.invoice.invoiceNo}</span>
                  {v.lineCount > 0 ? (
                    <span className="ml-1.5 text-[11px] text-fg-subtle">
                      {v.lineCount} line{v.lineCount === 1 ? "" : "s"}
                    </span>
                  ) : (
                    <span className="ml-1.5 text-[11px] text-warn">no lines on it yet</span>
                  )}
                </span>
                <span className="block truncate text-[11px] text-fg-muted">
                  {[fmtDate(v.invoice.deliveredDate) ?? "not gone out", v.invoice.client]
                    .filter(Boolean).join(" · ")}
                </span>
              </span>
            ),
          },
          {
            key: "invoice", label: "Billed", width: "150px",
            csv: (v) => [v.invoice.invoiceNo, v.invoice.invoiceDate?.slice(0, 10)].filter(Boolean).join(" — ") || null,
            sortHref: sortHref("invoice"), sorted: sortedAs("invoice"),
            render: (v) => (
              <span className="min-w-0">
                <span className="block truncate text-[12px]">
                  {v.invoice.invoiceNo ?? <span className="text-fg-subtle">not billed</span>}
                </span>
                <span className={cn("block truncate text-[11px]",
                  v.billed ? "text-fg-subtle" : "text-warn")}>
                  {v.billed
                    ? fmtDate(v.invoice.invoiceDate) ?? "no date"
                    : v.unbilledDays !== null
                      ? `${v.unbilledDays} days since it went`
                      : v.waitingOn ?? "—"}
                </span>
              </span>
            ),
          },
          {
            key: "value", label: "Value", width: "150px", align: "right",
            csv: (v) => v.billedTzs,
            sortHref: sortHref("value"), sorted: sortedAs("value"),
            render: (v) => (
              <span className="min-w-0">
                <span className="tabular block truncate text-[12px]">
                  {/* Unknown stays a dash — an unvalued document is not a free one. */}
                  {v.billedTzs === null ? "—" : money(v.billedTzs)}
                </span>
                {v.difference !== null ? (
                  <span className="block truncate text-[11px] text-danger"
                    title={`Typed ${money(v.billedTzs)}, but the lines on it come to ${money(v.linesValueTzs)}.`}>
                    {v.difference > 0 ? "+" : ""}{money(v.difference)} vs its lines
                  </span>
                ) : (
                  <span className="block truncate text-[11px] text-fg-subtle">
                    {v.billedIsTyped ? "as typed" : v.lineCount > 0 ? "from its lines" : "—"}
                    {v.unpricedLines > 0 && ` · ${v.unpricedLines} unpriced`}
                  </span>
                )}
              </span>
            ),
            total: (onScreen) => (
              <span className="tabular">
                {money(onScreen.reduce((s, v) => s + (v.billedTzs ?? 0), 0))}
              </span>
            ),
          },
          {
            key: "waiting", label: "To bill", width: "90px", align: "right", hideBelow: "lg",
            csv: (v) => v.unbilledDays ?? v.daysToBill,
            sortHref: sortHref("waiting"), sorted: sortedAs("waiting"),
            render: (v) => (
              <span className="tabular text-[12px] text-fg-muted">
                {v.unbilledDays === null
                  ? v.daysToBill === null ? "—" : `${v.daysToBill}d`
                  : <span className="text-warn">{v.unbilledDays}d</span>}
              </span>
            ),
          },
        ]}
        rowActions={(v) => (
          <span className="flex items-center gap-1">
            <button type="button" title="Open this record"
              onClick={() => setEditing(editing === v.invoice.id ? null : v.invoice.id)}
              className="rounded p-1 text-fg-subtle hover:bg-bg-muted hover:text-fg">
              <Pencil size={13} />
            </button>
            <button type="button" title="Archive (never deleted)" disabled={pending}
              onClick={() => {
                const label = v.invoice.invoiceNo ?? v.invoice.deliveryNoteNo;
                if (!confirm(
                  `Archive ${label}?` +
                  (v.lineCount > 0
                    ? `\n\n${v.lineCount} order line${v.lineCount === 1 ? "" : "s"} will go back to "not despatched yet".`
                    : ""))) return;
                start(async () => {
                  const res = await archiveInvoiceAction(v.invoice.id, true);
                  if (!res.ok) { setError(res.error ?? "Couldn't archive."); return; }
                  setRows((p) => p.filter((r) => r.id !== v.invoice.id));
                  router.refresh();
                });
              }}
              className="rounded p-1 text-fg-subtle hover:bg-bg-muted hover:text-fg">
              <Archive size={13} />
            </button>
          </span>
        )}
        subRow={(v) =>
          editing === v.invoice.id ? (
            <div data-quick-update>
              <EditInvoice
                companyId={companyId}
                invoice={v.invoice} view={v} suggest={suggest} defaultExRate={defaultExRate}
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

function Tile({ label, value, sub, tone }: {
  label: string; value: string; sub?: string; tone?: "warn" | "danger";
}) {
  return (
    <div className="bg-bg-elev px-3 py-2">
      <p className="text-[11px] uppercase tracking-[0.04em] text-fg-subtle">{label}</p>
      <p className={cn("tabular mt-0.5 text-[15px]",
        tone === "warn" && "text-warn", tone === "danger" && "text-danger")}>{value}</p>
      {sub && <p className="text-[11px] text-fg-subtle">{sub}</p>}
    </div>
  );
}

const inputCls =
  "h-8 w-full rounded-md border border-border bg-bg px-2 text-[13px] outline-none placeholder:text-fg-subtle focus:border-accent";

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

/* ────────────────────────────────────────────────────── goods leave ──────── */

function AddInvoice({
  companyId, suggest, onSaved, onError,
}: {
  companyId: number; suggest: Suggest;
  onSaved: (d: Invoice) => void; onError: (e: string | null) => void;
}) {
  const [pending, start] = useTransition();
  const [deliveryNoteNo, setNote] = useState("");
  const [deliveredDate, setDelivered] = useState("");
  const [client, setClient] = useState("");
  const [invoiceNo, setInvoiceNo] = useState("");
  const [invoiceDate, setInvoiceDate] = useState("");
  const [comboKey, setComboKey] = useState(0);
  const noteRef = useRef<HTMLInputElement | null>(null);

  const save = () => {
    onError(null);
    if (!deliveryNoteNo.trim() && !invoiceNo.trim()) {
      onError("Give it a delivery note number or an invoice number — otherwise it cannot be found again.");
      return;
    }
    start(async () => {
      const res = await createInvoiceAction({
        companyId, deliveryNoteNo, deliveredDate, client, invoiceNo, invoiceDate,
      });
      if (!res.ok) { onError(res.error ?? "Couldn't save."); return; }
      onSaved({
        id: res.id ?? -Date.now(), companyId,
        deliveryNoteNo: deliveryNoteNo.trim() || null, deliveredDate: deliveredDate || null,
        invoiceNo: invoiceNo.trim() || null, invoiceDate: invoiceDate || null,
        invoiceValue: null, invoiceCurrency: null, exRate: null,
        client: client || null, status: null, pendingWith: null, notes: null, archived: false,
      });
      // ⚠️ The client and the date STAY — a day's deliveries are usually the
      // same client on the same day. The references do not.
      setNote(""); setInvoiceNo(""); setInvoiceDate("");
      setComboKey((k) => k + 1);
      noteRef.current?.focus();
    });
  };

  return (
    <div className="rounded-lg border border-border bg-bg-elev p-3">
      <h3 className="mb-2 flex items-center gap-1.5 text-[12px] font-medium">
        <Truck size={13} className="text-fg-subtle" /> Something has gone out
      </h3>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-12"
        onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); save(); } }}>
        <Cell className="sm:col-span-3" label="Delivery note" hint="what went with the goods">
          <input ref={noteRef} value={deliveryNoteNo} onChange={(e) => setNote(e.target.value)}
            placeholder="006/24/18" className={inputCls} />
        </Cell>
        <Cell className="sm:col-span-2" label="Delivered on" hint="stays">
          <input type="date" value={deliveredDate} onChange={(e) => setDelivered(e.target.value)} className={inputCls} />
        </Cell>
        <Cell className="sm:col-span-3" label="Client" hint="stays">
          <Combobox key={`c${comboKey}`} options={suggest.clients}
              onCreate={(v) => createOpsRefAction(companyId, "client", v)} createNoun="client" defaultValue={client}
            placeholder="" onInput={setClient} onCommit={setClient} className={inputCls} />
        </Cell>
        <Cell className="sm:col-span-2" label="Invoice no." hint="if billed already">
          <input value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)}
            placeholder="SS/25/80" className={inputCls} />
        </Cell>
        <Cell className="sm:col-span-2" label="Invoiced on">
          <input type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} className={inputCls} />
        </Cell>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <button type="button" onClick={save} disabled={pending}
          className="inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-accent-fg disabled:opacity-60">
          {pending ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} Record it
        </button>
        <span className="text-[11px] text-fg-subtle">
          The invoice can wait — put its order lines on it from the Orders tab, and what it is
          worth follows from them.
        </span>
      </div>
    </div>
  );
}

/* ───────────────────────────────────────────────────── and then billed ──── */

function EditInvoice({
  companyId, invoice, view, suggest, defaultExRate, onDone, onCancel, onError,
}: {
  companyId: number; invoice: Invoice; view: InvoiceView; suggest: Suggest; defaultExRate: number;
  onDone: (d: Invoice) => void; onCancel: () => void; onError: (e: string | null) => void;
}) {
  const [pending, start] = useTransition();
  const [f, setF] = useState({
    deliveryNoteNo: invoice.deliveryNoteNo ?? "",
    deliveredDate: invoice.deliveredDate?.slice(0, 10) ?? "",
    invoiceNo: invoice.invoiceNo ?? "",
    invoiceDate: invoice.invoiceDate?.slice(0, 10) ?? "",
    invoiceValue: invoice.invoiceValue ?? "",
    invoiceCurrency: invoice.invoiceCurrency ?? "",
    exRate: invoice.exRate ?? "",
    client: invoice.client ?? "", status: invoice.status ?? "",
    pendingWith: invoice.pendingWith ?? "", notes: invoice.notes ?? "",
  });
  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));

  const needsRate = f.invoiceCurrency !== "" && f.invoiceCurrency !== "TZS" && String(f.exRate) === "";

  const submit = () =>
    start(async () => {
      onError(null);
      const res = await updateInvoiceAction(invoice.id, f);
      if (!res.ok) { onError(res.error ?? "Couldn't save."); return; }
      // ⚠️ Coerce FIRST. A Postgres `numeric` comes back from PostgREST as a JSON
      // NUMBER, not a string, even though the row type says `string | null` —
      // so the second time a valued row is opened, `v.trim` is not a function
      // and the whole panel dies in the error boundary. Same trap as
      // `money-input.tsx` documents.
      const clean = (v: string | number | null) => {
        const s = v === null || v === undefined ? "" : String(v);
        return s.trim() === "" ? null : s.replace(/[\s,]/g, "");
      };
      onDone({
        ...invoice,
        deliveryNoteNo: f.deliveryNoteNo.trim() || null, deliveredDate: f.deliveredDate || null,
        invoiceNo: f.invoiceNo.trim() || null, invoiceDate: f.invoiceDate || null,
        invoiceValue: clean(f.invoiceValue), invoiceCurrency: f.invoiceCurrency || null,
        exRate: clean(f.exRate),
        client: f.client || null, status: f.status || null,
        pendingWith: f.pendingWith || null, notes: f.notes || null,
      });
    });

  return (
    <div className="space-y-3 rounded-md border border-accent/30 bg-bg-subtle p-3"
      onKeyDown={(e) => { if (e.key === "Escape") onCancel(); }}>

      {view.waitingOn && (
        <p className="text-[11px] text-warn">
          {view.waitingOn}
          {view.unbilledDays !== null && ` — ${view.unbilledDays} days since it went out`}.
        </p>
      )}

      <div>
        <p className="mb-1.5 text-[11px] font-medium text-fg-muted">What went out</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-12">
          <Cell className="sm:col-span-3" label="Delivery note">
            <input value={f.deliveryNoteNo} onChange={(e) => set("deliveryNoteNo", e.target.value)} className={inputCls} />
          </Cell>
          <Cell className="sm:col-span-3" label="Delivered on">
            <input type="date" value={f.deliveredDate} onChange={(e) => set("deliveredDate", e.target.value)} className={inputCls} />
          </Cell>
          <Cell className="sm:col-span-3" label="Client">
            <Combobox options={suggest.clients}
              onCreate={(v) => createOpsRefAction(companyId, "client", v)} createNoun="client" defaultValue={f.client} placeholder=""
              onInput={(v) => set("client", v)} onCommit={(v) => set("client", v)} className={inputCls} />
          </Cell>
          <Cell className="sm:col-span-3" label="Status">
            <Combobox options={suggest.statuses}
              onCreate={(v) => createOpsRefAction(companyId, "delivery_status", v)} createNoun="status" defaultValue={f.status} placeholder=""
              onInput={(v) => set("status", v)} onCommit={(v) => set("status", v)} className={inputCls} />
          </Cell>
        </div>
      </div>

      <div>
        <p className="mb-1.5 text-[11px] font-medium text-fg-muted">
          What was billed — a separate date, because it usually is
        </p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-12">
          <Cell className="sm:col-span-2" label="Invoice no.">
            <input value={f.invoiceNo} onChange={(e) => set("invoiceNo", e.target.value)} className={inputCls} />
          </Cell>
          <Cell className="sm:col-span-2" label="Invoiced on">
            <input type="date" value={f.invoiceDate} onChange={(e) => set("invoiceDate", e.target.value)} className={inputCls} />
          </Cell>
          <Cell className="sm:col-span-3" label="Value" hint="blank = its lines">
            <MoneyInput value={f.invoiceValue} onChange={(v) => set("invoiceValue", v)} />
          </Cell>
          <Cell className="sm:col-span-2" label="Currency">
            <div className="flex gap-1">
              {["TZS", "USD"].map((c) => (
                <button key={c} type="button"
                  onClick={() => set("invoiceCurrency", f.invoiceCurrency === c ? "" : c)}
                  className={cn("h-8 flex-1 rounded-md border text-[11px]",
                    f.invoiceCurrency === c ? "border-accent bg-accent-soft text-accent" : "border-border bg-bg text-fg-muted")}>
                  {c}
                </button>
              ))}
            </div>
          </Cell>
          <Cell className="sm:col-span-3" label="Rate" hint="frozen here">
            <div className="flex gap-1">
              <input value={f.exRate} onChange={(e) => set("exRate", e.target.value)}
                inputMode="decimal" className={cn(inputCls, "tabular text-right")} />
              {needsRate && defaultExRate > 0 && (
                <button type="button" onClick={() => set("exRate", String(defaultExRate))}
                  title="Use the rate set up on the Setup tab"
                  className="h-8 shrink-0 rounded-md border border-border px-2 text-[11px] text-fg-muted hover:text-fg">
                  {defaultExRate.toLocaleString("en-GB")}
                </button>
              )}
            </div>
          </Cell>
        </div>
        {/* ⚠️ The gap between what was typed and what the lines come to is SHOWN.
            It is either a discount or a mistake, and both want a second look. */}
        <p className={cn("mt-1 text-[11px]", view.difference !== null ? "text-danger" : "text-fg-subtle")}>
          {view.lineCount === 0
            ? "No order lines on this yet — put them on it from the Orders tab, and it can value itself."
            : view.difference !== null
              ? `Typed ${money(view.billedTzs)}, but the ${view.lineCount} line${view.lineCount === 1 ? "" : "s"} on it come to ${money(view.linesValueTzs)} — a difference of ${money(view.difference)}.`
              : `${view.lineCount} line${view.lineCount === 1 ? "" : "s"} on it, worth ${money(view.linesValueTzs) ?? "an amount nobody has priced"}` +
                (view.unpricedLines > 0 ? ` · ${view.unpricedLines} not priced` : "") +
                (view.billedIsTyped ? " — the typed figure is what counts as billed." : ".")}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-12">
        <Cell className="sm:col-span-4" label="Pending with">
          <Combobox options={suggest.pendingWith} defaultValue={f.pendingWith} placeholder=""
            onInput={(v) => set("pendingWith", v)} onCommit={(v) => set("pendingWith", v)} className={inputCls} />
        </Cell>
        <Cell className="sm:col-span-8" label="Notes">
          <input value={f.notes} onChange={(e) => set("notes", e.target.value)} className={inputCls} />
        </Cell>
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
        <span className="text-[11px] text-fg-subtle">
          Every change is recorded — what it was, what it became, and who changed it.
        </span>
      </div>
    </div>
  );
}

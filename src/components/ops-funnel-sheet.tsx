"use client";

// ─────────────────────────────────────────────────────────────────────────────
// THE FUNNEL — enquiry → quote → order → invoice (Stage 4).
//
// This is the workbook's INFO - RFQ sheet: 2,639 rows, of which 1,859 got a
// quote, 336 became a PO and 268 were invoiced. One row travels the whole way.
//
// ⚠️ THE ORDER'S VALUE IS NOT TYPED HERE. The row names a PO number; the value,
// the date and the invoice are read from the order lines carrying that number.
// The sheet types the same figure on both sheets and they disagree — PO 24235
// is 98,491,475 here and 98,491,500 on POS STATUS.
//
// ⚠️ NOTHING IS FILLED IN. No date, no value, no outcome. An enquiry with a
// number and a client is a real enquiry and saves.
//
// ⚠️ This screen owns its list (see project-budget-sheet.tsx for why).
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useUrlFilters } from "@/lib/use-url-filters";
import { Loader2, Check, X, Pencil, Archive, MessageSquareQuote } from "lucide-react";
import { cn } from "@/lib/cn";
import { FieldCell } from "@/components/ui";
import { RecordList } from "./record-list";
// The same saved-view bar Projects, Assets, Documents and Commitments use —
// a saved view is just a query string, which is why every filter on this
// screen goes through `useUrlFilters` (CLAUDE.md, the forward rule).
import { SavedViewsBar, type SavedView } from "./saved-views-bar";
import { Combobox } from "./combobox";
import { MoneyInput } from "./money-input";
import { money, fmtDate, type OrderLine } from "@/lib/ops-orders-shared";
import {
  enquiryView, funnelCohorts, funnelTotals, linesByPo, rateText,
  OUTCOME_SUGGESTIONS, STAGE_LABEL,
  type Enquiry, type EnquiryView,
} from "@/lib/ops-funnel-shared";
import { FunnelCohorts } from "./ops-funnel-cohorts";
import {
  createEnquiryAction, updateEnquiryAction, archiveEnquiryAction,
} from "@/app/ops/funnel-actions";
// ⚠️ Every dropdown that maps to a Setup list can ADD to it from inside the
// menu — ERPNext's "+ Create a new Item". The owner asked for this twice:
// "do not build a dropdown that dead-ends into a setup screen".
import { createOpsRefAction } from "@/app/ops/actions";

type Suggest = {
  clients: string[];
  assignedTo: string[];
  descriptions: string[];
  outcomes: string[];
  poNumbers: string[];
};

export function OpsFunnelSheet({
  companyId, savedViews = [], enquiries: serverRows, lines, despatches = [], suggest, defaultExRate,
}: {
  companyId: number;
  /** Views the owner has saved for this list. */
  savedViews?: SavedView[];
  enquiries: Enquiry[];
  /** The order lines, so a won enquiry can be priced from them rather than
   *  from a second copy of the figure. */
  lines: OrderLine[];
  /** The delivery notes / invoices, so a won order can say whether it was
   *  billed. ⚠️ Since Stage 5 that fact is on the document, not the line. */
  despatches?: Array<{
    id: number; deliveredDate: string | null;
    invoiceNo: string | null; invoiceDate: string | null;
  }>;
  suggest: Suggest;
  defaultExRate: number;
}) {
  const router = useRouter();
  const [rows, setRows] = useState(serverRows);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<number | null>(null);
  const [pending, start] = useTransition();
  const { values: view, hrefFor, query, dirty } = useUrlFilters(
    { state: "all", sort: "rfq", dir: "desc", co: "" },
  );

  const seededFor = useRef(companyId);
  useEffect(() => {
    if (seededFor.current !== companyId) { seededFor.current = companyId; setRows(serverRows); }
  }, [companyId, serverRows]);

  const byPo = useMemo(() => linesByPo(lines), [lines]);
  const docById = useMemo(() => new Map(despatches.map((d) => [d.id, d])), [despatches]);
  const docOf = useMemo(
    () => (l: OrderLine) => (l.invoiceId === null ? null : docById.get(l.invoiceId) ?? null),
    [docById]);
  const views = useMemo(
    () => rows.map((e) => enquiryView(e, byPo, undefined, docOf)), [rows, byPo, docOf]);

  const counts = useMemo(() => ({
    all: views.length,
    open: views.filter((v) => v.open).length,
    unquoted: views.filter((v) => v.open && !v.quoted).length,
    won: views.filter((v) => v.ordered).length,
    lost: views.filter((v) => v.lost).length,
  }), [views]);

  const shown = useMemo(() => {
    const picked =
      view.state === "open" ? views.filter((v) => v.open)
      : view.state === "unquoted" ? views.filter((v) => v.open && !v.quoted)
      : view.state === "won" ? views.filter((v) => v.ordered)
      : view.state === "lost" ? views.filter((v) => v.lost)
      : views;
    const dir = view.dir === "asc" ? 1 : -1;
    // Nulls sink either way: an enquiry with no date is not the most urgent.
    const val = (v: EnquiryView): string | number | null => {
      switch (view.sort) {
        case "client": return v.enquiry.client;
        case "quote": return v.quoteValueTzs;
        case "order": return v.orderValueTzs;
        case "age": return v.ageDays;
        default: return v.enquiry.rfqDate ?? null;
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

  // ⚠️ The tiles and the month table read the WHOLE funnel, not the filtered
  // list. A conversion rate that changes when you click a filter is a rate
  // about the filter, not about the business.
  const totals = useMemo(() => funnelTotals(views), [views]);
  const cohorts = useMemo(() => funnelCohorts(views), [views]);

  const sortHref = (key: string) =>
    hrefFor({ sort: key, dir: view.sort === key && view.dir === "desc" ? "asc" : "desc" });
  const sortedAs = (key: string): "asc" | "desc" | undefined =>
    view.sort === key ? (view.dir === "asc" ? "asc" : "desc") : undefined;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-4">
        <Tile label="Enquiries" value={String(totals.enquiries)}
          sub={totals.open > 0 ? `${totals.open} still live` : "all settled"} />
        <Tile label="Quoted" value={String(totals.quoted)}
          sub={`${rateText(totals.quoteRate, totals.settled)} of enquiries`} />
        <Tile label="Won" value={String(totals.ordered)}
          sub={`${rateText(totals.orderRate, totals.settled)} of quotes`} />
        <Tile label="Order value" value={money(totals.orderValue) ?? "—"}
          sub={totals.unvalued > 0 ? `${totals.unvalued} with no value recorded` : "in shillings"}
          tone={totals.unvalued > 0 ? "warn" : undefined} />
      </div>

      <AddEnquiry
        companyId={companyId} suggest={suggest}
        onSaved={(e) => { setError(null); setRows((p) => [e, ...p]); router.refresh(); }}
        onError={setError}
      />

      {error && (
        <p role="alert" className="rounded-md border border-danger/30 bg-danger-soft px-2.5 py-1.5 text-sm text-danger">
          {error}
        </p>
      )}

      <FunnelCohorts cohorts={cohorts} />

      <SavedViewsBar
        initialViews={savedViews}
        currentQuery={query}
        hasFilters={dirty}
        basePath="/ops/funnel"
        listKey="ops-enquiries"
      />

      <RecordList
        rows={shown}
        rowKey={(v) => v.enquiry.id}
        exportName="Enquiries"
        listKey="ops-enquiries"
        total={shown.length}
        search={{
          placeholder: "Search RFQ, client, quotation, PO…",
          param: "fq",
          match: (v, q) =>
            [v.enquiry.rfqNo, v.enquiry.client, v.enquiry.description, v.enquiry.quotationNo,
             v.enquiry.poNo, v.enquiry.assignedTo, v.enquiry.outcome, v.enquiry.outcomeReason,
             v.enquiry.remarks]
              .some((x) => (x ?? "").toLowerCase().includes(q)),
        }}
        filters={[
          { key: "all", label: "All enquiries", count: counts.all, href: hrefFor({ state: "all" }), active: view.state === "all" },
          { key: "open", label: "Still live", count: counts.open, href: hrefFor({ state: "open" }), active: view.state === "open" },
          { key: "unquoted", label: "Not quoted yet", count: counts.unquoted, href: hrefFor({ state: "unquoted" }), active: view.state === "unquoted", tone: "warn" },
          { key: "won", label: "Won", count: counts.won, href: hrefFor({ state: "won" }), active: view.state === "won", tone: "success" },
          { key: "lost", label: "Closed, not won", count: counts.lost, href: hrefFor({ state: "lost" }), active: view.state === "lost" },
        ]}
        empty={
          <div className="py-6 text-center">
            <p className="text-base font-medium">No enquiries yet</p>
            <p className="mt-1 text-sm text-fg-subtle">
              Add one when a client asks for a price. Write the PO number on it when it is won,
              and the order&apos;s value follows from the order lines.
            </p>
          </div>
        }
        columns={[
          {
            key: "rfq", label: "RFQ / client", width: "minmax(0,1fr)",
            csv: (v) => `${v.enquiry.rfqNo} — ${v.enquiry.client ?? ""}`.trim(),
            sortHref: sortHref("rfq"), sorted: sortedAs("rfq"),
            render: (v) => (
              <span className="min-w-0">
                <span className="block truncate text-sm">
                  <span className="font-mono">{v.enquiry.rfqNo}</span>
                  {v.enquiry.client && <span className="ml-1.5 text-fg-muted">{v.enquiry.client}</span>}
                </span>
                <span className="block truncate text-xs text-fg-muted">
                  {[fmtDate(v.enquiry.rfqDate), v.enquiry.description, v.enquiry.assignedTo]
                    .filter(Boolean).join(" · ") || "—"}
                </span>
              </span>
            ),
          },
          {
            key: "quote", label: "Quoted", width: "140px", align: "right",
            csv: (v) => v.quoteValueTzs,
            sortHref: sortHref("quote"), sorted: sortedAs("quote"),
            render: (v) => (
              <span className="min-w-0">
                <span className="tabular block truncate text-sm">
                  {/* A quote with no figure stays a dash — it is not a quote for nothing. */}
                  {v.quoteValueTzs === null ? (v.quoted ? "no value" : "—") : money(v.quoteValueTzs)}
                </span>
                <span className="block truncate text-xs text-fg-subtle">
                  {v.enquiry.quotationNo ?? (v.quoted ? "quoted" : "not quoted")}
                </span>
              </span>
            ),
            total: (onScreen) => (
              <span className="tabular">
                {money(onScreen.reduce((s, v) => s + (v.quoteValueTzs ?? 0), 0))}
              </span>
            ),
          },
          {
            key: "order", label: "Order", width: "150px", align: "right",
            csv: (v) => v.orderValueTzs,
            sortHref: sortHref("order"), sorted: sortedAs("order"),
            render: (v) => (
              <span className="min-w-0">
                <span className="tabular block truncate text-sm">
                  {/* ⚠️ Read from the order lines, never typed here. */}
                  {v.orderValueTzs === null ? (v.ordered ? "not priced" : "—") : money(v.orderValueTzs)}
                </span>
                <span className={cn("block truncate text-xs",
                  v.ordered && v.orderLines === 0 ? "text-warn" : "text-fg-subtle")}>
                  {!v.ordered ? "—"
                    : v.orderLines === 0 ? `PO ${v.enquiry.poNo} — no lines yet`
                    : `PO ${v.enquiry.poNo} · ${v.orderLines} line${v.orderLines === 1 ? "" : "s"}` +
                      (v.unpricedLines > 0 ? ` · ${v.unpricedLines} unpriced` : "")}
                </span>
              </span>
            ),
            total: (onScreen) => (
              <span className="tabular">
                {money(onScreen.reduce((s, v) => s + (v.orderValueTzs ?? 0), 0))}
              </span>
            ),
          },
          {
            key: "age", label: "Waiting", width: "100px", align: "right", hideBelow: "lg",
            csv: (v) => v.ageDays,
            sortHref: sortHref("age"), sorted: sortedAs("age"),
            render: (v) => (
              <span className="tabular text-sm text-fg-muted">
                {v.ageDays === null ? "—" : `${v.ageDays}d`}
              </span>
            ),
          },
          {
            key: "stage", label: "Stage", width: "150px", hideBelow: "md",
            csv: (v) => (v.lost ? v.enquiry.outcome ?? "Closed" : STAGE_LABEL[v.stage]),
            render: (v) => (
              <span className="min-w-0">
                <span className={cn("block truncate text-sm",
                  v.invoiced ? "text-success" : v.ordered ? "text-accent"
                  : v.lost ? "text-fg-subtle" : "")}>
                  {v.lost ? (v.enquiry.outcome ?? "Closed") : STAGE_LABEL[v.stage]}
                </span>
                <span className="block truncate text-xs text-fg-subtle">
                  {v.waitingOn ?? v.enquiry.outcomeReason ?? "—"}
                </span>
              </span>
            ),
          },
        ]}
        rowActions={(v) => (
          <span className="flex items-center gap-1">
            <button type="button" title="Open this enquiry"
              onClick={() => setEditing(editing === v.enquiry.id ? null : v.enquiry.id)}
              className="rounded p-1 text-fg-subtle hover:bg-bg-muted hover:text-fg">
              <Pencil size={13} />
            </button>
            <button type="button" title="Archive (never deleted)" disabled={pending}
              onClick={() => {
                if (!confirm(`Archive enquiry ${v.enquiry.rfqNo}?`)) return;
                start(async () => {
                  const res = await archiveEnquiryAction(v.enquiry.id, true);
                  if (!res.ok) { setError(res.error ?? "Couldn't archive."); return; }
                  setRows((p) => p.filter((r) => r.id !== v.enquiry.id));
                  router.refresh();
                });
              }}
              className="rounded p-1 text-fg-subtle hover:bg-bg-muted hover:text-fg">
              <Archive size={13} />
            </button>
          </span>
        )}
        subRow={(v) =>
          editing === v.enquiry.id ? (
            <div data-quick-update>
              <EditEnquiry
                companyId={companyId}
                enquiry={v.enquiry} view={v} suggest={suggest} defaultExRate={defaultExRate}
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
      <p className="text-xs uppercase tracking-[0.04em] text-fg-subtle">{label}</p>
      <p className={cn("tabular mt-0.5 text-[15px]",
        tone === "warn" && "text-warn", tone === "danger" && "text-danger")}>{value}</p>
      {sub && <p className="text-xs text-fg-subtle">{sub}</p>}
    </div>
  );
}

const inputCls =
  "h-8 w-full rounded-md border border-border bg-bg px-2 text-base outline-none placeholder:text-fg-subtle focus:border-accent";


/* ──────────────────────────────────────────────────── an enquiry arrives ─── */

function AddEnquiry({
  companyId, suggest, onSaved, onError,
}: {
  companyId: number; suggest: Suggest;
  onSaved: (e: Enquiry) => void; onError: (e: string | null) => void;
}) {
  const [pending, start] = useTransition();
  const [rfqNo, setRfqNo] = useState("");
  const [rfqDate, setRfqDate] = useState("");
  const [client, setClient] = useState("");
  const [description, setDescription] = useState("");
  const [assignedTo, setAssignedTo] = useState("");
  const [comboKey, setComboKey] = useState(0);
  const rfqRef = useRef<HTMLInputElement | null>(null);

  const save = () => {
    onError(null);
    if (!rfqNo.trim()) { onError("Give the enquiry its RFQ number — it is how the client will refer to it."); return; }
    start(async () => {
      const res = await createEnquiryAction({
        companyId, rfqNo, rfqDate, client, description, assignedTo,
      });
      if (!res.ok) { onError(res.error ?? "Couldn't save."); return; }
      onSaved({
        id: res.id ?? -Date.now(), companyId, rfqNo: rfqNo.trim(),
        rfqDate: rfqDate || null, client: client || null, description: description || null,
        assignedTo: assignedTo || null, quotationNo: null, quotationDate: null,
        quoteCurrency: null, quoteValue: null, quoteExRate: null, poNo: null,
        outcome: null, outcomeReason: null, remarks: null, archived: false,
      });
      // ⚠️ The client, the date and whose it is STAY — a morning's enquiries
      // are nearly always the same client on the same day.
      setRfqNo(""); setDescription("");
      setComboKey((k) => k + 1);
      rfqRef.current?.focus();
    });
  };

  return (
    <div className="rounded-lg border border-border bg-bg-elev p-3">
      <h3 className="mb-2 flex items-center gap-1.5 text-sm font-medium">
        <MessageSquareQuote size={13} className="text-fg-subtle" /> A client has asked for a price
      </h3>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-12"
        onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); save(); } }}>
        <FieldCell className="sm:col-span-3" label="RFQ number">
          <input ref={rfqRef} value={rfqNo} onChange={(e) => setRfqNo(e.target.value)}
            placeholder="6000173251" className={inputCls} />
        </FieldCell>
        <FieldCell className="sm:col-span-2" label="Asked on">
          <input type="date" value={rfqDate} onChange={(e) => setRfqDate(e.target.value)} className={inputCls} />
        </FieldCell>
        <FieldCell className="sm:col-span-2" label="Client">
          <Combobox key={`c${comboKey}`} options={suggest.clients}
              onCreate={(v) => createOpsRefAction(companyId, "client", v)} createNoun="client" defaultValue={client}
            placeholder="" onInput={setClient} onCommit={setClient} className={inputCls} />
        </FieldCell>
        <FieldCell className="sm:col-span-3" label="What they asked for">
          <Combobox key={`d${comboKey}`} options={suggest.descriptions} defaultValue={description}
            placeholder="" onInput={setDescription} onCommit={setDescription} className={inputCls} />
        </FieldCell>
        <FieldCell className="sm:col-span-2" label="Assigned to">
          <Combobox key={`a${comboKey}`} options={suggest.assignedTo} defaultValue={assignedTo}
            placeholder="" onInput={setAssignedTo} onCommit={setAssignedTo} className={inputCls} />
        </FieldCell>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <button type="button" onClick={save} disabled={pending}
          className="inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-accent-fg disabled:opacity-60">
          {pending ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} Log the enquiry
        </button>
        <span className="text-xs text-fg-subtle">
          The date, client and owner carry to the next enquiry. The quote, the PO and the
          outcome are filled in on the row itself, later.
        </span>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────── what became of the enquiry ─── */

function EditEnquiry({
  companyId, enquiry, view, suggest, defaultExRate, onDone, onCancel, onError,
}: {
  companyId: number; enquiry: Enquiry; view: EnquiryView; suggest: Suggest; defaultExRate: number;
  onDone: (e: Enquiry) => void; onCancel: () => void; onError: (e: string | null) => void;
}) {
  const [pending, start] = useTransition();
  const [f, setF] = useState({
    rfqNo: enquiry.rfqNo, rfqDate: enquiry.rfqDate?.slice(0, 10) ?? "",
    client: enquiry.client ?? "", description: enquiry.description ?? "",
    assignedTo: enquiry.assignedTo ?? "",
    quotationNo: enquiry.quotationNo ?? "", quotationDate: enquiry.quotationDate?.slice(0, 10) ?? "",
    quoteCurrency: enquiry.quoteCurrency ?? "", quoteValue: enquiry.quoteValue ?? "",
    quoteExRate: enquiry.quoteExRate ?? "",
    poNo: enquiry.poNo ?? "",
    outcome: enquiry.outcome ?? "", outcomeReason: enquiry.outcomeReason ?? "",
    remarks: enquiry.remarks ?? "",
  });
  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));

  // The rate is OFFERED, never applied — the owner's decision 5. One press puts
  // it in; ignoring it leaves the box empty.
  const needsRate = f.quoteCurrency !== "" && f.quoteCurrency !== "TZS" && f.quoteExRate === "";

  const submit = () =>
    start(async () => {
      onError(null);
      const res = await updateEnquiryAction(enquiry.id, f);
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
        ...enquiry,
        rfqNo: f.rfqNo.trim(), rfqDate: f.rfqDate || null,
        client: f.client || null, description: f.description || null,
        assignedTo: f.assignedTo || null,
        quotationNo: f.quotationNo || null, quotationDate: f.quotationDate || null,
        quoteCurrency: f.quoteCurrency || null, quoteValue: clean(f.quoteValue),
        quoteExRate: clean(f.quoteExRate),
        poNo: f.poNo || null,
        outcome: f.outcome || null, outcomeReason: f.outcomeReason || null,
        remarks: f.remarks || null,
      });
    });

  return (
    <div className="space-y-3 rounded-md border border-accent/30 bg-bg-subtle p-3"
      onKeyDown={(e) => { if (e.key === "Escape") onCancel(); }}>

      {view.waitingOn && (
        <p className="text-xs text-warn">
          {view.waitingOn}
          {view.ageDays !== null && ` — ${view.ageDays} days since they asked`}.
        </p>
      )}

      <div>
        <p className="mb-1.5 text-xs font-medium text-fg-muted">The enquiry</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-12">
          <FieldCell className="sm:col-span-2" label="RFQ number">
            <input value={f.rfqNo} onChange={(e) => set("rfqNo", e.target.value)} className={inputCls} />
          </FieldCell>
          <FieldCell className="sm:col-span-2" label="Asked on">
            <input type="date" value={f.rfqDate} onChange={(e) => set("rfqDate", e.target.value)} className={inputCls} />
          </FieldCell>
          <FieldCell className="sm:col-span-2" label="Client">
            <Combobox options={suggest.clients}
              onCreate={(v) => createOpsRefAction(companyId, "client", v)} createNoun="client" defaultValue={f.client} placeholder=""
              onInput={(v) => set("client", v)} onCommit={(v) => set("client", v)} className={inputCls} />
          </FieldCell>
          <FieldCell className="sm:col-span-4" label="What they asked for">
            <Combobox options={suggest.descriptions} defaultValue={f.description} placeholder=""
              onInput={(v) => set("description", v)} onCommit={(v) => set("description", v)} className={inputCls} />
          </FieldCell>
          <FieldCell className="sm:col-span-2" label="Assigned to">
            <Combobox options={suggest.assignedTo} defaultValue={f.assignedTo} placeholder=""
              onInput={(v) => set("assignedTo", v)} onCommit={(v) => set("assignedTo", v)} className={inputCls} />
          </FieldCell>
        </div>
      </div>

      <div>
        <p className="mb-1.5 text-xs font-medium text-fg-muted">What we quoted</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-12">
          <FieldCell className="sm:col-span-2" label="Quotation no">
            <input value={f.quotationNo} onChange={(e) => set("quotationNo", e.target.value)}
              placeholder="PE-Q1466" className={inputCls} />
          </FieldCell>
          <FieldCell className="sm:col-span-2" label="Quoted on">
            <input type="date" value={f.quotationDate} onChange={(e) => set("quotationDate", e.target.value)} className={inputCls} />
          </FieldCell>
          <FieldCell className="sm:col-span-3" label="Value">
            <MoneyInput value={f.quoteValue} onChange={(v) => set("quoteValue", v)} />
          </FieldCell>
          <FieldCell className="sm:col-span-2" label="Currency" hint="blank = shillings">
            <div className="flex gap-1">
              {["TZS", "USD"].map((c) => (
                <button key={c} type="button"
                  onClick={() => set("quoteCurrency", f.quoteCurrency === c ? "" : c)}
                  className={cn("h-8 flex-1 rounded-md border text-xs",
                    f.quoteCurrency === c ? "border-accent bg-accent-soft text-accent" : "border-border bg-bg text-fg-muted")}>
                  {c}
                </button>
              ))}
            </div>
          </FieldCell>
          <FieldCell className="sm:col-span-3" label="Exchange rate" hint="frozen here">
            <div className="flex gap-1">
              <input value={f.quoteExRate} onChange={(e) => set("quoteExRate", e.target.value)}
                inputMode="decimal" className={cn(inputCls, "tabular text-right")} />
              {needsRate && defaultExRate > 0 && (
                <button type="button" onClick={() => set("quoteExRate", String(defaultExRate))}
                  title="Use the rate set up on the Setup tab"
                  className="h-8 shrink-0 rounded-md border border-border px-2 text-xs text-fg-muted hover:text-fg">
                  {defaultExRate.toLocaleString("en-GB")}
                </button>
              )}
            </div>
          </FieldCell>
        </div>
        {needsRate && (
          <p className="mt-1 text-xs text-warn">
            Priced in {f.quoteCurrency} with no rate — this quote will not be counted in the
            shilling totals until one is entered.
          </p>
        )}
      </div>

      <div>
        <p className="mb-1.5 text-xs font-medium text-fg-muted">What became of it</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-12">
          <FieldCell className="sm:col-span-3" label="PO number" hint="won — links to the order lines">
            <Combobox options={suggest.poNumbers} defaultValue={f.poNo} placeholder=""
              onInput={(v) => set("poNo", v)} onCommit={(v) => set("poNo", v)} className={inputCls} />
          </FieldCell>
          <FieldCell className="sm:col-span-3" label="Or closed as" hint="only if it died">
            <Combobox options={suggest.outcomes.length ? suggest.outcomes : OUTCOME_SUGGESTIONS}
              defaultValue={f.outcome} placeholder=""
              onInput={(v) => set("outcome", v)} onCommit={(v) => set("outcome", v)} className={inputCls} />
          </FieldCell>
          <FieldCell className="sm:col-span-3" label="Why">
            <input value={f.outcomeReason} onChange={(e) => set("outcomeReason", e.target.value)}
              placeholder="Client didn't come back" className={inputCls} />
          </FieldCell>
          <FieldCell className="sm:col-span-3" label="Remarks">
            <input value={f.remarks} onChange={(e) => set("remarks", e.target.value)} className={inputCls} />
          </FieldCell>
        </div>
        {/* ⚠️ The order's value is REPORTED here, never typed. It is the sum of
            the order lines carrying this PO number. */}
        <p className="mt-1 text-xs text-fg-subtle">
          {!view.ordered
            ? "No PO yet. Write the number here when the client places the order — its value comes from the order lines, so it is never typed twice."
            : view.orderLines === 0
              ? `No order line carries PO ${enquiry.poNo} yet, so this order's value is unknown. Add the lines on the Orders tab.`
              : `${view.orderLines} order line${view.orderLines === 1 ? "" : "s"} on PO ${enquiry.poNo}` +
                (view.orderValueTzs !== null ? `, worth ${money(view.orderValueTzs)}` : "") +
                (view.unpricedLines > 0 ? ` · ${view.unpricedLines} of them not priced` : "") +
                (view.daysToOrder !== null ? ` · won ${view.daysToOrder} days after they asked` : "")}
        </p>
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

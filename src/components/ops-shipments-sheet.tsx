"use client";

// ─────────────────────────────────────────────────────────────────────────────
// IMPORTS — a bill of lading and what customs does to it (Stage 3).
//
// This replaces the ASSESSMENTS, PENDING and clearance sheets at once, because
// they are three views of the same journey. One shipment is typed once here and
// the order lines point at it.
//
// ⚠️ NOTHING IS FILLED IN. No agent, no mode, no rate, no date. A charge nobody
// has entered stays blank — an unassessed shipment costs an UNKNOWN amount, not
// nothing, and the difference is what makes a total worth reading.
//
// ⚠️ This screen owns its list (see project-budget-sheet.tsx for why).
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useUrlFilters } from "@/lib/use-url-filters";
import { Loader2, Plus, Check, X, Pencil, Archive, Ship } from "lucide-react";
import { cn } from "@/lib/cn";
import { RecordList } from "./record-list";
import { Combobox } from "./combobox";
import { MoneyInput } from "./money-input";
import { money, fmtDate } from "@/lib/ops-orders-shared";
import {
  shipmentView, shipmentTotals, type Shipment, type ShipmentView,
} from "@/lib/ops-shipments-shared";
import {
  createShipmentAction, updateShipmentAction, archiveShipmentAction,
} from "@/app/ops/shipment-actions";

type Suggest = {
  suppliers: string[];
  origins: string[];
  agents: string[];
  modes: string[];
  statuses: string[];
  pendingWith: string[];
};

export function OpsShipmentsSheet({
  companyId, shipments: serverRows, lineCounts, suggest, defaultExRate,
}: {
  companyId: number;
  shipments: Shipment[];
  /** How many order lines travel on each — a shipment nobody has linked is a
   *  clue, not a mistake, so it is shown rather than hidden. */
  lineCounts: Record<number, number>;
  suggest: Suggest;
  defaultExRate: number;
}) {
  const router = useRouter();
  const [rows, setRows] = useState(serverRows);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<number | null>(null);
  const [pending, start] = useTransition();
  const { values: view, hrefFor } = useUrlFilters(
    { state: "all", sort: "eta", dir: "desc", co: "" },
  );

  const seededFor = useRef(companyId);
  useEffect(() => {
    if (seededFor.current !== companyId) { seededFor.current = companyId; setRows(serverRows); }
  }, [companyId, serverRows]);

  const views = useMemo(() => rows.map((s) => shipmentView(s)), [rows]);

  const counts = useMemo(() => ({
    all: views.length,
    port: views.filter((v) => !v.cleared).length,
    owing: views.filter((v) => (v.balance ?? 0) > 0.005).length,
    late: views.filter((v) => (v.overdueDays ?? 0) > 0).length,
    cleared: views.filter((v) => v.cleared).length,
  }), [views]);

  const shown = useMemo(() => {
    const picked =
      view.state === "port" ? views.filter((v) => !v.cleared)
      : view.state === "owing" ? views.filter((v) => (v.balance ?? 0) > 0.005)
      : view.state === "late" ? views.filter((v) => (v.overdueDays ?? 0) > 0)
      : view.state === "cleared" ? views.filter((v) => v.cleared)
      : views;
    const dir = view.dir === "asc" ? 1 : -1;
    // Nulls sink either way: a shipment with no ETA is not the most urgent.
    const val = (v: ShipmentView): string | number | null => {
      switch (view.sort) {
        case "bl": return v.shipment.blNo;
        case "cost": return v.costTotalTzs;
        case "owed": return v.balance;
        case "transit": return v.daysInTransit;
        default: return v.shipment.eta ?? null;
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

  const totals = useMemo(() => shipmentTotals(shown), [shown]);
  const sortHref = (key: string) =>
    hrefFor({ sort: key, dir: view.sort === key && view.dir === "desc" ? "asc" : "desc" });
  const sortedAs = (key: string): "asc" | "desc" | undefined =>
    view.sort === key ? (view.dir === "asc" ? "asc" : "desc") : undefined;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-4">
        <Tile label="Shipments" value={String(totals.shipments)} sub={`${totals.atPort} still moving`} />
        <Tile label="Duty & charges" value={money(totals.costed) ?? "—"}
          sub={totals.uncosted > 0 ? `${totals.uncosted} not assessed yet` : "assessed"} />
        <Tile label="Still to pay" value={money(totals.owed) ?? "—"}
          tone={totals.owed > 0 ? "warn" : undefined} sub="duty, VAT and agent" />
        <Tile label="Cleared" value={String(totals.cleared)} sub="goods received" />
      </div>

      <AddShipment
        companyId={companyId} suggest={suggest} defaultExRate={defaultExRate}
        onSaved={(s) => { setError(null); setRows((p) => [s, ...p]); router.refresh(); }}
        onError={setError}
      />

      {error && (
        <p role="alert" className="rounded-md border border-danger/30 bg-danger-soft px-2.5 py-1.5 text-[12px] text-danger">
          {error}
        </p>
      )}

      <RecordList
        rows={shown}
        rowKey={(v) => v.shipment.id}
        listKey="ops-shipments"
        total={shown.length}
        search={{
          placeholder: "Search BL, supplier, agent…",
          param: "sq",
          match: (v, q) =>
            [v.shipment.blNo, v.shipment.supplier, v.shipment.origin, v.shipment.clearingAgent,
             v.shipment.status, v.shipment.pendingWith, v.shipment.notes]
              .some((x) => (x ?? "").toLowerCase().includes(q)),
        }}
        filters={[
          { key: "all", label: "All shipments", count: counts.all, href: hrefFor({ state: "all" }), active: view.state === "all" },
          { key: "port", label: "Still moving", count: counts.port, href: hrefFor({ state: "port" }), active: view.state === "port" },
          { key: "late", label: "Past its ETA", count: counts.late, href: hrefFor({ state: "late" }), active: view.state === "late", tone: "danger" },
          { key: "owing", label: "Duty to pay", count: counts.owing, href: hrefFor({ state: "owing" }), active: view.state === "owing", tone: "warn" },
          { key: "cleared", label: "Cleared", count: counts.cleared, href: hrefFor({ state: "cleared" }), active: view.state === "cleared", tone: "success" },
        ]}
        empty={
          <div className="py-6 text-center">
            <p className="text-[13px] font-medium">No shipments yet</p>
            <p className="mt-1 text-[12px] text-fg-subtle">
              Add one when a bill of lading arrives, then point its order lines at it.
            </p>
          </div>
        }
        columns={[
          {
            key: "bl", label: "BL / supplier", width: "minmax(0,1fr)",
            sortHref: sortHref("bl"), sorted: sortedAs("bl"),
            render: (v) => (
              <span className="min-w-0">
                <span className="block truncate text-[12px]">
                  <span className="font-mono">{v.shipment.blNo}</span>
                  {lineCounts[v.shipment.id] ? (
                    <span className="ml-1.5 text-[11px] text-fg-subtle">
                      {lineCounts[v.shipment.id]} line{lineCounts[v.shipment.id] === 1 ? "" : "s"}
                    </span>
                  ) : (
                    <span className="ml-1.5 text-[11px] text-warn">no lines on it yet</span>
                  )}
                </span>
                <span className="block truncate text-[11px] text-fg-muted">
                  {[v.shipment.supplier, v.shipment.origin, v.shipment.mode, v.shipment.clearingAgent]
                    .filter(Boolean).join(" · ") || "—"}
                </span>
              </span>
            ),
          },
          {
            key: "eta", label: "ETA", width: "130px", hideBelow: "md",
            sortHref: sortHref("eta"), sorted: sortedAs("eta"),
            render: (v) => (
              <span className="min-w-0">
                <span className="block truncate text-[12px]">{fmtDate(v.shipment.eta) ?? "—"}</span>
                <span className={cn("block truncate text-[11px]",
                  v.cleared ? "text-success" : (v.overdueDays ?? 0) > 0 ? "text-danger" : "text-fg-subtle")}>
                  {v.cleared
                    ? `cleared ${fmtDate(v.shipment.clearedDate) ?? ""}`
                    : v.overdueDays !== null && v.overdueDays > 0
                      ? `${v.overdueDays} days past ETA`
                      : v.heldUpBy ?? "on its way"}
                </span>
              </span>
            ),
          },
          {
            key: "transit", label: "In transit", width: "90px", align: "right", hideBelow: "lg",
            sortHref: sortHref("transit"), sorted: sortedAs("transit"),
            render: (v) => (
              <span className="tabular text-[12px] text-fg-muted">
                {v.daysInTransit === null ? "—" : `${v.daysInTransit}d`}
              </span>
            ),
          },
          {
            key: "cost", label: "Duty & charges", width: "130px", align: "right",
            sortHref: sortHref("cost"), sorted: sortedAs("cost"),
            render: (v) => (
              <span className="tabular text-[12px]"
                title={v.parts.map((p) => `${p.label} ${money(p.amount)}`).join(" · ") || undefined}>
                {/* Unknown stays a dash — an unassessed shipment is not free. */}
                {v.costTotal === null ? "—" : money(v.costTotalTzs ?? v.costTotal)}
              </span>
            ),
            total: (onScreen) => (
              <span className="tabular">
                {money(onScreen.reduce((s, v) => s + (v.costTotalTzs ?? 0), 0))}
              </span>
            ),
          },
          {
            key: "owed", label: "Still to pay", width: "120px", align: "right",
            sortHref: sortHref("owed"), sorted: sortedAs("owed"),
            render: (v) => (
              <span className={cn("tabular text-[12px]",
                (v.balance ?? 0) > 0.005 ? "text-warn" : "text-fg-muted")}>
                {v.balance === null ? "not known" : v.balance <= 0.005 ? "paid" : money(v.balance)}
              </span>
            ),
          },
        ]}
        rowActions={(v) => (
          <span className="flex items-center gap-1">
            <button type="button" title="Open this shipment"
              onClick={() => setEditing(editing === v.shipment.id ? null : v.shipment.id)}
              className="rounded p-1 text-fg-subtle hover:bg-bg-muted hover:text-fg">
              <Pencil size={13} />
            </button>
            <button type="button" title="Archive (never deleted)" disabled={pending}
              onClick={() => {
                if (!confirm(`Archive ${v.shipment.blNo}?`)) return;
                start(async () => {
                  const res = await archiveShipmentAction(v.shipment.id, true);
                  if (!res.ok) { setError(res.error ?? "Couldn't archive."); return; }
                  setRows((p) => p.filter((r) => r.id !== v.shipment.id));
                  router.refresh();
                });
              }}
              className="rounded p-1 text-fg-subtle hover:bg-bg-muted hover:text-fg">
              <Archive size={13} />
            </button>
          </span>
        )}
        subRow={(v) =>
          editing === v.shipment.id ? (
            <div data-quick-update>
              <EditShipment
                shipment={v.shipment} view={v} suggest={suggest}
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

/* ─────────────────────────────────────────────────────── add a shipment ──── */

function AddShipment({
  companyId, suggest, defaultExRate, onSaved, onError,
}: {
  companyId: number; suggest: Suggest; defaultExRate: number;
  onSaved: (s: Shipment) => void; onError: (e: string | null) => void;
}) {
  const [pending, start] = useTransition();
  const [blNo, setBlNo] = useState("");
  const [supplier, setSupplier] = useState("");
  const [origin, setOrigin] = useState("");
  const [mode, setMode] = useState("");
  const [blDate, setBlDate] = useState("");
  const [eta, setEta] = useState("");
  const [agent, setAgent] = useState("");
  const [comboKey, setComboKey] = useState(0);
  const blRef = useRef<HTMLInputElement | null>(null);

  const save = () => {
    onError(null);
    if (!blNo.trim()) { onError("Give the shipment its BL or airway bill number."); return; }
    start(async () => {
      const res = await createShipmentAction({
        companyId, blNo, supplier, origin, mode, blDate, eta, clearingAgent: agent,
      });
      if (!res.ok) { onError(res.error ?? "Couldn't save."); return; }
      onSaved({
        id: res.id ?? -Date.now(), companyId, blNo: blNo.trim(),
        blDate: blDate || null, supplier: supplier || null, origin: origin || null,
        mode: mode || null, clearingAgent: agent || null, doxLodged: null,
        eta: eta || null, berthDate: null, clearedDate: null, assessmentDate: null,
        dutyAmount: null, vatAmount: null, wharfage: null, agencyFees: null,
        otherCosts: null, freightAmount: null, costCurrency: null, exRate: null,
        amountPaid: null, paidDate: null, status: null, pendingWith: null, notes: null,
        archived: false,
      });
      setBlNo(""); setBlDate(""); setEta(""); setComboKey((k) => k + 1);
      blRef.current?.focus();
    });
  };

  return (
    <div className="rounded-lg border border-border bg-bg-elev p-3">
      <h3 className="mb-2 flex items-center gap-1.5 text-[12px] font-medium">
        <Ship size={13} className="text-fg-subtle" /> Add a shipment
      </h3>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-12"
        onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); save(); } }}>
        <Cell className="sm:col-span-3" label="BL / airway bill">
          <input ref={blRef} value={blNo} onChange={(e) => setBlNo(e.target.value)}
            placeholder="MEDUG9676552" className={cn(inputCls, "font-mono")} />
        </Cell>
        <Cell className="sm:col-span-3" label="Supplier" hint="stays">
          <Combobox key={`s${comboKey}`} options={suggest.suppliers} defaultValue={supplier}
            placeholder="" onInput={setSupplier} onCommit={setSupplier} className={inputCls} />
        </Cell>
        <Cell className="sm:col-span-2" label="Origin" hint="stays">
          <Combobox key={`o${comboKey}`} options={suggest.origins} defaultValue={origin}
            placeholder="" onInput={setOrigin} onCommit={setOrigin} className={inputCls} />
        </Cell>
        <Cell className="sm:col-span-2" label="Mode" hint="stays">
          <Combobox key={`m${comboKey}`} options={suggest.modes} defaultValue={mode}
            placeholder="" onInput={setMode} onCommit={setMode} className={inputCls} />
        </Cell>
        <Cell className="sm:col-span-2" label="Agent" hint="stays">
          <Combobox key={`a${comboKey}`} options={suggest.agents} defaultValue={agent}
            placeholder="" onInput={setAgent} onCommit={setAgent} className={inputCls} />
        </Cell>
        <Cell className="sm:col-span-2" label="BL date">
          <input type="date" value={blDate} onChange={(e) => setBlDate(e.target.value)} className={inputCls} />
        </Cell>
        <Cell className="sm:col-span-2" label="ETA">
          <input type="date" value={eta} onChange={(e) => setEta(e.target.value)} className={inputCls} />
        </Cell>
      </div>
      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        <button type="button" onClick={save} disabled={pending}
          className="inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-accent-fg disabled:opacity-60">
          {pending ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />} Add shipment
        </button>
        <span className="text-[11px] text-fg-subtle">
          The customs side — documents, assessment, duty and what has been paid — is filled in
          on the shipment itself, as it happens.
        </span>
      </div>
    </div>
  );
}

/* ───────────────────────────────────────────────── the customs paperwork ─── */

function EditShipment({
  shipment, view, suggest, onDone, onCancel, onError,
}: {
  shipment: Shipment; view: ShipmentView; suggest: Suggest;
  onDone: (s: Shipment) => void; onCancel: () => void; onError: (e: string | null) => void;
}) {
  const [pending, start] = useTransition();
  const [f, setF] = useState({
    blNo: shipment.blNo, blDate: shipment.blDate?.slice(0, 10) ?? "",
    supplier: shipment.supplier ?? "", origin: shipment.origin ?? "", mode: shipment.mode ?? "",
    clearingAgent: shipment.clearingAgent ?? "", doxLodged: shipment.doxLodged?.slice(0, 10) ?? "",
    eta: shipment.eta?.slice(0, 10) ?? "", berthDate: shipment.berthDate?.slice(0, 10) ?? "",
    clearedDate: shipment.clearedDate?.slice(0, 10) ?? "",
    assessmentDate: shipment.assessmentDate?.slice(0, 10) ?? "",
    dutyAmount: shipment.dutyAmount ?? "", vatAmount: shipment.vatAmount ?? "",
    wharfage: shipment.wharfage ?? "", agencyFees: shipment.agencyFees ?? "",
    otherCosts: shipment.otherCosts ?? "", freightAmount: shipment.freightAmount ?? "",
    costCurrency: shipment.costCurrency ?? "", exRate: shipment.exRate ?? "",
    amountPaid: shipment.amountPaid ?? "", paidDate: shipment.paidDate?.slice(0, 10) ?? "",
    status: shipment.status ?? "", pendingWith: shipment.pendingWith ?? "",
    notes: shipment.notes ?? "",
  });
  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));

  const submit = () =>
    start(async () => {
      onError(null);
      const res = await updateShipmentAction(shipment.id, f);
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
        ...shipment,
        blNo: f.blNo.trim(), blDate: f.blDate || null,
        supplier: f.supplier || null, origin: f.origin || null, mode: f.mode || null,
        clearingAgent: f.clearingAgent || null, doxLodged: f.doxLodged || null,
        eta: f.eta || null, berthDate: f.berthDate || null, clearedDate: f.clearedDate || null,
        assessmentDate: f.assessmentDate || null,
        dutyAmount: clean(f.dutyAmount), vatAmount: clean(f.vatAmount),
        wharfage: clean(f.wharfage), agencyFees: clean(f.agencyFees),
        otherCosts: clean(f.otherCosts), freightAmount: clean(f.freightAmount),
        costCurrency: f.costCurrency || null, exRate: clean(f.exRate),
        amountPaid: clean(f.amountPaid), paidDate: f.paidDate || null,
        status: f.status || null, pendingWith: f.pendingWith || null, notes: f.notes || null,
      });
    });

  return (
    <div className="space-y-3 rounded-md border border-accent/30 bg-bg-subtle p-3"
      onKeyDown={(e) => { if (e.key === "Escape") onCancel(); }}>

      {view.heldUpBy && (
        <p className="text-[11px] text-warn">Held up: {view.heldUpBy}.</p>
      )}

      <div>
        <p className="mb-1.5 text-[11px] font-medium text-fg-muted">Getting it off the ship</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-12">
          <Cell className="sm:col-span-3" label="Clearing agent">
            <Combobox options={suggest.agents} defaultValue={f.clearingAgent} placeholder=""
              onInput={(v) => set("clearingAgent", v)} onCommit={(v) => set("clearingAgent", v)} className={inputCls} />
          </Cell>
          <Cell className="sm:col-span-2" label="Dox lodged">
            <input type="date" value={f.doxLodged} onChange={(e) => set("doxLodged", e.target.value)} className={inputCls} />
          </Cell>
          <Cell className="sm:col-span-2" label="ETA">
            <input type="date" value={f.eta} onChange={(e) => set("eta", e.target.value)} className={inputCls} />
          </Cell>
          <Cell className="sm:col-span-2" label="Berthed">
            <input type="date" value={f.berthDate} onChange={(e) => set("berthDate", e.target.value)} className={inputCls} />
          </Cell>
          <Cell className="sm:col-span-3" label="Cleared" hint="stops every countdown">
            <input type="date" value={f.clearedDate} onChange={(e) => set("clearedDate", e.target.value)} className={inputCls} />
          </Cell>
        </div>
      </div>

      <div>
        <p className="mb-1.5 text-[11px] font-medium text-fg-muted">
          What customs wants — each charge on its own
        </p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-12">
          <Cell className="sm:col-span-2" label="Assessed on">
            <input type="date" value={f.assessmentDate} onChange={(e) => set("assessmentDate", e.target.value)} className={inputCls} />
          </Cell>
          <Cell className="sm:col-span-2" label="Duty">
            <MoneyInput value={f.dutyAmount} onChange={(v) => set("dutyAmount", v)} />
          </Cell>
          <Cell className="sm:col-span-2" label="VAT">
            <MoneyInput value={f.vatAmount} onChange={(v) => set("vatAmount", v)} />
          </Cell>
          <Cell className="sm:col-span-2" label="Wharfage">
            <MoneyInput value={f.wharfage} onChange={(v) => set("wharfage", v)} />
          </Cell>
          <Cell className="sm:col-span-2" label="Agency fees">
            <MoneyInput value={f.agencyFees} onChange={(v) => set("agencyFees", v)} />
          </Cell>
          <Cell className="sm:col-span-2" label="Other C&F">
            <MoneyInput value={f.otherCosts} onChange={(v) => set("otherCosts", v)} />
          </Cell>
          <Cell className="sm:col-span-2" label="Freight">
            <MoneyInput value={f.freightAmount} onChange={(v) => set("freightAmount", v)} />
          </Cell>
          <Cell className="sm:col-span-2" label="Currency">
            <div className="flex gap-1">
              {["TZS", "USD"].map((c) => (
                <button key={c} type="button"
                  onClick={() => set("costCurrency", f.costCurrency === c ? "" : c)}
                  className={cn("h-8 flex-1 rounded-md border text-[11px]",
                    f.costCurrency === c ? "border-accent bg-accent-soft text-accent" : "border-border bg-bg text-fg-muted")}>
                  {c}
                </button>
              ))}
            </div>
          </Cell>
          <Cell className="sm:col-span-2" label="Rate" hint="frozen here">
            <input value={f.exRate} onChange={(e) => set("exRate", e.target.value)} inputMode="decimal"
              className={cn(inputCls, "tabular text-right")} />
          </Cell>
          <Cell className="sm:col-span-2" label="Paid">
            <MoneyInput value={f.amountPaid} onChange={(v) => set("amountPaid", v)} />
          </Cell>
          <Cell className="sm:col-span-2" label="Paid on">
            <input type="date" value={f.paidDate} onChange={(e) => set("paidDate", e.target.value)} className={inputCls} />
          </Cell>
        </div>
        <p className="mt-1 text-[11px] text-fg-subtle">
          {view.costTotal === null
            ? "Nothing assessed yet — the cost of this shipment is unknown, not nil."
            : `${view.parts.map((p) => `${p.label} ${money(p.amount)}`).join(" · ")} = ${money(view.costTotal)}`}
        </p>
      </div>

      <div>
        <p className="mb-1.5 text-[11px] font-medium text-fg-muted">Where it stands</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-12">
          <Cell className="sm:col-span-3" label="Status">
            <Combobox options={suggest.statuses} defaultValue={f.status} placeholder=""
              onInput={(v) => set("status", v)} onCommit={(v) => set("status", v)} className={inputCls} />
          </Cell>
          <Cell className="sm:col-span-3" label="Pending with">
            <Combobox options={suggest.pendingWith} defaultValue={f.pendingWith} placeholder=""
              onInput={(v) => set("pendingWith", v)} onCommit={(v) => set("pendingWith", v)} className={inputCls} />
          </Cell>
          <Cell className="sm:col-span-6" label="Notes">
            <input value={f.notes} onChange={(e) => set("notes", e.target.value)} className={inputCls} />
          </Cell>
        </div>
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

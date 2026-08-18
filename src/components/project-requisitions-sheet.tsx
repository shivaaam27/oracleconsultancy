"use client";

// ─────────────────────────────────────────────────────────────────────────────
// PROJECT REQUISITIONS — request → approve → receive (Phase 3).
//
// The workbook's three bands, kept as three deliberate acts rather than one
// form. Raising, approving and receiving belong to different people (SHAO, HQ,
// KELVIN) and the whole control depends on not merging them.
//
// ⚠️ THE LIST IS OWNED HERE, not re-fetched after every write — see the long
// note in project-budget-sheet.tsx for why `router.refresh()` alone loses rows
// under fast entry.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Check, X, PackageCheck, Ban, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/cn";
import { RecordList, type RecordFilter } from "./record-list";
import { Combobox } from "./combobox";
import { SetupNeeded } from "./setup-needed";
import { ChipPicker } from "./chip-picker";
import { createRefAction } from "@/app/projects/[id]/setup/actions";
import { MoneyInput } from "./money-input";
import { money } from "@/lib/project-budget-shared";
import { num, fmtDate } from "@/lib/projects-shared";
import {
  itemBalance, receivedCoverage, statusTone,
  REQUISITION_STATUSES, type Requisition,
} from "@/lib/project-requisitions-shared";
import {
  createRequisitionAction, approveRequisitionAction,
  receiveRequisitionAction, setRequisitionStatusAction,
} from "@/app/projects/[id]/requisitions/actions";

const TONE_CHIP: Record<string, string> = {
  danger: "bg-danger-soft text-danger",
  warn: "bg-warn-soft text-warn",
  success: "bg-success-soft text-success",
  info: "bg-accent-soft text-accent",
  muted: "bg-bg-muted text-fg-muted",
};

export type BudgetItem = { itemCode: string; category: string; amount: number };

export function ProjectRequisitionsSheet({
  projectId, requisitions: serverRows, budgetItems, routes, suppliers, currency,
}: {
  projectId: number;
  requisitions: Requisition[];
  /** Every budget line, so a request can only point at a real one. */
  budgetItems: BudgetItem[];
  /** From the project's Setup tab. Empty means the Setup tab is not done yet. */
  routes: string[];
  suppliers: string[];
  currency: string;
}) {
  const router = useRouter();
  const [rows, setRows] = useState<Requisition[]>(serverRows);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>("all");
  // Which row has its approve/receive panel open. See the note on `subRow` below.
  const [openRow, setOpenRow] = useState<number | null>(null);

  const seededFor = useRef(projectId);
  useEffect(() => {
    if (seededFor.current !== projectId) {
      seededFor.current = projectId;
      setRows(serverRows);
    }
  }, [projectId, serverRows]);

  const patch = (id: number, next: Partial<Requisition>) =>
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...next } : r)));

  const budgetByCode = useMemo(
    () => new Map(budgetItems.map((b) => [b.itemCode, b.amount])),
    [budgetItems],
  );

  const coverage = useMemo(() => receivedCoverage(rows), [rows]);
  const awaitingApproval = rows.filter((r) => r.status === "Requested").length;

  const shown = useMemo(
    () => (filter === "all" ? rows : rows.filter((r) => r.status === filter)),
    [rows, filter],
  );

  const rail: RecordFilter[] = [
    { key: "all", label: "All requests", group: "Status", count: rows.length,
      href: "#", active: filter === "all" },
    ...REQUISITION_STATUSES.map((s) => ({
      key: s, label: s, group: "Status",
      count: rows.filter((r) => r.status === s).length,
      href: "#", active: filter === s,
      tone: s === "Requested" ? ("warn" as const) : undefined,
    })),
  ].map((f) => ({ ...f, href: "#" }));

  return (
    <div className="space-y-4">
      <Coverage coverage={coverage} awaitingApproval={awaitingApproval} />

      <SetupNeeded projectId={projectId} missing={[
        ...(routes.length ? [] : ["Who pays"]),
        ...(suppliers.length ? [] : ["Suppliers"]),
      ]} />

      <RaiseRequest
        projectId={projectId}
        budgetItems={budgetItems}
        routes={routes}
        suppliers={suppliers}
        currency={currency}
        rows={rows}
        onSaved={(r) => { setError(null); setRows((prev) => [r, ...prev]); router.refresh(); }}
        onError={setError}
      />

      {error && (
        <p role="alert" className="rounded-md border border-danger/30 bg-danger-soft px-2.5 py-1.5 text-[12px] text-danger">
          {error}
        </p>
      )}

      {/* The rail filters in memory rather than through the URL: this list lives
          inside a record tab that already owns its rows, so a URL filter would
          trigger the refetch the component deliberately avoids. */}
      <div className="flex flex-wrap gap-1.5">
        {rail.map((f) => (
          <button
            key={f.key} type="button" onClick={() => setFilter(f.key)}
            className={cn(
              "inline-flex h-7 items-center gap-1.5 rounded-md border px-2 text-[12px]",
              f.active ? "border-accent/40 bg-accent-soft font-medium text-accent"
                       : "border-border bg-bg-elev text-fg-muted",
            )}
          >
            {f.label}
            <span className={cn("tabular text-[11px]", f.active ? "text-accent" : "text-fg-subtle")}>{f.count}</span>
          </button>
        ))}
      </div>

      <p className="text-[11px] text-fg-subtle">Click a request to approve it or record its delivery.</p>

      <RecordList
        rows={shown}
        rowKey={(r) => r.id}
        listKey="project-requisitions"
        total={rows.length}
        shown={shown.length}
        empty={
          <div className="py-6 text-center">
            <p className="text-[13px] font-medium">No requests yet</p>
            <p className="mt-1 text-[12px] text-fg-subtle">
              Raise one above. You can only request against an item that is on the budget.
            </p>
          </div>
        }
        columns={[
          {
            key: "itemCode", label: "Item", width: "minmax(0,1fr)",
            render: (r) => (
              <span className="min-w-0">
                <span className="block truncate font-mono text-[12px]">{r.itemCode}</span>
                <span className="block truncate text-[11px] text-fg-muted">
                  {[r.batchNo, r.supplier, r.route].filter(Boolean).join(" · ") || "—"}
                </span>
              </span>
            ),
          },
          {
            key: "requested", label: "Requested", width: "110px", align: "right",
            render: (r) => <span className="tabular text-[12px]">{money(num(r.amountRequested)) ?? "—"}</span>,
          },
          {
            key: "approved", label: "Approved", width: "110px", align: "right",
            render: (r) => (
              <span className={cn("tabular text-[12px]", r.amountApproved === null && "text-fg-subtle")}>
                {r.amountApproved === null ? "not yet" : money(num(r.amountApproved))}
              </span>
            ),
          },
          {
            key: "received", label: "Received", width: "110px", align: "right", hideBelow: "md",
            render: (r) => (
              <span className={cn("tabular text-[12px]", r.amountReceived === null && "text-fg-subtle")}>
                {r.amountReceived === null ? "—" : money(num(r.amountReceived))}
              </span>
            ),
          },
          {
            key: "status", label: "Status", width: "104px",
            render: (r) => (
              <span className={cn("inline-flex items-center rounded-sm px-1.5 py-0.5 text-[11px] font-medium", TONE_CHIP[statusTone(r.status)])}>
                {r.status}
              </span>
            ),
          },
        ]}
        onRowClick={(r) => setOpenRow((cur) => (cur === r.id ? null : r.id))}
        /* ⚠️ `data-quick-update` is REQUIRED here, not decoration. In Compact
           density — the admin default — globals.css hides `[data-subrow]` and
           only reveals it on :hover. Interactive controls behind a hover are
           unusable with a mouse and unreachable on a touch screen, and the
           approve/receive buttons were exactly that until this was added. The
           rule `[data-list-row]:has([data-quick-update]) [data-subrow]` is the
           sanctioned way to keep an open editor on screen. */
        subRow={(r) =>
          openRow === r.id ? (
            <div data-quick-update>
              <RowActions
                r={r} projectId={projectId} currency={currency}
                budget={budgetByCode.get(r.itemCode) ?? null}
                siblings={rows.filter((x) => x.itemCode === r.itemCode && x.id !== r.id)}
                onPatched={patch} onError={setError} onRefresh={() => router.refresh()}
              />
            </div>
          ) : null
        }
      />
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────── coverage ─── */

/**
 * How much of what was approved has actually been confirmed delivered.
 *
 * The workbook cannot show this, because its receiving columns pre-fill from the
 * request — there, everything always looks received. On the real Patamela data
 * the honest figure is about 5%.
 */
function Coverage({
  coverage, awaitingApproval,
}: {
  coverage: ReturnType<typeof receivedCoverage>;
  awaitingApproval: number;
}) {
  const pct = coverage.pct;
  const poor = pct !== null && pct < 0.5;
  return (
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-4">
      <Tile label="Approved" value={money(coverage.approved) ?? "0"} />
      <Tile label="Confirmed received" value={money(coverage.received) ?? "0"}
        sub={pct === null ? "nothing approved yet" : `${(pct * 100).toFixed(0)}% of approved`}
        tone={poor ? "danger" : undefined} />
      <Tile label="Awaiting delivery" value={money(coverage.awaiting) ?? "0"}
        sub="approved but never confirmed" tone={coverage.awaiting > 0 ? "warn" : undefined} />
      <Tile label="Waiting on approval" value={String(awaitingApproval)}
        sub={awaitingApproval ? "nobody has decided yet" : "none"} />
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

/* ────────────────────────────────────────────────────────── raise request ─── */

function RaiseRequest({
  projectId, budgetItems, routes, suppliers, currency, rows, onSaved, onError,
}: {
  projectId: number;
  budgetItems: BudgetItem[];
  routes: string[];
  suppliers: string[];
  currency: string;
  rows: Requisition[];
  onSaved: (r: Requisition) => void;
  onError: (e: string | null) => void;
}) {
  const [pending, start] = useTransition();
  const [itemCode, setItemCode] = useState("");
  const [batchNo, setBatchNo] = useState("");
  const [qty, setQty] = useState("");
  const [rate, setRate] = useState("");
  const [amount, setAmount] = useState("");
  const [route, setRoute] = useState("");
  const [supplier, setSupplier] = useState("");
  const [comboKey, setComboKey] = useState(0);

  // qty x rate, offered as the amount until the amount is typed over. The
  // workbook's column J is exactly this (`=H*I`).
  const computed = useMemo(() => {
    const q = num(qty.replace(/[\s,]/g, "")), r = num(rate.replace(/[\s,]/g, ""));
    return q !== null && r !== null ? q * r : null;
  }, [qty, rate]);
  const [amountTouched, setAmountTouched] = useState(false);
  const effectiveAmount = amountTouched || computed === null ? amount : String(computed);

  /** What is left on this item — the control the workbook puts in columns C/D. */
  const balance = useMemo(() => {
    const b = budgetItems.find((x) => x.itemCode === itemCode);
    if (!b) return null;
    return itemBalance(b.amount, rows.filter((r) => r.itemCode === itemCode));
  }, [itemCode, budgetItems, rows]);

  const asking = num(effectiveAmount.replace(/[\s,]/g, "")) ?? 0;
  const wouldOverspend = balance?.remaining !== null && balance?.remaining !== undefined && asking > balance.remaining;

  const save = () => {
    onError(null);
    if (!itemCode.trim()) { onError("Choose which budget item this is for."); return; }
    start(async () => {
      const res = await createRequisitionAction({
        projectId, itemCode, batchNo,
        requestedDate: new Date().toISOString().slice(0, 10),
        qtyRequested: qty, rate, amountRequested: effectiveAmount,
        route, supplier,
      });
      if (!res.ok) { onError(res.error ?? "Couldn't raise the request."); return; }
      onSaved({
        id: res.id ?? -Date.now(), projectId, itemCode: itemCode.toUpperCase(),
        batchNo: batchNo || null, requestedDate: new Date().toISOString().slice(0, 10),
        qtyRequested: qty || null, rate: rate || null,
        amountRequested: effectiveAmount.replace(/[\s,]/g, "") || "0",
        route: route || null, supplier: supplier || null, referenceNo: null, remarks: null,
        amountApproved: null, receivedDate: null, grnNo: null,
        qtyReceived: null, amountReceived: null, status: "Requested",
      });
      setQty(""); setRate(""); setAmount(""); setAmountTouched(false);
      setSupplier(""); setComboKey((k) => k + 1); setItemCode("");
    });
  };

  return (
    <div className="rounded-lg border border-border bg-bg-elev p-3">
      <h3 className="mb-2 text-[12px] font-medium">Raise a request</h3>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-12"
        onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); save(); } }}>
        <Field className="sm:col-span-4" label="Budget item" hint="must be on the budget">
          <Combobox
            key={comboKey}
            options={budgetItems.map((b) => b.itemCode)}
            defaultValue={itemCode}
            placeholder="CEMENT-STRIP-FOUNDATION"
            onInput={setItemCode}
            onCommit={setItemCode}
            className={inputCls}
          />
        </Field>
        <Field className="sm:col-span-2" label="Batch" hint="col G">
          <input value={batchNo} onChange={(e) => setBatchNo(e.target.value)} placeholder="PT-01" className={inputCls} />
        </Field>
        <Field className="sm:col-span-1" label="Qty">
          <input value={qty} onChange={(e) => setQty(e.target.value)} inputMode="decimal" className={cn(inputCls, "tabular text-right")} />
        </Field>
        <Field className="sm:col-span-2" label="Rate">
          <MoneyInput value={rate} onChange={setRate} currency={currency} />
        </Field>
        <Field className="sm:col-span-3" label="Amount" hint="qty × rate — editable">
          <MoneyInput
            value={effectiveAmount}
            onChange={(v) => { setAmountTouched(true); setAmount(v); }}
            currency={currency}
            className={cn(!amountTouched && computed !== null && "text-fg-muted")}
          />
        </Field>
        <Field className="sm:col-span-4" label="Who pays" hint="from Setup">
          <ChipPicker
            options={routes}
            value={route}
            onSelect={setRoute}
            onCreate={(name) => createRefAction(projectId, "route", name)}
            createNoun="payment route"
            placeholder="SHAO"
          />
        </Field>
        <Field className="sm:col-span-4" label="Supplier" hint="from Setup">
          <Combobox
            key={`sup-${comboKey}`}
            options={suppliers}
            onCreate={(name) => createRefAction(projectId, "supplier", name)}
            createNoun="supplier"
            defaultValue={supplier}
            placeholder="who you are buying from"
            onInput={setSupplier}
            onCommit={setSupplier}
            className={inputCls}
          />
        </Field>
      </div>

      {/* The control the workbook puts in columns C/D: what is left BEFORE you ask. */}
      {balance && (
        <div className={cn("mt-2 rounded-md px-2.5 py-1.5 text-[11px]",
          wouldOverspend ? "bg-danger-soft text-danger" : "bg-bg-subtle text-fg-muted")}>
          {wouldOverspend && <AlertTriangle size={12} className="mr-1 inline" />}
          <strong>{money(balance.remaining)}</strong> left on this item
          {" "}(budget {money(balance.budget)} − approved {money(balance.approved)})
          {balance.pending > 0 && <> · {money(balance.pending)} already requested but not yet approved</>}
          {wouldOverspend && <> — this request would take it over.</>}
        </div>
      )}

      <div className="mt-2.5 flex items-center gap-2">
        <button type="button" onClick={save} disabled={pending}
          className="inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-accent-fg disabled:opacity-60">
          {pending ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />} Raise request
        </button>
        <span className="text-[11px] text-fg-subtle">
          Raising does not approve it — head office does that separately.
        </span>
      </div>
    </div>
  );
}

const inputCls =
  "h-8 w-full rounded-md border border-border bg-bg px-2 text-[13px] outline-none placeholder:text-fg-subtle focus:border-accent";

function Field({ label, hint, className, children }: {
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

/* ──────────────────────────────────────────────── approve / receive row ──── */

function RowActions({
  r, projectId, currency, budget, siblings, onPatched, onError, onRefresh,
}: {
  r: Requisition; projectId: number; currency: string; budget: number | null;
  siblings: Requisition[];
  onPatched: (id: number, next: Partial<Requisition>) => void;
  onError: (e: string | null) => void;
  onRefresh: () => void;
}) {
  const [pending, start] = useTransition();
  const [approve, setApprove] = useState("");
  const [recvAmount, setRecvAmount] = useState("");
  const [grnNo, setGrnNo] = useState("");
  const [qtyRecv, setQtyRecv] = useState("");

  const bal = budget === null ? null : itemBalance(budget, siblings);

  if (r.status === "Rejected" || r.status === "Cancelled") {
    return (
      <div className="flex items-center gap-2 rounded-md bg-bg-subtle px-2.5 py-2 text-[11px] text-fg-muted">
        This request was {r.status.toLowerCase()}. It counts against nothing.
        <button type="button" disabled={pending}
          onClick={() => start(async () => {
            const res = await setRequisitionStatusAction(r.id, projectId, "Requested");
            if (!res.ok) { onError(res.error!); return; }
            onPatched(r.id, { status: "Requested" }); onRefresh();
          })}
          className="rounded border border-border px-1.5 py-0.5 hover:bg-bg-muted">Reopen</button>
      </div>
    );
  }

  return (
    <div className="space-y-2 rounded-md bg-bg-subtle p-2">
      {/* ── approve ── */}
      {r.amountApproved === null ? (
        <div className="flex flex-wrap items-end gap-2">
          <Field label="Approve" hint={bal ? `${money(bal.remaining)} left on this item` : "head office decision"}>
            <span className="block w-36"><MoneyInput value={approve} onChange={setApprove}
              currency={currency} placeholder={r.amountRequested} /></span>
          </Field>
          <button type="button" disabled={pending}
            onClick={() => start(async () => {
              const value = approve.trim() === "" ? r.amountRequested : approve;
              const res = await approveRequisitionAction(r.id, projectId, value);
              if (!res.ok) { onError(res.error!); return; }
              onPatched(r.id, { amountApproved: value.replace(/[\s,]/g, ""), status: "Approved" });
              onRefresh();
            })}
            className="inline-flex h-8 items-center gap-1.5 rounded-md bg-accent px-2.5 text-[12px] font-medium text-accent-fg disabled:opacity-60">
            {pending ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />} Approve
          </button>
          <button type="button" disabled={pending}
            onClick={() => start(async () => {
              const res = await setRequisitionStatusAction(r.id, projectId, "Rejected");
              if (!res.ok) { onError(res.error!); return; }
              onPatched(r.id, { status: "Rejected" }); onRefresh();
            })}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-[12px] text-fg-muted hover:text-danger">
            <Ban size={12} /> Reject
          </button>
          <span className="text-[11px] text-fg-subtle">
            Leave blank to approve the full {money(num(r.amountRequested))}.
          </span>
        </div>
      ) : r.amountReceived === null ? (
        /* ── receive: BLANK BY DEFAULT. Nothing is copied from the request. ── */
        <div className="flex flex-wrap items-end gap-2">
          <Field label="GRN no"><input value={grnNo} onChange={(e) => setGrnNo(e.target.value)} className={cn(inputCls, "w-28")} /></Field>
          <Field label="Qty received"><input value={qtyRecv} onChange={(e) => setQtyRecv(e.target.value)} inputMode="decimal" className={cn(inputCls, "tabular w-24 text-right")} /></Field>
          <Field label="Value received" hint="what actually arrived">
            <span className="block w-36"><MoneyInput value={recvAmount} onChange={setRecvAmount}
              currency={currency} /></span>
          </Field>
          <button type="button" disabled={pending || !recvAmount.trim()}
            onClick={() => start(async () => {
              const res = await receiveRequisitionAction(r.id, projectId, {
                grnNo, qtyReceived: qtyRecv, amountReceived: recvAmount,
              });
              if (!res.ok) { onError(res.error!); return; }
              onPatched(r.id, {
                amountReceived: recvAmount.replace(/[\s,]/g, ""),
                grnNo: grnNo || null, qtyReceived: qtyRecv || null, status: "Received",
              });
              onRefresh();
            })}
            className="inline-flex h-8 items-center gap-1.5 rounded-md bg-accent px-2.5 text-[12px] font-medium text-accent-fg disabled:opacity-60">
            {pending ? <Loader2 size={12} className="animate-spin" /> : <PackageCheck size={12} />} Record delivery
          </button>
          <span className="text-[11px] text-fg-subtle">
            Type what actually arrived — nothing is filled in from the order.
          </span>
        </div>
      ) : (
        <p className="flex items-center gap-1.5 text-[11px] text-fg-muted">
          <PackageCheck size={12} className="text-success" />
          Received {money(num(r.amountReceived))}
          {r.grnNo && <> on GRN {r.grnNo}</>}
          {r.receivedDate && <> · {fmtDate(r.receivedDate)}</>}
          {num(r.amountReceived) !== num(r.amountApproved) && (
            <span className="text-warn">
              (approved {money(num(r.amountApproved))} — a difference of{" "}
              {money(Math.abs((num(r.amountApproved) ?? 0) - (num(r.amountReceived) ?? 0)))})
            </span>
          )}
        </p>
      )}
    </div>
  );
}

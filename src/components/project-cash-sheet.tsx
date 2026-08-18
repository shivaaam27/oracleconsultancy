"use client";

// ─────────────────────────────────────────────────────────────────────────────
// PROJECT CASH — money released, money spent, and the gap (Phase 4).
//
// The workbook's PAYMENTS and EXPENDITURES sheets. The single most important
// thing on this screen is the GAP between them: on the real Patamela figures
// 94,431,950 was released and 54,754,050 accounted for, leaving 39,677,900 of
// float on site that nothing on the workbook's dashboard names — while
// SNAPSHOT B21 quietly uses the RELEASED figure as "actual cost", flattering
// every profit line by the whole difference.
//
// ⚠️ This screen owns its lists — see the long note in project-budget-sheet.tsx.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Trash2, AlertTriangle, Wallet, Receipt } from "lucide-react";
import { cn } from "@/lib/cn";
import { RecordList } from "./record-list";
import { Combobox } from "./combobox";
import { SetupNeeded } from "./setup-needed";
import { ChipPicker } from "./chip-picker";
import { createRefAction } from "@/app/projects/[id]/setup/actions";
import { MoneyInput } from "./money-input";
import { money } from "@/lib/project-budget-shared";
import { num, fmtDate } from "@/lib/projects-shared";
import {
  walkFloat, openingFloat, PAYMENT_ROUTES, PAYMENT_ROUTE_LABEL,
  type Payment, type Expenditure,
} from "@/lib/project-cash-shared";
import {
  createPaymentAction, deletePaymentAction,
  createExpenditureAction, deleteExpenditureAction,
} from "@/app/projects/[id]/cash/actions";

export function ProjectCashSheet({
  projectId, payments: serverPayments, expenditures: serverExpenditures,
  itemCodes, floatHolders, suppliers, currency,
}: {
  projectId: number;
  payments: Payment[];
  expenditures: Expenditure[];
  /** Budget item codes, so spending can be attributed. */
  itemCodes: string[];
  /** From the Setup tab. Empty means Setup has not been done yet. */
  floatHolders: string[];
  suppliers: string[];
  currency: string;
}) {
  const router = useRouter();
  const [payments, setPayments] = useState(serverPayments);
  const [expenditures, setExpenditures] = useState(serverExpenditures);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"spend" | "released">("spend");

  const seededFor = useRef(projectId);
  useEffect(() => {
    if (seededFor.current !== projectId) {
      seededFor.current = projectId;
      setPayments(serverPayments);
      setExpenditures(serverExpenditures);
    }
  }, [projectId, serverPayments, serverExpenditures]);

  const state = useMemo(
    () => walkFloat(expenditures, openingFloat(payments)),
    [expenditures, payments],
  );
  // Prefer the Setup list; fall back to whoever already holds float, so an
  // older project still shows its balances before Setup is filled in.
  const holders = floatHolders.length ? floatHolders : Object.keys(state.releasedBy);

  return (
    <div className="space-y-4">
      <FloatSummary state={state} />

      <SetupNeeded projectId={projectId} missing={holders.length ? [] : ["Whose float"]} />

      {error && (
        <p role="alert" className="rounded-md border border-danger/30 bg-danger-soft px-2.5 py-1.5 text-[12px] text-danger">
          {error}
        </p>
      )}

      <div className="flex gap-1.5">
        {([["spend", "Money spent", Receipt], ["released", "Money released", Wallet]] as const).map(([k, label, Icon]) => (
          <button key={k} type="button" onClick={() => setTab(k)}
            className={cn("inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-[12px]",
              tab === k ? "border-accent/40 bg-accent-soft font-medium text-accent" : "border-border bg-bg-elev text-fg-muted")}>
            <Icon size={13} /> {label}
            <span className="tabular text-[11px] opacity-70">
              {k === "spend" ? expenditures.length : payments.length}
            </span>
          </button>
        ))}
      </div>

      {tab === "spend" ? (
        <>
          <AddExpenditure
            projectId={projectId} itemCodes={itemCodes}
            floatHolders={holders} currency={currency}
            onSaved={(e) => { setError(null); setExpenditures((p) => [...p, e]); router.refresh(); }}
            onError={setError}
          />
          <RecordList
            rows={[...state.rows].reverse()}
            rowKey={(r) => r.expenditure.id}
            listKey="project-expenditures"
            total={expenditures.length}
            shown={expenditures.length}
            empty={<p className="py-6 text-center text-[12px] text-fg-subtle">Nothing spent yet.</p>}
            columns={[
              {
                key: "what", label: "What", width: "minmax(0,1fr)",
                render: (r) => (
                  <span className="min-w-0">
                    <span className="block truncate text-[12px]">
                      {r.expenditure.description || r.expenditure.itemCode || "—"}
                    </span>
                    <span className="block truncate text-[11px] text-fg-muted">
                      {[fmtDate(r.expenditure.spentDate), r.expenditure.itemCode, r.expenditure.payer]
                        .filter(Boolean).join(" · ")}
                    </span>
                  </span>
                ),
              },
              {
                key: "amount", label: "Spent", width: "110px", align: "right",
                render: (r) => <span className="tabular text-[12px]">{money(num(r.expenditure.amount))}</span>,
              },
              {
                key: "balance", label: "Float left", width: "120px", align: "right", hideBelow: "md",
                render: (r) => (
                  <span className={cn("tabular text-[12px]", r.payerBalance < 0 && "text-danger")}>
                    {money(r.payerBalance)}
                  </span>
                ),
              },
            ]}
            rowActions={(r) => (
              <DeleteButton
                label={r.expenditure.description ?? r.expenditure.itemCode ?? "this entry"}
                onDelete={async () => {
                  const res = await deleteExpenditureAction(r.expenditure.id, projectId);
                  if (!res.ok) { setError(res.error!); return; }
                  setExpenditures((p) => p.filter((x) => x.id !== r.expenditure.id));
                  router.refresh();
                }}
              />
            )}
          />
        </>
      ) : (
        <>
          <AddPayment
            projectId={projectId} suppliers={suppliers} currency={currency}
            onSaved={(p) => { setError(null); setPayments((prev) => [p, ...prev]); router.refresh(); }}
            onError={setError}
          />
          <RecordList
            rows={payments}
            rowKey={(p) => p.id}
            listKey="project-payments"
            total={payments.length}
            shown={payments.length}
            empty={<p className="py-6 text-center text-[12px] text-fg-subtle">No payments recorded yet.</p>}
            columns={[
              {
                key: "route", label: "Paid to", width: "minmax(0,1fr)",
                render: (p) => (
                  <span className="min-w-0">
                    <span className="block truncate text-[12px]">
                      {PAYMENT_ROUTE_LABEL[p.route as keyof typeof PAYMENT_ROUTE_LABEL] ?? p.route}
                    </span>
                    <span className="block truncate text-[11px] text-fg-muted">
                      {[fmtDate(p.paidDate), p.supplier, p.referenceNo, p.batchNo].filter(Boolean).join(" · ") || "—"}
                    </span>
                  </span>
                ),
              },
              {
                key: "amount", label: "Released", width: "120px", align: "right",
                render: (p) => <span className="tabular text-[12px]">{money(num(p.amountPaid))}</span>,
              },
            ]}
            rowActions={(p) => (
              <DeleteButton
                label={`this ${p.route} payment`}
                onDelete={async () => {
                  const res = await deletePaymentAction(p.id, projectId);
                  if (!res.ok) { setError(res.error!); return; }
                  setPayments((prev) => prev.filter((x) => x.id !== p.id));
                  router.refresh();
                }}
              />
            )}
          />
        </>
      )}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────── the summary ── */

function FloatSummary({ state }: { state: ReturnType<typeof walkFloat> }) {
  const gap = state.unaccounted;
  const pct = state.totalReleased > 0 ? state.totalSpent / state.totalReleased : null;
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-4">
        <Tile label="Released" value={money(state.totalReleased) ?? "0"} sub="money out of head office" />
        <Tile label="Accounted for" value={money(state.totalSpent) ?? "0"}
          sub={pct === null ? "nothing released yet" : `${(pct * 100).toFixed(0)}% of released`} />
        <Tile label="Float on site" value={money(gap) ?? "0"}
          sub="released but not written up" tone={gap > 0 ? "warn" : undefined} />
        <Tile label="Held by" value={Object.keys(state.heldBy).length
          ? Object.entries(state.heldBy).map(([who, v]) => `${who}: ${money(v)}`).join("  ")
          : "-"}
          small tone={state.overdrawn.length ? "danger" : undefined}
          sub={state.overdrawn.length ? `${state.overdrawn.join(", ")} overdrawn` : undefined} />
      </div>
      {gap > 0 && (
        <p className="flex items-start gap-1.5 rounded-md bg-warn-soft px-2.5 py-1.5 text-[11px] text-warn">
          <AlertTriangle size={12} className="mt-px shrink-0" />
          <span>
            <strong>{money(gap)}</strong> has left head office but has not been written up line by line.
            That is cash sitting on site. The workbook shows both numbers but never names the
            difference — and then treats the released figure as though it were the cost.
          </span>
        </p>
      )}
    </div>
  );
}

function Tile({ label, value, sub, tone, small }: {
  label: string; value: string; sub?: string; tone?: "danger" | "warn"; small?: boolean;
}) {
  return (
    <div className="bg-bg-elev px-3 py-2">
      <p className="text-[11px] uppercase tracking-[0.04em] text-fg-subtle">{label}</p>
      <p className={cn("tabular mt-0.5", small ? "text-[12px]" : "text-[15px]",
        tone === "danger" && "text-danger", tone === "warn" && "text-warn")}>{value}</p>
      {sub && <p className="text-[11px] text-fg-subtle">{sub}</p>}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────── the forms ── */

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

function AddExpenditure({
  projectId, itemCodes, floatHolders, currency, onSaved, onError,
}: {
  projectId: number; itemCodes: string[];
  floatHolders: string[]; currency: string;
  onSaved: (e: Expenditure) => void; onError: (e: string | null) => void;
}) {
  const [pending, start] = useTransition();
  const [itemCode, setItemCode] = useState("");
  const [description, setDescription] = useState("");
  const [payer, setPayer] = useState<string>(floatHolders[0] ?? "");
  const [amount, setAmount] = useState("");
  const [spentDate, setSpentDate] = useState(new Date().toISOString().slice(0, 10));
  const [comboKey, setComboKey] = useState(0);

  const save = () => {
    onError(null);
    if (!amount.trim()) { onError("Enter what was spent."); return; }
    start(async () => {
      const res = await createExpenditureAction({
        projectId, spentDate, itemCode, description, payer, amount, source: "SITE",
      });
      if (!res.ok) { onError(res.error ?? "Couldn't save."); return; }
      onSaved({
        id: res.id ?? -Date.now(), projectId, spentDate,
        itemCode: itemCode ? itemCode.toUpperCase() : null,
        description: description || null, payer,
        amount: amount.replace(/[\s,]/g, ""), source: "SITE",
        mobileNo: null, batchNo: null, notes: null,
      });
      setItemCode(""); setDescription(""); setAmount(""); setComboKey((k) => k + 1);
    });
  };

  return (
    <div className="rounded-lg border border-border bg-bg-elev p-3">
      <h3 className="mb-2 text-[12px] font-medium">Record spending</h3>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-12"
        onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); save(); } }}>
        <Field className="sm:col-span-2" label="Date">
          <input type="date" value={spentDate} onChange={(e) => setSpentDate(e.target.value)} className={inputCls} />
        </Field>
        <Field className="sm:col-span-3" label="Budget item" hint="blank if none">
          <Combobox key={comboKey} options={itemCodes} defaultValue={itemCode}
            placeholder="leave blank for fuel, food…" onInput={setItemCode} onCommit={setItemCode}
            className={inputCls} />
        </Field>
        <Field className="sm:col-span-3" label="What it was for">
          <input value={description} onChange={(e) => setDescription(e.target.value)} className={inputCls} />
        </Field>
        <Field className="sm:col-span-2" label="Whose float">
          <ChipPicker
            options={floatHolders}
            value={payer}
            onSelect={setPayer}
            onCreate={(name) => createRefAction(projectId, "float_holder", name)}
            createNoun="float holder"
            placeholder="SHAO"
            allowClear={false}
          />
        </Field>
        <Field className="sm:col-span-2" label="Amount">
          <MoneyInput value={amount} onChange={setAmount} currency={currency} />
        </Field>
      </div>
      <div className="mt-2.5 flex items-center gap-2">
        <button type="button" onClick={save} disabled={pending}
          className="inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-accent-fg disabled:opacity-60">
          {pending ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />} Add
        </button>
        <span className="text-[11px] text-fg-subtle">
          Leave the budget item blank for spending that belongs to no line — it is still counted.
        </span>
      </div>
    </div>
  );
}

function AddPayment({
  projectId, suppliers, currency, onSaved, onError,
}: {
  projectId: number; suppliers: string[]; currency: string;
  onSaved: (p: Payment) => void; onError: (e: string | null) => void;
}) {
  const [pending, start] = useTransition();
  const [route, setRoute] = useState<string>("SHAO");
  const [referenceNo, setReferenceNo] = useState("");
  const [batchNo, setBatchNo] = useState("");
  const [supplier, setSupplier] = useState("");
  const [amountPaid, setAmountPaid] = useState("");
  const [paidDate, setPaidDate] = useState(new Date().toISOString().slice(0, 10));

  const save = () => {
    onError(null);
    if (!amountPaid.trim()) { onError("Enter the amount released."); return; }
    start(async () => {
      const res = await createPaymentAction({
        projectId, route, referenceNo, batchNo, supplier, paidDate, amountPaid,
      });
      if (!res.ok) { onError(res.error ?? "Couldn't save."); return; }
      onSaved({
        id: res.id ?? -Date.now(), projectId, route,
        referenceNo: referenceNo || null, batchNo: batchNo || null,
        supplier: supplier || null, paidDate,
        amountPaid: amountPaid.replace(/[\s,]/g, ""), notes: null,
      });
      setReferenceNo(""); setSupplier(""); setAmountPaid("");
    });
  };

  return (
    <div className="rounded-lg border border-border bg-bg-elev p-3">
      <h3 className="mb-2 text-[12px] font-medium">Record money released</h3>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-12"
        onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); save(); } }}>
        <Field className="sm:col-span-4" label="Which ledger">
          <div className="flex gap-1">
            {PAYMENT_ROUTES.map((r) => (
              <button key={r} type="button" onClick={() => setRoute(r)} title={PAYMENT_ROUTE_LABEL[r]}
                className={cn("h-8 flex-1 rounded-md border px-1 text-[11px]",
                  route === r ? "border-accent bg-accent-soft text-accent" : "border-border bg-bg text-fg-muted")}>
                {r}
              </button>
            ))}
          </div>
        </Field>
        <Field className="sm:col-span-2" label="Date">
          <input type="date" value={paidDate} onChange={(e) => setPaidDate(e.target.value)} className={inputCls} />
        </Field>
        {route === "DIRECT" ? (
          <>
            <Field className="sm:col-span-2" label="Invoice no" hint="col M">
              <input value={referenceNo} onChange={(e) => setReferenceNo(e.target.value)} className={inputCls} />
            </Field>
            <Field className="sm:col-span-2" label="Supplier" hint="from Setup">
              <Combobox options={suppliers} defaultValue={supplier} placeholder="who was paid"
                onInput={setSupplier} onCommit={setSupplier} className={inputCls}
                onCreate={(name) => createRefAction(projectId, "supplier", name)}
                createNoun="supplier" />
            </Field>
          </>
        ) : (
          <Field className="sm:col-span-4" label="Batch" hint="which requisition batch this settles">
            <input value={batchNo} onChange={(e) => setBatchNo(e.target.value)} placeholder="PT-01" className={inputCls} />
          </Field>
        )}
        <Field className="sm:col-span-2" label="Amount">
          <MoneyInput value={amountPaid} onChange={setAmountPaid} currency={currency} />
        </Field>
      </div>
      <div className="mt-2.5 flex items-center gap-2">
        <button type="button" onClick={save} disabled={pending}
          className="inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-accent-fg disabled:opacity-60">
          {pending ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />} Add
        </button>
        <span className="text-[11px] text-fg-subtle">
          This is money leaving head office — it becomes float until it is written up as spending.
        </span>
      </div>
    </div>
  );
}

function DeleteButton({ label, onDelete }: { label: string; onDelete: () => Promise<void> }) {
  const [pending, start] = useTransition();
  return (
    <button type="button" title="Delete" disabled={pending}
      onClick={() => { if (confirm(`Delete ${label}?`)) start(() => onDelete()); }}
      className="rounded p-1 text-fg-subtle hover:bg-danger-soft hover:text-danger">
      {pending ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
    </button>
  );
}

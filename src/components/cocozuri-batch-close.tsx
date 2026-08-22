"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, Loader2, Undo2, X } from "lucide-react";
import { BottomSheet } from "@/components/bottom-sheet";
import { FIELD } from "@/components/ui";
import { FluidSelect } from "@/components/fluid-select";
import { useToast } from "@/components/toast";
import { qty as qtyText } from "@/lib/cocozuri-stock-shared";
import {
  CZ_LOSS_KINDS, batchCheck, closeBlockers,
  type CzBatch, type CzLossKind,
} from "@/lib/cocozuri-batch-shared";
import type { CzBatchPlan } from "@/lib/cocozuri-batch-shared";
import { cancelBatchAction, closeBatchAction, reopenBatchAction } from "@/app/cocozuri/actions";
import { typedNumber, typedNumberOr, hasPositive } from "@/lib/typed-number";

/* ------------------------------------------------------------------ *
 * Finishing a batch — and this is where the questions get asked.
 *
 * ⚠️ ALL THE FRICTION IN STAGE 4 LIVES HERE, ON PURPOSE. Somebody opening a
 * batch is standing in a kitchen with their hands full; somebody closing one has
 * finished and is writing down what happened. Asking "how many came out" and,
 * if it is short, "where did it go" at THIS moment is the difference between a
 * system that gets used and one people keep on paper. Plan §5a.
 *
 * ⚠️ AND THIS IS WHERE THE STOCK MOVES. Every material out, the chocolate in,
 * one voucher, all of it tagged with the batch — which is what makes a bar
 * traceable back to the bag it came from.
 * ------------------------------------------------------------------ */

export function CocozuriBatchClose({
  batch, plan, used,
}: {
  batch: CzBatch;
  /** What the recipe asked for. Null when the batch has no recipe. */
  plan: CzBatchPlan | null;
  used: { itemId: number; itemName: string; uom: string; qty: number }[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [closing, setClosing] = useState(false);

  const [produced, setProduced] = useState(
    plan ? String(plan.expectedQty) : batch.plannedQty != null ? String(batch.plannedQty) : "",
  );
  const [lossKind, setLossKind] = useState<CzLossKind>(batch.lossKind === "none" ? "production" : batch.lossKind);
  const [lossNote, setLossNote] = useState(batch.lossNote ?? "");
  const [closedBy, setClosedBy] = useState(batch.openedBy ?? "");
  /** What was ACTUALLY taken — starts at what the recipe asked for. */
  const [amounts, setAmounts] = useState<Record<number, string>>(
    Object.fromEntries(used.map((u) => [u.itemId, String(u.qty)])),
  );

  const usedNow = useMemo(
    () => used.map((u) => ({ ...u, qty: typedNumberOr(amounts[u.itemId] ?? u.qty) })),
    [used, amounts],
  );
  // ⚠️ `typedNumber`, so "1,200" is a quantity rather than NaN.
  const producedQty = typedNumber(produced);
  const check = batchCheck(
    { producedQty, plannedQty: batch.plannedQty, recipeMultiple: batch.recipeMultiple, lossKind, lossNote },
    plan,
    usedNow,
  );
  const blockers = closeBlockers({ producedQty, check, used: usedNow });
  const short = check.variance != null && check.variance < 0;

  async function run(label: string, fn: () => Promise<{ ok: boolean; error?: string }>) {
    setBusy(true);
    const res = await fn();
    setBusy(false);
    if (!res.ok) { toast(res.error ?? "That did not work.", { tone: "danger" }); return false; }
    toast(label, { tone: "success" });
    router.refresh();
    return true;
  }

  if (batch.status === "closed") {
    return (
      <div className="flex flex-wrap items-center gap-2">
        {busy && <Loader2 size={14} className="animate-spin text-fg-subtle" />}
        <span className="inline-flex h-8 items-center gap-1.5 rounded-md bg-success/10 px-2.5 text-sm text-success">
          <CheckCircle2 size={13} /> Done{batch.closedBy ? ` — ${batch.closedBy}` : ""}
        </span>
        {/* ⚠️ Reopening REVERSES the movements rather than erasing them. */}
        <button type="button"
          onClick={() => {
            const why = window.prompt(`Reopen ${batch.batchNo}?\n\nThis puts the materials back on the shelf and takes the chocolate off, with an opposite movement for each — nothing is erased.\n\nWhy?`);
            if (why === null) return;
            void run("Reopened, with the movements reversed.", () => reopenBatchAction(batch.id, why || null));
          }}
          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-sm text-fg-muted hover:text-warn">
          <Undo2 size={13} /> Reopen it
        </button>
      </div>
    );
  }

  if (batch.status === "cancelled") {
    return (
      <span className="inline-flex h-8 items-center gap-1.5 rounded-md bg-bg-subtle px-2.5 text-sm text-fg-subtle">
        Abandoned — nothing moved
      </span>
    );
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {busy && <Loader2 size={14} className="animate-spin text-fg-subtle" />}
        <button type="button" onClick={() => setClosing(true)}
          className="inline-flex h-8 items-center gap-1.5 rounded-md bg-accent px-2.5 text-sm font-medium text-accent-fg hover:opacity-90">
          <CheckCircle2 size={13} /> Say what came out
        </button>
        {/* ⚠️ Abandoning costs nothing — materials are not taken until close, so
            nobody has a reason to avoid starting a batch "just in case". */}
        <button type="button"
          onClick={() => {
            const why = window.prompt(`Abandon ${batch.batchNo}?\n\nNothing has come off the shelf, so this costs nothing.\n\nWhy? (optional)`);
            if (why === null) return;
            void run("Abandoned. Nothing moved.", () => cancelBatchAction(batch.id, why || null));
          }}
          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-sm text-fg-muted hover:text-danger">
          <X size={13} /> Abandon it
        </button>
      </div>

      {closing && (
        <BottomSheet open onClose={() => setClosing(false)} title={`Finish ${batch.batchNo}`} maxWidth="max-w-3xl">
          <div className="flex flex-col gap-3 px-1 pb-2">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={`How many ${batch.itemName ?? "came out"}`}>
                <input value={produced} onChange={(e) => setProduced(e.target.value)} inputMode="decimal"
                  className={`${FIELD} text-right tabular`} placeholder="0" autoFocus />
                {check.expected != null && (
                  <span className="text-xs text-fg-subtle">
                    {qtyText(check.expected)} expected{plan ? ` of a ${qtyText(plan.yieldQty)} run` : ""}
                  </span>
                )}
              </Field>
              <Field label="Who finished it">
                <input value={closedBy} onChange={(e) => setClosedBy(e.target.value)} className={FIELD} placeholder="A name" />
              </Field>
            </div>

            {/* What actually went in. ⚠️ It STARTS at what the recipe asked for
                but is not forced to it — recording the recipe as if it were fact
                would make every batch agree with itself and the check would be
                worthless. */}
            {usedNow.length > 0 && (
              <div className="rounded-md border border-border">
                <div className="grid grid-cols-[minmax(0,1fr)_100px_110px] items-center gap-2 border-b border-border bg-bg-subtle px-2.5 py-1.5 text-xs font-medium uppercase tracking-[0.06em] text-fg-subtle">
                  <span>What went in</span>
                  <span className="text-right">Recipe</span>
                  <span className="text-right">Actually used</span>
                </div>
                <div className="max-h-[14rem] overflow-y-auto">
                  {check.materials.map((m) => (
                    <div key={m.itemId} className="grid grid-cols-[minmax(0,1fr)_100px_110px] items-center gap-2 border-b border-border px-2.5 py-1.5 last:border-0">
                      <span className="min-w-0 truncate text-sm text-fg">{m.itemName}</span>
                      <span className="text-right text-sm tabular text-fg-subtle">
                        {m.planned == null ? "—" : `${qtyText(m.planned)} ${m.uom}`}
                      </span>
                      <input
                        value={amounts[m.itemId] ?? String(m.used)}
                        onChange={(e) => setAmounts((a) => ({ ...a, [m.itemId]: e.target.value }))}
                        inputMode="decimal"
                        className={`${FIELD} text-right tabular ${m.variance != null && Math.abs(m.variance) > 0.0005 ? "border-warn" : ""}`}
                        aria-label={`Used of ${m.itemName}`}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* The inter check, live. */}
            {check.variance != null && (
              <div className={`rounded-md border px-3 py-2 text-sm ${
                short ? "border-warn/30 bg-warn/10 text-warn" : "border-border bg-bg-subtle text-fg-muted"}`}>
                <div className="flex items-center justify-between font-medium">
                  <span>{short ? "Short of the plan" : check.variance > 0 ? "Better than the plan" : "Exactly as planned"}</span>
                  <span className="tabular">
                    {check.variance > 0 ? "+" : ""}{qtyText(check.variance)}
                  </span>
                </div>
                {check.yieldPercent != null && (
                  <p className="mt-0.5 text-xs">
                    {check.yieldPercent}% yield
                    {/* ⚠️ The trade expects above 95% for artisanal chocolate —
                        a daily number, not a year-end one. */}
                    {check.belowBenchmark && " — below the 95% the trade expects"}
                  </p>
                )}
              </div>
            )}

            {/* ⚠️ NOTE #12: a shortfall has to say WHERE it went — in the making,
                or the materials. A number nobody can act on is what the
                workbook's VARIANCE column already is. */}
            {short && (
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Where did it go">
                  <FluidSelect
                    value={lossKind === "none" ? "production" : lossKind}
                    onSelect={(v) => setLossKind(v as CzLossKind)}
                    options={CZ_LOSS_KINDS.map((k) => ({ value: k.key, label: k.label }))}
                  />
                  <span className="text-xs text-fg-subtle">
                    {CZ_LOSS_KINDS.find((k) => k.key === lossKind)?.hint}
                  </span>
                </Field>
                <Field label="What happened">
                  <input value={lossNote} onChange={(e) => setLossNote(e.target.value)} className={FIELD}
                    placeholder="Tempering went over, a bad bag…" />
                </Field>
              </div>
            )}

            {blockers.length > 0 && (
              <p className="flex items-start gap-2 rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
                <AlertTriangle size={13} className="mt-px shrink-0" />
                {blockers[0]}
              </p>
            )}

            <p className="rounded-md border border-border bg-bg-subtle px-3 py-2 text-xs text-fg-muted">
              Closing takes the materials off the shelf and puts the chocolate on, in one movement
              each, all marked with <strong className="text-fg">{batch.batchNo}</strong>. That is what
              lets you go from a bad bag of anything to every bar made from it, and back.
            </p>

            <div className="flex items-center gap-2">
              <button type="button" disabled={busy || blockers.length > 0}
                onClick={() => {
                  void (async () => {
                    const ok = await run(`${batch.batchNo} is done.`, () =>
                      closeBatchAction(batch.id, {
                        producedQty: producedQty ?? 0,
                        used: usedNow.map((u) => ({ itemId: u.itemId, qty: u.qty })),
                        lossKind: short ? lossKind : "none",
                        lossNote: short ? lossNote : null,
                        closedBy: closedBy || null,
                      }));
                    if (ok) setClosing(false);
                  })();
                }}
                className="inline-flex h-8 items-center gap-1.5 rounded-md bg-accent px-3 text-sm font-medium text-accent-fg hover:opacity-90 disabled:opacity-60">
                {busy && <Loader2 size={13} className="animate-spin" />} Finish it
              </button>
              <button type="button" onClick={() => setClosing(false)}
                className="h-8 rounded-md px-3 text-sm text-fg-muted hover:text-fg">Cancel</button>
            </div>
          </div>
        </BottomSheet>
      )}
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium uppercase tracking-[0.06em] text-fg-subtle">{label}</span>
      {children}
    </label>
  );
}

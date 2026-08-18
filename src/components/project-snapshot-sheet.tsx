"use client";

// ─────────────────────────────────────────────────────────────────────────────
// THE SNAPSHOT — the dashboard (Phase 5).
//
// The workbook's SNAPSHOT sheet: the budget-vs-actual gauge and the payment
// plan, on one page. Three deliberate departures from the original:
//
//   1. WORST FIRST. The workbook's gauge is sorted by budget SIZE, so FUEL at
//      235% of its budget sits near the bottom while big, healthy categories
//      fill the top of the screen. Here the trouble floats up.
//   2. THE BANDS COMPARE NUMBERS. The workbook's conditional formatting tests
//      TEXT ("1%" to "25%"), in which "100%" sorts inside that range.
//   3. "ACTUAL" MEANS SPENT. SNAPSHOT B21 uses money RELEASED as the actual
//      cost, which on Patamela flatters every profit line by 39.7m. Here the two
//      are separate and both are shown.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, AlertTriangle, Check } from "lucide-react";
import { cn } from "@/lib/cn";
import { money } from "@/lib/project-budget-shared";
import { num, pct, fmtDate } from "@/lib/projects-shared";
import {
  categoryGauge, stageViews, planTotals, BAND_TONE,
  type GaugeRow, type PaymentStage,
} from "@/lib/project-snapshot-shared";
import { seedDefaultStagesAction, updatePaymentStageAction } from "@/app/projects/[id]/site/actions";

const TONE_TEXT: Record<string, string> = {
  danger: "text-danger", warn: "text-warn", success: "text-success",
  info: "text-accent", muted: "text-fg-subtle",
};
const TONE_BAR: Record<string, string> = {
  danger: "bg-danger", warn: "bg-warn", success: "bg-success",
  info: "bg-accent", muted: "bg-fg-subtle",
};

export function ProjectSnapshotSheet({
  projectId, budgetByCategory, spentByCategory, stages: serverStages,
  totalContract, completionPct, budgetTotal, spentTotal, releasedTotal, quotationValue,
}: {
  projectId: number;
  budgetByCategory: Array<{ category: string; amount: number }>;
  spentByCategory: Array<[string, number]>;
  stages: PaymentStage[];
  totalContract: number | null;
  completionPct: number | null;
  budgetTotal: number | null;
  spentTotal: number | null;
  releasedTotal: number;
  quotationValue: number | null;
}) {
  const router = useRouter();
  const [stages, setStages] = useState(serverStages);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const spentMap = new Map(spentByCategory);
  const gauge = categoryGauge(budgetByCategory, spentMap);
  const views = stageViews(stages, { totalContract, completionPct });
  const totals = planTotals(views);

  const over = gauge.filter((g) => g.band === "over");
  const gap = releasedTotal - (spentTotal ?? 0);

  return (
    <div className="space-y-4">
      {/* ── the money in one line ── */}
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-5">
        <Tile label="Contract" value={money(totalContract) ?? "—"} />
        <Tile label="Budget" value={money(budgetTotal) ?? "—"} sub="bill of quantities" />
        <Tile label="Spent" value={money(spentTotal) ?? "—"}
          sub={budgetTotal ? `${(((spentTotal ?? 0) / budgetTotal) * 100).toFixed(0)}% of budget` : undefined} />
        <Tile label="Released" value={money(releasedTotal) ?? "0"} sub="cash out of head office" />
        <Tile label="Float on site" value={money(gap) ?? "0"} tone={gap > 0 ? "warn" : undefined}
          sub="released, not written up" />
      </div>

      {error && (
        <p role="alert" className="rounded-md border border-danger/30 bg-danger-soft px-2.5 py-1.5 text-[12px] text-danger">
          {error}
        </p>
      )}

      {over.length > 0 && (
        <p className="flex items-start gap-1.5 rounded-md bg-danger-soft px-2.5 py-1.5 text-[11px] text-danger">
          <AlertTriangle size={12} className="mt-px shrink-0" />
          <span>
            <strong>{over.length}</strong> {over.length === 1 ? "category is" : "categories are"} over budget:{" "}
            {over.slice(0, 4).map((g) => `${g.category} ${pct(g.utilisation, 0) ?? "—"}`).join(" · ")}
            {over.length > 4 && ` and ${over.length - 4} more`}.
          </span>
        </p>
      )}

      {/* ── the gauge ── */}
      <section className="overflow-hidden rounded-lg border border-border bg-bg-elev">
        <header className="flex items-baseline justify-between border-b border-border bg-bg-subtle px-3 py-2">
          <h3 className="text-[12px] font-medium">Budget against actual, by category</h3>
          <span className="text-[11px] text-fg-subtle">worst first · {gauge.length} categories</span>
        </header>
        {gauge.length === 0 ? (
          <p className="px-3 py-6 text-center text-[12px] text-fg-subtle">
            Nothing to show yet — the gauge needs a budget and some spending.
          </p>
        ) : (
          <div className="divide-y divide-border">
            {gauge.map((g) => <GaugeLine key={g.category} row={g} />)}
          </div>
        )}
      </section>

      {/* ── the payment plan ── */}
      <section className="overflow-hidden rounded-lg border border-border bg-bg-elev">
        <header className="flex items-baseline justify-between border-b border-border bg-bg-subtle px-3 py-2">
          <h3 className="text-[12px] font-medium">Payment plan</h3>
          <span className="text-[11px] text-fg-subtle">
            {completionPct === null ? "set completion % on the project" : `${pct(completionPct, 0) ?? "—"} complete`}
          </span>
        </header>

        {stages.length === 0 ? (
          <div className="px-3 py-6 text-center">
            <p className="text-[12px] text-fg-subtle">No payment plan yet.</p>
            <button type="button" disabled={pending}
              onClick={() => start(async () => {
                const res = await seedDefaultStagesAction(projectId);
                if (!res.ok) { setError(res.error!); return; }
                // Shown straight away from what the server just created — this
                // screen owns its list and will not pick them up from a refresh.
                if (res.stages) setStages(res.stages);
                router.refresh();
              })}
              className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-accent-fg disabled:opacity-60">
              {pending ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
              Use the standard 30 / 25 / 25 / 20
            </button>
            <p className="mx-auto mt-2 max-w-md text-[11px] text-fg-subtle">
              That is the workbook&rsquo;s plan for Patamela. It is offered, never applied by
              itself — every amount stays editable afterwards.
            </p>
          </div>
        ) : (
          <>
            <div className="divide-y divide-border">
              {views.map((v) => (
                <StageLine key={v.stage.id} view={v} projectId={projectId}
                  onSaved={(patched) => {
                    setStages((prev) => prev.map((s) => (s.id === patched.id ? patched : s)));
                    router.refresh();
                  }}
                  onError={setError} />
              ))}
            </div>
            <footer className="grid grid-cols-2 gap-px border-t border-border bg-border sm:grid-cols-4">
              <Tile label="Planned" value={money(totals.planned) ?? "—"} small />
              <Tile label="Invoiced" value={money(totals.invoiced) ?? "—"} small />
              <Tile label="Received" value={money(totals.received) ?? "—"} small />
              <Tile label="Billable, not invoiced" value={money(totals.billableNotInvoiced) ?? "—"} small
                tone={totals.billableNotInvoiced > 0 ? "warn" : undefined}
                sub={totals.billableNotInvoiced > 0 ? "you could invoice this now" : undefined} />
            </footer>
          </>
        )}
      </section>

      {quotationValue !== null && budgetTotal !== null && (
        <p className="text-[11px] text-fg-subtle">
          Quotation {money(quotationValue)} − budget {money(budgetTotal)} ={" "}
          <strong>{money(quotationValue - budgetTotal)}</strong> budgeted profit, before withholding tax.
          The full working is on the Overview tab.
        </p>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────── the rows ── */

function GaugeLine({ row }: { row: GaugeRow }) {
  const tone = BAND_TONE[row.band];
  const width = Math.min(100, (row.utilisation ?? 0) * 100);
  return (
    <div className="flex items-center gap-3 px-3 py-1.5">
      <span className="w-40 shrink-0 truncate text-[12px]" title={row.category}>{row.category}</span>
      <span className="h-1.5 flex-1 overflow-hidden rounded-sm bg-bg-muted">
        <span className={cn("block h-full", TONE_BAR[tone])} style={{ width: `${width}%` }} />
      </span>
      <span className="tabular w-24 shrink-0 text-right text-[11px] text-fg-muted">{money(row.actual)}</span>
      <span className="tabular w-24 shrink-0 text-right text-[11px] text-fg-subtle">
        {row.budget > 0 ? money(row.budget) : "no budget"}
      </span>
      {/* The workbook calls this COST CONT — how much of the whole budget this
          category is. It says which overspends actually matter. */}
      <span className="tabular hidden w-12 shrink-0 text-right text-[11px] text-fg-subtle sm:block"
        title="Share of the whole budget">
        {row.share > 0 ? pct(row.share, row.share < 0.01 ? 1 : 0) : "—"}
      </span>
      <span className={cn("tabular w-14 shrink-0 text-right text-[11px] font-medium", TONE_TEXT[tone])}>
        {row.utilisation === null ? "—" : pct(row.utilisation, 0)}
      </span>
    </div>
  );
}

function StageLine({
  view, projectId, onSaved, onError,
}: {
  view: ReturnType<typeof stageViews>[number];
  projectId: number;
  onSaved: (s: PaymentStage) => void;
  onError: (e: string | null) => void;
}) {
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [invoiceAmount, setInvoiceAmount] = useState(view.stage.invoiceAmount ?? "");
  const [invoiceDate, setInvoiceDate] = useState(view.stage.invoiceDate?.slice(0, 10) ?? "");
  const [amountReceived, setAmountReceived] = useState(view.stage.amountReceived ?? "");
  const [receivedDate, setReceivedDate] = useState(view.stage.receivedDate?.slice(0, 10) ?? "");
  const [ipcSubmitted, setIpcSubmitted] = useState(view.stage.ipcSubmitted);
  const [ipcProcessed, setIpcProcessed] = useState(view.stage.ipcProcessed);
  const [efdIssued, setEfdIssued] = useState(view.stage.efdIssued);

  const s = view.stage;
  return (
    <div className="px-3 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[12px] font-medium">{s.label}</span>
          <span className="block text-[11px] text-fg-subtle">
            {s.sharePct && `${pct(num(s.sharePct), 0) ?? "—"} of contract`}
            {s.thresholdPct !== null && ` · billable at ${pct(num(s.thresholdPct), 0) ?? "—"} complete`}
          </span>
        </span>
        <span className={cn("shrink-0 rounded-sm px-1.5 py-0.5 text-[10px] font-medium",
          view.billable === null ? "bg-bg-muted text-fg-muted"
            : view.billable ? "bg-success-soft text-success" : "bg-bg-muted text-fg-muted")}>
          {view.billable === null ? "unknown" : view.billable ? "billable" : "not yet"}
        </span>
        <span className="tabular w-28 shrink-0 text-right text-[12px]">{money(view.amount) ?? "—"}</span>
        <span className="tabular w-28 shrink-0 text-right text-[11px] text-fg-muted">
          {view.received > 0 ? `${money(view.received)} in` : "nothing in"}
        </span>
        <span className="flex shrink-0 items-center gap-1">
          <Mark on={s.ipcSubmitted} label="IPC in" title="Certificate submitted" />
          <Mark on={s.ipcProcessed} label="IPC done" title="Certificate processed" />
          <Mark on={s.efdIssued} label="EFD" title="Fiscal receipt issued" />
        </span>
        <button type="button" onClick={() => setOpen((v) => !v)}
          className="shrink-0 rounded border border-border px-1.5 py-0.5 text-[11px] text-fg-muted hover:text-fg">
          {open ? "Close" : "Invoice"}
        </button>
      </div>

      {/* One phrase naming the FIRST thing holding the money up — the question
          the workbook has the columns for and never asks. */}
      {view.heldUpBy && (
        <p className="mt-1 text-[11px] text-warn">
          {money(view.balance ?? view.amount)} outstanding — {view.heldUpBy}.
        </p>
      )}

      {open && (
        <div className="mt-2 flex flex-wrap items-end gap-2 rounded-md bg-bg-subtle p-2">
          <Small label="Invoice date"><input type="date" value={invoiceDate}
            onChange={(e) => setInvoiceDate(e.target.value)} className={smallInput} /></Small>
          <Small label="Invoice amount"><input value={invoiceAmount} inputMode="decimal"
            onChange={(e) => setInvoiceAmount(e.target.value)} className={cn(smallInput, "tabular text-right")} /></Small>
          <Small label="Date received"><input type="date" value={receivedDate}
            onChange={(e) => setReceivedDate(e.target.value)} className={smallInput} /></Small>
          <Small label="Amount received"><input value={amountReceived} inputMode="decimal"
            onChange={(e) => setAmountReceived(e.target.value)} className={cn(smallInput, "tabular text-right")} /></Small>
          <span className="flex items-end gap-1 pb-0.5">
            <Toggle on={ipcSubmitted} onChange={setIpcSubmitted} label="IPC submitted" />
            <Toggle on={ipcProcessed} onChange={setIpcProcessed} label="IPC processed" />
            <Toggle on={efdIssued} onChange={setEfdIssued} label="EFD receipt" />
          </span>
          <button type="button" disabled={pending}
            onClick={() => start(async () => {
              const res = await updatePaymentStageAction(s.id, projectId, {
                invoiceAmount, invoiceDate, amountReceived, receivedDate,
                ipcSubmitted, ipcProcessed, efdIssued,
              });
              if (!res.ok) { onError(res.error!); return; }
              onSaved({
                ...s,
                invoiceAmount: invoiceAmount.replace(/[\s,]/g, "") || null,
                invoiceDate: invoiceDate || null,
                amountReceived: amountReceived.replace(/[\s,]/g, "") || null,
                receivedDate: receivedDate || null,
                ipcSubmitted, ipcProcessed, efdIssued,
              });
              setOpen(false);
            })}
            className="inline-flex h-8 items-center gap-1.5 rounded-md bg-accent px-2.5 text-[12px] font-medium text-accent-fg disabled:opacity-60">
            {pending ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />} Save
          </button>
          {view.balance !== null && (
            <span className="text-[11px] text-fg-subtle">
              Balance on this stage: {money(view.balance)}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

/** A yes/no mark on the stage row — SNAPSHOT columns E, F and I. */
function Mark({ on, label, title }: { on: boolean; label: string; title: string }) {
  return (
    <span title={`${title}: ${on ? "yes" : "no"}`}
      className={cn("rounded-sm px-1 py-0.5 text-[10px] font-medium",
        on ? "bg-success-soft text-success" : "bg-bg-muted text-fg-subtle")}>
      {label}
    </span>
  );
}

/** The same three, as buttons, inside the editor. */
function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} onClick={() => onChange(!on)}
      className={cn("h-8 rounded-md border px-2 text-[11px]",
        on ? "border-success/40 bg-success-soft text-success" : "border-border bg-bg text-fg-muted")}>
      {on ? "✓ " : ""}{label}
    </button>
  );
}

const smallInput =
  "h-8 w-32 rounded-md border border-border bg-bg px-2 text-[12px] outline-none focus:border-accent";

function Small({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] uppercase tracking-[0.04em] text-fg-subtle">{label}</span>
      {children}
    </label>
  );
}

function Tile({ label, value, sub, tone, small }: {
  label: string; value: string; sub?: string; tone?: "danger" | "warn"; small?: boolean;
}) {
  return (
    <div className="bg-bg-elev px-3 py-2">
      <p className="text-[11px] uppercase tracking-[0.04em] text-fg-subtle">{label}</p>
      <p className={cn("tabular mt-0.5", small ? "text-[13px]" : "text-[15px]",
        tone === "danger" && "text-danger", tone === "warn" && "text-warn")}>{value}</p>
      {sub && <p className="text-[11px] text-fg-subtle">{sub}</p>}
    </div>
  );
}

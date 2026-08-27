"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, Ban, Check, Loader2, Play, ShoppingCart } from "lucide-react";
import { useToast } from "@/components/toast";
import { CocozuriHelp } from "@/components/cocozuri-help";
import { qty as qtyText } from "@/lib/cocozuri-stock-shared";
import {
  planIsDone, planProgress, type CzPlan, type CzPlanMaterial,
} from "@/lib/cocozuri-plan-shared";
import { cancelPlanAction, issuePlanAction, startPlanLineAction } from "@/app/cocozuri/actions";

/* ------------------------------------------------------------------ *
 * One day's plan.
 *
 * ⚠️ NOTHING ON THIS SCREEN MOVES STOCK EXCEPT `Start`, and that opens a real
 * batch through the door that already exists. Everything else is intent.
 * ------------------------------------------------------------------ */

export function CocozuriPlanRecord({
  plan, materials, linesWithoutRecipe,
}: {
  plan: CzPlan;
  materials: CzPlanMaterial[];
  linesWithoutRecipe: number;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState<number | "plan" | null>(null);

  const progress = planProgress(plan.lines);
  const done = planIsDone(plan.lines);
  const short = materials.filter((m) => m.short > 0.0005);

  async function run(what: number | "plan", fn: () => Promise<{ ok: boolean; error?: string }>, ok: string) {
    setBusy(what);
    const res = await fn();
    setBusy(null);
    if (!res.ok) { toast(res.error ?? "That did not work.", { tone: "danger" }); return; }
    toast(ok, { tone: "success" });
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-sm ${
          plan.status === "cancelled" ? "bg-bg-subtle text-fg-subtle"
            : done ? "bg-success/10 text-success"
              : plan.status === "issued" ? "bg-accent/10 text-accent" : "bg-warn/10 text-warn"}`}>
          {plan.status === "cancelled" ? "Cancelled" : done ? "All made" : plan.status === "issued" ? "Issued" : "Draft"}
        </span>

        {plan.status === "draft" && (
          <button type="button" disabled={busy !== null}
            onClick={() => void run("plan", () => issuePlanAction(plan.id), `${plan.reference} issued. It still moves nothing.`)}
            className="inline-flex h-8 items-center gap-1.5 rounded-md bg-accent px-2.5 text-sm font-medium text-accent-fg hover:opacity-90 disabled:opacity-60">
            {busy === "plan" ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} Issue it
          </button>
        )}

        {plan.status !== "cancelled" && plan.lines.every((l) => l.batchId == null || l.batchStatus === "cancelled") && (
          <button type="button" disabled={busy !== null}
            onClick={() => {
              const why = window.prompt("Cancelling says the day's work was never asked for. Why?");
              if (why == null) return;
              void run("plan", () => cancelPlanAction(plan.id, why), `${plan.reference} cancelled.`);
            }}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-sm text-fg-muted transition-colors hover:border-danger hover:text-danger disabled:opacity-60">
            <Ban size={13} /> Cancel
          </button>
        )}

        <span className="grow" />
        <CocozuriHelp title="This plan">
          <p>
            A plan is what the kitchen intends to make. It <strong>moves no stock</strong> — nothing
            is consumed and nothing is made until you press <strong>Start</strong> on a line.
          </p>
          <p>
            <strong>Start</strong> opens a real batch for that line, with the recipe scaled to the
            quantity you asked for. The line then follows that batch: running, then made.
          </p>
          <p>
            <strong>What this will need</strong> adds up the materials for every line together. That
            is the number a single line can never show — three products all wanting the same cream,
            and only enough for two.
          </p>
          <p>
            A line that has been started cannot be changed. The batch is already being measured
            against it.
          </p>
        </CocozuriHelp>
      </div>

      {/* The day at a glance. */}
      <div className="grid gap-3 sm:grid-cols-4">
        <Tile label="Lines" value={String(progress.lines)} />
        <Tile label="Wanted" value={qtyText(progress.wanted)} />
        <Tile label="Made" value={progress.made > 0 ? qtyText(progress.made) : "—"}
          tone={done ? "good" : undefined} />
        <Tile label="Still to make" value={qtyText(progress.outstanding)}
          tone={progress.outstanding > 0 ? "warn" : "good"} />
      </div>

      {/* ⚠️ SAID BEFORE ANYBODY STARTS. A shortfall found halfway through the
          morning is a batch abandoned; found now it is a purchase raised. */}
      {short.length > 0 && plan.status !== "cancelled" && (
        <div className="rounded-lg border border-warn/30 bg-warn/10 px-3.5 py-2.5">
          <p className="flex items-start gap-2 text-sm text-warn">
            <AlertTriangle size={14} className="mt-px shrink-0" />
            <span>
              <strong>{short.length}</strong> material{short.length === 1 ? " is" : "s are"} short for
              this plan. Starting anyway is allowed — the shortfall is recorded against the batch —
              but it is cheaper to know now.
            </span>
          </p>
          <Link href="/cocozuri/order/materials"
            className="mt-2 inline-flex h-7 items-center gap-1.5 rounded-md border border-warn/40 px-2 text-xs text-warn hover:bg-warn/10">
            <ShoppingCart size={12} /> See what to buy
          </Link>
        </div>
      )}

      {/* What is being made. */}
      <div className="overflow-x-auto rounded-lg border border-border bg-bg-elev">
        <div className="min-w-[40rem]">
          <div className="grid grid-cols-[minmax(0,1fr)_130px_85px_95px_110px] items-center gap-2 border-b border-border bg-bg-subtle px-3 py-1.5 text-xs font-medium uppercase tracking-[0.06em] text-fg-subtle">
            <span>Chocolate</span>
            <span>Recipe</span>
            <span className="text-right">Wanted</span>
            <span className="text-right">Made</span>
            <span className="text-right">Batch</span>
          </div>
          {plan.lines.map((line) => (
            <div key={line.id} className="grid grid-cols-[minmax(0,1fr)_130px_85px_95px_110px] items-center gap-2 border-b border-border px-3 py-1.5 last:border-0">
              <span className="min-w-0 truncate text-sm text-fg" title={line.itemName}>
                {line.itemName}
                <span className="ml-1.5 text-xs text-fg-subtle">{line.uom}</span>
                {line.note && <span className="ml-1.5 text-xs text-fg-subtle">{line.note}</span>}
              </span>
              <span className="min-w-0 truncate text-xs text-fg-subtle" title={line.recipeName ?? undefined}>
                {line.recipeName ?? "no recipe"}
              </span>
              <span className="text-right text-sm tabular text-fg-muted">{qtyText(line.qty)}</span>
              <span className={`text-right text-sm tabular ${
                line.batchStatus === "closed" ? "text-fg" : "text-fg-subtle"}`}>
                {/* ⚠️ A RUNNING BATCH HAS MADE NOTHING YET. What it made is
                    settled at close; saying otherwise reports a day as finished
                    while the kitchen is still working. */}
                {line.batchStatus === "closed" ? qtyText(line.madeQty ?? 0) : "—"}
              </span>
              <span className="flex items-center justify-end gap-1">
                {/* ⚠️ A CANCELLED BATCH FREES THE LINE — the work still needs
                    doing, and locking the line to a batch somebody gave up on
                    would leave a whole new plan as the only route. */}
                {line.batchNo && line.batchStatus !== "cancelled" ? (
                  <Link href={`/cocozuri/batches/${encodeURIComponent(line.batchNo)}`}
                    className="truncate text-xs text-accent hover:underline" title={line.batchNo}>
                    {line.batchNo}
                    <span className="ml-1 text-fg-subtle">
                      {line.batchStatus === "running" ? "running" : line.batchStatus === "closed" ? "done" : line.batchStatus}
                    </span>
                  </Link>
                ) : plan.status === "cancelled" ? (
                  <span className="text-xs text-fg-subtle">—</span>
                ) : (
                  <button type="button" disabled={busy !== null}
                    onClick={() => void run(
                      line.id,
                      () => startPlanLineAction(line.id),
                      "Batch opened. Nothing has come off the shelf yet — that happens when it is closed.",
                    )}
                    className="inline-flex h-7 items-center gap-1 rounded-md border border-border px-1.5 text-xs text-fg-muted transition-colors hover:border-accent hover:text-accent disabled:opacity-60">
                    {busy === line.id ? <Loader2 size={11} className="animate-spin" /> : <Play size={11} />} Start
                  </button>
                )}
              </span>
            </div>
          ))}
          {plan.lines.length === 0 && (
            <p className="px-3 py-8 text-center text-sm text-fg-subtle">Nothing is listed on this plan.</p>
          )}
        </div>
      </div>

      {/* ⚠️ THE ROLL-UP IS WHY A PLAN IS WORTH RAISING. */}
      <div className="overflow-x-auto rounded-lg border border-border bg-bg-elev">
        <div className="min-w-[36rem]">
          <div className="flex flex-wrap items-baseline gap-x-2 border-b border-border bg-bg-subtle px-3 py-1.5">
            <span className="text-xs font-medium uppercase tracking-[0.06em] text-fg-subtle">
              What this will need
            </span>
            <span className="text-xs text-fg-subtle">
              Every line&apos;s materials added together, against what is on the shelf now.
            </span>
          </div>

          {/* ⚠️ A LINE WITH NO RECIPE CONTRIBUTES NOTHING, and saying so matters:
              the list would otherwise look complete while being short by
              whatever that line needs. */}
          {linesWithoutRecipe > 0 && (
            <p className="border-b border-border px-3 py-2 text-sm text-warn">
              {linesWithoutRecipe} line{linesWithoutRecipe === 1 ? " has" : "s have"} no recipe, so
              what {linesWithoutRecipe === 1 ? "it needs is" : "they need is"} not counted below.
              This list is short by that much.
            </p>
          )}

          <div className="grid grid-cols-[minmax(0,1fr)_100px_100px_100px] items-center gap-2 border-b border-border px-3 py-1.5 text-xs font-medium uppercase tracking-[0.06em] text-fg-subtle">
            <span>Material</span>
            <span className="text-right">Needs</span>
            <span className="text-right">On shelf</span>
            <span className="text-right">Short</span>
          </div>
          {materials.map((m) => (
            <div key={m.itemId} className="grid grid-cols-[minmax(0,1fr)_100px_100px_100px] items-center gap-2 border-b border-border px-3 py-1.5 last:border-0">
              <span className="min-w-0 truncate text-sm text-fg" title={m.itemName}>
                {m.itemName}
                <span className="ml-1.5 text-xs text-fg-subtle">{m.uom}</span>
              </span>
              <span className="text-right text-sm tabular text-fg-muted">{qtyText(m.needed)}</span>
              <span className="text-right text-sm tabular text-fg-subtle">{qtyText(m.onHand)}</span>
              <span className={`text-right text-sm tabular ${m.short > 0 ? "text-danger" : "text-success"}`}>
                {m.short > 0 ? qtyText(m.short) : "enough"}
              </span>
            </div>
          ))}
          {materials.length === 0 && (
            <p className="px-3 py-6 text-center text-sm text-fg-subtle">
              {linesWithoutRecipe > 0
                ? "No line on this plan has a recipe, so nothing can be worked out."
                : "Nothing to work out yet."}
            </p>
          )}
        </div>
      </div>

      {plan.notes && (
        <p className="rounded-lg border border-border bg-bg-elev px-3.5 py-2.5 text-sm text-fg-muted">
          {plan.notes}
        </p>
      )}
    </div>
  );
}

function Tile({ label, value, tone }: { label: string; value: string; tone?: "good" | "warn" }) {
  return (
    <div className="rounded-lg border border-border bg-bg-elev px-3.5 py-3">
      <span className={`block truncate text-lg font-semibold leading-none tabular ${
        tone === "good" ? "text-success" : tone === "warn" ? "text-warn" : "text-fg"}`}>
        {value}
      </span>
      <span className="mt-1 block text-sm text-fg-muted">{label}</span>
    </div>
  );
}

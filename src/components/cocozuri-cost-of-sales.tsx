"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, BookOpen, Loader2 } from "lucide-react";
import { useToast } from "@/components/toast";
import { money } from "@/lib/cocozuri-shared";
import { qty as qtyText } from "@/lib/cocozuri-stock-shared";
import {
  postCostOfSalesAction, postStocktakeAction, unpostCostOfSalesAction, unpostStocktakeAction,
} from "@/app/cocozuri/actions";

/* ------------------------------------------------------------------ *
 * One month's cost of sales, into the books.
 *
 * ⚠️ THIS IS WHAT MAKES THE PROFIT AND LOSS REAL. Until it runs, selling posts
 * Dr debtors · Cr sales · Cr VAT and touches stock not at all — so the stock
 * account grows for ever and the P&L shows revenue with nothing against it.
 * ------------------------------------------------------------------ */

export function CocozuriCostOfSales({
  year, month, label, value, complete, unknown, countAdjustment, lineCount,
  booksState, ready, reason, stocktake,
}: {
  year: number;
  month: number;
  label: string;
  value: number;
  complete: boolean;
  unknown: string[];
  countAdjustment: number;
  lineCount: number;
  booksState: "unposted" | "posted" | "reversed";
  ready: boolean;
  reason: string | null;
  /** ⚠️ Stage 8 — what a stock-take found, which is a DIFFERENT figure with its
   *  own account and its own posting. Never folded into the cost of sales. */
  stocktake: { value: number; complete: boolean; unknown: string[]; lineCount: number; booksState: "unposted" | "posted" | "reversed" };
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

  async function run(label: string, fn: () => Promise<{ ok: boolean; error?: string }>) {
    setBusy(true);
    const res = await fn();
    setBusy(false);
    if (!res.ok) { toast(res.error ?? "That did not work.", { tone: "danger" }); return; }
    toast(label, { tone: "success" });
    router.refresh();
  }

  // ⚠️ Not `lineCount === 0` alone: a month can move nothing off the shelf and
  // still have a stock-take to answer for, and hiding it would lose the finding.
  if (lineCount === 0 && stocktake.lineCount === 0) return null;

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-bg-elev px-3.5 py-3">
      <div className={`flex flex-wrap items-center gap-2 ${lineCount === 0 ? "hidden" : ""}`}>
        <span className="text-sm text-fg-muted">
          {label}: <strong className="text-fg">{complete ? "" : "≥ "}{money(value)}</strong> of
          chocolate left the shelf across {lineCount} line{lineCount === 1 ? "" : "s"}.
        </span>
        <span className="grow" />
        {booksState === "posted" ? (
          <button type="button" disabled={busy}
            onClick={() => {
              const why = window.prompt(`Taking ${label}'s cost of sales back out of the books. Why?`);
              if (why == null) return;
              void run("Taken back out — with a reversal, not an erasure.", () => unpostCostOfSalesAction(year, month, why));
            }}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-sm text-fg-muted hover:text-fg disabled:opacity-60">
            <BookOpen size={13} /> Take out of the books
          </button>
        ) : (
          <button type="button" disabled={busy || !ready || !complete}
            title={!ready ? reason ?? undefined : !complete ? "Some of what was sold has never been costed." : undefined}
            onClick={() => void run(`${label}'s cost of sales is in the books.`, () => postCostOfSalesAction(year, month))}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-sm text-fg-muted hover:text-fg disabled:opacity-60">
            {busy ? <Loader2 size={13} className="animate-spin" /> : <BookOpen size={13} />} Put the cost in the books
          </button>
        )}
      </div>

      {booksState === "posted" && (
        <p className="text-xs text-success">
          Posted — Dr cost of goods sold, Cr stock. The month&apos;s profit and loss is real.
        </p>
      )}
      {booksState === "reversed" && (
        <p className="text-xs text-fg-subtle">This month&apos;s posting has been reversed.</p>
      )}

      {/* ⚠️ Refused rather than posted short: understating the cost overstates
          the profit, which is the one direction of error nobody notices. */}
      {!complete && (
        <p className="flex items-start gap-2 text-xs text-warn">
          <AlertTriangle size={12} className="mt-px shrink-0" />
          <span>
            Nothing has ever been bought or made at a known cost for{" "}
            <strong>{unknown.slice(0, 3).join(", ")}</strong>
            {unknown.length > 3 ? ` and ${unknown.length - 3} more` : ""}, so this cannot go in the
            books yet — posting only what is known would flatter the profit.
          </span>
        </p>
      )}

      {/* ⚠️ A SEPARATE FIGURE WITH A SEPARATE ACCOUNT (Stage 8). A stock-take
          difference is a real change in what the company owns, but it is not the
          cost of SELLING anything — folding it in would flatter or damn the
          margin for something that happened on a shelf. */}
      {stocktake.lineCount > 0 && (
        <div className="flex flex-col gap-1.5 border-t border-border pt-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-fg-muted">
              A stock-take moved {qtyText(Math.abs(countAdjustment))} this month
              {stocktake.value !== 0 && (
                <> — worth <strong className={stocktake.value < 0 ? "text-danger" : "text-success"}>
                  {stocktake.complete ? "" : "at least "}{money(Math.abs(stocktake.value))}
                </strong> {stocktake.value < 0 ? "short" : "more than the book said"}</>
              )}.
            </span>
            <span className="grow" />
            {stocktake.booksState === "posted" ? (
              <button type="button" disabled={busy}
                onClick={() => {
                  const why = window.prompt(`Taking ${label}'s stock-take back out of the books. Why?`);
                  if (why == null) return;
                  void run("Taken back out — a reversal, not an erasure.", () => unpostStocktakeAction(year, month, why));
                }}
                className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-sm text-fg-muted hover:text-fg disabled:opacity-60">
                <BookOpen size={13} /> Take out of the books
              </button>
            ) : (
              <button type="button" disabled={busy || !ready || !stocktake.complete || stocktake.value === 0}
                title={!ready ? reason ?? undefined : !stocktake.complete ? "Some of what the count moved has never been costed." : undefined}
                onClick={() => void run(`${label}'s stock-take is in the books.`, () => postStocktakeAction(year, month))}
                className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-sm text-fg-muted hover:text-fg disabled:opacity-60">
                <BookOpen size={13} /> Put the difference in the books
              </button>
            )}
          </div>
          <p className="text-xs text-fg-subtle">
            It goes to <strong>6940 Stock gains and losses</strong>, kept apart from breakage
            somebody wrote down — merging the two would hide which of them is getting worse.
          </p>
          {!stocktake.complete && (
            <p className="text-xs text-warn">
              Nothing has ever been bought or made at a known cost for{" "}
              {stocktake.unknown.slice(0, 3).join(", ")}, so this cannot go in the books yet.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

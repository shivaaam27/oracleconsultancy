"use client";

// ─────────────────────────────────────────────────────────────────────────────
// THE PO BALANCE — what each order still owes us.
//
// The workbook's column AK, `W - AJ`: the order's value less the invoice's.
// The subtraction is right; two things about it are not.
//
// ⚠️ It subtracts even when it cannot. An order with an unpriced line has an
// UNKNOWN balance, and printing one anyway gives a figure that looks
// authoritative and is not. Here such a PO says so and is counted separately.
//
// ⚠️ Its invoice value is copied down every line of a group, so a PO covered by
// one invoice across four lines reads as billed four times. Here a document is
// counted once however many lines it carries.
// ─────────────────────────────────────────────────────────────────────────────

import Link from "next/link";
import { cn } from "@/lib/cn";
import { money } from "@/lib/ops-orders-shared";
import { type PoBalance, type BalanceTotals } from "@/lib/ops-invoices-shared";

export function PoBalances({
  rows, totals, companyId,
}: {
  rows: PoBalance[];
  totals: BalanceTotals;
  companyId: number;
}) {
  if (rows.length === 0) return null;

  return (
    <section className="overflow-hidden rounded-lg border border-border bg-bg-elev">
      <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border px-3 py-2">
        <h3 className="text-sm font-medium">What each order still owes us</h3>
        <p className="text-xs text-fg-subtle">
          Ordered less billed, biggest first
          {totals.unknown > 0 && ` · ${totals.unknown} could not be worked out`}
        </p>
      </header>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[680px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-border text-xs uppercase tracking-[0.04em] text-fg-subtle">
              <Th className="text-left">PO</Th>
              <Th className="text-left">Client</Th>
              <Th>Lines</Th>
              <Th>Gone out</Th>
              <Th className="text-right">Ordered</Th>
              <Th className="text-right">Billed</Th>
              <Th className="text-right">Still to bill</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.poNo} className="border-b border-border/60 last:border-0">
                <Td className="text-left">
                  {/* Every number a door: the PO opens its lines on the orders screen. */}
                  <Link href={`/ops?co=${companyId}&oq=${encodeURIComponent(r.poNo)}`}
                    className="font-mono text-accent hover:underline">
                    {r.poNo}
                  </Link>
                </Td>
                <Td className="text-left text-fg-muted">{r.client ?? "—"}</Td>
                <Td className="tabular">{r.lines}</Td>
                <Td className={cn("tabular",
                  r.deliveredLines === 0 ? "text-fg-subtle"
                  : r.deliveredLines < r.lines ? "text-warn" : "text-success")}>
                  {r.deliveredLines} of {r.lines}
                  {r.partLines > 0 && (
                    <span className="ml-1 text-xs text-warn"
                      title={`${r.partLines} line${r.partLines === 1 ? "" : "s"} only part-delivered`}>
                      part
                    </span>
                  )}
                </Td>
                <Td className="tabular text-right">
                  {r.orderedTzs === null
                    ? <span className="text-fg-subtle" title={
                        `${r.unpriced} line${r.unpriced === 1 ? "" : "s"} on this PO have no price, ` +
                        `so what it is worth — and therefore what is still to bill — is not known.`
                      }>not known</span>
                    : money(r.orderedTzs)}
                </Td>
                <Td className="tabular text-right text-fg-muted">
                  {r.billedTzs === null ? "—" : money(r.billedTzs)}
                </Td>
                <Td className={cn("tabular text-right",
                  r.balanceTzs === null ? "text-fg-subtle"
                  : r.balanceTzs > 0.005 ? "text-warn"
                  : r.balanceTzs < -0.005 ? "text-danger" : "text-success")}>
                  {r.balanceTzs === null ? "—"
                    : Math.abs(r.balanceTzs) < 0.005 ? "settled"
                    // ⚠️ Over-billing shows as a negative rather than being
                    // clamped at nil — it is a mistake worth finding.
                    : money(r.balanceTzs)}
                </Td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-border bg-bg-subtle text-sm">
              <Td className="text-left font-medium">{totals.pos} orders</Td>
              <Td className="text-left text-fg-subtle">{totals.complete} finished</Td>
              <Td /><Td />
              <Td className="tabular text-right">{money(totals.ordered)}</Td>
              <Td className="tabular text-right">{money(totals.billed)}</Td>
              <Td className="tabular text-right text-warn">{money(totals.outstanding)}</Td>
            </tr>
          </tfoot>
        </table>
      </div>

      {totals.unknown > 0 && (
        <footer className="border-t border-border px-3 py-1.5 text-xs text-fg-subtle">
          {totals.unknown} order{totals.unknown === 1 ? " is" : "s are"} left out of these totals
          because a line on {totals.unknown === 1 ? "it has" : "them has"} no price. The workbook
          subtracts anyway and prints a balance that reads as though somebody checked it.
        </footer>
      )}
    </section>
  );
}

function Th({ children, className }: { children?: React.ReactNode; className?: string }) {
  return <th className={cn("px-2.5 py-1.5 text-center font-normal", className)}>{children}</th>;
}

function Td({ children, className }: { children?: React.ReactNode; className?: string }) {
  return <td className={cn("px-2.5 py-1.5 text-center", className)}>{children}</td>;
}

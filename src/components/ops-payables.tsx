"use client";

// ─────────────────────────────────────────────────────────────────────────────
// WHAT WE OWE, AND HOW OLD IT IS — the workbook's PAYMENTS FORECAST, finished.
//
// That sheet has eight cells filled in the whole thing. The ageing it was meant
// to produce lives in IMP PMT AND FREIGHT instead, where the bands are typed by
// hand next to figures that no longer recalculate.
//
// ⚠️ The bands are the workbook's OWN words — CURRENT, 0 - 30 DAYS, 31 - 60
// DAYS, 61 - 90 DAYS, OVER 90 DAYS — so a figure here can be checked against a
// figure there.
// ─────────────────────────────────────────────────────────────────────────────

import Link from "next/link";
import { cn } from "@/lib/cn";
import { money } from "@/lib/ops-orders-shared";
import type { PayeeBalance, PayableTotals } from "@/lib/ops-payments-shared";

const BAND_TONE: Record<string, string> = {
  "CURRENT": "text-success",
  "0 - 30 DAYS": "text-fg-muted",
  "31 - 60 DAYS": "text-warn",
  "61 - 90 DAYS": "text-warn",
  "OVER 90 DAYS": "text-danger",
};

export function OpsPayables({
  rows, totals, companyId,
}: {
  rows: PayeeBalance[];
  totals: PayableTotals;
  companyId: number;
}) {
  if (rows.length === 0) return null;

  return (
    <section className="overflow-hidden rounded-lg border border-border bg-bg-elev">
      <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border px-3 py-2">
        <h3 className="text-sm font-medium">What we owe, and to whom</h3>
        <p className="text-xs text-fg-subtle">
          Billed less paid, biggest first
          {totals.unknown > 0 && ` · ${totals.unknown} could not be worked out`}
        </p>
      </header>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-border text-xs uppercase tracking-[0.04em] text-fg-subtle">
              <Th className="text-left">Paid to</Th>
              <Th>Payments</Th>
              <Th className="text-right">Billed</Th>
              <Th className="text-right">Paid</Th>
              <Th className="text-right">Still owed</Th>
              <Th className="text-left">Oldest</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.payee} className="border-b border-border/60 last:border-0">
                <Td className="text-left">
                  <Link href={`/ops/payments?co=${companyId}&pq=${encodeURIComponent(r.payee)}`}
                    className="text-accent hover:underline">{r.payee}</Link>
                </Td>
                <Td className="tabular text-fg-muted">{r.payments || "—"}</Td>
                <Td className="tabular text-right">
                  {r.billedTzs === null
                    ? <span className="text-fg-subtle" title={
                        `${r.uncosted} purchase${r.uncosted === 1 ? "" : "s"} from them have no cost on them, ` +
                        `so what is owed cannot be worked out.`
                      }>not costed</span>
                    : money(r.billedTzs)}
                </Td>
                <Td className="tabular text-right text-fg-muted">
                  {r.paidTzs === null ? "—" : money(r.paidTzs)}
                </Td>
                <Td className={cn("tabular text-right",
                  r.owedTzs === null ? "text-fg-subtle"
                  : r.owedTzs > 0.005 ? "text-warn"
                  // ⚠️ Overpaid shows as a negative rather than "settled" — it
                  // is money sitting with a supplier and worth chasing.
                  : r.owedTzs < -0.005 ? "text-accent" : "text-success")}>
                  {r.owedTzs === null ? "—"
                    : Math.abs(r.owedTzs) < 0.005 ? "settled"
                    : r.owedTzs < 0 ? `${money(r.owedTzs)} in credit`
                    : money(r.owedTzs)}
                </Td>
                <Td className="text-left">
                  {r.worstAgeing
                    ? <span className={cn("text-xs", BAND_TONE[r.worstAgeing] ?? "text-fg-muted")}>
                        {r.worstAgeing}
                        {r.oldestOverdueDays !== null && r.oldestOverdueDays > 0
                          && <span className="ml-1 text-fg-subtle">({r.oldestOverdueDays}d)</span>}
                      </span>
                    : <span className="text-xs text-fg-subtle">—</span>}
                </Td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-border bg-bg-subtle text-sm">
              <Td className="text-left font-medium">
                {totals.payees} payee{totals.payees === 1 ? "" : "s"}
              </Td>
              <Td />
              <Td className="tabular text-right">{money(totals.billed)}</Td>
              <Td className="tabular text-right">{money(totals.paid)}</Td>
              <Td className="tabular text-right text-warn">{money(totals.owed)}</Td>
              <Td className="text-left text-xs text-fg-subtle">
                {totals.advance > 0 ? `${money(totals.advance)} in advance` : ""}
              </Td>
            </tr>
          </tfoot>
        </table>
      </div>

      <footer className="border-t border-border px-3 py-1.5 text-xs text-fg-subtle">
        A purchase with no cost on it is left out of these totals and counted separately — you
        cannot subtract from a figure nobody has worked out. Ageing runs from the supplier&apos;s
        own due date, and stops the moment a purchase is settled.
      </footer>
    </section>
  );
}

function Th({ children, className }: { children?: React.ReactNode; className?: string }) {
  return <th className={cn("px-2.5 py-1.5 text-center font-normal", className)}>{children}</th>;
}

function Td({ children, className, title }: {
  children?: React.ReactNode; className?: string; title?: string;
}) {
  return <td title={title} className={cn("px-2.5 py-1.5 text-center", className)}>{children}</td>;
}

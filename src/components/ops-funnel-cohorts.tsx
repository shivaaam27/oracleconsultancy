"use client";

// ─────────────────────────────────────────────────────────────────────────────
// THE CONVERSION, BY MONTH OF ENQUIRY — what MONTHLY ANALYSIS should have been.
//
// Every figure on a row is about the SAME enquiries: the ones that came in that
// month. An order won in August against a June enquiry is counted in June.
//
// The sheet divides a month's orders by a different month's quotes, which is
// why its Aug-26 row reads 132% — a number that cannot mean anything. Nothing
// here can exceed 100%.
//
// ⚠️ A month with live enquiries left in it is NOT FINISHED, and its rate is
// shown as a floor ("at least 21%"). It can only rise. The alternative is what
// the sheet does: print this month at 4% next to last year's 21% and invite the
// reader to conclude the business is collapsing.
// ─────────────────────────────────────────────────────────────────────────────

import { cn } from "@/lib/cn";
import { money } from "@/lib/ops-orders-shared";
import { type Cohort } from "@/lib/ops-funnel-shared";

export function FunnelCohorts({ cohorts }: { cohorts: Cohort[] }) {
  if (cohorts.length === 0) return null;

  const live = cohorts.filter((c) => !c.settled).length;

  return (
    <section className="overflow-hidden rounded-lg border border-border bg-bg-elev">
      <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border px-3 py-2">
        <h3 className="text-sm font-medium">Conversion, by the month the client asked</h3>
        <p className="text-xs text-fg-subtle">
          An order counts in the month of its enquiry, not the month it landed
          {live > 0 && ` · ${live} month${live === 1 ? "" : "s"} still open`}
        </p>
      </header>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-border text-xs uppercase tracking-[0.04em] text-fg-subtle">
              <Th className="text-left">Month</Th>
              <Th>Enquiries</Th>
              <Th>Quoted</Th>
              <Th>Quote rate</Th>
              <Th>Orders</Th>
              <Th>Win rate</Th>
              <Th className="text-right">Quoted value</Th>
              <Th className="text-right">Order value</Th>
              <Th>Typical wait</Th>
              <Th className="text-left">Still open</Th>
            </tr>
          </thead>
          <tbody>
            {cohorts.map((c) => (
              <tr key={c.month} className="border-b border-border/60 last:border-0">
                <Td className="text-left font-medium">{c.label}</Td>
                <Td className="tabular">{c.enquiries}</Td>
                <Td className="tabular">{c.quoted}</Td>
                <Td><Rate value={c.quoteRate} settled={c.settled} /></Td>
                <Td className="tabular">{c.ordered}</Td>
                <Td><Rate value={c.orderRate} settled={c.settled} /></Td>
                <Td className="tabular text-right">{c.quoteValue > 0 ? money(c.quoteValue) : "—"}</Td>
                <Td className="tabular text-right">
                  {c.orderValue > 0 ? money(c.orderValue) : "—"}
                  {c.unvalued > 0 && (
                    <span className="ml-1 text-xs text-warn" title={
                      `${c.unvalued} enquir${c.unvalued === 1 ? "y" : "ies"} in this month have no value ` +
                      `recorded — a quote with no figure, or a won order with no priced line. ` +
                      `They are counted, but they are not in this total.`
                    }>
                      +{c.unvalued}?
                    </span>
                  )}
                </Td>
                <Td className="tabular text-fg-muted">
                  {c.medianDaysToOrder === null ? "—" : `${c.medianDaysToOrder}d`}
                </Td>
                <Td className="text-left">
                  {c.open === 0
                    ? <span className="text-xs text-success">finished</span>
                    : <span className="text-xs text-fg-muted">{c.open} live</span>}
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <footer className="border-t border-border px-3 py-1.5 text-xs text-fg-subtle">
        Win rate is orders ÷ quotes <em>within the same month&apos;s enquiries</em>, so it can never
        pass 100%. A month still holding live enquiries shows a floor — the figure can only rise.
        {cohorts.some((c) => c.unvalued > 0) && " A “+n?” marks enquiries with no value recorded."}
      </footer>
    </section>
  );
}

function Rate({ value, settled }: { value: number | null; settled: boolean }) {
  if (value === null) return <span className="text-fg-subtle">—</span>;
  return (
    <span className={cn("tabular", !settled && "text-fg-muted")}>
      {!settled && <span className="mr-0.5 text-xs">≥</span>}
      {(value * 100).toFixed(0)}%
    </span>
  );
}

function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return <th className={cn("px-2.5 py-1.5 text-center font-normal", className)}>{children}</th>;
}

function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  return <td className={cn("px-2.5 py-1.5 text-center", className)}>{children}</td>;
}

"use client";

// ─────────────────────────────────────────────────────────────────────────────
// FUNDS ANALYSIS — the money, batch by batch.
//
// The workbook's FUNDS ANALYSIS sheet: one row per requisition batch (PT-01,
// PT-02 …) showing what was asked for, what head office allowed, what actually
// arrived, and — the useful one — the budget counting DOWN.
//
// Read-only on purpose. Every figure here is a sum of things entered elsewhere,
// so there is nothing to type; editing happens on Requisitions. That is why it
// carries no forms and no borders round each row.
// ─────────────────────────────────────────────────────────────────────────────

import { cn } from "@/lib/cn";
import { fmtMoney } from "@/lib/money-format";
import { pct, fmtDate } from "@/lib/projects-shared";
import type { FundsSummary } from "@/lib/project-funds-shared";

export function ProjectFundsSheet({
  funds, budget, currency,
}: {
  funds: FundsSummary;
  budget: number | null;
  currency: string;
}) {
  const { rows, totals } = funds;
  const m = (v: number | null) => fmtMoney(v, currency, { symbol: false }) ?? "—";

  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-bg-elev p-6 text-center">
        <p className="text-[13px] font-medium">Nothing requested yet</p>
        <p className="mx-auto mt-1 max-w-md text-[12px] text-fg-subtle">
          This page groups requisitions by their batch number — PT-01, PT-02 — and
          counts the budget down as head office approves them. It fills in as soon
          as the first request is raised.
        </p>
      </div>
    );
  }

  const last = rows[rows.length - 1];

  return (
    <div className="space-y-4">
      {/* ── where the budget stands ── */}
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-4">
        <Tile label="Budget" value={m(budget)} sub="bill of quantities" />
        <Tile label="Approved so far" value={m(totals.approved)}
          sub={totals.utilisation === null ? undefined : `${pct(totals.utilisation, 0)} of budget`} />
        <Tile label="Budget left" value={m(totals.remaining)}
          tone={totals.remaining !== null && totals.remaining < 0 ? "danger" : undefined}
          sub="after every approval" />
        <Tile label="Head office trimmed" value={m(totals.trimmed)}
          sub={totals.pending > 0 ? `${m(totals.pending)} still undecided` : "of what was decided"} />
      </div>

      {/* ── the countdown, as a bar ── */}
      {budget !== null && budget > 0 && (
        <div>
          <div className="mb-1 flex items-baseline justify-between text-[11px]">
            <span className="text-fg-muted">Budget consumed by approvals</span>
            <span className="tabular">{pct(totals.utilisation, 1) ?? "—"}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-sm bg-bg-muted">
            <div
              className={cn("h-full", (totals.utilisation ?? 0) > 1 ? "bg-danger" : "bg-accent")}
              style={{ width: `${Math.min(100, (totals.utilisation ?? 0) * 100)}%` }}
            />
          </div>
          <p className="mt-1 text-[11px] text-fg-subtle">
            {m(last.diminishing)} of budget left after {rows.length} batch{rows.length === 1 ? "" : "es"}.
            This is the workbook&rsquo;s &ldquo;diminishing budget&rdquo; column.
          </p>
        </div>
      )}

      {/* ── the sheet ── */}
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[1040px] border-collapse bg-bg-elev text-[12px]">
          <thead>
            <tr className="border-b border-border bg-bg-subtle text-[10px] uppercase tracking-[0.04em] text-fg-subtle">
              <th className="px-2 py-1.5 text-left font-medium">Batch</th>
              <th className="px-2 py-1.5 text-right font-medium">Requested</th>
              <th className="px-2 py-1.5 text-right font-medium">Approved</th>
              <th className="px-2 py-1.5 text-right font-medium">Trimmed</th>
              <th className="px-2 py-1.5 text-right font-medium">Undecided</th>
              <th className="px-2 py-1.5 text-right font-medium">Received</th>
              <th className="px-2 py-1.5 text-right font-medium">Not yet received</th>
              <th className="px-2 py-1.5 text-right font-medium" title="Cash actually released against this batch, and who it went through">
                Cash released
              </th>
              <th className="px-2 py-1.5 text-right font-medium">Budget left</th>
              <th className="px-2 py-1.5 text-right font-medium">Used</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.batchNo} className="border-b border-border/60">
                <td className="px-2 py-1.5">
                  <span className="block font-medium">{r.batchNo}</span>
                  <span className="block text-[10px] text-fg-subtle">
                    {[fmtDate(r.firstDate), `${r.requests} request${r.requests === 1 ? "" : "s"}`]
                      .filter(Boolean).join(" · ")}
                    {r.awaitingApproval && " · not approved yet"}
                  </span>
                </td>
                <td className="px-2 py-1.5 text-right tabular">{m(r.requested)}</td>
                <td className={cn("px-2 py-1.5 text-right tabular", r.awaitingApproval && "text-fg-subtle")}>
                  {r.awaitingApproval ? "—" : m(r.approved)}
                </td>
                <td className={cn("px-2 py-1.5 text-right tabular", r.trimmed > 0 && "text-warn")}>
                  {r.trimmed > 0 ? m(r.trimmed) : "—"}
                </td>
                <td className={cn("px-2 py-1.5 text-right tabular", r.pending > 0 && "text-warn")}
                  title="Asked for, but nobody has approved or refused it yet">
                  {r.pending > 0 ? m(r.pending) : "—"}
                </td>
                <td className="px-2 py-1.5 text-right tabular">{r.actual > 0 ? m(r.actual) : "—"}</td>
                <td className={cn("px-2 py-1.5 text-right tabular", r.underSpent > 0 && "text-warn")}>
                  {r.underSpent > 0 ? m(r.underSpent) : "—"}
                </td>
                <td className="px-2 py-1.5 text-right">
                  {/* Nothing released is a dash, not a zero: a batch settled
                      outside this ledger must not read as money withheld. */}
                  {r.released === 0 ? (
                    <span className="text-fg-subtle">—</span>
                  ) : (
                    <>
                      <span className="block tabular">{m(r.released)}</span>
                      <span className="block text-[10px] text-fg-subtle">
                        {Object.entries(r.releasedBy)
                          .sort((a, b) => b[1] - a[1])
                          .map(([route, amt]) => `${route} ${m(amt)}`)
                          .join(" · ")}
                        {r.lastPaidDate && ` · ${fmtDate(r.lastPaidDate)}`}
                      </span>
                      {r.notYetReleased !== null && r.notYetReleased > 0.005 && (
                        <span className="block text-[10px] text-warn">
                          {m(r.notYetReleased)} approved, not sent
                        </span>
                      )}
                    </>
                  )}
                </td>
                <td className={cn("px-2 py-1.5 text-right tabular",
                  r.diminishing !== null && r.diminishing < 0 && "text-danger")}>
                  {m(r.diminishing)}
                </td>
                <td className="px-2 py-1.5 text-right tabular text-fg-muted">
                  {pct(r.utilisation, 0) ?? "—"}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-border bg-bg-subtle font-medium">
              <td className="px-2 py-1.5">Total</td>
              <td className="px-2 py-1.5 text-right tabular">{m(totals.requested)}</td>
              <td className="px-2 py-1.5 text-right tabular">{m(totals.approved)}</td>
              <td className="px-2 py-1.5 text-right tabular">{m(totals.trimmed)}</td>
              <td className="px-2 py-1.5 text-right tabular">{m(totals.pending)}</td>
              <td className="px-2 py-1.5 text-right tabular">{m(totals.actual)}</td>
              <td className="px-2 py-1.5 text-right tabular">{m(last.cumulative)}</td>
              <td className="px-2 py-1.5 text-right tabular">{m(totals.released)}</td>
              <td className="px-2 py-1.5 text-right tabular">{m(totals.remaining)}</td>
              <td className="px-2 py-1.5 text-right tabular">{pct(totals.utilisation, 0) ?? "—"}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <p className="text-[11px] text-fg-subtle">
        Amounts are in {currency}. Rejected and cancelled requests are left out —
        the spreadsheet has no notion of either, so its batch totals quietly
        include money that was refused. Everything here is worked out from the
        Requisitions tab; there is nothing to type on this page.
      </p>
    </div>
  );
}

function Tile({ label, value, sub, tone }: {
  label: string; value: string; sub?: string; tone?: "danger";
}) {
  return (
    <div className="bg-bg-elev px-3 py-2">
      <p className="text-[11px] uppercase tracking-[0.04em] text-fg-subtle">{label}</p>
      <p className={cn("tabular mt-0.5 text-[15px]", tone === "danger" && "text-danger")}>{value}</p>
      {sub && <p className="text-[11px] text-fg-subtle">{sub}</p>}
    </div>
  );
}

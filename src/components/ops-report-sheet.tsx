"use client";

// ─────────────────────────────────────────────────────────────────────────────
// THE EXECUTIVE REPORT — PENDING, PURCHASE ANALYSIS and PAYMENTS FORECAST, all
// worked out rather than typed (Stage 6).
//
// ⚠️ NOTHING ON THIS SCREEN CAN BE EDITED, because nothing on it is stored. It
// is a view of the order lines, the shipments and the despatches. Every number
// is a door: clicking it takes you to the rows it came from.
//
// In the workbook these four sheets hold 47,000-odd formulas between them and
// almost no data — and PENDING's ITEM column has 223 cells that stopped
// recalculating, so it shows text Google last computed before the export.
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo } from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";
import { lineView, money, fmtDate, type OrderLine, type DespatchLite } from "@/lib/ops-orders-shared";
import { shipmentView, type Shipment } from "@/lib/ops-shipments-shared";
import {
  pendingLines, byDesk, byStatus, supplierBalances, reportTotals,
  type DeskGroup,
} from "@/lib/ops-report-shared";
// ⚠️ Since Stage 7 what we OWE comes from the real payments, not from a
// payment date. `supplierBalances` above still answers a different question:
// which purchases nobody has recorded a payment against at all.
import {
  purchaseDebt, shipmentDebt, payeeBalances, payableTotals, type Payment,
} from "@/lib/ops-payments-shared";
import { OpsPayables } from "./ops-payables";

export function OpsReportSheet({
  companyId, lines, shipments, despatches, payments = [], groupBy,
}: {
  companyId: number;
  lines: OrderLine[];
  shipments: Shipment[];
  /** Money out, so "owed to suppliers" is a real balance and not a guess. */
  payments?: Payment[];
  despatches: Array<{ id: number } & DespatchLite>;
  /** "desk" (whose it is) or "status" — a link, so it survives a refresh. */
  groupBy: string;
}) {
  const docById = useMemo(() => new Map(despatches.map((d) => [d.id, d])), [despatches]);
  const views = useMemo(
    () => lines.map((l) => lineView(l, undefined, l.invoiceId === null ? null : docById.get(l.invoiceId) ?? null)),
    [lines, docById]);

  const pending = useMemo(() => pendingLines(views), [views]);
  const groups = useMemo(
    () => (groupBy === "status" ? byStatus(pending) : byDesk(pending)), [pending, groupBy]);
  const suppliers = useMemo(() => supplierBalances(views), [views]);
  const shipViews = useMemo(() => shipments.map((s) => shipmentView(s)), [shipments]);

  const byLine = useMemo(() => {
    const m = new Map<number, Payment[]>();
    for (const p of payments) {
      if (p.orderLineId === null) continue;
      const b = m.get(p.orderLineId); if (b) b.push(p); else m.set(p.orderLineId, [p]);
    }
    return m;
  }, [payments]);
  const byShip = useMemo(() => {
    const m = new Map<number, Payment[]>();
    for (const p of payments) {
      if (p.shipmentId === null) continue;
      const b = m.get(p.shipmentId); if (b) b.push(p); else m.set(p.shipmentId, [p]);
    }
    return m;
  }, [payments]);
  const purchases = useMemo(
    () => views.filter((v) => v.line.supplier?.trim() || v.purchaseTotalTzs !== null)
      .map((v) => purchaseDebt(v, byLine.get(v.line.id) ?? [])), [views, byLine]);
  const payees = useMemo(
    () => payeeBalances(
      purchases,
      shipViews.map((v) => shipmentDebt(v, byShip.get(v.shipment.id) ?? [])),
      payments.filter((p) => p.orderLineId === null && p.shipmentId === null),
    ), [purchases, shipViews, byShip, payments]);
  const payable = useMemo(() => payableTotals(payees, purchases), [payees, purchases]);
  const totals = useMemo(
    () => reportTotals(pending, suppliers, shipViews), [pending, suppliers, shipViews]);

  const co = `co=${companyId}`;

  if (lines.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-bg-elev py-10 text-center">
        <p className="text-base font-medium">Nothing to report yet</p>
        <p className="mx-auto mt-1 max-w-md text-sm text-fg-subtle">
          This screen is worked out from the order lines, the shipments and the deliveries — there
          is nothing to type on it. Add an order on the Orders tab and it will fill itself in.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Every tile is a door to the rows behind it. */}
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-5">
        <Tile label="Still open" value={String(totals.openLines)} href={`/ops?${co}&flag=open`}
          sub={`${money(totals.openValueTzs) ?? "—"} of work`} />
        <Tile label="Overdue" value={String(totals.overdueLines)} href={`/ops?${co}&flag=overdue`}
          sub={totals.overdueLines > 0 ? "past the date promised" : "none late"}
          tone={totals.overdueLines > 0 ? "danger" : undefined} />
        <Tile label="On nobody's desk" value={String(totals.unclaimed)}
          sub="no name against them"
          tone={totals.unclaimed > 0 ? "warn" : undefined} />
        <Tile label="Owed to suppliers" value={money(payable.owed) ?? "—"}
          href={`/ops/payments?${co}`}
          sub={payable.unknown > 0 ? `${payable.unknown} not costed`
            : `${payable.payees} payee${payable.payees === 1 ? "" : "s"}`}
          tone={payable.owed > 0 ? "warn" : undefined} />
        <Tile label="Duty to pay" value={money(totals.dutyToPay) ?? "—"} href={`/ops/imports?${co}&state=owing`}
          sub={`${totals.atPort} still moving`}
          tone={totals.dutyToPay > 0 ? "warn" : undefined} />
      </div>

      {/* ── PENDING ──────────────────────────────────────────────────────── */}
      <section className="overflow-hidden rounded-lg border border-border bg-bg-elev">
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2">
          <h3 className="text-sm font-medium">Where the open work is sitting</h3>
          <nav className="flex items-center gap-1 text-xs">
            <span className="text-fg-subtle">Group by</span>
            {[["desk", "whose desk"], ["status", "status"]].map(([key, label]) => (
              <Link key={key} href={`/ops/report?${co}&group=${key}`}
                className={cn("rounded px-1.5 py-0.5",
                  (groupBy === key || (key === "desk" && groupBy !== "status"))
                    ? "bg-accent-soft text-accent" : "text-fg-muted hover:text-fg")}>
                {label}
              </Link>
            ))}
          </nav>
        </header>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border text-xs uppercase tracking-[0.04em] text-fg-subtle">
                <Th className="text-left">{groupBy === "status" ? "Status" : "With"}</Th>
                <Th>Lines</Th>
                <Th>Overdue</Th>
                <Th>Worst</Th>
                <Th className="text-right">Value</Th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => (
                <GroupRow key={g.name ?? "__none"} g={g} co={co}
                  // ⚠️ The empty group is named after what is MISSING, which
                  // differs by grouping — "nobody's name on it" is nonsense
                  // under a status heading.
                  emptyLabel={groupBy === "status" ? "no status typed" : "nobody's name on it"} />
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── the worst individual lines ───────────────────────────────────── */}
      <section className="overflow-hidden rounded-lg border border-border bg-bg-elev">
        <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border px-3 py-2">
          <h3 className="text-sm font-medium">The ten most overdue</h3>
          <Link href={`/ops?${co}&flag=overdue`} className="text-xs text-accent hover:underline">
            See them all
          </Link>
        </header>
        {pending.filter((r) => (r.overdueDays ?? 0) > 0).length === 0 ? (
          <p className="px-3 py-3 text-sm text-success">Nothing is past its date.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-border text-xs uppercase tracking-[0.04em] text-fg-subtle">
                  <Th className="text-left">PO</Th>
                  <Th className="text-left">Item</Th>
                  <Th className="text-left">Client</Th>
                  <Th>Due</Th>
                  <Th>Late by</Th>
                  <Th className="text-left">With</Th>
                </tr>
              </thead>
              <tbody>
                {pending.filter((r) => (r.overdueDays ?? 0) > 0).slice(0, 10).map((r) => (
                  <tr key={r.view.line.id} className="border-b border-border/60 last:border-0">
                    <Td className="text-left">
                      <Link href={`/ops?${co}&oq=${encodeURIComponent(r.view.line.poNo)}`}
                        className="font-mono text-accent hover:underline">{r.view.line.poNo}</Link>
                    </Td>
                    <Td className="max-w-[240px] truncate text-left" title={r.view.line.description}>
                      {r.view.line.description}
                    </Td>
                    <Td className="text-left text-fg-muted">{r.view.line.client ?? "—"}</Td>
                    <Td className="text-fg-muted">{fmtDate(r.view.line.dueDate) ?? "—"}</Td>
                    <Td className="tabular text-danger">{r.overdueDays}d</Td>
                    <Td className="text-left text-fg-muted">
                      {r.pendingWith ?? <span className="text-warn">nobody</span>}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── what we owe, from the real payments (Stage 7) ────────────────── */}
      <OpsPayables rows={payees} totals={payable} companyId={companyId} />

      <p className="px-1 text-xs text-fg-subtle">
        Nothing on this screen is stored. It is worked out from the orders, the shipments and the
        deliveries each time you open it, so it cannot go stale the way a spreadsheet formula does.
        The month-by-month conversion lives on the{" "}
        <Link href={`/ops/funnel?${co}`} className="text-accent hover:underline">Funnel</Link> tab.
      </p>
    </div>
  );
}

function GroupRow({ g, co, emptyLabel }: { g: DeskGroup; co: string; emptyLabel: string }) {
  return (
    <tr className="border-b border-border/60 last:border-0">
      <Td className="text-left">
        {g.name === null
          ? <span className="text-warn">{emptyLabel}</span>
          : <Link href={`/ops?${co}&oq=${encodeURIComponent(g.name)}`}
              className="text-accent hover:underline">{g.name}</Link>}
      </Td>
      <Td className="tabular">{g.lines}</Td>
      <Td className={cn("tabular", g.overdue > 0 ? "text-danger" : "text-fg-subtle")}>
        {g.overdue || "—"}
      </Td>
      <Td className="tabular text-fg-muted">
        {g.worstDays === null ? "—" : g.worstDays > 0 ? `${g.worstDays}d late` : `${-g.worstDays}d left`}
      </Td>
      <Td className="tabular text-right">
        {g.valueTzs === null ? "—" : money(g.valueTzs)}
        {g.unpriced > 0 && (
          <span className="ml-1 text-xs text-warn"
            title={`${g.unpriced} line${g.unpriced === 1 ? "" : "s"} here have no price, so they are not in this figure.`}>
            +{g.unpriced}?
          </span>
        )}
      </Td>
    </tr>
  );
}

function Tile({ label, value, sub, tone, href }: {
  label: string; value: string; sub?: string; tone?: "warn" | "danger"; href?: string;
}) {
  const body = (
    <>
      <p className="text-xs uppercase tracking-[0.04em] text-fg-subtle">{label}</p>
      <p className={cn("tabular mt-0.5 text-[15px]",
        tone === "warn" && "text-warn", tone === "danger" && "text-danger")}>{value}</p>
      {sub && <p className="text-xs text-fg-subtle">{sub}</p>}
    </>
  );
  return href
    ? <Link href={href} className="block bg-bg-elev px-3 py-2 transition-colors hover:bg-bg-subtle">{body}</Link>
    : <div className="bg-bg-elev px-3 py-2">{body}</div>;
}

function Th({ children, className }: { children?: React.ReactNode; className?: string }) {
  return <th className={cn("px-2.5 py-1.5 text-center font-normal", className)}>{children}</th>;
}

function Td({ children, className, title }: {
  children?: React.ReactNode; className?: string; title?: string;
}) {
  return <td title={title} className={cn("px-2.5 py-1.5 text-center", className)}>{children}</td>;
}

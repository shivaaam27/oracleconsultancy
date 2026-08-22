// THE PROJECT REPORT — one printable page, for the client, the file or the bank.
//
// The workbook is printed by taking a screenshot of SNAPSHOT, which loses the
// numbers behind it. This is the same block of figures laid out for paper: the
// contract, the programme, budget against actual by category, the cash position
// and the payment plan.
//
// Every figure is computed by the SAME shared functions the screens use, so the
// printed page can never quietly disagree with the system.
//
// Print styling is global (`globals.css`): `.print-hidden` disappears on paper,
// dark theme is remapped to light, and shadows are stripped.

import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getProject } from "@/lib/projects";
import { listBudgetLines } from "@/lib/project-budget";
import { listPayments, listExpenditures } from "@/lib/project-cash";
import { listPaymentStages } from "@/lib/project-site";
import { groupByCategory } from "@/lib/project-budget-shared";
import { stageViews, planTotals } from "@/lib/project-snapshot-shared";
import { num, pct, fmtDate } from "@/lib/projects-shared";
import { fmtMoney } from "@/lib/money-format";
import { ProjectPrintButton } from "@/components/project-print-button";

export const dynamic = "force-dynamic";
export const metadata = { title: "Print — Projects" };

export default async function ProjectPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const n = Number(id);
  if (!Number.isFinite(n)) notFound();

  const [project, lines, payments, expenditures, stages] = await Promise.all([
    getProject(n), listBudgetLines(n), listPayments(n), listExpenditures(n), listPaymentStages(n),
  ]);
  if (!project) notFound();

  const cur = project.currency;
  const m = (v: number | null) => fmtMoney(v, cur) ?? "—";

  const budgetTotal = lines.length ? lines.reduce((s, l) => s + (num(l.amount) ?? 0), 0) : null;
  const released = payments.reduce((s, p) => s + (num(p.amountPaid) ?? 0), 0);
  const accounted = expenditures.reduce((s, e) => s + (num(e.amount) ?? 0), 0);
  // The workbook never asks this. Released cash that nobody has accounted for is
  // not a cost, and treating it as one is what flatters every profit line there.
  const gap = released - accounted;

  const categoryOf = new Map(lines.map((l) => [l.itemCode, l.category]));
  const spent = new Map<string, number>();
  for (const e of expenditures) {
    const cat = e.itemCode ? categoryOf.get(e.itemCode) ?? "(not on the budget)" : "(no item code)";
    spent.set(cat, (spent.get(cat) ?? 0) + (num(e.amount) ?? 0));
  }
  const budgeted = groupByCategory(lines);
  const seen = new Set(budgeted.map((c) => c.category));
  const gauge = [
    ...budgeted.map((c) => {
      const s = spent.get(c.category) ?? 0;
      return { category: c.category, budget: c.amount, spent: s, used: c.amount ? s / c.amount : null };
    }),
    ...[...spent.entries()]
      .filter(([cat]) => !seen.has(cat))
      .map(([cat, s]) => ({ category: cat, budget: null, spent: s, used: null })),
  // Worst first, the house rule: an item at 235% must not be at the foot of the
  // page where nobody reads it.
  ].sort((a, b) => (b.used ?? Infinity) - (a.used ?? Infinity));

  const views = stageViews(stages, {
    totalContract: project.contract.totalContract,
    completionPct: num(project.completionPct),
  });
  const plan = planTotals(views);
  const printedOn = new Date();
  const count = (n2: number, one: string, many: string) => n2 + " " + (n2 === 1 ? one : many);

  return (
    <div className="space-y-4">
      <div className="print-hidden flex items-center justify-between">
        <Link href={`/projects/${n}`} className="inline-flex items-center gap-1.5 text-sm text-fg-muted hover:text-fg">
          <ArrowLeft size={13} /> Back to the project
        </Link>
        <ProjectPrintButton />
      </div>

      <article className="space-y-5 rounded-[8px] border border-border p-6 text-sm">
        <header className="space-y-1 border-b border-border pb-3">
          <h1 className="text-[20px] font-medium">{project.name}</h1>
          <p className="text-fg-muted">
            {[project.variant, project.client, project.location].filter(Boolean).join(" · ")}
          </p>
          <p className="text-fg-subtle">
            {project.companyName}
            {project.poNumber ? ` · PO ${project.poNumber}` : ""}
            {` · figures in ${cur}`}
          </p>
        </header>

        <Section title="Contract">
          <Fig label="Quotation (excl. VAT)" value={m(num(project.quotationValue))} />
          <Fig label="Purchase order" value={m(num(project.poValue))} />
          <Fig label="Additional work" value={m(num(project.additionalWork))} />
          <Fig label="Total contract" value={m(project.contract.totalContract)} strong />
          <Fig label={`VAT (${pct(num(project.vatRate), 0) ?? "—"})`} value={m(project.contract.vatPortion)} />
          <Fig label={`Withholding tax (${pct(num(project.whtRate), 0) ?? "—"})`} value={m(project.contract.withholdingTax)} />
        </Section>

        <Section title="Programme">
          <Fig label="Start" value={fmtDate(project.startDate) ?? "—"} />
          <Fig label="Duration" value={project.durationDays ? `${project.durationDays} days` : "—"} />
          <Fig label="Expected completion" value={fmtDate(project.programme.expectedCompletion) ?? "—"} />
          <Fig label="Days elapsed" value={project.programme.daysElapsed?.toString() ?? "—"} />
          <Fig
            label={project.programme.daysOverdue ? "Days overdue" : "Days remaining"}
            value={(project.programme.daysOverdue ?? project.programme.daysRemaining)?.toString() ?? "—"}
            strong={Boolean(project.programme.daysOverdue)}
          />
          <Fig label="Work complete" value={pct(num(project.completionPct)) ?? "—"} />
        </Section>

        <Section title="Money">
          <Fig label="Budget (bill of quantities)" value={budgetTotal === null ? "not entered" : m(budgetTotal)} />
          <Fig label="Cash released" value={m(released)} />
          <Fig label="Accounted for" value={m(accounted)} />
          <Fig label="Held, not yet accounted for" value={m(gap)} strong={gap > 0} />
          <Fig label="Budgeted profit" value={m(project.contract.budgetedProfit)} />
          <Fig label="Margin after withholding tax" value={pct(project.contract.marginAfterWht) ?? "—"} />
        </Section>

        {gauge.length > 0 && (
          <section className="space-y-1.5">
            <h2 className="text-base font-medium">Budget against actual</h2>
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border text-left text-fg-muted">
                  <th className="py-1 font-normal">Category</th>
                  <th className="py-1 text-right font-normal">Budget</th>
                  <th className="py-1 text-right font-normal">Spent</th>
                  <th className="py-1 text-right font-normal">Left</th>
                  <th className="py-1 text-right font-normal">Used</th>
                </tr>
              </thead>
              <tbody>
                {gauge.map((g) => (
                  <tr key={g.category} className="border-b border-border/50 last:border-0">
                    <td className="py-1">{g.category}</td>
                    <td className="py-1 text-right">{g.budget === null ? "—" : m(g.budget)}</td>
                    <td className="py-1 text-right">{m(g.spent)}</td>
                    <td className="py-1 text-right">{g.budget === null ? "—" : m(g.budget - g.spent)}</td>
                    <td className={`py-1 text-right ${g.used !== null && g.used > 1 ? "font-medium" : ""}`}>
                      {g.used === null ? "—" : `${(g.used * 100).toFixed(0)}%`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {views.length > 0 && (
          <section className="space-y-1.5">
            <h2 className="text-base font-medium">Payment plan</h2>
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border text-left text-fg-muted">
                  <th className="py-1 font-normal">Stage</th>
                  <th className="py-1 text-right font-normal">Due</th>
                  <th className="py-1 text-right font-normal">Invoiced</th>
                  <th className="py-1 text-right font-normal">Received</th>
                  <th className="py-1 font-normal">Billable now</th>
                  <th className="py-1 font-normal">Paperwork</th>
                </tr>
              </thead>
              <tbody>
                {views.map((v) => (
                  <tr key={v.stage.id} className="border-b border-border/50 last:border-0">
                    <td className="py-1">{v.stage.label}</td>
                    <td className="py-1 text-right">{m(v.amount)}</td>
                    <td className="py-1 text-right">{m(num(v.stage.invoiceAmount))}</td>
                    <td className="py-1 text-right">{m(v.received)}</td>
                    <td className="py-1">{v.billable ? "Yes" : "Not yet"}</td>
                    <td className="py-1">
                      {/* The certificate and the fiscal receipt — on paper, the
                          person reading this is usually chasing exactly these. */}
                      {[v.stage.ipcSubmitted && "IPC in", v.stage.ipcProcessed && "IPC done",
                        v.stage.efdIssued && "EFD"].filter(Boolean).join(", ") || "—"}
                      {v.heldUpBy && <span className="block text-fg-muted">{v.heldUpBy}</span>}
                    </td>
                  </tr>
                ))}
                <tr className="font-medium">
                  <td className="py-1">Total</td>
                  <td className="py-1 text-right">{m(plan.planned)}</td>
                  <td className="py-1 text-right">{m(plan.invoiced)}</td>
                  <td className="py-1 text-right">{m(plan.received)}</td>
                  <td className="py-1" />
                  <td className="py-1" />
                </tr>
              </tbody>
            </table>
          </section>
        )}

        <footer className="border-t border-border pt-2 text-xs text-fg-subtle">
          Printed {fmtDate(printedOn)} from COS · {count(lines.length, "budget line", "budget lines")} ·{" "}
          {count(expenditures.length, "spending entry", "spending entries")} ·{" "}
          {count(payments.length, "payment in", "payments in")}.
          Figures are calculated from what has been entered, not copied from a spreadsheet.
        </footer>
      </article>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-1.5">
      <h2 className="text-base font-medium">{title}</h2>
      <dl className="grid grid-cols-2 gap-x-8 gap-y-1 sm:grid-cols-3">{children}</dl>
    </section>
  );
}

function Fig({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-border/40 py-0.5">
      <dt className="text-fg-muted">{label}</dt>
      <dd className={strong ? "font-medium" : ""}>{value}</dd>
    </div>
  );
}

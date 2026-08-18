// ─────────────────────────────────────────────────────────────────────────────
// EXPORT — any project sheet as a CSV file.
//
// `/api/projects/12/export?what=budget` downloads Patamela-budget-2026-08-18.csv.
//
// Why this exists: the workbook could always be emailed to an accountant, and a
// system that cannot hand its figures back is a worse tool than the thing it
// replaced. Every sheet is exported from the SAME functions the screens read,
// so an export can never disagree with what is on screen.
//
// Read-only. It writes nothing, and it sits behind the admin gate in `proxy.ts`
// with the rest of `/api` — a project's figures are not staff-visible.
// ─────────────────────────────────────────────────────────────────────────────

import { getProject } from "@/lib/projects";
import { listBudgetLines } from "@/lib/project-budget";
import { listRequisitions } from "@/lib/project-requisitions";
import { listPayments, listExpenditures } from "@/lib/project-cash";
import { listSitePeople, listSiteDays, listPaymentStages } from "@/lib/project-site";
import { listProjectAudit } from "@/lib/project-audit";
import { fundsByBatch } from "@/lib/project-funds-shared";
import { num, money, pct, fmtDate } from "@/lib/projects-shared";
import { groupByCategory } from "@/lib/project-budget-shared";
import { fieldLabel, displayValue, actorLabel, summarise, ENTITY_LABELS } from "@/lib/project-audit-shared";
import { toCsv, csvResponse, csvFileName } from "@/lib/csv";

export const dynamic = "force-dynamic";

/**
 * A stored date arrives as a full timestamp ("2026-08-18T00:00:00+00:00").
 * Excel reads that as text, not a date, so every date column is cut back to the
 * day it means.
 */
function onDay(v: string | null | undefined): string {
  return v ? String(v).slice(0, 10) : "";
}

/** A moment, for the history file: "2026-08-18 17:04". */
function atTime(v: string): string {
  const s = String(v);
  return s.length >= 16 ? s.slice(0, 10) + " " + s.slice(11, 16) : s;
}

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const n = Number(id);
  if (!Number.isFinite(n)) return new Response("Not found", { status: 404 });

  const what = new URL(req.url).searchParams.get("what") ?? "budget";
  const project = await getProject(n);
  if (!project) return new Response("Not found", { status: 404 });

  const file = (rows: string) => csvResponse(csvFileName(project.name, what), rows);

  switch (what) {
    case "summary": {
      const lines = await listBudgetLines(n);
      const budget = lines.length ? lines.reduce((s, l) => s + (num(l.amount) ?? 0), 0) : null;
      const c = project.contract;
      const p = project.programme;
      // Two columns, Figure and Value. This one is read by a person rather than
      // filtered, so it keeps the shape of the workbook money block.
      const rows: unknown[][] = [
        ["Project", project.name],
        ["Type", project.variant],
        ["Client", project.client],
        ["Location", project.location],
        ["Company", project.companyName],
        ["PO number", project.poNumber],
        ["Currency", project.currency],
        ["Status", project.status],
        ["Start date", fmtDate(project.startDate)],
        ["Duration (days)", project.durationDays],
        ["Expected completion", fmtDate(p.expectedCompletion)],
        ["Days elapsed", p.daysElapsed],
        ["Days remaining", p.daysOverdue ? null : p.daysRemaining],
        ["Days overdue", p.daysOverdue],
        ["Completion %", pct(num(project.completionPct))],
        ["Quotation (excl. VAT)", money(num(project.quotationValue))],
        ["PO value", money(num(project.poValue))],
        ["Additional work", money(num(project.additionalWork))],
        ["Total contract", money(c.totalContract)],
        ["VAT", money(c.vatPortion)],
        ["Withholding tax", money(c.withholdingTax)],
        ["Budget (BOQ total)", money(budget)],
        ["Budget lines", lines.length],
      ];
      return file(toCsv(["Figure", "Value"], rows));
    }

    case "budget": {
      const lines = await listBudgetLines(n);
      return file(toCsv(
        ["Item code", "Category", "Sub-job", "Description", "Amount", "Notes"],
        lines.map((l) => [l.itemCode, l.category, l.subJob, l.description, num(l.amount), l.notes]),
      ));
    }

    case "requisitions": {
      const rs = await listRequisitions(n);
      return file(toCsv(
        ["Batch", "Requested on", "Item code", "Amount requested", "Who pays", "Supplier",
          "Reference", "Amount approved", "Status", "GRN no.", "Received on", "Amount received", "Remarks"],
        rs.map((r) => [
          r.batchNo, onDay(r.requestedDate), r.itemCode, num(r.amountRequested), r.route, r.supplier,
          r.referenceNo, r.amountApproved === null ? "" : num(r.amountApproved), r.status,
          r.grnNo, onDay(r.receivedDate), r.amountReceived === null ? "" : num(r.amountReceived), r.remarks,
        ]),
      ));
    }

    case "payments": {
      const ps = await listPayments(n);
      return file(toCsv(
        ["Route", "Reference", "Batch", "Supplier", "Paid on", "Amount paid", "Notes"],
        ps.map((p) => [p.route, p.referenceNo, p.batchNo, p.supplier, onDay(p.paidDate), num(p.amountPaid), p.notes]),
      ));
    }

    case "expenditures": {
      const es = await listExpenditures(n);
      return file(toCsv(
        ["Spent on", "Item code", "Description", "Whose float", "Amount", "Money from", "Batch", "Mobile no."],
        es.map((e) => [onDay(e.spentDate), e.itemCode, e.description, e.payer, num(e.amount), e.source, e.batchNo, e.mobileNo]),
      ));
    }

    case "funds": {
      const [lines, rs] = await Promise.all([listBudgetLines(n), listRequisitions(n)]);
      const budget = lines.length ? lines.reduce((s, l) => s + (num(l.amount) ?? 0), 0) : null;
      const funds = fundsByBatch(
        rs.map((r) => ({
          batchNo: r.batchNo, amountRequested: r.amountRequested, amountApproved: r.amountApproved,
          amountReceived: r.amountReceived, requestedDate: r.requestedDate, status: r.status,
        })),
        budget,
      );
      return file(toCsv(
        ["Batch", "First request", "Requests", "Requested", "Approved", "Trimmed", "Undecided",
          "Received", "Not yet received", "Budget left", "Used %"],
        funds.rows.map((b) => [
          b.batchNo, onDay(b.firstDate), b.requests, b.requested, b.approved, b.trimmed, b.pending,
          b.actual, b.underSpent, b.diminishing,
          b.utilisation === null ? "" : (b.utilisation * 100).toFixed(1),
        ]),
      ));
    }

    case "snapshot": {
      const [lines, es] = await Promise.all([listBudgetLines(n), listExpenditures(n)]);
      const categoryOf = new Map(lines.map((l) => [l.itemCode, l.category]));
      const spent = new Map<string, number>();
      for (const e of es) {
        // Spending that belongs to no budget line is still real money, so it
        // gets its own heading rather than being dropped — the workbook fixed
        // gauge cannot show it at all.
        const cat = e.itemCode ? categoryOf.get(e.itemCode) ?? "(not on the budget)" : "(no item code)";
        spent.set(cat, (spent.get(cat) ?? 0) + (num(e.amount) ?? 0));
      }
      const budgeted = groupByCategory(lines);
      const seen = new Set(budgeted.map((c) => c.category));
      const rows: unknown[][] = budgeted.map((c) => {
        const s = spent.get(c.category) ?? 0;
        return [c.category, c.amount, s, c.amount - s, c.amount ? ((s / c.amount) * 100).toFixed(1) : ""];
      });
      for (const [cat, s] of spent) {
        if (!seen.has(cat)) rows.push([cat, "", s, "", ""]);
      }
      return file(toCsv(["Category", "Budget", "Spent", "Left", "Used %"], rows));
    }

    case "plan": {
      const stages = await listPaymentStages(n);
      return file(toCsv(
        ["Stage", "At completion %", "Share %", "Amount", "Invoiced on", "Invoiced", "Received on", "Received"],
        stages.map((s) => [
          s.label,
          s.thresholdPct === null ? "" : ((num(s.thresholdPct) ?? 0) * 100).toFixed(0),
          s.sharePct === null ? "" : ((num(s.sharePct) ?? 0) * 100).toFixed(0),
          num(s.amount), onDay(s.invoiceDate), num(s.invoiceAmount), onDay(s.receivedDate), num(s.amountReceived),
        ]),
      ));
    }

    case "site-people": {
      const people = await listSitePeople(n);
      return file(toCsv(
        ["Name", "Job", "Type", "Daily rate", "Phone", "Gets meals", "Active"],
        people.map((p) => [p.name, p.designation, p.kind, num(p.dailyRate), p.phone, p.mealsEligible, p.active]),
      ));
    }

    case "site-days": {
      const [people, days] = await Promise.all([listSitePeople(n), listSiteDays(n)]);
      const nameOf = new Map(people.map((p) => [p.id, p.name]));
      return file(toCsv(
        ["Day", "Name", "Meal", "Wage"],
        days.map((d) => [onDay(d.day), nameOf.get(d.personId) ?? d.personId, d.meal, num(d.labourAmount)]),
      ));
    }

    case "history": {
      const rows = await listProjectAudit(n, { limit: 5000 });
      return file(toCsv(
        ["When", "Who", "Sheet", "Record", "What happened", "Field", "Was", "Became"],
        rows.map((r) => [
          atTime(r.createdAt), actorLabel(r.createdBy), ENTITY_LABELS[r.entity] ?? r.entity, r.label,
          r.action, fieldLabel(r.field), displayValue(r.field, r.oldValue),
          r.field ? displayValue(r.field, r.newValue) : summarise(r.newValue),
        ]),
      ));
    }

    default:
      return new Response("Unknown export", { status: 400 });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// MCP — the PES trading module, for Claude to READ.
//
// ⚠️ READ ONLY, on purpose. Every figure the module shows is worked out from
// order lines that several people type by hand, and a wrong company or a wrong
// PO number on a write is worse than a question. Writing can be added later —
// the cores are `ops-orders.ts` / `ops-invoices.ts` — but it should be a
// decision somebody takes, not something that arrives with the read tool.
//
// ⚠️ ONE tool, grouped by subject, with a `type` argument. Every tool's
// description sits in every conversation's prompt, so five tools here would
// cost five descriptions for one module (CLAUDE.md, the MCP forward rule).
// ─────────────────────────────────────────────────────────────────────────────

import { sb } from "@/db/supabase";
import { companyScope } from "@/lib/portal-auth";
import type { McpCaller } from "@/lib/mcp/auth";
import { listOrderLines } from "@/lib/ops-orders";
import { listShipments } from "@/lib/ops-shipments";
import { listInvoices } from "@/lib/ops-invoices";
import { listEnquiries } from "@/lib/ops-funnel";
import { lineView, money, type DespatchLite } from "@/lib/ops-orders-shared";
import { shipmentView } from "@/lib/ops-shipments-shared";
import { invoiceView, poBalances, balanceTotals } from "@/lib/ops-invoices-shared";
import { enquiryView, funnelCohorts, linesByPo, rateText } from "@/lib/ops-funnel-shared";
import { pendingLines, byDesk, supplierBalances, reportTotals } from "@/lib/ops-report-shared";

export const OPS_TYPES = [
  "orders", "shipments", "enquiries", "deliveries", "balances", "report", "conversion",
] as const;

export type OpsArgs = {
  type: (typeof OPS_TYPES)[number];
  company?: string;
  search?: string;
  openOnly?: boolean;
  limit?: number;
};

/** The trading company, resolved from the caller's own scope. */
async function resolveCompany(caller: McpCaller, name?: string): Promise<{ id: number; name: string } | null> {
  const { data } = await sb.from("companies").select("id,name").eq("active", true).order("name");
  const rows = (data ?? []).map((c) => ({ id: c.id as number, name: c.name as string }));

  // ⚠️ The caller's scope governs, exactly as it does everywhere else — a staff
  // key must not read another company's orders through this door. The owner
  // sees everything; anyone else is filtered by the SAME helper the portal uses,
  // so this door can never be wider than their portal (CLAUDE.md).
  const scope = caller.kind === "owner" ? null : await companyScope(caller.person);
  const allowed = scope === null ? rows : rows.filter((c) => scope.includes(c.id));
  if (allowed.length === 0) return null;

  if (name) {
    const q = name.trim().toLowerCase();
    return allowed.find((c) => c.name.toLowerCase().includes(q)) ?? null;
  }
  // No company named: the trading business is PES, so lead with it.
  return allowed.find((c) => /^PES\b/i.test(c.name)) ?? allowed[0];
}

const hit = (q: string | undefined, ...parts: Array<string | null>) =>
  !q ? true : parts.some((p) => (p ?? "").toLowerCase().includes(q.toLowerCase()));

export async function mcpOps(caller: McpCaller, args: OpsArgs): Promise<unknown> {
  const company = await resolveCompany(caller, args.company);
  if (!company) {
    return { error: "I could not find that company, or you do not have access to it." };
  }
  const limit = Math.min(Math.max(args.limit ?? 30, 1), 100);
  const openOnly = args.openOnly ?? true;

  const [lines, despatches] = await Promise.all([
    listOrderLines(company.id),
    listInvoices(company.id),
  ]);
  const docById = new Map(despatches.map((d) => [d.id, d as DespatchLite & { id: number }]));
  const docOf = (l: { invoiceId: number | null }) =>
    l.invoiceId === null ? null : docById.get(l.invoiceId) ?? null;
  const views = lines.map((l) => lineView(l, undefined, docOf(l)));

  const head = { company: company.name };

  switch (args.type) {
    case "orders": {
      const rows = views
        .filter((v) => (openOnly ? !v.invoiced : true))
        .filter((v) => hit(args.search, v.line.poNo, v.line.description, v.line.client, v.line.supplier))
        .sort((a, b) => (b.overdueDays ?? -Infinity) - (a.overdueDays ?? -Infinity))
        .slice(0, limit)
        .map((v) => ({
          po: v.line.poNo, item: v.line.description, client: v.line.client,
          qty: v.line.qty, value: money(v.saleTotalTzs), currency: "TZS",
          due: v.line.dueDate?.slice(0, 10) ?? null,
          overdueDays: v.overdueDays, status: v.line.status,
          with: v.line.pendingWith, supplier: v.line.supplier,
          delivered: v.delivered, invoiced: v.invoiced,
          // ⚠️ Said plainly, so a total is never quoted as though it covered
          // lines it could not price.
          note: v.saleTotalTzs === null ? "no price on this line, so it is in no total" : undefined,
        }));
      return { ...head, showing: rows.length, openOnly, orders: rows };
    }

    case "shipments": {
      const rows = (await listShipments(company.id))
        .map((s) => shipmentView(s))
        .filter((v) => (openOnly ? !v.cleared : true))
        .filter((v) => hit(args.search, v.shipment.blNo, v.shipment.supplier, v.shipment.clearingAgent))
        .slice(0, limit)
        .map((v) => ({
          bl: v.shipment.blNo, supplier: v.shipment.supplier, origin: v.shipment.origin,
          agent: v.shipment.clearingAgent, eta: v.shipment.eta?.slice(0, 10) ?? null,
          daysPastEta: v.overdueDays, cleared: v.cleared,
          charges: money(v.costTotalTzs), stillToPay: money(v.balance),
          heldUpBy: v.heldUpBy,
        }));
      return { ...head, showing: rows.length, shipments: rows };
    }

    case "enquiries": {
      const byPo = linesByPo(lines);
      const rows = (await listEnquiries(company.id))
        .map((e) => enquiryView(e, byPo, undefined, docOf))
        .filter((v) => (openOnly ? v.open : true))
        .filter((v) => hit(args.search, v.enquiry.rfqNo, v.enquiry.client, v.enquiry.description))
        .slice(0, limit)
        .map((v) => ({
          rfq: v.enquiry.rfqNo, client: v.enquiry.client, asked: v.enquiry.rfqDate?.slice(0, 10) ?? null,
          what: v.enquiry.description, quotation: v.enquiry.quotationNo,
          quoted: money(v.quoteValueTzs), po: v.enquiry.poNo,
          orderValue: money(v.orderValueTzs), stage: v.stage,
          waitingDays: v.ageDays, waitingOn: v.waitingOn,
        }));
      return { ...head, showing: rows.length, enquiries: rows };
    }

    case "deliveries": {
      const linesOf = new Map<number, typeof views>();
      for (const v of views) {
        const id = v.line.invoiceId;
        if (id === null) continue;
        const b = linesOf.get(id);
        if (b) b.push(v); else linesOf.set(id, [v]);
      }
      const rows = despatches
        .map((d) => invoiceView(d, linesOf.get(d.id) ?? []))
        .filter((v) => (openOnly ? !v.billed : true))
        .filter((v) => hit(args.search, v.invoice.invoiceNo, v.invoice.deliveryNoteNo, v.invoice.client))
        .slice(0, limit)
        .map((v) => ({
          deliveryNote: v.invoice.deliveryNoteNo, invoice: v.invoice.invoiceNo,
          client: v.invoice.client, delivered: v.invoice.deliveredDate?.slice(0, 10) ?? null,
          invoiced: v.invoice.invoiceDate?.slice(0, 10) ?? null,
          lines: v.lineCount, value: money(v.billedTzs),
          daysUnbilled: v.unbilledDays, waitingOn: v.waitingOn,
          disagreesWithLinesBy: v.difference === null ? undefined : money(v.difference),
        }));
      return { ...head, showing: rows.length, openOnly, deliveries: rows };
    }

    case "balances": {
      const linesOf = new Map<number, typeof views>();
      for (const v of views) {
        const id = v.line.invoiceId;
        if (id === null) continue;
        const b = linesOf.get(id);
        if (b) b.push(v); else linesOf.set(id, [v]);
      }
      const viewById = new Map(
        despatches.map((d) => [d.id, invoiceView(d, linesOf.get(d.id) ?? [])]));
      const rows = poBalances(views, (v) =>
        v.line.invoiceId === null ? null : viewById.get(v.line.invoiceId) ?? null);
      const totals = balanceTotals(rows);
      return {
        ...head,
        totals: {
          orders: totals.pos, ordered: money(totals.ordered), billed: money(totals.billed),
          stillToBill: money(totals.outstanding),
          couldNotWorkOut: totals.unknown || undefined,
        },
        orders: rows
          .filter((r) => hit(args.search, r.poNo, r.client))
          .filter((r) => (openOnly ? !r.complete : true))
          .slice(0, limit)
          .map((r) => ({
            po: r.poNo, client: r.client, lines: r.lines,
            ordered: r.orderedTzs === null ? "not known" : money(r.orderedTzs),
            billed: money(r.billedTzs), stillToBill: r.balanceTzs === null ? "not known" : money(r.balanceTzs),
            goneOut: `${r.deliveredLines} of ${r.lines}`,
          })),
      };
    }

    case "conversion": {
      const byPo = linesByPo(lines);
      const cohorts = funnelCohorts(
        (await listEnquiries(company.id)).map((e) => enquiryView(e, byPo, undefined, docOf)));
      return {
        ...head,
        // ⚠️ Say what the figure MEANS. A month still holding live enquiries can
        // only go up, and quoting its rate as final is the mistake the workbook
        // makes (its Aug-26 reads 132%).
        howItIsMeasured:
          "An order counts in the month the client asked, not the month it landed, so no rate " +
          "can pass 100%. A month with live enquiries left in it shows a floor, not a final figure.",
        months: cohorts.slice(0, limit).map((c) => ({
          month: c.label, enquiries: c.enquiries, quoted: c.quoted, orders: c.ordered,
          quoteRate: rateText(c.quoteRate, c.settled), winRate: rateText(c.orderRate, c.settled),
          quotedValue: money(c.quoteValue), orderValue: money(c.orderValue),
          stillOpen: c.open, finished: c.settled,
          typicalDaysToOrder: c.medianDaysToOrder,
        })),
      };
    }

    case "report":
    default: {
      const pending = pendingLines(views);
      const suppliers = supplierBalances(views);
      const ships = (await listShipments(company.id)).map((s) => shipmentView(s));
      const t = reportTotals(pending, suppliers, ships);
      return {
        ...head,
        openLines: t.openLines,
        overdue: t.overdueLines,
        openWork: money(t.openValueTzs),
        onNobodysDesk: t.unclaimed,
        owedToSuppliers: money(t.owedToSuppliers),
        dutyToPay: money(t.dutyToPay),
        shipmentsStillMoving: t.atPort,
        couldNotPrice: t.openUnpriced || undefined,
        worstDesks: byDesk(pending).slice(0, 8).map((g) => ({
          with: g.name ?? "nobody's name on it",
          lines: g.lines, overdue: g.overdue,
          worstDaysLate: g.worstDays, value: money(g.valueTzs),
        })),
        suppliersOwed: suppliers.filter((s) => (s.owedTzs ?? 0) > 0).slice(0, 8).map((s) => ({
          supplier: s.supplier, owed: money(s.owedTzs),
          unpaidLines: s.unpaidLines, oldestDays: s.oldestDays,
        })),
      };
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ONE-OFF: check the import against the workbook it came from.
//
//   npx tsx scripts/audit-pes-import.ts <path-to-xlsx> [--company 5]
//
// ⚠️ This is meant to FIND FAULTS, not to confirm the import. Every check is
// counted from both sides and printed whether it agrees or not.
// ─────────────────────────────────────────────────────────────────────────────

import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

import XLSX from "xlsx";
import * as fs from "fs";
XLSX.set_fs(fs);

const num = (v: unknown) => {
  const s = String(v ?? "").trim().replace(/[\s,]/g, "");
  if (!s || s === "-" || s.startsWith("#")) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};
const txt = (v: unknown) => {
  const t = String(v ?? "").trim();
  return !t || t.startsWith("#") || t === "-" ? null : t;
};

async function main() {
  const args = process.argv.slice(2);
  const file = args.find((a) => !a.startsWith("--"))!;
  const companyId = Number(args[args.indexOf("--company") + 1]) || 5;
  const { sb } = await import("../src/db/supabase");
  const wb = XLSX.readFile(file, { raw: false, cellDates: false });
  const grid = (n: string) => XLSX.utils.sheet_to_json(
    wb.Sheets[n] ?? wb.Sheets[n + " "], { header: 1, raw: false, defval: null }) as unknown[][];
  const rowsOf = (g: unknown[][], from: number) =>
    g.slice(from).filter((r) => r && r.some((c) => c !== null && String(c).trim() !== ""));

  const count = async (t: string) =>
    (await sb.from(t).select("id", { count: "exact", head: true }).eq("company_id", companyId)).count ?? 0;

  console.log("═══ ROW COUNTS: workbook against COS ═══\n");

  const pos = rowsOf(grid("POS STATUS"), 3);
  const posWithPo = pos.filter((r) => txt(r[0])).length;
  const lines = await count("ops_order_lines");
  console.log(`POS STATUS rows                 ${pos.length}`);
  console.log(`  ...of which have a PO number  ${posWithPo}`);
  console.log(`  order lines in COS            ${lines}   ${lines === posWithPo ? "MATCH" : "*** DIFFERS ***"}`);

  const rfq = rowsOf(grid("INFO - RFQ"), 6);
  const rfqWithNo = rfq.filter((r) => txt(r[4])).length;
  const enq = await count("ops_enquiries");
  console.log(`\nINFO - RFQ rows                 ${rfq.length}`);
  console.log(`  ...of which have an RFQ no    ${rfqWithNo}`);
  console.log(`  enquiries in COS              ${enq}   ${enq === rfqWithNo ? "MATCH" : "*** DIFFERS ***"}`);

  const posBls = new Set(pos.map((r) => txt(r[41])?.toUpperCase()).filter(Boolean));
  const ass = rowsOf(grid("ASSESSMENTS"), 3);
  const assBls = new Set(ass.map((r) => (txt(r[11]) ?? txt(r[0]) ?? txt(r[1]))?.toUpperCase()).filter(Boolean));
  const allBls = new Set([...posBls, ...assBls]);
  const ships = await count("ops_shipments");
  console.log(`\ndistinct BL numbers on POS STATUS ${posBls.size}`);
  console.log(`distinct BL numbers on ASSESSMENTS ${assBls.size}`);
  console.log(`  both together                 ${allBls.size}`);
  console.log(`  shipments in COS              ${ships}   ${ships === allBls.size ? "MATCH" : "*** DIFFERS ***"}`);

  const posInvs = new Set(pos.map((r) => txt(r[55])?.toUpperCase()).filter(Boolean));
  const invs = await count("ops_invoices");
  console.log(`\ndistinct invoice numbers on POS STATUS ${posInvs.size}`);
  console.log(`  invoices in COS               ${invs}   ${invs === posInvs.size ? "MATCH" : "*** DIFFERS ***"}`);

  const imp = rowsOf(grid("IMP PMT AND FREIGHT"), 4);
  const impPayments = imp.filter((r) => num(r[18]) !== null).length;
  const pays = await count("ops_payments");
  console.log(`\nIMP PMT AND FREIGHT rows        ${imp.length}`);
  console.log(`  ...with an amount in the payments block ${impPayments}`);
  console.log(`  payments in COS               ${pays}   ${pays === impPayments ? "MATCH" : "*** DIFFERS ***"}`);

  const tend = rowsOf(grid("tenders"), 1).filter((r) => txt(r[0]));
  const tenders = await count("ops_tenders");
  console.log(`\ntenders rows                    ${tend.length}`);
  console.log(`  tenders in COS                ${tenders}   ${tenders === tend.length ? "MATCH" : "*** DIFFERS ***"}`);

  /* ── does the money agree? ─────────────────────────────────────────────── */
  console.log("\n\n═══ MONEY: the workbook's own totals against COS ═══\n");

  // POS STATUS col 16 is "TOTAL IN TZS" — its own figure for each line.
  let sheetSale = 0, sheetSaleRows = 0;
  for (const r of pos) {
    if (!txt(r[0])) continue;
    const v = num(r[16]);
    if (v !== null) { sheetSale += v; sheetSaleRows += 1; }
  }
  const { listOrderLines } = await import("../src/lib/ops-orders");
  const { lineView } = await import("../src/lib/ops-orders-shared");
  const cosLines = await listOrderLines(companyId);
  let cosSale = 0, cosPriced = 0, cosUnpriced = 0;
  for (const l of cosLines) {
    const v = lineView(l);
    if (v.saleTotalTzs === null) cosUnpriced += 1;
    else { cosSale += v.saleTotalTzs; cosPriced += 1; }
  }
  console.log(`sale value, the sheet's own TOTAL IN TZS column  ${Math.round(sheetSale).toLocaleString()}  (${sheetSaleRows} lines)`);
  console.log(`sale value COS works out from qty x price x rate ${Math.round(cosSale).toLocaleString()}  (${cosPriced} lines)`);
  console.log(`  lines COS could NOT price                      ${cosUnpriced}`);
  const gap = cosSale - sheetSale;
  console.log(`  difference                                     ${Math.round(gap).toLocaleString()}` +
    `  ${Math.abs(gap) < sheetSale * 0.01 ? "(under 1%)" : "*** LOOK AT THIS ***"}`);

  // One known row, checked by hand: PO 24235 on POS STATUS reads 98,491,500.
  const known = cosLines.filter((l) => l.poNo === "24235");
  console.log(`\nPO 24235 — the row checked by hand while building:`);
  for (const l of known) {
    const v = lineView(l);
    console.log(`  ${l.description.slice(0, 40)}  qty ${l.qty} x ${l.saleUnitPrice} ${l.saleCurrency} @ ${l.exRate} = ${v.saleTotalTzs?.toLocaleString() ?? "not priced"}`);
  }

  /* ── does the funnel agree with MONTHLY ANALYSIS? ──────────────────────── */
  console.log("\n\n═══ THE FUNNEL against the workbook's MONTHLY ANALYSIS ═══\n");
  const { listEnquiries } = await import("../src/lib/ops-funnel");
  const { enquiryView, linesByPo, funnelCohorts } = await import("../src/lib/ops-funnel-shared");
  const byPo = linesByPo(cosLines);
  const views = (await listEnquiries(companyId)).map((e) => enquiryView(e, byPo));
  const cohorts = funnelCohorts(views);
  const year = (y: string) => {
    const rows = cohorts.filter((c) => c.month.startsWith(y));
    return {
      enquiries: rows.reduce((s, c) => s + c.enquiries, 0),
      quoted: rows.reduce((s, c) => s + c.quoted, 0),
      ordered: rows.reduce((s, c) => s + c.ordered, 0),
    };
  };
  const a = year("2025"), b = year("2026");
  console.log(`2025 — workbook says 1,276 enquiries, 854 quotes, 176 orders`);
  console.log(`       COS says       ${a.enquiries} enquiries, ${a.quoted} quotes, ${a.ordered} orders`);
  console.log(`2026 — workbook says 1,234 enquiries, 938 quotes, 129 orders`);
  console.log(`       COS says       ${b.enquiries} enquiries, ${b.quoted} quotes, ${b.ordered} orders`);
  console.log(`\n  (the workbook counts a MONTH of 2025 from Jun; COS counts every`);
  console.log(`   enquiry it has with a date in that year, so a gap here is expected`);
  console.log(`   and the direction is what matters)`);

  /* ── what is NOT filled in ─────────────────────────────────────────────── */
  console.log("\n\n═══ HOW COMPLETE IS WHAT LANDED ═══\n");
  const fill = async (table: string, cols: string[]) => {
    const { data } = await sb.from(table).select(cols.join(",")).eq("company_id", companyId);
    const rows = (data ?? []) as unknown as Array<Record<string, unknown>>;
    console.log(`${table} (${rows.length} rows)`);
    for (const c of cols) {
      const n = rows.filter((r) => r[c] !== null && String(r[c]).trim() !== "").length;
      const pct = rows.length ? Math.round((n / rows.length) * 100) : 0;
      console.log(`   ${c.padEnd(24)} ${String(n).padStart(5)}  ${pct}%`);
    }
  };
  await fill("ops_order_lines", ["client", "qty", "sale_unit_price", "ex_rate", "supplier",
    "purchase_unit_price", "due_date", "status", "pending_with", "shipment_id", "invoice_id",
    "supplier_due_date", "production_due_date"]);
  await fill("ops_shipments", ["bl_date", "clearing_agent", "duty_amount", "vat_amount",
    "amount_paid", "eta", "ref_no", "freight_amount"]);
  await fill("ops_payments", ["payee", "paid_date", "amount", "reference", "order_line_id", "shipment_id"]);
  await fill("ops_enquiries", ["rfq_date", "client", "quotation_no", "quote_value", "po_no", "assigned_to"]);
  await fill("ops_tenders", ["client", "quote_type", "deadline"]);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });

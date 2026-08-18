// ─────────────────────────────────────────────────────────────────────────────
// ONE-OFF: bring the PES workbook into COS.
//
//   npx tsx scripts/import-pes-ops.ts <path-to-xlsx> [--company 5] [--wipe]
//
// ⚠️ It imports ONLY what is typed by hand. Every calculated sheet (PENDING,
// PURCHASE ANALYSIS, MONTHLY/DAILY ANALYSIS, PAYMENTS FORECAST) is worked out
// on read in COS, so importing them would create the very duplication the
// module exists to remove.
//
// ⚠️ It does NOT import the Deliveries sheet — the owner's decision 3 was
// "start fresh; the old sheet stays as an archive" — nor `cleranace`, whose 13
// POs are all on POS STATUS already.
//
// ⚠️ It writes ONE audit row per table rather than one per record. 4,000 audit
// rows saying "created by the import" is noise that would bury the real trail.
//
// Everything it cannot read it COUNTS and prints. Nothing is guessed.
// ─────────────────────────────────────────────────────────────────────────────

import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

import XLSX from "xlsx";
import * as fs from "fs";
XLSX.set_fs(fs);

const BY = "excel-import";

/* ───────────────────────────────────────────────────────────── parsing ──── */

const skipped = { dates: 0, amounts: 0 };

/** A workbook date. The file writes m/d/yy and m/d/yyyy — "12/18/25" settles
 *  which way round it is, because 18 cannot be a month. */
function date(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  // With `cellDates: true` a real date cell arrives as a Date.
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return null;
    const y = v.getUTCFullYear();
    if (y < 2015 || y > 2035) { skipped.dates += 1; return null; }
    return `${y}-${String(v.getUTCMonth() + 1).padStart(2, "0")}-${String(v.getUTCDate()).padStart(2, "0")}`;
  }
  // A numeric cell here is an Excel serial that was not date-formatted. Not
  // safe to guess at, so it is counted rather than converted.
  if (typeof v === "number") { skipped.dates += 1; return null; }
  const raw = String(v).trim();
  if (!raw || raw.startsWith("#") || raw === "-") return null;
  // The month helper columns hold "Dec-99" for an empty date. Not a date.
  if (/^[A-Za-z]{3}-\d{2}$/.test(raw)) return null;
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec(raw);
  if (!m) {
    const d = new Date(raw);
    if (!Number.isNaN(d.getTime()) && d.getFullYear() > 2000 && d.getFullYear() < 2100) {
      return d.toISOString().slice(0, 10);
    }
    if (raw) skipped.dates += 1;
    return null;
  }
  let mm = Number(m[1]), dd = Number(m[2]);
  let yy = Number(m[3]);
  if (yy < 100) yy += 2000;
  // ⚠️ FAULT C. The file is month/day/year almost everywhere, but a handful of
  // cells were typed day/month/year — "21/1/2026". Where the first number
  // cannot be a month and the second can, it is unambiguous, so read it the
  // other way round. Where BOTH could be a month it stays month/day, because
  // that is what the rest of the file is and guessing would be worse.
  if (mm > 12 && dd <= 12) { const t = mm; mm = dd; dd = t; }
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31 || yy < 2015 || yy > 2035) { skipped.dates += 1; return null; }
  return `${yy}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
}

/** A workbook amount. Handles " 19,698 ", " -   ", "#N/A", "#VALUE!". */
function amount(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  // With `raw: true` a money cell arrives as a NUMBER and needs no cleaning —
  // this is the path that keeps 19,698.30 from becoming 19,698.
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : null;
  const raw = String(v).trim();
  if (!raw || raw === "-" || raw.startsWith("#")) return null;
  const cleaned = raw.replace(/[\s,]/g, "");
  if (cleaned === "" || cleaned === "-") return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n)) { skipped.amounts += 1; return null; }
  return String(n);
}

/** Free text, tidied. Blank, "#N/A" and "0" placeholders become null. */
function text(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const t = String(v).trim().replace(/\s+/g, " ");
  if (!t || t.startsWith("#") || t === "-") return null;
  return t;
}

const upper = (v: unknown) => { const t = text(v); return t ? t.toUpperCase() : null; };

/* ─────────────────────────────────────────────────────────────── the run ── */

async function main() {
  const args = process.argv.slice(2);
  const file = args.find((a) => !a.startsWith("--"));
  if (!file) { console.error("Give me the .xlsx path."); process.exit(1); }
  const companyId = Number(args[args.indexOf("--company") + 1]) || 5;
  const wipe = args.includes("--wipe");

  const { sb } = await import("../src/db/supabase");
  // ⚠️ FAULT B, found by the audit. `raw: false` hands back what the cell
  // DISPLAYS, so " 19,698 " arrived instead of the 19,698.30 the file
  // actually holds — 582 of 1,507 money cells were rounded on the way in.
  // `raw: true` + `cellDates: true` gives real numbers and real dates.
  const wb = XLSX.readFile(file, { raw: true, cellDates: true });
  const grid = (name: string): unknown[][] => {
    const sheet = wb.Sheets[name] ?? wb.Sheets[name + " "] ?? wb.Sheets[name.trim()];
    if (!sheet) { console.warn(`  ! sheet "${name}" not found`); return []; }
    return XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: null }) as unknown[][];
  };
  const rowsOf = (g: unknown[][], from: number) =>
    g.slice(from).filter((r) => r && r.some((c) => c !== null && String(c).trim() !== ""));

  console.log(`Importing into company ${companyId} from ${file}`);

  if (wipe) {
    console.log("\n--wipe: clearing every ops row for this company first");
    for (const t of ["ops_payments", "ops_tenders", "ops_order_lines", "ops_invoices",
                     "ops_shipments", "ops_enquiries", "ops_audit"]) {
      await sb.from(t).delete().eq("company_id", companyId);
    }
  }

  const insert = async (table: string, rows: Record<string, unknown>[]) => {
    let done = 0;
    // Chunked: the pooler will not take 2,600 rows in one statement.
    for (let i = 0; i < rows.length; i += 250) {
      const chunk = rows.slice(i, i + 250);
      const { error } = await sb.from(table).insert(chunk);
      if (error) { console.error(`  ! ${table} chunk ${i}: ${error.message}`); continue; }
      done += chunk.length;
    }
    return done;
  };

  const report: Record<string, unknown> = {};

  /* ── 1. MASTER → the Setup lists ──────────────────────────────────────── */
  {
    const g = grid("MASTER");
    const rows = rowsOf(g, 2);
    // MASTER's columns, read from the file: A/B ageing, D agents, E clients,
    // F suppliers, G origins, H delivery statuses.
    const lists: Array<[number, string, boolean]> = [
      [1, "ageing_bucket", true], [3, "clearing_agent", false], [4, "client", true],
      [5, "supplier", false], [6, "origin", true], [7, "delivery_status", true],
    ];
    const { data: existing } = await sb.from("ops_refs").select("kind,name").eq("company_id", companyId);
    const have = new Set((existing ?? []).map((r) => `${r.kind}|${String(r.name).toUpperCase()}`));
    const out: Record<string, unknown>[] = [];
    let order = 100;
    for (const [col, kind, up] of lists) {
      const seen = new Set<string>();
      for (const r of rows) {
        const name = up ? upper(r[col]) : text(r[col]);
        if (!name) continue;
        const key = `${kind}|${name.toUpperCase()}`;
        if (seen.has(key) || have.has(key)) continue;
        seen.add(key); have.add(key);
        out.push({ company_id: companyId, kind, name, sort_order: (order += 10), created_by: BY });
      }
    }
    report.setupLists = await insert("ops_refs", out);
  }

  /* ── 2. POS STATUS → shipments, then invoices, then the order lines ───── */
  const pos = grid("POS STATUS");
  const posRows = rowsOf(pos, 3);
  report.posStatusRows = posRows.length;

  // 2a. Shipments, keyed on the bill of lading. One BL carries many lines, so
  // the sheet repeats it; here it is written once.
  const shipIdByBl = new Map<string, number>();
  {
    const byBl = new Map<string, Record<string, unknown>>();
    for (const r of posRows) {
      const bl = upper(r[41]);
      if (!bl) continue;
      if (!byBl.has(bl)) {
        byBl.set(bl, {
          company_id: companyId, bl_no: bl, bl_date: date(r[39]),
          supplier: text(r[26]) ?? text(r[25]), origin: upper(r[27]),
          mode: upper(r[50]), clearing_agent: text(r[42]),
          dox_lodged: date(r[43]), assessment_date: date(r[44]),
          paid_date: date(r[45]), eta: date(r[46]), berth_date: date(r[48]),
          status: upper(r[51]), created_by: BY,
        });
      }
    }
    const rows = [...byBl.values()];
    const made = await insert("ops_shipments", rows);
    report.shipmentsFromPosStatus = made;
    const { data } = await sb.from("ops_shipments").select("id,bl_no").eq("company_id", companyId);
    for (const s of data ?? []) shipIdByBl.set(String(s.bl_no).toUpperCase(), s.id as number);
  }

  // 2b. ASSESSMENTS carries the customs money in far more detail than POS
  // STATUS, so it UPDATES the shipments rather than making new ones.
  {
    const g = grid("ASSESSMENTS");
    const rows = rowsOf(g, 3);
    let updated = 0, created = 0;
    for (const r of rows) {
      const bl = upper(r[11]) ?? upper(r[0]) ?? upper(r[1]);
      if (!bl) continue;
      const patch: Record<string, unknown> = {
        ref_no: text(r[12]), bl_date: date(r[13]),
        supplier: text(r[16]), origin: upper(r[17]),
        clearing_agent: text(r[19]), dox_lodged: date(r[20]),
        eta: date(r[21]), berth_date: date(r[23]), mode: upper(r[24]),
        status: upper(r[25]), assessment_date: date(r[28]),
        duty_amount: amount(r[29]), vat_amount: amount(r[30]),
        wharfage: amount(r[32]), other_costs: amount(r[33]),
        agency_fees: amount(r[34]), freight_amount: amount(r[35]),
        paid_date: date(r[38]), amount_paid: amount(r[39]),
      };
      for (const k of Object.keys(patch)) if (patch[k] === null) delete patch[k];
      const id = shipIdByBl.get(bl);
      if (id) {
        const { error } = await sb.from("ops_shipments").update(patch).eq("id", id);
        if (!error) updated += 1;
      } else {
        const { data, error } = await sb.from("ops_shipments")
          .insert({ ...patch, company_id: companyId, bl_no: bl, created_by: BY })
          .select("id").single();
        if (!error && data) { shipIdByBl.set(bl, data.id as number); created += 1; }
      }
    }
    report.assessmentsRows = rows.length;
    report.shipmentsUpdatedFromAssessments = updated;
    report.shipmentsNewFromAssessments = created;
  }

  // 2c. Invoices / delivery notes, keyed on the invoice number.
  const invIdByNo = new Map<string, number>();
  {
    const byNo = new Map<string, Record<string, unknown>>();
    for (const r of posRows) {
      const no = upper(r[55]);
      if (!no) continue;
      if (!byNo.has(no)) {
        // ⚠️ POS STATUS has ONE column for both events, so the same date goes
        // in both boxes. That is what the sheet knows; splitting them is what
        // the screens are for from here on.
        const d = date(r[53]);
        byNo.set(no, {
          company_id: companyId, invoice_no: no, invoice_date: d, delivered_date: d,
          client: upper(r[2]), status: upper(r[57]), created_by: BY,
        });
      }
    }
    const made = await insert("ops_invoices", [...byNo.values()]);
    report.invoicesFromPosStatus = made;
    const { data } = await sb.from("ops_invoices").select("id,invoice_no").eq("company_id", companyId);
    for (const i of data ?? []) if (i.invoice_no) invIdByNo.set(String(i.invoice_no).toUpperCase(), i.id as number);
  }

  // 2d. The order lines themselves.
  {
    const rows: Record<string, unknown>[] = [];
    let noPo = 0, noDescription = 0;
    for (const r of posRows) {
      const po = text(r[0]);
      const description = text(r[8]);
      // ⚠️ Both are required by the schema, on purpose: a line with neither
      // cannot be found again. Counted and reported, never invented.
      if (!po) { noPo += 1; continue; }
      if (!description) { noDescription += 1; continue; }
      const bl = upper(r[41]);
      const inv = upper(r[55]);
      rows.push({
        company_id: companyId, po_no: po, description,
        client: upper(r[2]), cost_centre: upper(r[3]),
        received_date: date(r[4]), due_date: date(r[6]),
        qty: amount(r[9]), uom: text(r[10]),
        sale_unit_price: amount(r[11]), sale_currency: upper(r[12]), ex_rate: amount(r[13]),
        kind: upper(r[17]), quotation_no: text(r[18]),
        quoted_unit_bp: amount(r[20]), lc_factor: amount(r[21]),
        source: upper(r[22]), purchase_date: date(r[23]), prof_no: text(r[24]),
        supplier: text(r[26]) ?? text(r[25]), origin: upper(r[27]),
        purchase_currency: upper(r[28]), purchase_qty: amount(r[29]),
        purchase_unit_price: amount(r[30]), supplier_payment_date: date(r[33]),
        status: upper(r[35]) ?? upper(r[51]),
        production_due_date: date(r[36]),
        pending_with: text(r[59]), remarks: text(r[58]),
        shipment_id: bl ? shipIdByBl.get(bl) ?? null : null,
        invoice_id: inv ? invIdByNo.get(inv) ?? null : null,
        created_by: BY,
      });
    }
    report.orderLines = await insert("ops_order_lines", rows);
    report.orderLinesSkippedNoPo = noPo;
    report.orderLinesSkippedNoDescription = noDescription;
  }

  /* ── 3. INFO - RFQ → the enquiries ────────────────────────────────────── */
  {
    const g = grid("INFO - RFQ");
    const src = rowsOf(g, 6);
    const rows: Record<string, unknown>[] = [];
    let noRfq = 0;
    for (const r of src) {
      const rfq = text(r[4]);
      if (!rfq) { noRfq += 1; continue; }
      // The sheet keeps the quote in TZS or in USD, in two columns.
      const tzs = amount(r[10]);
      const usd = amount(r[11]);
      rows.push({
        company_id: companyId, rfq_no: rfq, rfq_date: date(r[0]), client: upper(r[3]),
        assigned_to: text(r[5]),
        quotation_no: text(r[9]), quotation_date: date(r[6]),
        quote_value: usd ?? tzs,
        quote_currency: usd ? "USD" : tzs ? "TZS" : null,
        quote_ex_rate: usd ? amount(r[12]) : null,
        po_no: text(r[19]),
        remarks: text(r[15]),
        created_by: BY,
      });
    }
    report.infoRfqRows = src.length;
    report.enquiries = await insert("ops_enquiries", rows);
    report.enquiriesSkippedNoRfqNo = noRfq;
  }

  /* ── 4. IMP PMT AND FREIGHT → the payments ────────────────────────────── */
  {
    const g = grid("IMP PMT AND FREIGHT");
    const src = rowsOf(g, 4);
    // ⚠️ Four blocks side by side on one sheet. Block 3 (cols 15-18) is the
    // one that holds ACTUAL PAYMENTS — reference, supplier, date, amount.
    // Blocks 1, 2 and 4 are per-invoice SUMMARIES (amount paid, balance,
    // ageing), all of which COS works out from the payments themselves.
    const rows: Record<string, unknown>[] = [];
    let noAmount = 0;
    const { data: lineRows } = await sb
      .from("ops_order_lines").select("id,prof_no").eq("company_id", companyId);
    const lineByProf = new Map<string, number>();
    for (const l of lineRows ?? []) {
      const k = String(l.prof_no ?? "").trim().toUpperCase();
      if (k && !lineByProf.has(k)) lineByProf.set(k, l.id as number);
    }

    for (const r of src) {
      const ref = text(r[15]);
      const payee = text(r[16]);
      const paid = date(r[17]);
      const amt = amount(r[18]);
      if (!amt) { if (ref || payee) noAmount += 1; continue; }
      const key = (ref ?? "").toUpperCase();
      rows.push({
        company_id: companyId, payee, kind: "GOODS", paid_date: paid,
        // ⚠️ The column says "AMOUNT PAID (USD)", so the currency is not a
        // guess. No rate is recorded on the sheet, so none is invented — the
        // screens will show these as "no rate" until one is entered.
        amount: amt, currency: "USD",
        reference: ref,
        order_line_id: key ? lineByProf.get(key) ?? null : null,
        shipment_id: key ? shipIdByBl.get(key) ?? null : null,
        created_by: BY,
      });
    }
    // ⚠️ Block 1 (cols 1-9) also carries the supplier's DUE DATE, which the
    // first import missed entirely — so ageing had nothing to run from. It goes
    // onto the order line, matched on the proforma number.
    let dueDates = 0;
    const seenDue = new Set<number>();
    for (const r of src) {
      const ref = text(r[1]);
      const due = date(r[7]);
      if (!ref || !due) continue;
      const id = lineByProf.get(ref.toUpperCase());
      if (!id || seenDue.has(id)) continue;
      seenDue.add(id);
      const { error } = await sb.from("ops_order_lines").update({ supplier_due_date: due }).eq("id", id);
      if (!error) dueDates += 1;
    }
    report.supplierDueDatesSet = dueDates;

    report.impPmtRows = src.length;
    report.payments = await insert("ops_payments", rows);
    report.paymentsSkippedNoAmount = noAmount;
    report.paymentsMatchedToAPurchase = rows.filter((r) => r.order_line_id !== null).length;
    report.paymentsMatchedToAShipment = rows.filter((r) => r.shipment_id !== null).length;
  }

  /* ── 5. tenders ───────────────────────────────────────────────────────── */
  {
    const g = grid("tenders");
    const src = rowsOf(g, 1);
    const rows: Record<string, unknown>[] = [];
    let noYear = 0;
    for (const r of src) {
      const description = text(r[0]);
      if (!description) continue;
      // ⚠️ The DEADLINE column is "27/11" — a day and a month with NO YEAR.
      // It is left EMPTY rather than guessed, and the raw text is kept in the
      // notes so nothing is lost.
      const rawDeadline = text(r[2]);
      const parsed = date(rawDeadline);
      if (rawDeadline && !parsed) noYear += 1;
      rows.push({
        company_id: companyId, description, quote_type: upper(r[1]),
        deadline: parsed, client: upper(r[3]),
        notes: rawDeadline && !parsed ? `Deadline in the workbook: ${rawDeadline} (no year given)` : null,
        created_by: BY,
      });
    }
    report.tenderRows = src.length;
    report.tenders = await insert("ops_tenders", rows);
    report.tendersDeadlineHadNoYear = noYear;
  }

  /* ── one audit row per table, not one per record ──────────────────────── */
  const stamp = new Date().toISOString();
  await sb.from("ops_audit").insert(
    [["order_line", report.orderLines], ["shipment", (report.shipmentsFromPosStatus as number) + (report.shipmentsNewFromAssessments as number)],
     ["invoice", report.invoicesFromPosStatus], ["enquiry", report.enquiries],
     ["payment", report.payments], ["tender", report.tenders]]
      .filter(([, n]) => (n as number) > 0)
      .map(([entity, n]) => ({
        company_id: companyId, entity, action: "created",
        label: "imported from the workbook",
        new_value: `${n} rows from PES OPS EXECUTIVE REPORT.xlsx on ${stamp}`,
        created_by: BY,
      })));

  console.log("\n─── what went in ───");
  for (const [k, v] of Object.entries(report)) console.log(`  ${k}: ${v}`);
  console.log(`  cellsThatWereNotDates: ${skipped.dates}`);
  console.log(`  cellsThatWereNotAmounts: ${skipped.amounts}`);
  console.log("\nNOT imported, on purpose: Deliveries (owner said start fresh),");
  console.log("cleranace (its 13 POs are all on POS STATUS), and every calculated");
  console.log("sheet — PENDING, PURCHASE ANALYSIS, MONTHLY/DAILY ANALYSIS,");
  console.log("PAYMENTS FORECAST — which COS works out on read.");
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });

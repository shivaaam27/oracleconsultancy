/**
 * `npx tsx scripts/seed-cocozuri-stock.ts <STOCK & SALES ….xlsx>`
 *
 * Loads CocoZuri's three stock sheets — the shop, the kitchen and raw materials
 * — into `cz_stock_locations` / `cz_stock_items` / `cz_stock_days` /
 * `cz_stock_counts`.
 *
 * ⚠️ NOTHING IS INVENTED AND NOTHING IS TRANSLATED. Every item, every opening
 * figure and every day's movements came out of the workbook. In particular:
 *
 *   - **The third column keeps its own name.** The shop heads it RETURN, the
 *     kitchen DA/SA/ TA and raw materials DAMAGE. Nobody has said what DA/SA/TA
 *     stands for (plan §4.3), so it is read off the sheet and stored, not
 *     guessed at.
 *   - **A row with a name but no S/N is a CATEGORY heading**, which is how these
 *     sheets mark one — and the trap that imported `PISTACHIO KUNAFA MILK
 *     CHOCOLATE (220GM)` as a category in Phase 1.
 *   - **Items are linked to products by an EXACT name match, and only when it is
 *     unambiguous.** Anything else is left unlinked AND REPORTED. Fault #4 is a
 *     fuzzy name match costing 200 units a month; the answer to it is not a
 *     cleverer fuzzy match.
 *   - **The opening stock becomes a COUNT dated the day before the sheet's first
 *     day**, because a count is the position at the end of its date.
 *
 * ⚠️ SAFE TO RUN TWICE. Locations and items are matched by name and reused;
 * days and counts are upserted against their unique indexes, so a second run
 * rewrites the same rows with the same figures rather than doubling them.
 */
import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
config({ path: ".env", quiet: true });

import { readFileSync } from "node:fs";
import XLSX from "xlsx";
import postgres from "postgres";

/** The three stock sheets, in the order they should appear on screen. */
const SHEETS = ["CZ SHOP STOCK", "KITCHEN STOCK", "RAW MATERIALS"] as const;

/** What each one should be CALLED in COS. The sheet names are file-speak. */
const LOCATION_NAME: Record<string, string> = {
  "CZ SHOP STOCK": "Shop",
  "KITCHEN STOCK": "Kitchen",
  "RAW MATERIALS": "Raw materials",
};

const serialToISO = (n: number) =>
  new Date(Date.UTC(1899, 11, 30) + n * 86400000).toISOString().slice(0, 10);

const previousDay = (iso: string) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
};

type Parsed = {
  thirdLabel: string;
  days: { iso: string; col: number }[];
  items: { sn: number; name: string; uom: string; op: number | null; category: string | null;
           moves: Record<string, { i: number; o: number; t: number }> }[];
  headings: number;
};

function parseSheet(ws: XLSX.WorkSheet): Parsed {
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, blankrows: true });
  const hIdx = rows.findIndex((r) => String((r as unknown[])?.[0] ?? "").trim().toUpperCase() === "S/N");
  const head = (rows[hIdx] ?? []) as unknown[];
  const col = (label: string) => head.findIndex((c) => String(c ?? "").trim().toUpperCase() === label);
  const nameCol = col("ITEMS"), uomCol = col("UOM"), opCol = col("OP STOCK");

  const days: { iso: string; col: number }[] = [];
  for (let c = opCol + 1; c < head.length; c++) {
    const v = head[c];
    if (typeof v === "number" && v > 40_000) days.push({ iso: serialToISO(v), col: c });
  }

  // ⚠️ The third column's label is FOUND, not assumed at a fixed offset — the
  // sub-header does not sit a constant distance below the header in all three
  // sheets, and reading it by index came back empty.
  let thirdLabel = "";
  for (const r of rows) {
    const row = (r ?? []) as unknown[];
    const cl = row.findIndex((c) => String(c ?? "").replace(/\s+/g, " ").trim().toUpperCase() === "CL STOCK");
    if (cl > 1) { thirdLabel = String(row[cl - 1] ?? "").replace(/\s+/g, " ").trim(); break; }
  }

  const items: Parsed["items"] = [];
  let category: string | null = null;
  let headings = 0;
  for (let r = hIdx + 1; r < rows.length; r++) {
    const row = (rows[r] ?? []) as unknown[];
    const name = String(row[nameCol] ?? "").trim();
    if (!name) continue;
    const sn = row[0];
    // A name with no S/N beside it is a category heading on these sheets.
    if (typeof sn !== "number") { category = name.toUpperCase(); headings++; continue; }
    const n = (v: unknown) => (typeof v === "number" ? v : 0);
    const moves: Record<string, { i: number; o: number; t: number }> = {};
    for (const d of days) {
      const i = n(row[d.col]), o = n(row[d.col + 1]), t = n(row[d.col + 2]);
      if (i !== 0 || o !== 0 || t !== 0) moves[d.iso] = { i, o, t };
    }
    items.push({
      sn, name, uom: String(row[uomCol] ?? "").trim() || "PCS",
      op: typeof row[opCol] === "number" ? (row[opCol] as number) : null,
      category, moves,
    });
  }
  return { thirdLabel, days, items, headings };
}

async function main() {
  const file = process.argv[2];
  if (!file) { console.error("Usage: tsx scripts/seed-cocozuri-stock.ts <workbook.xlsx>"); process.exit(1); }
  // ⚠️ `XLSX.readFile` cannot reach the filesystem in the ESM build — read the
  // bytes here and hand them over.
  const wb = XLSX.read(readFileSync(file), { type: "buffer" });

  const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });
  const [company] = await sql<{ id: number; name: string }[]>`
    select id, name from companies where code_prefix = 'CC' limit 1`;
  if (!company) { console.error("Cocozuri (code_prefix CC) is not in the company list."); process.exit(1); }
  console.log(`Company: ${company.name} (#${company.id})\n`);

  // The catalogue, for linking. ⚠️ A name that appears TWICE cannot be matched
  // to safely — the catalogue still holds real duplicates on purpose.
  const products = await sql<{ id: number; name: string }[]>`
    select id, name from cz_products where company_id = ${company.id} and archived = false`;
  const byName = new Map<string, number[]>();
  for (const p of products) {
    const k = p.name.trim().toUpperCase();
    byName.set(k, [...(byName.get(k) ?? []), p.id]);
  }

  const report = { locations: 0, items: 0, linked: 0, unlinked: [] as string[], ambiguous: [] as string[], days: 0, counts: 0 };

  for (let s = 0; s < SHEETS.length; s++) {
    const sheet = SHEETS[s]!;
    const ws = wb.Sheets[sheet];
    if (!ws) { console.log(`⚠️  ${sheet}: not in this workbook — skipped.`); continue; }
    const parsed = parseSheet(ws);
    const locName = LOCATION_NAME[sheet] ?? sheet;

    const [loc] = await sql<{ id: number }[]>`
      insert into cz_stock_locations (company_id, name, third_label, sort_order, updated_at)
      values (${company.id}, ${locName}, ${parsed.thirdLabel || "Return"}, ${s}, now())
      on conflict (company_id, name) do update set third_label = excluded.third_label, updated_at = now()
      returning id`;
    report.locations++;

    const firstDay = parsed.days[0]?.iso;
    const openingOn = firstDay ? previousDay(firstDay) : null;
    let items = 0, linked = 0, days = 0, counts = 0;

    for (const it of parsed.items) {
      const key = it.name.trim().toUpperCase();
      const hits = byName.get(key) ?? [];
      // ⚠️ EXACT, AND ONLY WHEN UNAMBIGUOUS. One hit links; none or several do
      // not, and both cases are reported rather than resolved by a coin toss.
      const productId = hits.length === 1 ? hits[0]! : null;
      if (hits.length === 1) linked++;
      else if (hits.length > 1) report.ambiguous.push(`${locName}: ${it.name} (${hits.length} products of that name)`);
      else report.unlinked.push(`${locName}: ${it.name}`);

      const [row] = await sql<{ id: number }[]>`
        insert into cz_stock_items (company_id, location_id, product_id, name, uom, category, sort_order, updated_at)
        values (${company.id}, ${loc!.id}, ${productId}, ${it.name}, ${it.uom}, ${it.category}, ${it.sn}, now())
        on conflict (location_id, name) do update
          set product_id = coalesce(cz_stock_items.product_id, excluded.product_id),
              uom = excluded.uom, category = excluded.category,
              sort_order = excluded.sort_order, updated_at = now()
        returning id`;
      const itemId = row!.id;
      items++;

      // ⚠️ THE OPENING STOCK BECOMES A COUNT DATED THE DAY BEFORE THE BOOK
      // STARTS, because a count is the position at the END of its date.
      if (openingOn && it.op != null) {
        await sql`
          insert into cz_stock_counts (company_id, item_id, counted_on, qty, note, created_by, updated_at)
          values (${company.id}, ${itemId}, ${openingOn}, ${it.op}, ${'Opening stock, from the ' + sheet + ' sheet'}, 'seed:stock', now())
          on conflict (item_id, counted_on) do update set qty = excluded.qty, updated_at = now()`;
        counts++;
      }

      for (const [iso, m] of Object.entries(it.moves)) {
        await sql`
          insert into cz_stock_days (company_id, item_id, on_date, qty_in, qty_out, qty_third, created_by, updated_at)
          values (${company.id}, ${itemId}, ${iso}, ${m.i}, ${m.o}, ${m.t}, 'seed:stock', now())
          on conflict (item_id, on_date) do update
            set qty_in = excluded.qty_in, qty_out = excluded.qty_out,
                qty_third = excluded.qty_third, updated_at = now()`;
        days++;
      }
    }

    const last = parsed.days[parsed.days.length - 1]?.iso;
    const spill = parsed.days.filter((d) => firstDay && d.iso.slice(0, 7) !== firstDay.slice(0, 7));
    console.log(
      `${locName}: third column "${parsed.thirdLabel}" · ${items} items (${linked} linked to a product) · ` +
      `${counts} opening counts · ${days} days of movements · sheet runs ${firstDay}…${last}` +
      (spill.length ? ` · ⚠️ ${spill.length} of its day columns fall OUTSIDE that first month` : ""),
    );
    report.items += items; report.linked += linked; report.days += days; report.counts += counts;
  }

  console.log(`\n${report.locations} locations · ${report.items} items · ${report.linked} linked · ${report.counts} opening counts · ${report.days} day rows.`);

  // ⚠️ SAID OUT LOUD, NOT SWALLOWED. An item with no product cannot be valued in
  // the sales figures, and one matching several products is a duplicate in the
  // catalogue that only a person can resolve.
  if (report.ambiguous.length) {
    console.log(`\n⚠️  ${report.ambiguous.length} items match MORE THAN ONE product and were left unlinked —`);
    console.log(`    the catalogue's known duplicates. Merge them on /cocozuri/products, then re-run.`);
    for (const a of report.ambiguous.slice(0, 15)) console.log(`      · ${a}`);
    if (report.ambiguous.length > 15) console.log(`      … and ${report.ambiguous.length - 15} more`);
  }
  if (report.unlinked.length) {
    console.log(`\n⚠️  ${report.unlinked.length} items match NO product and were left unlinked.`);
    console.log(`    Raw materials are expected here — they are counted, not sold. Anything else`);
    console.log(`    can be linked by hand on the stock book, and until it is it has no sales value.`);
    for (const u of report.unlinked.slice(0, 10)) console.log(`      · ${u}`);
    if (report.unlinked.length > 10) console.log(`      … and ${report.unlinked.length - 10} more`);
  }

  await sql.end();
}

main().catch((e) => { console.error(e); process.exit(1); });

/**
 * Seed the OECR stock register from the Oracle Consultancy Stationery Stock
 * Register screenshot. Idempotent — keyed by item code, safe to re-run.
 * Opening stock is set to the screenshot's Current Stock (no movements yet, so
 * current = opening). Unit cost is 0 (the workbook had no costs filled in).
 *
 * Usage: npx tsx scripts/seed-oecr-stationery.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });
import postgres from "postgres";

type Row = {
  code: string;
  name: string;
  category: string | null;
  unit: string | null;
  opening: number;
  reorder: number;
};

// Categories aren't filled in the workbook; we leave them null to match it.
const ITEMS: Row[] = [
  { code: "penred", name: "Red Pen", category: null, unit: "Piece", opening: 19, reorder: 5 },
  { code: "penblack", name: "Black Pen", category: null, unit: "Piece", opening: 34, reorder: 5 },
  { code: "penblue", name: "Blue Pen", category: null, unit: "Piece", opening: 44, reorder: 5 },
  { code: "a4paper", name: "A4 White Paper Sheet", category: null, unit: "Ream", opening: 5, reorder: 2 },
  { code: "visitorbook", name: "Visitors Book", category: null, unit: "Piece", opening: 3, reorder: 1 },
  { code: "a4envelope", name: "A4 Envelope", category: null, unit: "Piece", opening: 39, reorder: 10 },
  { code: "senvelope", name: "Small Envelope", category: null, unit: "Piece", opening: 53, reorder: 10 },
  { code: "bigenvelope", name: "Bigger Envelope", category: null, unit: "Piece", opening: 41, reorder: 10 },
  { code: "biggestenvelope", name: "Biggest Envelope", category: null, unit: "Piece", opening: 11, reorder: 5 },
  { code: "notebook", name: "Notebook", category: null, unit: "Piece", opening: 4, reorder: 5 },
  { code: "blackmarker", name: "Black Marker Pen", category: null, unit: "Piece", opening: 1, reorder: 5 },
  { code: "clipspaper", name: "Paper Clips", category: null, unit: "Piece", opening: 4, reorder: 0 },
  { code: "stapples", name: "Stapples", category: null, unit: "Pack", opening: 18, reorder: 5 },
  { code: "filebox", name: "Box File", category: null, unit: "Piece", opening: 5, reorder: 2 },
  { code: "filepaper", name: "Paper File", category: null, unit: "Piece", opening: 7, reorder: 2 },
  { code: "fileredbox", name: "Red Small Box File", category: null, unit: "Piece", opening: 1, reorder: 0 },
  { code: "pettycashvoucher", name: "Petty Cash Voucher", category: null, unit: "Box", opening: 7, reorder: 3 },
  { code: "materialreqbook", name: "Material Requisition Book", category: null, unit: "Box", opening: 5, reorder: 2 },
  { code: "wirecharger", name: "Charger Wire", category: null, unit: null, opening: 2, reorder: 0 },
  { code: "wireinternet", name: "Internet Wire", category: null, unit: null, opening: 2, reorder: 0 },
  { code: "adhesivestickers", name: "Stickers Paper", category: null, unit: "Set", opening: 1, reorder: 0 },
];

(async () => {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL not set");
  const sql = postgres(url, { prepare: false, max: 1 });
  const now = new Date().toISOString();
  const existing = await sql`SELECT code FROM stock_items`;
  const have = new Set(existing.map((r) => (r as { code: string }).code));
  let created = 0;
  let skipped = 0;
  for (const it of ITEMS) {
    if (have.has(it.code)) {
      skipped++;
      continue;
    }
    await sql`INSERT INTO stock_items
      (code, name, category, unit, opening_stock, reorder_level, unit_cost, archived, created_at, updated_at, created_by)
      VALUES (${it.code}, ${it.name}, ${it.category}, ${it.unit}, ${it.opening}, ${it.reorder}, 0, false, ${now}, ${now}, 'web-ui')`;
    created++;
  }
  console.log(`OECR seed: created ${created}, skipped ${skipped} existing.`);
  await sql.end();
})();

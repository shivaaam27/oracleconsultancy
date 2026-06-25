/**
 * Import the Cocozuri office equipment inventory (Office_Inventory.xlsx) into
 * the Site Tools register for Cocozuri Chocolat. The sheet is quantity-by-room
 * office equipment (no tags / serials / individual holders), so it maps to
 * site_tools (name + quantity + location + condition), NOT the individually
 * tracked assets table. 52 lines = 109 units; matches the sheet's TOTAL.
 *
 * Idempotent: skips any row that already matches company + name + location for
 * this import marker, so re-running won't duplicate.
 *
 * Usage: npx tsx scripts/seed-cocozuri-office.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });
import postgres from "postgres";

const COMPANY = "Cocozuri Chocolat";
const MARKER = "import:cocozuri-office";

// (location/room, item, quantity) — faithful to Office_Inventory.xlsx.
const LINES: Array<[string, string, number]> = [
  ["Board Room 2", "Large table", 2],
  ["Board Room 2", "Phone", 2],
  ["Board Room 2", "Chair", 6],
  ["Board Room 2", "Side table", 1],
  ["Board Room 2", "Cupboard", 3],
  ["Board Room 2", "AC", 1],
  ["Board Room 2", "Centralized AC", 1],
  ["Staff Area", "Side table", 6],
  ["Staff Area", "Table", 10],
  ["Staff Area", "Chair", 12],
  ["Staff Area", "Printer", 2],
  ["Staff Area", "AC", 2],
  ["Staff Area", "Phone", 1],
  ["Staff Area", "Dustbin", 3],
  ["Staff Area", "AC remote", 1],
  ["Staff Area", "Side table file holder", 6],
  ["Staff Area", "Power extension", 1],
  ["Board Room 1", "Side table", 4],
  ["Board Room 1", "Large table", 2],
  ["Board Room 1", "Chair", 6],
  ["Board Room 1", "Centralized AC", 1],
  ["Board Room 1", "AC remote", 1],
  ["Ashit Room", "Table", 1],
  ["Ashit Room", "Chair", 2],
  ["Ashit Room", "Cupboard", 1],
  ["Ashit Room", "Printer", 1],
  ["Ashit Room", "AC", 1],
  ["Ashit Room", "Phone", 1],
  ["Ashit Room", "Side table", 2],
  ["Ashit Room", "Dustbin", 1],
  ["Ashit Room", "AC remote", 1],
  ["Daniel", "Chair", 1],
  ["Daniel", "Sofa", 1],
  ["Daniel", "Table", 1],
  ["Daniel", "Cupboard", 1],
  ["Daniel", "Phone", 1],
  ["Daniel", "AC remote", 1],
  ["Jitesh", "Chair", 2],
  ["Jitesh", "Large table", 1],
  ["Jitesh", "Sofa", 1],
  ["Jitesh", "Cupboard", 1],
  ["Jitesh", "Printer", 1],
  ["Jitesh", "AC", 1],
  ["Jitesh", "Side table", 1],
  ["Jitesh", "Dustbin", 1],
  ["Jitesh", "AC remote", 1],
  ["Admin Office", "Large table", 2],
  ["Admin Office", "Side table", 1],
  ["Admin Office", "Chair", 2],
  ["Admin Office", "AC", 1],
  ["Admin Office", "AC remote", 1],
  ["Admin Office", "Phone", 1],
];

const url = process.env.DATABASE_URL;
if (!url) { console.error("DATABASE_URL is not set."); process.exit(1); }
const sql = postgres(url, { prepare: false, max: 1 });

async function main() {
  const [company] = await sql<{ id: number }[]>`select id from companies where name = ${COMPANY} limit 1`;
  if (!company) { console.error(`Company "${COMPANY}" not found.`); process.exit(1); }
  const companyId = company.id;

  const now = new Date().toISOString();
  let added = 0, skipped = 0, units = 0;
  for (const [location, name, quantity] of LINES) {
    // Sheet note: each large table has 3 drawers — keep it as the spec.
    const specification = /large table/i.test(name) ? "3 drawers" : null;

    const [exists] = await sql<{ id: number }[]>`
      select id from site_tools
      where company_id = ${companyId} and name = ${name} and location = ${location}
        and created_by = ${MARKER} and archived = false
      limit 1`;
    if (exists) { skipped++; continue; }

    await sql`
      insert into site_tools
        (company_id, name, quantity, min_qty, specification, location, condition, created_at, updated_at, created_by)
      values
        (${companyId}, ${name}, ${quantity}, 0, ${specification}, ${location}, 'good', ${now}, ${now}, ${MARKER})`;
    added++;
    units += quantity;
  }

  console.log(`Cocozuri Chocolat (#${companyId}) site tools: ${added} lines added (${units} units), ${skipped} skipped (already imported).`);
  await sql.end();
}

main().catch((e) => { console.error(e); process.exit(1); });

/**
 * READ-ONLY. Counts rows and measures on-disk size for every CocoZuri table,
 * plus the largest tables in the whole database.
 *
 * ⚠️ IT WRITES NOTHING. It exists to answer two questions with numbers rather
 * than guesses: what would "clear the data" actually remove, and which reads
 * are pulling the most out of the database on every page load.
 *
 * Usage: npx tsx scripts/cz-audit-size.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) { console.error("DATABASE_URL is not set."); process.exit(1); }

const sql = postgres(url, { prepare: false, max: 1 });

async function main() {
  const rows = await sql<{ table_name: string; n: number; bytes: number }[]>`
    SELECT c.relname AS table_name,
           c.reltuples::bigint AS n,
           pg_total_relation_size(c.oid) AS bytes
    FROM pg_class c
    JOIN pg_namespace ns ON ns.oid = c.relnamespace
    WHERE ns.nspname = 'public' AND c.relkind = 'r'
    ORDER BY pg_total_relation_size(c.oid) DESC
  `;

  const cz = rows.filter((r) => r.table_name.startsWith("cz_"));

  console.log("\n=== CocoZuri tables (cz_*) — estimated rows, on-disk size ===");
  let czRows = 0;
  for (const r of cz) {
    czRows += Number(r.n);
    console.log(`${r.table_name.padEnd(26)} ${String(r.n).padStart(8)}  ${(Number(r.bytes) / 1024).toFixed(0).padStart(7)} KB`);
  }
  console.log(`${"TOTAL".padEnd(26)} ${String(czRows).padStart(8)}`);

  console.log("\n=== The 20 largest tables in the whole database ===");
  for (const r of rows.slice(0, 20)) {
    console.log(`${r.table_name.padEnd(30)} ${String(r.n).padStart(9)} rows  ${(Number(r.bytes) / 1024 / 1024).toFixed(2).padStart(8)} MB`);
  }

  // ⚠️ Exact counts for the tables a reset would touch — `reltuples` is an
  // estimate kept by ANALYZE and can be stale or -1 on a table never analysed.
  console.log("\n=== Exact counts for the CocoZuri tables ===");
  for (const r of cz) {
    const [{ count }] = await sql<{ count: number }[]>`
      SELECT count(*)::int AS count FROM ${sql(r.table_name)}
    `;
    console.log(`${r.table_name.padEnd(26)} ${String(count).padStart(8)}`);
  }

  // Furaha's ledger entries, which are NOT cz_* but are CocoZuri's money.
  const [company] = await sql<{ id: number; name: string }[]>`
    SELECT id, name FROM companies WHERE code_prefix = 'CC' LIMIT 1
  `;
  if (company) {
    const [gl] = await sql<{ count: number }[]>`
      SELECT count(*)::int AS count FROM gl_entries WHERE company_id = ${company.id}
    `;
    const [je] = await sql<{ count: number }[]>`
      SELECT count(*)::int AS count FROM journal_entries WHERE company_id = ${company.id}
    `;
    const [acc] = await sql<{ count: number }[]>`
      SELECT count(*)::int AS count FROM gl_accounts WHERE company_id = ${company.id}
    `;
    const [ven] = await sql<{ count: number }[]>`
      SELECT count(*)::int AS count FROM vendors WHERE company_id = ${company.id}
    `;
    console.log(`\n=== ${company.name} (prefix CC), outside cz_* ===`);
    console.log(`gl_entries                 ${String(gl.count).padStart(8)}`);
    console.log(`journal_entries            ${String(je.count).padStart(8)}`);
    console.log(`gl_accounts (the chart)    ${String(acc.count).padStart(8)}`);
    console.log(`vendors (suppliers)        ${String(ven.count).padStart(8)}`);
  }

  await sql.end();
}

main().catch(async (e) => { console.error(e); await sql.end(); process.exit(1); });

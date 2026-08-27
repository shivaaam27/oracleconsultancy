/**
 * **Empty the CocoZuri module.** Everything: the catalogue, the customers, the
 * stock items, the shelves, the lists, and every movement, sheet, count, batch,
 * purchase, transfer, invoice and receipt ever recorded against them.
 *
 * ⚠️ THIS DELETES REAL DATA AND IT DOES NOT COME BACK. Take `npm run db:backup`
 * first. The owner asked for it (27 Aug 2026) so he can enter everything
 * himself from scratch.
 *
 * ⚠️ IT DOES NOT TOUCH THE CHART OF ACCOUNTS. `gl_accounts` belongs to the
 * general ledger, not to CocoZuri — it is a template, not data, and wiping it
 * would leave nothing able to post with no way back but a re-seed. Furaha's
 * `gl_entries` and `journal_entries` are emptied where they exist, because
 * those ARE its money.
 *
 * ⚠️ IT REFUSES IF ANYTHING OUTSIDE THE MODULE POINTS INTO IT. `TRUNCATE …
 * CASCADE` would silently empty that table too, and "I cleared CocoZuri and my
 * documents went" is not a thing anybody should be able to do by accident.
 *
 * Usage: npx tsx scripts/cz-reset.ts --yes
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) { console.error("DATABASE_URL is not set."); process.exit(1); }
if (!process.argv.includes("--yes")) {
  console.error("Refusing to run without --yes. This deletes every CocoZuri row.");
  process.exit(1);
}

const sql = postgres(url, { prepare: false, max: 1 });

async function main() {
  // Every cz_* table there is, asked for rather than typed from memory — a
  // table added later and forgotten would otherwise survive the reset.
  const tables = (await sql<{ table_name: string }[]>`
    SELECT c.relname AS table_name
    FROM pg_class c JOIN pg_namespace ns ON ns.oid = c.relnamespace
    WHERE ns.nspname = 'public' AND c.relkind = 'r' AND c.relname LIKE 'cz\\_%'
    ORDER BY c.relname
  `).map((r) => r.table_name);

  if (tables.length === 0) { console.log("No cz_* tables found."); await sql.end(); return; }

  // ⚠️ The safety check. CASCADE empties whatever points at these, so anything
  // outside the module holding a reference has to be a deliberate decision.
  const outside = await sql<{ child: string; parent: string }[]>`
    SELECT tc.table_name AS child, ccu.table_name AS parent
    FROM information_schema.table_constraints tc
    JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND ccu.table_name LIKE 'cz\\_%'
      AND tc.table_name NOT LIKE 'cz\\_%'
  `;
  if (outside.length > 0) {
    console.error("REFUSING — these tables outside CocoZuri point into it:");
    for (const o of outside) console.error(`  ${o.child} -> ${o.parent}`);
    await sql.end();
    process.exit(1);
  }

  const before: Record<string, number> = {};
  for (const t of tables) {
    const [{ count }] = await sql<{ count: number }[]>`SELECT count(*)::int AS count FROM ${sql(t)}`;
    before[t] = count;
  }
  const total = Object.values(before).reduce((a, b) => a + b, 0);
  console.log(`\nEmptying ${tables.length} CocoZuri tables — ${total} rows.\n`);

  /* ⚠️ ONE STATEMENT, so foreign keys between them never come into it, and
     RESTART IDENTITY so the first product entered by hand is #1 rather than
     #129. CASCADE is safe here only because of the check above. */
  await sql.unsafe(`TRUNCATE TABLE ${tables.map((t) => `"${t}"`).join(", ")} RESTART IDENTITY CASCADE`);

  // Furaha's own money, which does not live in a cz_ table.
  const [company] = await sql<{ id: number; name: string }[]>`
    SELECT id, name FROM companies WHERE code_prefix = 'CC' LIMIT 1
  `;
  let gl = 0, je = 0;
  if (company) {
    const g = await sql`DELETE FROM gl_entries WHERE company_id = ${company.id} RETURNING id`;
    const j = await sql`DELETE FROM journal_entries WHERE company_id = ${company.id} RETURNING id`;
    gl = g.length; je = j.length;
  }

  // Proved by effect, never by the absence of an error.
  let leftover = 0;
  for (const t of tables) {
    const [{ count }] = await sql<{ count: number }[]>`SELECT count(*)::int AS count FROM ${sql(t)}`;
    if (count > 0) { console.log(`  STILL HAS ROWS: ${t} = ${count}`); leftover += count; }
  }

  for (const t of tables) if (before[t] > 0) console.log(`  ${t.padEnd(26)} ${String(before[t]).padStart(6)} -> 0`);
  if (company) {
    console.log(`\n  ${company.name}: gl_entries ${gl} removed, journal_entries ${je} removed.`);
    const [{ count: acc }] = await sql<{ count: number }[]>`
      SELECT count(*)::int AS count FROM gl_accounts WHERE company_id = ${company.id}
    `;
    console.log(`  Chart of accounts KEPT: ${acc} accounts.`);
  }
  console.log(leftover === 0 ? "\nCocoZuri is empty.\n" : `\n${leftover} rows survived — look above.\n`);

  await sql.end();
}

main().catch(async (e) => { console.error(e); await sql.end(); process.exit(1); });

/**
 * One-shot: nulls out the legacy literal "NO REASON PROVIDED" change_reason
 * strings (519 rows from an older code version). Current code never writes
 * this string; rendering treats NULL as "no reason shown".
 */
import { config } from "dotenv"; config({ path: ".env.local" });
import postgres from "postgres";

async function main() {
  const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });
  const before = await sql`SELECT COUNT(*)::int AS n FROM audit_log WHERE change_reason = 'NO REASON PROVIDED'`;
  console.log(`Found ${before[0].n} rows with literal "NO REASON PROVIDED".`);
  const res = await sql`UPDATE audit_log SET change_reason = NULL WHERE change_reason = 'NO REASON PROVIDED'`;
  console.log(`✓ Nulled ${res.count} rows.`);
  await sql.end();
}
main();

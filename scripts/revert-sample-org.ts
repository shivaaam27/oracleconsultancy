/** Revert the sample reporting lines set by seed-sample-org.ts. */
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });
import postgres from "postgres";

const NAMES = ["Jay", "Mona", "Pankaj", "Hiral", "Neema", "Vishal", "Neema Clearning Agent",
  "Beka", "Benja", "Jigna", "Sahel", "Shvam", "Sulleiman", "Suma", "Yuvi"];

(async () => {
  const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });
  for (const n of NAMES) await sql`UPDATE people SET manager_id = NULL WHERE name = ${n}`;
  await sql`DELETE FROM reporting_lines`;
  const c = await sql<{ c: number }[]>`SELECT count(*)::int AS c FROM people WHERE manager_id IS NOT NULL AND active`;
  const rl = await sql<{ c: number }[]>`SELECT count(*)::int AS c FROM reporting_lines`;
  console.log(`Reverted. people-with-manager=${c[0].c} reporting_lines=${rl[0].c}`);
  await sql.end();
})();

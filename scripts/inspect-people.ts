/**
 * Read-only audit of the people table: finds combined "X and Y" names and
 * case-insensitive duplicate names so we can plan a safe cleanup.
 */
import { config } from "dotenv"; config({ path: ".env.local" });
import postgres from "postgres";

async function main() {
  const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });

  const combined = await sql<{ id: number; name: string; company_id: number | null }[]>`
    SELECT id, name, company_id FROM people
    WHERE name ~* ' and | & |,' ORDER BY name`;
  console.log(`\n=== Combined-looking names (${combined.length}) ===`);
  for (const p of combined) console.log(`  #${p.id}  "${p.name}"  (company ${p.company_id ?? "-"})`);

  const dupes = await sql<{ lname: string; ids: number[]; names: string[] }[]>`
    SELECT lower(trim(name)) AS lname, array_agg(id) AS ids, array_agg(name) AS names
    FROM people GROUP BY lower(trim(name)) HAVING COUNT(*) > 1 ORDER BY lname`;
  console.log(`\n=== Duplicate names (${dupes.length}) ===`);
  for (const d of dupes) console.log(`  "${d.lname}" → ids ${d.ids.join(", ")}`);

  // For each combined person, show how many tasks they're linked to.
  for (const p of combined) {
    const links = await sql<{ n: number }[]>`SELECT COUNT(*)::int AS n FROM task_assignees WHERE person_id = ${p.id}`;
    console.log(`  #${p.id} "${p.name}" → ${links[0].n} task link(s)`);
  }

  await sql.end();
}
main();

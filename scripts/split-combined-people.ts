/**
 * One-shot cleanup: split combined "X and Y" people into individuals.
 * For each combined person:
 *   1. ensure each part exists as its own person (case-insensitive),
 *   2. repoint any task_assignees from the combined row to the individuals,
 *   3. delete the combined row.
 * Safe to re-run.
 */
import { config } from "dotenv"; config({ path: ".env.local" });
import postgres from "postgres";

function splitName(v: string): string[] {
  return v.split(/\s+and\s+|\s*&\s*|\s*,\s*/i).map((x) => x.trim()).filter(Boolean);
}

async function main() {
  const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });

  const combined = await sql<{ id: number; name: string; company_id: number | null }[]>`
    SELECT id, name, company_id FROM people WHERE name ~* '\\sand\\s|\\s&\\s'`;

  if (combined.length === 0) { console.log("Nothing to split. ✓"); await sql.end(); return; }

  for (const c of combined) {
    const parts = splitName(c.name);
    if (parts.length < 2) continue;
    console.log(`Splitting #${c.id} "${c.name}" → ${parts.join(", ")}`);

    const ids: number[] = [];
    for (const part of parts) {
      const found = await sql<{ id: number }[]>`SELECT id FROM people WHERE lower(trim(name)) = ${part.toLowerCase()} LIMIT 1`;
      if (found.length) { ids.push(found[0].id); console.log(`  • "${part}" exists (#${found[0].id})`); }
      else {
        const ins = await sql<{ id: number }[]>`
          INSERT INTO people (name, company_id, active) VALUES (${part}, ${c.company_id}, true) RETURNING id`;
        ids.push(ins[0].id); console.log(`  • created "${part}" (#${ins[0].id})`);
      }
    }

    // Repoint task links from the combined person to each individual.
    const links = await sql<{ task_id: number }[]>`SELECT task_id FROM task_assignees WHERE person_id = ${c.id}`;
    for (const { task_id } of links) {
      for (const pid of ids) {
        await sql`INSERT INTO task_assignees (task_id, person_id) VALUES (${task_id}, ${pid}) ON CONFLICT DO NOTHING`;
      }
    }
    await sql`DELETE FROM task_assignees WHERE person_id = ${c.id}`;
    // Repoint ownership to the first individual, and make all parts assignees of owned tasks.
    const owned = await sql<{ id: number }[]>`SELECT id FROM tasks WHERE owner_id = ${c.id}`;
    for (const { id: taskId } of owned) {
      for (const pid of ids) {
        await sql`INSERT INTO task_assignees (task_id, person_id) VALUES (${taskId}, ${pid}) ON CONFLICT DO NOTHING`;
      }
    }
    await sql`UPDATE tasks SET owner_id = ${ids[0]} WHERE owner_id = ${c.id}`;
    await sql`UPDATE people SET manager_id = NULL WHERE manager_id = ${c.id}`;
    await sql`UPDATE people SET related_person_id = NULL WHERE related_person_id = ${c.id}`;
    await sql`DELETE FROM person_companies WHERE person_id = ${c.id}`;
    await sql`DELETE FROM people WHERE id = ${c.id}`;
    console.log(`  ✓ removed combined #${c.id} (repointed ${links.length} task link(s))`);
  }

  await sql.end();
  console.log("Done. ✓");
}
main();

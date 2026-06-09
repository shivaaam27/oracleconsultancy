/**
 * SAMPLE reporting lines so the organogram has depth to test. Plausible but
 * invented — change or clear in the person form anytime.
 * Revert: UPDATE people SET manager_id=NULL WHERE name IN (...the reports...);
 *         DELETE FROM reporting_lines WHERE ...
 * Usage: npx tsx scripts/seed-sample-org.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });
import postgres from "postgres";

// person name -> primary manager name (manager looked up globally by unique name)
const PRIMARY: Record<string, string> = {
  // Dar Spices
  Jay: "Jitesh", Mona: "Jitesh", Pankaj: "Jitesh",
  Hiral: "Pankaj", Neema: "Pankaj",
  Vishal: "Jay", "Neema Clearning Agent": "Mona",
  // Oracle Consultancy
  Beka: "Ashit", Benja: "Ashit", Jigna: "Ashit",
  Sahel: "Benja", Shvam: "Benja",
  Sulleiman: "Jigna", Suma: "Jigna", Yuvi: "Jigna",
};
// cross-company dotted "also reports to"
const SECONDARY: Array<[string, string]> = [["Pankaj", "Ashit"]];

(async () => {
  const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });
  const rows = await sql<{ id: number; name: string }[]>`SELECT id, name FROM people`;
  const idByName = new Map(rows.map((r) => [r.name, r.id]));
  let set = 0;
  for (const [person, manager] of Object.entries(PRIMARY)) {
    const pid = idByName.get(person), mid = idByName.get(manager);
    if (pid && mid) { await sql`UPDATE people SET manager_id=${mid} WHERE id=${pid}`; set++; }
    else console.warn(`skip primary ${person} -> ${manager} (missing)`);
  }
  let sec = 0;
  for (const [person, manager] of SECONDARY) {
    const pid = idByName.get(person), mid = idByName.get(manager);
    if (pid && mid) {
      await sql`INSERT INTO reporting_lines (person_id, manager_id) VALUES (${pid}, ${mid}) ON CONFLICT DO NOTHING`;
      sec++;
    }
  }
  console.log(`Set ${set} primary reporting lines + ${sec} dotted lines.`);
  await sql.end();
})();

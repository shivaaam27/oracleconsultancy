/**
 * Read-only org-chart data readiness check.
 * Reports how complete `people.manager_id` is, so we know whether the
 * organogram will render as a real tree or a flat pile.
 * Usage: npx tsx scripts/check-manager-coverage.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });
import postgres from "postgres";

type Row = {
  id: number;
  name: string;
  active: boolean;
  person_type: string | null;
  manager_id: number | null;
  company_id: number | null;
  company_name: string | null;
};

(async () => {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL not set");
  const sql = postgres(url, { prepare: false, max: 1 });

  const rows = (await sql`
    SELECT p.id, p.name, p.active, p.person_type, p.manager_id,
           p.company_id, c.name AS company_name
    FROM people p
    LEFT JOIN companies c ON c.id = p.company_id
    ORDER BY c.name NULLS LAST, p.name
  `) as unknown as Row[];

  const active = rows.filter((r) => r.active);
  const withMgr = active.filter((r) => r.manager_id != null);
  const noMgr = active.filter((r) => r.manager_id == null);

  // Staff types we'd expect to have a manager (candidates/outsiders often won't).
  const STAFF = new Set(["local_staff", "expat", "internal"]);
  const staffNoMgr = noMgr.filter((r) => STAFF.has(r.person_type ?? ""));

  // How many people are managers (appear as someone's manager_id)?
  const mgrIds = new Set(active.map((r) => r.manager_id).filter(Boolean) as number[]);

  console.log("\n=== Org chart data readiness ===\n");
  console.log(`Active people:            ${active.length}`);
  console.log(`  with a manager set:     ${withMgr.length}`);
  console.log(`  without a manager:      ${noMgr.length}`);
  console.log(`People who ARE a manager: ${mgrIds.size}`);
  console.log(`\nDistinct reporting lines: ${withMgr.length}`);

  // Per-company breakdown.
  const byCompany = new Map<string, { total: number; withMgr: number }>();
  for (const r of active) {
    const key = r.company_name ?? "— No company —";
    const e = byCompany.get(key) ?? { total: 0, withMgr: 0 };
    e.total++;
    if (r.manager_id != null) e.withMgr++;
    byCompany.set(key, e);
  }
  console.log("\nPer company (with manager / total):");
  for (const [name, e] of [...byCompany.entries()].sort()) {
    console.log(`  ${name.padEnd(24)} ${e.withMgr}/${e.total}`);
  }

  if (staffNoMgr.length) {
    console.log(`\nStaff/expats with NO manager (likely tree roots — fill these in):`);
    for (const r of staffNoMgr) {
      console.log(`  • ${r.name}  [${r.person_type}]  ${r.company_name ?? "no company"}`);
    }
  } else {
    console.log("\nEvery active staff member / expat has a manager set. ✓");
  }

  await sql.end();
})();

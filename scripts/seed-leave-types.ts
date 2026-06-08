/**
 * Seed default leave types. Idempotent — keyed by name, safe to re-run.
 * Usage: npx tsx scripts/seed-leave-types.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });
import postgres from "postgres";

const TYPES: Array<{ name: string; color: string; paid: boolean; defaultDays: number; sortOrder: number }> = [
  { name: "Annual", color: "#2563eb", paid: true, defaultDays: 28, sortOrder: 0 },
  { name: "Sick", color: "#dc2626", paid: true, defaultDays: 14, sortOrder: 1 },
  { name: "Maternity", color: "#db2777", paid: true, defaultDays: 84, sortOrder: 2 },
  { name: "Paternity", color: "#7c3aed", paid: true, defaultDays: 3, sortOrder: 3 },
  { name: "Compassionate", color: "#0891b2", paid: true, defaultDays: 5, sortOrder: 4 },
  { name: "Unpaid", color: "#6b7280", paid: false, defaultDays: 0, sortOrder: 5 },
];

(async () => {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL not set");
  const sql = postgres(url, { prepare: false, max: 1 });
  const now = new Date().toISOString();
  const existing = await sql`SELECT name FROM leave_types`;
  const have = new Set(existing.map((r) => (r as { name: string }).name));
  let created = 0;
  for (const t of TYPES) {
    if (have.has(t.name)) continue;
    await sql`INSERT INTO leave_types (name, color, paid, default_days, active, sort_order, created_at)
      VALUES (${t.name}, ${t.color}, ${t.paid}, ${t.defaultDays}, true, ${t.sortOrder}, ${now})`;
    created++;
  }
  console.log(`Seeded ${created} leave type(s).`);
  await sql.end();
})();

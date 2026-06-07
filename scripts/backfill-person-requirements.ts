/**
 * Backfill person_requirements for every active person from their type's
 * profile. Idempotent — only inserts rows that don't already exist.
 *
 * Usage: npx tsx scripts/backfill-person-requirements.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

import postgres from "postgres";

function normalizeType(v: string | null): string {
  switch (v) {
    case "expat": return "expat";
    case "external":
    case "outsider": return "outsider";
    case "candidate": return "candidate";
    default: return "local_staff";
  }
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL not set");
  const sql = postgres(url, { prepare: false, max: 1 });
  const now = new Date().toISOString();

  // Profile items keyed by applies_to_type.
  const items = await sql<{ id: number; profile_type: string; label: string; category: string | null; mandatory: boolean; expiry_tracked: boolean }[]>`
    select ri.id, rp.applies_to_type as profile_type, ri.label, ri.category, ri.mandatory, ri.expiry_tracked
    from requirement_items ri
    join requirement_profiles rp on rp.id = ri.profile_id and rp.active = true`;
  const itemsByType = new Map<string, typeof items>();
  for (const it of items) {
    const list = itemsByType.get(it.profile_type) ?? ([] as unknown as typeof items);
    list.push(it);
    itemsByType.set(it.profile_type, list);
  }

  const people = await sql<{ id: number; person_type: string | null }[]>`select id, person_type from people where active = true`;
  const existing = await sql<{ person_id: number; item_id: number | null }[]>`select person_id, item_id from person_requirements`;
  const have = new Set(existing.map((r) => `${r.person_id}:${r.item_id}`));

  let inserted = 0;
  for (const p of people) {
    const type = normalizeType(p.person_type);
    const target = itemsByType.get(type) ?? [];
    for (const it of target) {
      if (have.has(`${p.id}:${it.id}`)) continue;
      await sql`
        insert into person_requirements (person_id, item_id, label, category, mandatory, expiry_tracked, status, created_at, updated_at)
        values (${p.id}, ${it.id}, ${it.label}, ${it.category}, ${it.mandatory}, ${it.expiry_tracked}, 'missing', ${now}, ${now})`;
      inserted++;
    }
  }

  console.log(`Backfill complete. ${inserted} requirement row(s) inserted across ${people.length} people.`);
  await sql.end();
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });

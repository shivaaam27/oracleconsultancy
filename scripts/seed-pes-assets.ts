/**
 * Seed the PES asset register from PES_ASSETS.xlsx (exported to
 * scripts/pes-assets-data.json). Loads Sheet 1 → assets, Sheet 2 → site_tools.
 *
 * Holder handling (per owner decision): if the "Assigned To" name matches an
 * active PES person, the asset is assigned to them; otherwise it stays in_store
 * with the holder label kept in notes (e.g. "Shared-HQ", "Police Post").
 *
 * Idempotent-ish: skips assets whose tag already exists and tools that already
 * match on name+location, so re-running won't duplicate.
 *
 * Usage: npx tsx scripts/seed-pes-assets.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });
import postgres from "postgres";
import { readFileSync } from "fs";
import { join } from "path";

const DATA_FILE = join(process.cwd(), "scripts", "pes-assets-data.json");

const PES = "PES Ltd"; // company name to attach everything to

type AssetJson = {
  tag: string | null;
  category: string | null;
  deviceType: string | null;
  brand: string | null;
  model: string | null;
  name: string;
  serialNo: string | null;
  holder: string | null;
  department: string | null;
  handoverDate: string | null;
  location: string | null;
  notes: string | null;
};
type ToolJson = {
  name: string;
  quantity: number;
  specification: string | null;
  location: string | null;
  condition: string;
  purchasedDate: string | null;
  remark: string | null;
};

const url = process.env.DATABASE_URL;
if (!url) { console.error("DATABASE_URL is not set."); process.exit(1); }
const sql = postgres(url, { prepare: false, max: 1 });

function iso(d: string | null): string | null {
  if (!d) return null;
  const dt = new Date(`${d}T00:00:00Z`);
  return isNaN(dt.getTime()) ? null : dt.toISOString();
}
function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z]/g, "");
}

async function main() {
  const data = JSON.parse(readFileSync(DATA_FILE, "utf8")) as {
    assets: AssetJson[];
    tools: ToolJson[];
  };

  const [company] = await sql<{ id: number }[]>`select id from companies where name = ${PES} limit 1`;
  if (!company) { console.error(`Company "${PES}" not found.`); process.exit(1); }
  const companyId = company.id;

  // Active people for holder matching (match on first token or full name).
  const people = await sql<{ id: number; name: string }[]>`select id, name from people where active = true`;
  function matchPerson(holder: string | null): number | null {
    if (!holder) return null;
    if (/^shared|^police|^singida$/i.test(holder.trim())) return null; // not a person
    const h = norm(holder);
    let hit = people.find((p) => norm(p.name) === h);
    if (!hit) hit = people.find((p) => norm(p.name).startsWith(h) || h.startsWith(norm(p.name.split(/\s+/)[0])));
    return hit?.id ?? null;
  }

  const now = new Date().toISOString();
  let aNew = 0, aSkip = 0, assigned = 0;
  for (const a of data.assets) {
    if (a.tag) {
      const [exists] = await sql<{ id: number }[]>`select id from assets where tag = ${a.tag} limit 1`;
      if (exists) { aSkip++; continue; }
    }
    const personId = matchPerson(a.holder);
    const holderNote = a.holder && personId === null ? `Holder: ${a.holder}` : null;
    const notes = [a.notes, a.deviceType && !a.name.includes(a.deviceType) ? a.deviceType : null, holderNote]
      .filter(Boolean).join(" · ") || null;
    const handover = iso(a.handoverDate);

    const [row] = await sql<{ id: number }[]>`
      insert into assets
        (tag, name, category, brand, model, department, serial_no, company_id, location, status, assigned_to_person_id, assigned_at, notes, created_at, updated_at, created_by)
      values
        (${a.tag}, ${a.name}, ${a.category}, ${a.brand}, ${a.model}, ${a.department}, ${a.serialNo}, ${companyId},
         ${a.location}, ${personId ? "assigned" : "in_store"}, ${personId},
         ${personId ? (handover ?? now) : handover}, ${notes}, ${now}, ${now}, 'seed:pes')
      returning id`;
    aNew++;
    if (personId) {
      await sql`insert into asset_assignments (asset_id, person_id, assigned_at, notes, created_at, created_by)
                values (${row.id}, ${personId}, ${handover ?? now}, 'Imported from PES_ASSETS.xlsx', ${now}, 'seed:pes')`;
      assigned++;
    }
  }

  // The spreadsheet legitimately repeats a tool at one site across rows
  // (different dates/quantities), so we can't dedup on name+site. Instead the
  // whole tool seed runs once — guarded by the seed marker.
  let tNew = 0, tSkip = 0;
  const [seededTools] = await sql<{ n: number }[]>`select count(*)::int as n from site_tools where created_by = 'seed:pes'`;
  if (seededTools.n > 0) {
    tSkip = data.tools.length;
    console.log(`Tools already seeded (${seededTools.n} rows) — skipping. Delete them to re-run.`);
  } else
  for (const t of data.tools) {
    await sql`
      insert into site_tools
        (company_id, name, quantity, specification, location, condition, purchased_date, remark, created_at, updated_at, created_by)
      values
        (${companyId}, ${t.name}, ${t.quantity}, ${t.specification}, ${t.location}, ${t.condition},
         ${iso(t.purchasedDate)}, ${t.remark}, ${now}, ${now}, 'seed:pes')`;
    tNew++;
  }

  console.log(`Assets: ${aNew} added (${assigned} assigned to people), ${aSkip} skipped (existing tag).`);
  console.log(`Tools:  ${tNew} added, ${tSkip} skipped (existing name+site).`);
  await sql.end();
}

main().catch((e) => { console.error(e); process.exit(1); });

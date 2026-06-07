/**
 * Seed the default HR requirement profiles + items (one profile per person
 * type). Idempotent — keyed by applies_to_type, safe to re-run.
 *
 * Usage: npx tsx scripts/seed-requirement-profiles.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

import postgres from "postgres";

const LEAD: Record<string, number> = {
  Immigration: 90, Passport: 180, Permit: 60, Licence: 60, Registration: 45,
  Insurance: 30, Lease: 60, Contract: 30, Certificate: 30, Tax: 30, Other: 30,
};

type Item = { label: string; category: string; mandatory: boolean };
type Profile = { type: string; name: string; description: string; items: Item[] };

const PROFILES: Profile[] = [
  {
    type: "local_staff",
    name: "Local Staff",
    description: "Documents required from an employed local team member.",
    items: [
      { label: "Employment contract", category: "Contract", mandatory: true },
      { label: "National ID (NIDA)", category: "Other", mandatory: true },
      { label: "TIN certificate", category: "Tax", mandatory: true },
      { label: "NSSF registration", category: "Other", mandatory: true },
      { label: "Academic / professional certificates", category: "Certificate", mandatory: true },
      { label: "Passport photo", category: "Other", mandatory: true },
      { label: "Bank details", category: "Other", mandatory: true },
      { label: "Emergency contact", category: "Other", mandatory: true },
      { label: "CV / résumé", category: "Other", mandatory: false },
      { label: "Reference letters", category: "Other", mandatory: false },
    ],
  },
  {
    type: "expat",
    name: "Expat Staff",
    description: "Documents required from expatriate staff, including immigration.",
    items: [
      { label: "Employment contract", category: "Contract", mandatory: true },
      { label: "Passport", category: "Passport", mandatory: true },
      { label: "Work / residence permit", category: "Permit", mandatory: true },
      { label: "Visa", category: "Immigration", mandatory: true },
      { label: "TIN certificate", category: "Tax", mandatory: true },
      { label: "NSSF registration", category: "Other", mandatory: true },
      { label: "Academic / professional certificates", category: "Certificate", mandatory: true },
      { label: "Medical / health certificate", category: "Certificate", mandatory: true },
      { label: "Passport photo", category: "Other", mandatory: true },
      { label: "Bank details", category: "Other", mandatory: true },
      { label: "Emergency contact", category: "Other", mandatory: true },
      { label: "CV / résumé", category: "Other", mandatory: false },
      { label: "Reference letters", category: "Other", mandatory: false },
    ],
  },
  {
    type: "outsider",
    name: "Outsider",
    description: "Monitored documents for brokers, agents, vendors and lawyers.",
    items: [
      { label: "Service contract", category: "Contract", mandatory: false },
      { label: "National ID", category: "Other", mandatory: false },
      { label: "TIN certificate", category: "Tax", mandatory: false },
      { label: "Bank details", category: "Other", mandatory: false },
    ],
  },
  {
    type: "candidate",
    name: "Candidate",
    description: "Documents required from a recruitment candidate.",
    items: [
      { label: "CV / résumé", category: "Other", mandatory: true },
      { label: "Academic / professional certificates", category: "Certificate", mandatory: true },
      { label: "National ID", category: "Other", mandatory: true },
      { label: "Passport photo", category: "Other", mandatory: true },
      { label: "Reference letters", category: "Other", mandatory: false },
      { label: "Passport", category: "Passport", mandatory: false },
    ],
  },
];

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL not set");
  const sql = postgres(url, { prepare: false, max: 1 });
  const now = new Date().toISOString();
  let created = 0;

  const existing = await sql<{ applies_to_type: string }[]>`select applies_to_type from requirement_profiles`;
  const have = new Set(existing.map((r) => r.applies_to_type));

  for (let i = 0; i < PROFILES.length; i++) {
    const p = PROFILES[i];
    if (have.has(p.type)) {
      console.log(`skip ${p.type} (exists)`);
      continue;
    }
    const [prof] = await sql<{ id: number }[]>`
      insert into requirement_profiles (name, applies_to_type, description, active, sort_order, created_at, updated_at)
      values (${p.name}, ${p.type}, ${p.description}, true, ${i}, ${now}, ${now})
      returning id`;
    for (let j = 0; j < p.items.length; j++) {
      const it = p.items[j];
      await sql`
        insert into requirement_items (profile_id, label, category, mandatory, expiry_tracked, default_lead_days, sort_order)
        values (${prof.id}, ${it.label}, ${it.category}, ${it.mandatory}, true, ${LEAD[it.category] ?? 30}, ${j})`;
    }
    created++;
    console.log(`created ${p.type} with ${p.items.length} items`);
  }

  console.log(`Done. ${created} profile(s) created.`);
  await sql.end();
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

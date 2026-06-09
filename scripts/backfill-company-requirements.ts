/**
 * Re-seed the company statutory checklist for every company, so existing
 * (already-seeded) companies pick up newly-added COMPANY_DEFAULT_ITEMS.
 * Idempotent — ensureCompanyRequirements only inserts missing keys and never
 * resurrects items the operator removed. Usage:
 *   npx tsx scripts/backfill-company-requirements.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

// Dynamic imports AFTER env is loaded — supabase.ts throws at import time if the
// env vars aren't set yet, and static imports are hoisted above config().
(async () => {
  const { sb } = await import("@/db/supabase");
  const { ensureCompanyRequirements } = await import("@/lib/company-requirements");

  // Sync the three core items renamed to the handover labels — but only where
  // the row still carries the exact old default, so operator edits are kept.
  const RENAMES: Array<{ key: string; from: string; to: string }> = [
    { key: "company-registration", from: "Company registration", to: "Certificate of Incorporation (BRELA)" },
    { key: "tax-registration", from: "Tax / TIN", to: "TIN (Taxpayer ID)" },
    { key: "business-licence", from: "Business licence", to: "Business / trading licence" },
  ];

  const { data, error } = await sb.from("companies").select("id,name").order("id");
  if (error) throw new Error(error.message);
  const companies = data ?? [];
  for (const c of companies) {
    await ensureCompanyRequirements(c.id as number);
    for (const r of RENAMES) {
      await sb
        .from("company_requirements")
        .update({ label: r.to, updated_at: new Date().toISOString() })
        .eq("company_id", c.id as number)
        .eq("source_key", r.key)
        .eq("label", r.from);
    }
    console.log(`  ✓ ${c.name}`);
  }
  console.log(`Backfilled ${companies.length} compan${companies.length === 1 ? "y" : "ies"}.`);
  process.exit(0);
})();

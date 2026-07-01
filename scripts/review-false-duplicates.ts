/**
 * One-off: clear the quarantine docs that were wrongly held as "Possible duplicate"
 * (e.g. different employees' contracts, differently-dated permits). Re-checks each
 * with the fixed near-duplicate logic and files the ones that are not real dupes.
 *
 *   npx tsx scripts/review-false-duplicates.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const { reviewFalseDuplicatesAction } = await import("@/app/documents/actions");
  const res = await reviewFalseDuplicatesAction();
  console.log(`Checked ${res.checked} "possible duplicate" docs → filed ${res.filed} (dropped ${res.personDropped} wrong-person tags), kept ${res.kept} genuine.`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });

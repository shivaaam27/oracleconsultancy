// One-off (Aug 2026): purge the old email/WhatsApp intake.
//
// The `inbox` table and its `inbox/` storage prefix are the forwarding intake
// that fed the removed Capture Wizard. The page and the /api/inbox ingest route
// were deleted with the rest of the document intelligence, so nothing reads
// either any more. This clears the data.
//
//   npx tsx scripts/purge-old-inbox.ts            (dry run)
//   npx tsx scripts/purge-old-inbox.ts --yes
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });
import postgres from "postgres";
import { createClient } from "@supabase/supabase-js";

const dryRun = !process.argv.includes("--yes");
const sql = postgres(process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL!, { prepare: false, max: 1 });
const storage = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!).storage.from("documents");

/** Every object under a prefix, walking any nested folders. */
async function walk(prefix: string): Promise<string[]> {
  const out: string[] = [];
  let offset = 0;
  for (;;) {
    const { data, error } = await storage.list(prefix, { limit: 100, offset });
    if (error || !data || data.length === 0) break;
    for (const entry of data) {
      const path = `${prefix}/${entry.name}`;
      // A folder comes back with no id/metadata — recurse into it.
      if (entry.id === null) out.push(...(await walk(path)));
      else out.push(path);
    }
    offset += data.length;
    if (data.length < 100) break;
  }
  return out;
}

async function main() {
  const rows = await sql<{ n: number }[]>`select count(*)::int as n from inbox`;
  console.log(`inbox rows: ${rows[0].n}`);

  const paths = await walk("inbox");
  console.log(`inbox/ storage objects: ${paths.length}`);

  // Safety: make sure nothing outside the inbox points at these files.
  const refs = await sql<{ n: number }[]>`
    select count(*)::int as n from chat_messages where attachments::text like '%inbox/%'`;
  console.log(`chat messages referencing inbox/: ${refs[0].n}`);

  if (dryRun) {
    console.log("\nDRY RUN — nothing deleted. Re-run with --yes to purge.");
    await sql.end();
    return;
  }

  let removed = 0;
  for (let i = 0; i < paths.length; i += 100) {
    const batch = paths.slice(i, i + 100);
    const { error } = await storage.remove(batch);
    if (error) console.warn(`  storage batch ${i}: ${error.message}`);
    else removed += batch.length;
  }
  console.log(`storage objects removed: ${removed}/${paths.length}`);

  const del = await sql`delete from inbox returning id`;
  console.log(`inbox rows deleted: ${del.length}`);
  const left = await sql<{ n: number }[]>`select count(*)::int as n from inbox`;
  console.log(`inbox rows remaining: ${left[0].n}`);
  console.log(`inbox/ objects remaining: ${(await walk("inbox")).length}`);
  await sql.end();
}
main();

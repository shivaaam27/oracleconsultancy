// One-off (Aug 2026): purge the pre-rebuild document library.
//
// Everything left in `documents` predates the manual-filing rebuild — the owner
// had already "deleted" it in the UI, which only archived it. This removes the
// rows AND their stored files, so the library starts genuinely empty.
//
// It ONLY touches storage objects referenced by the rows it deletes; chat
// attachments (chat/…) and every other object in the bucket are left alone.
//
//   npx tsx scripts/purge-old-documents.ts --dry-run
//   npx tsx scripts/purge-old-documents.ts --yes
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });
import postgres from "postgres";
import { createClient } from "@supabase/supabase-js";

const url = process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL!;
const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const dryRun = !process.argv.includes("--yes");

async function main() {
  const sql = postgres(url, { prepare: false, max: 1 });
  const storage = createClient(sbUrl, sbKey).storage.from("documents");

  const rows = await sql<{ id: number; storage_path: string | null }[]>`
    select id, storage_path from documents order by id`;
  const paths = rows.map((r) => r.storage_path).filter((p): p is string => !!p);
  console.log(`documents rows: ${rows.length}`);
  console.log(`with a stored file: ${paths.length}`);

  // Sanity: nothing here should be referenced by a live chat message.
  const shared = await sql<{ n: number }[]>`
    select count(*)::int as n from chat_messages
    where attachments::text like '%/documents/%'`;
  console.log(`chat messages mentioning a documents-bucket path: ${shared[0]?.n ?? 0}`);

  if (dryRun) {
    console.log("\nDRY RUN — nothing deleted. Re-run with --yes to purge.");
    await sql.end();
    return;
  }

  // Storage first (in batches; the API caps a remove() call).
  let removed = 0;
  for (let i = 0; i < paths.length; i += 100) {
    const batch = paths.slice(i, i + 100);
    const { error } = await storage.remove(batch);
    if (error) console.warn(`  storage batch ${i}: ${error.message}`);
    else removed += batch.length;
  }
  console.log(`storage objects removed: ${removed}/${paths.length}`);

  // Then the rows. document_links FKs cascade/set-null per the schema.
  await sql`delete from document_links where document_id in (select id from documents)`;
  const del = await sql`delete from documents returning id`;
  console.log(`document rows deleted: ${del.length}`);

  const left = await sql<{ n: number }[]>`select count(*)::int as n from documents`;
  console.log(`documents remaining: ${left[0]?.n}`);
  await sql.end();
}
main();

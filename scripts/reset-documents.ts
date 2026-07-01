/**
 * reset-documents.ts — PERMANENT wipe of all documents + everything derived from
 * them, for a clean re-upload test. Deletes: Storage files, document rows, the
 * search index (doc embeddings), doc-derived facts, profile suggestions, and
 * resets the compliance checklists. KEEPS companies, people, and board-level
 * governance (cap table / directors / beneficial owners) — rule-based re-upload
 * can't reconstruct those, so they're preserved.
 *
 * Run a `npm run db:backup` FIRST. This is irreversible.
 *   npx tsx scripts/reset-documents.ts        # dry run (counts only)
 *   npx tsx scripts/reset-documents.ts --yes   # actually delete
 */
import { config } from "dotenv"; config({ path: ".env.local" });

const CONFIRM = process.argv.includes("--yes");
const BUCKET = "documents";

async function run() {
  const { sb } = await import("@/db/supabase");
  const count = async (t: string, f?: (q: any) => any): Promise<number> => {
    let q = sb.from(t).select("id", { count: "exact", head: true });
    if (f) q = f(q);
    const { count } = await q;
    return count ?? 0;
  };

  console.log("── BEFORE ──");
  console.log("  documents        =", await count("documents"));
  console.log("  facts (doc-derived) =", await count("facts", (q) => q.not("document_id", "is", null)));
  console.log("  embeddings (doc) =", await count("embeddings", (q) => q.eq("source_type", "document")));

  // Collect the exact storage objects the documents reference (paginated).
  const paths: string[] = [];
  for (let from = 0; ; from += 1000) {
    const { data } = await sb.from("documents").select("storage_path").not("storage_path", "is", null).range(from, from + 999);
    if (!data || !data.length) break;
    paths.push(...data.map((d) => d.storage_path as string));
    if (data.length < 1000) break;
  }
  console.log("  storage files    =", paths.length);

  if (!CONFIRM) {
    console.log("\nDRY RUN — nothing deleted. Re-run with --yes to execute.");
    return;
  }

  console.log("\n── DELETING ──");
  // 1. Doc-derived facts — target by writer tag (ai-intake*), so seed-live-data
  //    board governance (directors/shareholding) is preserved. (document_id also
  //    NULLs on doc delete, so the tag is the reliable discriminator.)
  {
    const { error, count } = await sb.from("facts").delete({ count: "exact" }).in("created_by", ["ai-intake", "ai-intake-auto"]);
    console.log("  facts deleted    =", count ?? "?", error ? "ERR " + error.message : "");
  }
  // 2. Search index for documents.
  {
    const { error, count } = await sb.from("embeddings").delete({ count: "exact" }).eq("source_type", "document");
    console.log("  embeddings deleted =", count ?? "?", error ? "ERR " + error.message : "");
  }
  // 3. Doc-derived profile suggestions.
  {
    const { error } = await sb.from("profile_suggestions").delete().not("document_id", "is", null);
    if (error) console.log("  profile_suggestions ERR", error.message);
  }
  // 4. Reset compliance checklists satisfied by the deleted docs back to "missing"
  //    (there is no boolean `verified` column — status holds it). Keeps waived.
  for (const t of ["person_requirements", "company_requirements"]) {
    const { error } = await sb.from(t)
      .update({ status: "missing", document_id: null, verified_at: null, verified_by: null, requested_at: null, received_at: null })
      .in("status", ["received", "verified", "requested"]);
    if (error) console.log(`  ${t} reset ERR`, error.message);
  }
  // 5. Compliance history.
  {
    const { error } = await sb.from("compliance_events").delete().not("id", "is", null);
    if (error) console.log("  compliance_events ERR", error.message);
  }
  // 6. The documents themselves (cascades the junction, SET NULLs every other ref).
  {
    const { error, count } = await sb.from("documents").delete({ count: "exact" }).not("id", "is", null);
    console.log("  documents deleted =", count ?? "?", error ? "ERR " + error.message : "");
  }
  // 7. Storage files.
  let removed = 0;
  for (let i = 0; i < paths.length; i += 100) {
    const batch = paths.slice(i, i + 100);
    const { error } = await sb.storage.from(BUCKET).remove(batch);
    if (error) console.log("  storage remove ERR", error.message);
    else removed += batch.length;
  }
  console.log("  storage removed  =", removed);

  console.log("\n── AFTER ──");
  console.log("  documents        =", await count("documents"));
  console.log("  facts (doc-derived) =", await count("facts", (q) => q.not("document_id", "is", null)));
  console.log("  embeddings (doc) =", await count("embeddings", (q) => q.eq("source_type", "document")));
  console.log("\nDone. Companies, people, and board governance were preserved.");
}
run().catch((e) => console.log("FAIL", e instanceof Error ? e.message : e));

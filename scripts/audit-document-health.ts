import { config } from "dotenv";
config({ path: ".env.local" });

/**
 * Read-only document-health audit. Zero AI, zero file downloads: reads only the
 * small structural columns (no extracted_text body → egress-friendly) and buckets
 * every document by what actually happened to it. Run: npx tsx scripts/audit-document-health.ts
 */
type Row = {
  id: number;
  title: string | null;
  file_name: string | null;
  created_by: string | null;
  storage_path: string | null;
  file_url: string | null;
  file_hash: string | null;
  text_source: string | null;
  review_status: string | null;
  confidence: number | null;
  vetted_at: string | null;
  intake_state: string | null;
  archived: boolean | null;
  created_at: string | null;
};

const LIGHT =
  "id,title,file_name,created_by,storage_path,file_url,file_hash,text_source,review_status,confidence,vetted_at,intake_state,archived,created_at";

async function run() {
  const { sb } = await import("@/db/supabase");

  // Paginate so we get every row regardless of the 1000-row default cap.
  const rows: Row[] = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await sb
      .from("documents")
      .select(LIGHT)
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    const batch = (data ?? []) as unknown as Row[];
    rows.push(...batch);
    if (batch.length < PAGE) break;
  }

  const active = rows.filter((r) => !r.archived);
  const nonTrash = active.filter((r) => r.intake_state !== "trash");

  const hasFile = (r: Row) => !!r.storage_path || !!r.file_url;
  const hasStored = (r: Row) => !!r.storage_path;
  const unread = (r: Row) => !r.text_source || r.text_source === "ocr-empty";
  const intakePath = (r: Row) =>
    r.created_by === "ai-intake" || r.created_by === "meeting-mode" || (r.created_by ?? "").startsWith("portal:");

  // Buckets (all over non-trash, non-archived unless noted).
  const noFile = nonTrash.filter((r) => !hasFile(r));
  const failedUpload = noFile.filter((r) => intakePath(r)); // came through an upload path but no bytes → upload failed
  const noFileManual = noFile.filter((r) => !intakePath(r)); // likely intentional details-only entries
  const unreadWithFile = nonTrash.filter((r) => hasStored(r) && unread(r)); // file present, never read → read failed
  const needsReview = nonTrash.filter((r) => r.review_status === "needs_review");
  const lowConf = nonTrash.filter((r) => r.confidence != null && r.confidence < 0.75);
  const unvetted = nonTrash.filter((r) => r.intake_state === "filed" && !r.vetted_at);
  const quarantine = active.filter((r) => r.intake_state === "quarantine");
  const noHash = nonTrash.filter((r) => hasStored(r) && !r.file_hash); // stored but never hashed → partial

  // Exact duplicates by byte-hash (name-independent).
  const byHash = new Map<string, Row[]>();
  for (const r of nonTrash) {
    if (!r.file_hash) continue;
    const g = byHash.get(r.file_hash) ?? [];
    g.push(r);
    byHash.set(r.file_hash, g);
  }
  const dupGroups = [...byHash.values()].filter((g) => g.length > 1);
  const dupExtra = dupGroups.reduce((n, g) => n + (g.length - 1), 0);

  const byState = active.reduce<Record<string, number>>((m, r) => {
    const k = r.intake_state ?? "(null)";
    m[k] = (m[k] ?? 0) + 1;
    return m;
  }, {});

  const pct = (n: number) => (nonTrash.length ? Math.round((n / nonTrash.length) * 100) : 0);
  const sample = (list: Row[], n = 6) =>
    list.slice(0, n).map((r) => `      #${r.id}  ${(r.title ?? r.file_name ?? "(untitled)").slice(0, 60)}  [${r.created_by ?? "?"}, ${r.created_at?.slice(0, 10) ?? "?"}]`);

  const L: string[] = [];
  L.push("");
  L.push("=== DOCUMENT HEALTH AUDIT (read-only, no AI) ===");
  L.push(`Total document rows:        ${rows.length}`);
  L.push(`  archived:                 ${rows.length - active.length}`);
  L.push(`  active:                   ${active.length}`);
  L.push(`  by intake_state:          ${JSON.stringify(byState)}`);
  L.push(`Active, not in Trash:       ${nonTrash.length}   (the working set below)`);
  L.push("");
  L.push("--- NEEDS ATTENTION ---");
  L.push(`A. Upload failed (no file, came via upload):  ${failedUpload.length}  (${pct(failedUpload.length)}%)  → re-upload these`);
  L.push(...sample(failedUpload));
  L.push(`B. Read failed (file present, no text layer):  ${unreadWithFile.length}  (${pct(unreadWithFile.length)}%)  → re-READ only these (AI cost here)`);
  L.push(...sample(unreadWithFile));
  L.push(`C. Unverified (needs_review):                  ${needsReview.length}`);
  L.push(`   Low confidence (<0.75):                     ${lowConf.length}`);
  L.push(`   Filed but never vetted:                     ${unvetted.length}`);
  L.push(`D. Waiting in To Sort (quarantine):            ${quarantine.length}`);
  L.push(`E. Exact duplicate groups (by byte-hash):      ${dupGroups.length}  (${dupExtra} extra copies)`);
  L.push("");
  L.push("--- OTHER SIGNALS ---");
  L.push(`Details-only rows with no file (likely intentional, NOT failures):  ${noFileManual.length}`);
  L.push(`Stored but never hashed (partial upload):                          ${noHash.length}`);
  L.push("");
  console.log(L.join("\n"));
}

run().catch((e) => {
  console.error("AUDIT FAILED:", e instanceof Error ? e.message : e);
  process.exit(1);
});

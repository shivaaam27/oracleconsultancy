/**
 * One-off: bring the old Workbook notes into the Notes module.
 *
 * Notes used to live in `meetings` with `kind='note'` (the Workbook's Notes tab,
 * removed in Jul 2026 — the table was kept). There are FOUR of them, verified
 * against the live database on 17 Aug 2026, so this is a small, safe import rather
 * than a migration: the rows stay where they are and are COPIED, which means running
 * this twice would duplicate them. It therefore skips anything already imported, by
 * matching on title + created date.
 *
 *   npx tsx scripts/import-legacy-notes.ts          # dry run, prints what it would do
 *   npx tsx scripts/import-legacy-notes.ts --write   # actually inserts
 *
 * The old body was plain text (`raw_notes`), so each paragraph becomes a paragraph
 * node — no formatting is invented that was never there.
 */
// ⚠️ Env FIRST, and that is why `@/db/supabase` is imported DYNAMICALLY below rather
// than at the top. It throws at import time when the keys are missing, and a static
// `import` is hoisted ABOVE these `config()` calls — so the top-level version failed
// every time. Load the env, then reach for the client.
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

const WRITE = process.argv.includes("--write");

/** Plain text → a Tiptap document. Blank lines separate paragraphs. */
function textToDoc(text: string) {
  const paras = text.replace(/\r\n/g, "\n").split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  if (paras.length === 0) return { type: "doc", content: [{ type: "paragraph" }] };
  return {
    type: "doc",
    content: paras.map((p) => ({
      type: "paragraph",
      // Single newlines inside a paragraph become hard breaks, so a typed list of
      // lines does not collapse into one run-on sentence.
      content: p.split("\n").flatMap((line, i) =>
        i === 0 ? [{ type: "text", text: line }] : [{ type: "hardBreak" }, { type: "text", text: line }],
      ),
    })),
  };
}

async function main() {
  const { sb } = await import("@/db/supabase");

  const { data: legacy, error } = await sb
    .from("meetings")
    .select("id,title,raw_notes,minutes,folder,pinned_at,created_at,updated_at,created_by")
    .eq("kind", "note")
    .order("created_at");
  if (error) throw new Error(error.message);
  const rows = legacy ?? [];
  console.log(`found ${rows.length} legacy note(s) in meetings.kind='note'`);

  const { data: existing } = await sb.from("notes").select("title,created_at");
  const seen = new Set((existing ?? []).map((n) => `${n.title}|${String(n.created_at).slice(0, 10)}`));

  let imported = 0, skipped = 0;
  for (const r of rows) {
    const title = ((r.title as string) ?? "").trim();
    const createdAt = r.created_at as string;
    const key = `${title}|${String(createdAt).slice(0, 10)}`;
    if (seen.has(key)) { skipped++; console.log(`  skip (already there): ${title || "(untitled)"}`); continue; }

    // `minutes` was the polished version when it existed; keep both rather than
    // choosing for the owner — the body is the raw note, minutes appended under a
    // heading so nothing is lost.
    const raw = ((r.raw_notes as string) ?? "").trim();
    const minutes = ((r.minutes as string) ?? "").trim();
    const text = minutes && minutes !== raw ? `${raw}\n\n— Minutes —\n\n${minutes}` : raw;

    console.log(`  import: ${title || "(untitled)"} — ${text.length} chars${r.folder ? ` [folder: ${r.folder}]` : ""}`);
    if (!WRITE) continue;

    let folderId: number | null = null;
    const folderName = ((r.folder as string) ?? "").trim();
    if (folderName) {
      const { data: found } = await sb.from("note_folders").select("id").eq("name", folderName).maybeSingle();
      if (found) folderId = found.id as number;
      else {
        const { data: made } = await sb.from("note_folders").insert({ name: folderName, created_at: new Date().toISOString() }).select("id").single();
        folderId = (made?.id as number) ?? null;
      }
    }

    const { error: insErr } = await sb.from("notes").insert({
      title,
      body_json: textToDoc(text),
      body_text: text,
      folder_id: folderId,
      pinned_at: (r.pinned_at as string | null) ?? null,
      kind: "note",
      created_by: (r.created_by as string) ?? "web-ui",
      created_at: createdAt,
      updated_at: (r.updated_at as string) ?? createdAt,
    });
    if (insErr) { console.error(`    FAILED: ${insErr.message}`); continue; }
    imported++;
  }

  console.log(WRITE ? `\nimported ${imported}, skipped ${skipped}` : `\n(dry run — nothing written. Re-run with --write)`);
  console.log("The legacy rows in `meetings` are left untouched.");
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });

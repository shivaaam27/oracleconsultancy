/**
 * One-off repair: the legacy import copied each note's TITLE into the first line of
 * its body, so every imported note opened with its own title twice — once as the
 * title, once as the first paragraph. My fault, on 4 rows.
 *
 * This drops that first paragraph, and ONLY when it matches the title exactly. Both
 * columns are rewritten together (body_json is canonical, body_text is derived), the
 * way every write to this table must.
 *
 *   npx tsx scripts/fix-imported-note-titles.ts          # dry run
 *   npx tsx scripts/fix-imported-note-titles.ts --write
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

const WRITE = process.argv.includes("--write");

type PMNode = { type: string; content?: PMNode[]; text?: string };

/** The plain text of a node tree — the same thing Tiptap's getText() produces.
 *  ⚠️ `hardBreak` carries no `text`, so a naive walker silently welds two lines
 *  together ("$600His facilitation fees") and that is what lands in `body_text`,
 *  which is the column search and AI read. It must emit a newline. */
function textOf(node: PMNode): string {
  if (node.type === "hardBreak") return "\n";
  if (node.text) return node.text;
  return (node.content ?? []).map(textOf).join("");
}

async function main() {
  const { sb } = await import("@/db/supabase");
  const { data: notes } = await sb.from("notes").select("id,title,body_json,body_text");

  let fixed = 0;
  for (const n of notes ?? []) {
    const title = ((n.title as string) ?? "").trim();
    const doc = n.body_json as PMNode | null;
    if (!title || !doc?.content?.length) continue;

    const first = doc.content[0];
    const isDuplicateTitle = textOf(first).trim() === title;
    // Re-derive body_text from the canonical JSON either way: an earlier run of this
    // script welded lines together, and body_text is what search will read.
    const content = isDuplicateTitle ? doc.content.slice(1) : doc.content;
    const nextDoc: PMNode = { type: "doc", content: content.length ? content : [{ type: "paragraph" }] };
    const nextText = content.map((c) => textOf(c)).join("\n").trim();

    if (nextText === (n.body_text as string) && !isDuplicateTitle) continue;  // nothing to do
    console.log(`#${n.id} "${title}" — ${isDuplicateTitle ? "dropping the repeated first line, " : ""}re-deriving body_text (${(n.body_text as string).length} → ${nextText.length} chars)`);
    if (!WRITE) continue;

    const { error } = await sb
      .from("notes")
      .update({ body_json: nextDoc, body_text: nextText })
      .eq("id", n.id);
    if (error) { console.error(`   FAILED: ${error.message}`); continue; }
    fixed++;
  }
  console.log(WRITE ? `\nrepaired ${fixed}` : `\n(dry run — nothing written)`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });

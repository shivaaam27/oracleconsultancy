// Re-runnable backfill for semantic search (Phase 3b + advanced upgrade).
//
// Indexes every task + meeting + document + person via the app's own
// indexEmbedding (chunking + translate + hybrid full-text + vector), forcing past
// the on/off toggle. Run AFTER the migration + `embed` function are deployed:
//   npm run db:embed-backfill
// Re-running is safe — unchanged items (same content hash) are skipped.

import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

import { createClient } from "@supabase/supabase-js";
import type { SourceType } from "@/lib/embeddings";

// App modules import src/db/supabase, which throws if env isn't loaded — and
// static ESM imports run BEFORE dotenv config() above. So load the app's
// indexEmbedding lazily (after config) via a dynamic import inside main().
let indexEmbedding!: (t: SourceType, id: number, content: string, force?: boolean) => Promise<void>;

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local first.");
  process.exit(1);
}
const sb = createClient(url, key, { auth: { persistSession: false } });

type Row = { type: SourceType; id: number; content: string };
const join = (...parts: (string | null | undefined)[]) => parts.filter(Boolean).join("\n");

async function run(label: string, rows: Row[]) {
  let processed = 0, empty = 0;
  for (const r of rows) {
    if (!r.content.trim()) { empty++; continue; }
    await indexEmbedding(r.type, r.id, r.content, true); // force past the toggle
    processed++;
    if (processed % 10 === 0) process.stdout.write(`  …${processed}/${rows.length}\r`);
  }
  console.log(`${label}: ${processed} processed, ${empty} empty (of ${rows.length}).`);
}

async function main() {
  ({ indexEmbedding } = await import("@/lib/embeddings"));
  const { data: tasks, error: te } = await sb.from("tasks").select("id,action_item,latest_update").eq("archived", false);
  if (te) throw new Error(`tasks: ${te.message}`);
  const taskRows: Row[] = (tasks ?? []).map((t) => ({ type: "task", id: t.id as number, content: join(t.action_item as string, t.latest_update as string) }));

  const { data: meetings, error: me } = await sb.from("meetings").select("id,title,attendees,raw_notes,minutes");
  if (me) throw new Error(`meetings: ${me.message}`);
  const meetingRows: Row[] = (meetings ?? []).map((m) => ({ type: "meeting", id: m.id as number, content: join(m.title as string, m.attendees as string, m.raw_notes as string, m.minutes as string) }));

  const { data: docs, error: de } = await sb.from("documents").select("id,title,doc_type,issuer,category,reference_no,notes").eq("archived", false);
  if (de) throw new Error(`documents: ${de.message}`);
  const docRows: Row[] = (docs ?? []).map((d) => ({ type: "document", id: d.id as number, content: join(d.title as string, d.doc_type as string, d.issuer as string, d.category as string, d.reference_no as string, d.notes as string) }));

  const { data: people, error: pe } = await sb.from("people").select("id,name,role,staff_category,notes").eq("active", true);
  if (pe) throw new Error(`people: ${pe.message}`);
  const personRows: Row[] = (people ?? []).map((p) => ({ type: "person", id: p.id as number, content: join(p.name as string, p.role as string, p.staff_category as string, p.notes as string) }));

  console.log(`Backfilling: ${taskRows.length} tasks, ${meetingRows.length} meetings, ${docRows.length} documents, ${personRows.length} people…\n`);
  await run("task", taskRows);
  await run("meeting", meetingRows);
  await run("document", docRows);
  await run("person", personRows);
  console.log("\nDone. Re-run any time; unchanged items are skipped.");
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });

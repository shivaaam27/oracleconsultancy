// One-off (re-runnable) backfill for semantic search (Phase 3b).
//
// Embeds every existing task + meeting via the in-region `embed` Edge Function
// and stores the vectors in the `embeddings` table. Run AFTER you've:
//   1. deployed the migration (the `embeddings` table + RPCs exist), and
//   2. deployed the `embed` Edge Function (`supabase functions deploy embed`).
// Then run:  npm run db:embed-backfill
//
// Self-contained on purpose (no app imports): it talks to Supabase directly so
// it doesn't depend on the "@/" path alias or the in-app semantic-search toggle.
// Re-running is safe — unchanged items (same content hash) are skipped.

import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

import { createClient } from "@supabase/supabase-js";
import { createHash } from "crypto";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local first.");
  process.exit(1);
}
const sb = createClient(url, key, { auth: { persistSession: false } });

const MAX_INPUT = 8000;
const hash = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 32);
const toVec = (v: number[]) => `[${v.join(",")}]`;

async function embed(text: string): Promise<number[] | null> {
  const input = text.trim().slice(0, MAX_INPUT);
  if (!input) return null;
  const { data, error } = await sb.functions.invoke("embed", { body: { input } });
  if (error) {
    console.error("  embed Edge Function error:", error.message, "— is it deployed? (supabase functions deploy embed)");
    return null;
  }
  const emb = (data as { embedding?: unknown })?.embedding;
  return Array.isArray(emb) && emb.length ? (emb as number[]) : null;
}

async function index(sourceType: string, sourceId: number, content: string): Promise<"done" | "skip" | "fail"> {
  const trimmed = content.trim().slice(0, MAX_INPUT);
  if (!trimmed) return "skip";
  const h = hash(trimmed);
  const { data: existing } = await sb
    .from("embeddings")
    .select("content_hash")
    .eq("source_type", sourceType)
    .eq("source_id", sourceId)
    .maybeSingle();
  if (existing && (existing as { content_hash?: string }).content_hash === h) return "skip";
  const vec = await embed(trimmed);
  if (!vec) return "fail";
  const { error } = await sb.rpc("upsert_embedding", {
    p_source_type: sourceType,
    p_source_id: sourceId,
    p_content: trimmed,
    p_content_hash: h,
    p_embedding: toVec(vec),
  });
  if (error) {
    console.error("  upsert error:", error.message);
    return "fail";
  }
  return "done";
}

async function run(label: string, rows: { id: number; content: string }[]) {
  let done = 0, skip = 0, fail = 0;
  for (const r of rows) {
    const res = await index(label, r.id, r.content);
    if (res === "done") done++;
    else if (res === "skip") skip++;
    else fail++;
    if ((done + skip + fail) % 25 === 0) process.stdout.write(`  …${done + skip + fail}/${rows.length}\r`);
  }
  console.log(`${label}: ${done} indexed, ${skip} unchanged, ${fail} failed (of ${rows.length}).`);
  return fail;
}

async function main() {
  const { data: tasks, error: te } = await sb.from("tasks").select("id,action_item,latest_update").eq("archived", false);
  if (te) throw new Error(`tasks: ${te.message}`);
  const taskRows = (tasks ?? []).map((t) => ({
    id: t.id as number,
    content: [t.action_item, t.latest_update].filter(Boolean).join("\n"),
  }));

  const { data: meetings, error: me } = await sb.from("meetings").select("id,title,attendees,raw_notes,minutes");
  if (me) throw new Error(`meetings: ${me.message}`);
  const meetingRows = (meetings ?? []).map((m) => ({
    id: m.id as number,
    content: [m.title, m.attendees, m.raw_notes, m.minutes].filter(Boolean).join("\n\n"),
  }));

  console.log(`Backfilling embeddings: ${taskRows.length} tasks, ${meetingRows.length} meetings…\n`);
  const f1 = await run("task", taskRows);
  const f2 = await run("meeting", meetingRows);
  console.log(`\nDone.${f1 + f2 ? ` ${f1 + f2} failed — re-run to retry just those.` : " Re-run any time; unchanged items are skipped."}`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });

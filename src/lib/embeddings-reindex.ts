// S6 — semantic-search freshness safety net.
//
// reindexAll() re-indexes every ACTIVE task/meeting/document/person (unchanged
// items are skipped via content_hash, so it's cheap) and deletes embeddings whose
// source row no longer exists OR was archived/deactivated (orphans/ghosts). This
// is the catch-all behind the per-write create/update/delete hooks: it heals
// missed fire-and-forget calls, picks up edits, and removes stale vectors. Run by
// the nightly /api/cron/reindex cron and by the backfill script.

import { sb } from "@/db/supabase";
import { indexEmbedding, type SourceType } from "@/lib/embeddings";

type Row = { type: SourceType; id: number; content: string };
const join = (...parts: (string | null | undefined)[]) => parts.filter(Boolean).join("\n");

/** All active source rows + the text we index for each. Mirrors the write hooks. */
async function activeRows(): Promise<Row[]> {
  const rows: Row[] = [];

  const { data: tasks } = await sb.from("tasks").select("id,action_item,latest_update").eq("archived", false);
  for (const t of tasks ?? []) rows.push({ type: "task", id: t.id as number, content: join(t.action_item as string, t.latest_update as string) });

  const { data: meetings } = await sb.from("meetings").select("id,title,attendees,raw_notes,minutes");
  for (const m of meetings ?? []) rows.push({ type: "meeting", id: m.id as number, content: join(m.title as string, m.attendees as string, m.raw_notes as string, m.minutes as string) });

  const { data: docs } = await sb.from("documents").select("id,title,doc_type,issuer,category,reference_no,notes,extracted_text").eq("archived", false);
  for (const d of docs ?? []) rows.push({ type: "document", id: d.id as number, content: join(d.title as string, d.doc_type as string, d.issuer as string, d.category as string, d.reference_no as string, d.notes as string, d.extracted_text as string) });

  const { data: people } = await sb.from("people").select("id,name,role,staff_category,notes").eq("active", true);
  for (const p of people ?? []) rows.push({ type: "person", id: p.id as number, content: join(p.name as string, p.role as string, p.staff_category as string, p.notes as string) });

  return rows;
}

/** Delete embeddings whose (type, source_id) is not among the current active rows. */
async function removeOrphans(rows: Row[]): Promise<number> {
  const valid: Record<SourceType, Set<number>> = { task: new Set(), meeting: new Set(), document: new Set(), person: new Set() };
  for (const r of rows) valid[r.type].add(r.id);
  let removed = 0;
  for (const type of Object.keys(valid) as SourceType[]) {
    const { data } = await sb.from("embeddings").select("source_id").eq("source_type", type);
    const ids = [...new Set((data ?? []).map((r) => r.source_id as number))];
    const orphans = ids.filter((id) => !valid[type].has(id));
    if (orphans.length) {
      await sb.from("embeddings").delete().eq("source_type", type).in("source_id", orphans);
      removed += orphans.length;
    }
  }
  return removed;
}

export async function reindexAll(force = false): Promise<{ checked: number; orphansRemoved: number }> {
  const rows = await activeRows();
  for (const r of rows) {
    if (r.content.trim()) await indexEmbedding(r.type, r.id, r.content, force);
  }
  const orphansRemoved = await removeOrphans(rows);
  return { checked: rows.length, orphansRemoved };
}

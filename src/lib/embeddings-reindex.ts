// S6 — semantic-search freshness safety net (history-aware, all-entity).
//
// reindexAll() re-indexes EVERY entity the system holds — tasks, meetings,
// documents, people, companies, letters, vendors, assets, governance, risks,
// pipeline cases and commitments — both CURRENT and HISTORICAL. Unchanged rows
// are skipped via content_hash (+ lifecycle), so it stays cheap. Each row is
// stamped lifecycle "active" (live) or "history" (archived/closed/inactive); the
// owner asked that the past be KEPT and labelled, not deleted, so old records
// stay searchable behind the lifecycle filter.
//
// The set of rows, their text and their lifecycle are now DERIVED from the
// single source of truth in src/lib/entity-registry.ts (ENTITY_DEFS +
// getGovernanceRows), the same definitions the per-write hooks use — so adding a
// new entity there makes it auto-index nightly here, with zero drift between the
// write-hooks and the catch-all.
//
// The ONLY embeddings we delete are TRUE ORPHANS: rows whose source no longer
// exists at all (hard-deleted). An archived/closed/inactive source is NOT an
// orphan — it is re-indexed as history. This is the catch-all behind the
// per-write create/update/delete hooks: it heals missed fire-and-forget calls,
// picks up edits, flips lifecycle, and removes only genuinely vanished vectors.
// Run by the nightly /api/cron/reindex cron and by the backfill script.

import { sb } from "@/db/supabase";
import { indexEmbedding, type SourceType, type Lifecycle } from "@/lib/embeddings";
import { ENTITY_DEFS, getGovernanceRows, isGovernance, type EntityRow } from "@/lib/entity-registry";

type Row = { type: SourceType; id: number; content: string; lifecycle: Lifecycle };

/** All source rows (current + historical) + the text + lifecycle to index.
 *  DERIVED from ENTITY_DEFS so it always matches the per-write hooks; lifecycle
 *  decides active vs history. Governance is special (composite ids over four
 *  tables) and gathered via getGovernanceRows(). */
async function allRows(): Promise<Row[]> {
  const rows: Row[] = [];

  for (const def of ENTITY_DEFS) {
    // Governance is handled out-of-band: one SourceType, four physical tables,
    // composite ids. getGovernanceRows() mirrors the old collectGovernance().
    if (isGovernance(def.type)) {
      for (const g of await getGovernanceRows())
        rows.push({ type: def.type, id: g.id, content: g.content, lifecycle: g.lifecycle });
      continue;
    }

    const { data } = await sb.from(def.table).select(def.selectColumns.join(","));
    for (const r of data ?? []) {
      const row = r as unknown as EntityRow;
      rows.push({
        type: def.type,
        id: Number(row[def.idColumn]),
        lifecycle: def.lifecycleFor(row),
        content: def.textFor(row),
      });
    }
  }

  return rows;
}

/**
 * Delete embeddings that are TRUE ORPHANS only: their (source_type, source_id)
 * is not present among the current rows (the source was hard-deleted). Archived/
 * closed/inactive sources are NOT orphans — they stay indexed as history.
 */
async function removeOrphans(rows: Row[]): Promise<number> {
  const valid = new Map<SourceType, Set<number>>();
  for (const r of rows) {
    let set = valid.get(r.type);
    if (!set) valid.set(r.type, (set = new Set()));
    set.add(r.id);
  }
  // Every SourceType we manage — derived from the registry so a type whose source
  // table is now empty still has its leftover vectors swept.
  const allTypes: SourceType[] = ENTITY_DEFS.map((d) => d.type);
  let removed = 0;
  for (const type of allTypes) {
    const present = valid.get(type) ?? new Set<number>();
    const { data } = await sb.from("embeddings").select("source_id").eq("source_type", type);
    const ids = [...new Set((data ?? []).map((r) => r.source_id as number))];
    const orphans = ids.filter((id) => !present.has(id));
    if (orphans.length) {
      await sb.from("embeddings").delete().eq("source_type", type).in("source_id", orphans);
      removed += orphans.length;
    }
  }
  return removed;
}

export async function reindexAll(force = false): Promise<{ checked: number; orphansRemoved: number }> {
  const rows = await allRows();
  for (const r of rows) {
    if (r.content.trim()) await indexEmbedding(r.type, r.id, r.content, force, r.lifecycle);
  }
  const orphansRemoved = await removeOrphans(rows);
  return { checked: rows.length, orphansRemoved };
}

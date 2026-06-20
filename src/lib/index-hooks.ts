// Registry-driven write hooks for the semantic-search index.
//
// CONVENTION — call these from write paths so search stays fresh without waiting
// for the nightly /api/cron/reindex catch-all:
//   • on CREATE  → reindexEntity(type, id)
//   • on UPDATE  → reindexEntity(type, id)
//   • on ARCHIVE → reindexEntity(type, id)   (re-stamps lifecycle="history";
//                                              we KEEP history, never delete it)
//   • on HARD-DELETE (the source row is truly gone) → removeEntityIndex(type, id)
//
// Both helpers are BEST-EFFORT and NEVER throw: they swallow every error so an
// indexing problem can never break the underlying create/update/delete. They are
// safe to fire-and-forget. They no-op when the source row is gone or empty, and
// indexEmbedding itself no-ops when the semanticSearch feature is off.
//
// Everything derives from src/lib/entity-registry.ts (the single source of
// truth), so a new entity added there is hookable here with no code change.
//
// Governance is special: its ids are COMPOSITE (GOV_BASE.<table> + row.id, see
// the registry). Pass the composite id straight through to reindexEntity /
// removeEntityIndex — they decode it for you.

import { sb } from "@/db/supabase";
import { indexEmbedding, removeEmbedding } from "@/lib/embeddings";
import {
  getEntityDef,
  getGovernanceRowById,
  isGovernance,
  type EntityType,
  type EntityRow,
} from "@/lib/entity-registry";

/**
 * Re-index a single entity row after a create/update/archive. Looks up its def,
 * fetches the one row, builds the text + lifecycle, and calls indexEmbedding
 * (which de-dups by content_hash + lifecycle, so this is cheap on no-op edits).
 *
 * For governance, pass the COMPOSITE id — it is decoded to (sub-table, row id).
 * Best-effort: never throws; silently no-ops on a missing/empty row or any error.
 */
export async function reindexEntity(type: EntityType, id: number): Promise<void> {
  try {
    if (!id) return;

    // Governance — composite id, four physical tables. The registry resolves it.
    if (isGovernance(type)) {
      const gov = await getGovernanceRowById(id);
      if (!gov || !gov.content.trim()) return;
      await indexEmbedding(type, gov.id, gov.content, false, gov.lifecycle);
      return;
    }

    const def = getEntityDef(type);
    if (!def) return;

    const { data } = await sb
      .from(def.table)
      .select(def.selectColumns.join(","))
      .eq(def.idColumn, id)
      .limit(1)
      .maybeSingle();
    if (!data) return; // source row gone — nothing to (re)index

    const row = data as unknown as EntityRow;
    const content = def.textFor(row);
    if (!content.trim()) return;
    await indexEmbedding(type, id, content, false, def.lifecycleFor(row));
  } catch {
    /* best-effort: never break the write path */
  }
}

/**
 * Remove an entity's index entries. Call ONLY on a true HARD-DELETE (the source
 * row no longer exists). For archive/close/deactivate use reindexEntity instead
 * — we keep history searchable, just re-stamped as lifecycle="history".
 *
 * For governance, pass the COMPOSITE id (the same one reindexEntity took).
 * Best-effort: never throws.
 */
export async function removeEntityIndex(type: EntityType, id: number): Promise<void> {
  try {
    if (!id) return;
    await removeEmbedding(type, id);
  } catch {
    /* best-effort: never break the write path */
  }
}

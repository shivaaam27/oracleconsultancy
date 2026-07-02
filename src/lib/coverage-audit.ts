// Search-coverage self-audit — the system flagging its own blind spots.
//
// Today only task/meeting/document/person are indexed ON WRITE (create only); the
// other eight registry types plus ALL updates only catch up at the nightly
// /api/cron/reindex. If that cron stalls (or a new entity is added without a
// write-hook), whole swathes of records quietly fall out of search. This audit
// makes that loud: for every entity in the registry it compares how many source
// rows EXIST against how many are actually INDEXED, and reports anything that is
// materially under-indexed or entirely missing.
//
// It also takes a cheap best-effort look for tables that LOOK like first-class
// searchable entities (they hold rows of business content) but are NOT in the
// registry at all — a blind spot the registry-vs-index check can't see by
// definition.
//
// Pure / server-safe: DB reads via the supabase-js client `sb` only. EVERYTHING
// is best-effort — a failed count is treated as "unknown" and never throws, so
// this can be folded into health checks without any risk to a write path.

import { sb } from "@/db/supabase";
import { ENTITY_DEFS, isGovernance, type EntityType } from "@/lib/entity-registry";
import { getAppSettings } from "@/lib/settings";
import { selectAllPaged } from "@/lib/db-helpers";

// Below this fraction of rows indexed, a type with content is "materially under-
// indexed". 0.9 = at least 90% of source rows must have an embedding.
const MIN_COVERAGE = 0.9;

export type CoverageSeverity = "ok" | "gap" | "missing";

export type CoverageRow = {
  /** The registry SourceType (or a candidate table name for unregistered tables). */
  type: string;
  /** Distinct source rows that exist in the source table(s). null = couldn't count. */
  sourceRows: number | null;
  /** Distinct source_ids present in the embeddings table for this type. */
  indexedRows: number;
  /** Fraction of source rows NOT indexed (0 = fully covered, 1 = none). null = unknown. */
  gapPct: number | null;
  /** ok = covered; gap = below MIN_COVERAGE; missing = rows exist but nothing indexed. */
  severity: CoverageSeverity;
  /** A registered entity in ENTITY_DEFS, or a table that merely LOOKS like an entity. */
  registered: boolean;
};

export type CoverageAudit = {
  /** ok = every registered type adequately covered; warn = at least one material gap. */
  status: "ok" | "warn";
  rows: CoverageRow[];
  checkedAt: string;
};

/** Exact row count for a table via a HEAD request. null on any failure. */
async function tableCount(table: string): Promise<number | null> {
  try {
    const { count, error } = await sb.from(table).select("id", { count: "exact", head: true });
    if (error) return null;
    return count ?? 0;
  } catch {
    return null;
  }
}

/** Count of DISTINCT source_ids in the embeddings table for one SourceType.
 *  The table is chunk-level (many rows per source), so we fetch just the id
 *  column and dedupe in memory. Best-effort: 0 on any failure. */
async function indexedCount(type: EntityType): Promise<number> {
  try {
    // Page past 1000 chunks so a large type isn't undercounted (which used to
    // raise a false "search blind spot" warning once a type grew past one page).
    const data = await selectAllPaged<{ source_id: unknown }>(() => sb.from("embeddings").select("source_id").eq("source_type", type));
    return new Set(data.map((r) => r.source_id)).size;
  } catch {
    return 0;
  }
}

/** Source-row count for a registry type. Governance spans four physical tables
 *  under one SourceType, so sum them; any sub-table that can't be counted makes
 *  the whole count "unknown" (null) rather than silently undercounting. */
async function sourceCountFor(type: EntityType): Promise<number | null> {
  if (isGovernance(type)) {
    const tables = ["cap_table", "beneficial_owners", "signatories", "key_persons"] as const;
    let total = 0;
    for (const t of tables) {
      const c = await tableCount(t);
      if (c === null) return null;
      total += c;
    }
    return total;
  }
  const def = ENTITY_DEFS.find((d) => d.type === type);
  if (!def) return null;
  return tableCount(def.table);
}

function classify(sourceRows: number | null, indexedRows: number): {
  gapPct: number | null;
  severity: CoverageSeverity;
} {
  // Can't count the source → don't raise a false alarm.
  if (sourceRows === null) return { gapPct: null, severity: "ok" };
  // No source rows → nothing to index, so nothing is wrong.
  if (sourceRows <= 0) return { gapPct: 0, severity: "ok" };
  const covered = Math.min(indexedRows, sourceRows);
  const gapPct = 1 - covered / sourceRows;
  if (indexedRows <= 0) return { gapPct, severity: "missing" };
  if (covered / sourceRows < MIN_COVERAGE) return { gapPct, severity: "gap" };
  return { gapPct, severity: "ok" };
}

// Tables that hold first-class, searchable business content but are NOT in the
// entity registry — so they are invisible to the registry-vs-index check above.
// Probed cheaply (one HEAD count each); any with rows is surfaced as a possible
// blind spot for a human to decide whether it should be indexed. Heuristic, not
// exhaustive: listing every public table needs information_schema, which the
// supabase-js (PostREST) client doesn't expose.
//
// Kept deliberately tight to the records a reasonable observer would EXPECT to be
// searchable yet aren't — so the signal stays honest and doesn't cry wolf over
// operational/ephemeral tables the owner may have chosen not to index.
const UNREGISTERED_CANDIDATES: string[] = [
  "facts",       // append-only fact ledger (salary/shareholding/directors/bank…)
  "resolutions", // board resolutions (governance)
  "decisions",   // governance decisions
];

/**
 * Audit search coverage across every registered entity (+ a cheap look for
 * un-registered entity-like tables). Returns a structured per-type breakdown and
 * an overall ok/warn. Best-effort — never throws; on total failure returns an
 * empty, ok audit so health checks degrade gracefully.
 */
export async function auditCoverage(): Promise<CoverageAudit> {
  const checkedAt = new Date().toISOString();
  try {
    // Semantic search is OFF by default and INERT until the owner does the
    // one-time setup (see SEMANTIC_SEARCH.md). While it's off, the embeddings
    // table is intentionally empty, so a coverage check would flag EVERY type as
    // "un-indexed" and the health card would cry wolf forever. Report ok (with an
    // empty breakdown) until the feature is actually turned on.
    let enabled = false;
    try {
      enabled = (await getAppSettings()).semanticSearch === true;
    } catch {
      enabled = false;
    }
    if (!enabled) return { status: "ok", rows: [], checkedAt };

    const rows: CoverageRow[] = [];

    // 1) Every registered SourceType: source rows vs distinct indexed source_ids.
    for (const def of ENTITY_DEFS) {
      const [sourceRows, indexedRows] = await Promise.all([
        sourceCountFor(def.type),
        indexedCount(def.type),
      ]);
      const { gapPct, severity } = classify(sourceRows, indexedRows);
      rows.push({ type: def.type, sourceRows, indexedRows, gapPct, severity, registered: true });
    }

    // 2) Cheap blind-spot probe: tables that look like entities but aren't
    //    registered. Only flag ones that actually hold rows (severity "gap" —
    //    they have content yet zero coverage by design, since nothing indexes
    //    them). Skip names already covered by a registry table.
    const registeredTables = new Set<string>([
      ...ENTITY_DEFS.map((d) => d.table),
      "cap_table", "beneficial_owners", "signatories", "key_persons",
    ]);
    for (const table of UNREGISTERED_CANDIDATES) {
      if (registeredTables.has(table)) continue;
      const sourceRows = await tableCount(table);
      if (sourceRows === null || sourceRows <= 0) continue; // missing/empty → not a blind spot
      rows.push({
        type: table,
        sourceRows,
        indexedRows: 0,
        gapPct: 1,
        severity: "gap",
        registered: false,
      });
    }

    const status: CoverageAudit["status"] =
      rows.some((r) => r.severity !== "ok") ? "warn" : "ok";
    return { status, rows, checkedAt };
  } catch {
    return { status: "ok", rows: [], checkedAt };
  }
}

// Unified "deep index" search across the whole COS system.
//
// One pass over the high-value entities — people, companies, documents,
// letters, meetings, vendors, assets — plus the board/governance/process data
// (cap table, beneficial owners, signatories, key persons, risk register,
// pipeline applications, commitments) with typo-tolerant, relevance-ranked
// matching. Tasks are handled separately (they keep their rich action rows in
// the palette), so they're not duplicated here.
//
// History-aware: by default only current items surface, but `includeHistory`
// ALSO returns archived people, inactive vendors, archived assets/documents and
// closed/expired/terminal records — never dropping them, just labelling each as
// "history" with a human badge and a small ranking penalty.
//
// Single-operator system with modest data volumes, so we fetch a wide net via
// per-token ilike OR-filters and rank in memory. No new infrastructure.
//
// REGISTRY-DRIVEN: the per-type knowledge (which table, which columns, the ilike
// net, the current-only filter, and the row→result mapping) lives ONCE in
// src/lib/entity-registry.ts. This file just loops over SEARCHABLE_DEFS, runs each
// def's query, scores via the shared scorer, and applies the history penalty +
// per-type cap. Adding a new searchable entity = add one EntityDef there; this
// file does NOT change. The scorer (score/within/tokenize) stays the single
// source of ranking truth and lives here.

import { sb } from "@/db/supabase";
import { expandQuery } from "@/lib/synonyms";
import {
  SEARCHABLE_DEFS,
  type EntityRow,
  type SearchCustomCtx,
  type ScoredSearchResult,
} from "@/lib/entity-registry";

export type SearchResultType =
  | "person" | "company" | "document" | "letter" | "meeting" | "vendor" | "asset"
  | "governance" | "risk" | "pipeline" | "commitment";

export type SearchResult = {
  type: SearchResultType;
  id: number;
  title: string;
  subtitle: string;
  href: string;
  badge?: string;
  score: number;
  lifecycle?: "active" | "history";
};

const STOP = new Set(["the", "a", "an", "of", "for", "to", "in", "on", "and", "is", "with"]);

// History rows still appear, just below their live equivalents.
const HISTORY_PENALTY = 18;

function tokenize(q: string): string[] {
  return q
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 2 && !STOP.has(t))
    .slice(0, 6);
}

// Tiny bounded Levenshtein — returns true when within `max` edits.
function within(a: string, b: string, max: number): boolean {
  if (Math.abs(a.length - b.length) > max) return false;
  const prev = new Array(b.length + 1).fill(0).map((_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diagPrev = prev[0];
    prev[0] = i;
    let rowMin = prev[0];
    for (let j = 1; j <= b.length; j++) {
      const cur = a[i - 1] === b[j - 1] ? diagPrev : Math.min(diagPrev, prev[j], prev[j - 1]) + 1;
      diagPrev = prev[j];
      prev[j] = cur;
      if (cur < rowMin) rowMin = cur;
    }
    if (rowMin > max) return false; // whole row already exceeds budget
  }
  return prev[b.length] <= max;
}

/**
 * Score how well `parts` (the searchable fields of a record, in priority order:
 * the most important field first) match the query tokens. Higher is better; 0
 * means no match at all (caller should drop it).
 *
 * `tokens` are the literal user words (strict — every one must land somewhere).
 * `extra` are synonym-expanded recall tokens: they only ADD score (a soft
 * boost), they never gate the result, so "supplier" can light up a vendor whose
 * own fields only ever say "vendor".
 */
function score(
  parts: (string | null | undefined)[],
  q: string,
  tokens: string[],
  extra: string[] = [],
): number {
  const fields = parts.map((p) => (p ?? "").toLowerCase()).filter(Boolean);
  if (fields.length === 0) return 0;
  const primary = fields[0];
  const haystack = fields.join(" ");
  let s = 0;

  // Whole-query signals on the primary field (name/title/code).
  if (primary === q) s += 120;
  else if (primary.startsWith(q)) s += 70;
  else if (haystack.includes(q)) s += 40;

  let matchedTokens = 0;
  for (const t of tokens) {
    let best = 0;
    for (let fi = 0; fi < fields.length; fi++) {
      const f = fields[fi];
      const weight = fi === 0 ? 1 : 0.5; // primary field matches count more
      const words = f.split(/[\s\-_/]+/);
      if (words.some((w) => w === t)) best = Math.max(best, 30 * weight);
      else if (words.some((w) => w.startsWith(t))) best = Math.max(best, 22 * weight);
      else if (f.includes(t)) best = Math.max(best, 14 * weight);
      else if (t.length >= 4 && words.some((w) => w.length >= 4 && within(w, t, 1)))
        best = Math.max(best, 10 * weight); // typo tolerance
    }
    if (best > 0) matchedTokens++;
    s += best;
  }

  // Synonym recall: a small additive boost only (never a gate). Skip any extra
  // token that's already a literal token so we don't double-count.
  const literal = new Set(tokens);
  for (const t of extra) {
    if (literal.has(t)) continue;
    let best = 0;
    for (let fi = 0; fi < fields.length; fi++) {
      const f = fields[fi];
      const weight = fi === 0 ? 1 : 0.5;
      const words = f.split(/[\s\-_/]+/);
      if (words.some((w) => w === t)) best = Math.max(best, 12 * weight);
      else if (words.some((w) => w.startsWith(t))) best = Math.max(best, 9 * weight);
      else if (f.includes(t)) best = Math.max(best, 6 * weight);
    }
    s += best;
  }

  // Every literal token must land somewhere, or it isn't a real hit.
  if (tokens.length > 0 && matchedTokens < tokens.length) {
    if (matchedTokens < tokens.length - 0) return 0;
  }
  return s;
}

function orIlike(cols: string[], tokens: string[]): string {
  const parts: string[] = [];
  for (const t of tokens) for (const c of cols) parts.push(`${c}.ilike.%${t}%`);
  return parts.join(",");
}

function one<T>(rel: T | T[] | null | undefined): T | null {
  return Array.isArray(rel) ? rel[0] ?? null : rel ?? null;
}

export async function unifiedSearch(
  query: string,
  perTypeLimit = 6,
  includeHistory = false,
): Promise<SearchResult[]> {
  const q = query.toLowerCase().trim();
  const tokens = tokenize(q);
  if (!q || tokens.length === 0) return [];

  // Synonym-expanded recall tokens — used to WIDEN the ilike net on the
  // free-text tables and to softly boost in-memory scoring. Always include the
  // literal tokens so the net never narrows.
  let expanded: string[] = [];
  try {
    expanded = expandQuery(q);
  } catch {
    expanded = [];
  }
  const netTokens = Array.from(new Set([...tokens, ...expanded]));

  // Build the supabase query for one per-row searchable def, applying exactly the
  // select/ilike-net/current-filter/order/limit the hand-written block used.
  //  - ilikeColumns set → the OR-ilike net (free-text tables) on the widened
  //    synonym token set, so the net never narrows.
  //  - currentFilter set AND not including history → the current-only `.eq(...)`
  //    (small/typo-critical tables instead drop history rows in `toResult`).
  const buildQuery = (def: (typeof SEARCHABLE_DEFS)[number]) => {
    const s = def.search!;
    // Apply the FILTER ops (.or/.eq) first so `qb` keeps the filter-builder type,
    // then chain the transform ops (.order/.limit) in the return expression — the
    // same op order the hand-written blocks used.
    let qb = sb.from(def.table).select(s.select);
    if (s.ilikeColumns) qb = qb.or(orIlike(s.ilikeColumns, netTokens));
    if (s.currentFilter && !includeHistory) qb = qb.eq(s.currentFilter.column, s.currentFilter.value);
    const transformed = s.order ? qb.order(s.order.column, { ascending: s.order.ascending }) : qb;
    return transformed.limit(s.limit);
  };

  // The scorer + the read context handed to each def. `score` here closes over
  // this query's tokens, so a def's `toResult` parts and `searchCustom` self-score
  // are ranked identically to the inline blocks they replaced.
  const scoreParts = (parts: (string | null | undefined)[]) => score(parts, q, tokens, expanded);
  const ctx: SearchCustomCtx = { q, tokens, includeHistory, score: scoreParts, one };

  // One collected result set per def. `custom` = the governance escape-hatch
  // (self-scored); `rows` = raw DB rows for a per-row def.
  type DefResult =
    | { def: (typeof SEARCHABLE_DEFS)[number]; custom: ScoredSearchResult[] }
    | { def: (typeof SEARCHABLE_DEFS)[number]; rows: EntityRow[] };

  // Fire every searchable def in parallel. Each carries its def so the COLLECTION
  // phase can re-order independently of fetch order. Best-effort per def: a table
  // that errors logs + yields an empty set, never breaking the whole search.
  const results: DefResult[] = await Promise.all(
    SEARCHABLE_DEFS.map(async (def): Promise<DefResult> => {
      try {
        if (def.searchCustom) return { def, custom: await def.searchCustom(ctx) };
        const r = (await buildQuery(def)) as { data: EntityRow[] | null };
        return { def, rows: r.data ?? [] };
      } catch (e) {
        console.error("Unified search table error:", e);
        return def.searchCustom ? { def, custom: [] } : { def, rows: [] };
      }
    }),
  );

  const out: SearchResult[] = [];
  const push = (r: SearchResult | null) => { if (r && r.score > 0) out.push(r); };

  // Apply the history label + ranking penalty in one place (unchanged from the
  // hand-written `past()` helper).
  const HISTORY = (r: SearchResult): SearchResult =>
    r.lifecycle === "history" ? { ...r, score: Math.max(1, r.score - HISTORY_PENALTY) } : r;

  // The final ranking sort is STABLE, so for two cross-type rows that tie on score
  // the one pushed FIRST wins the higher slot. To keep results byte-for-byte
  // identical to the hand-written blocks, collect in their exact original push
  // order (not searchOrder). Any future type the legacy order doesn't name simply
  // falls to the end (by searchOrder), so a new EntityDef still surfaces.
  const LEGACY_PUSH_ORDER = [
    "person", "company", "document", "letter", "meeting", "vendor", "asset",
    "governance", "risk", "pipeline", "commitment",
  ];
  const pushRank = (type: string) => {
    const i = LEGACY_PUSH_ORDER.indexOf(type);
    return i === -1 ? LEGACY_PUSH_ORDER.length : i;
  };
  const ordered = [...results].sort((a, b) => pushRank(a.def.type) - pushRank(b.def.type));

  for (const res of ordered) {
    if ("custom" in res) {
      // Governance: already fully scored by its own scorer; apply the history
      // penalty uniformly (governance is always active, so this is a no-op there).
      for (const r of res.custom) push(HISTORY(r as SearchResult));
      continue;
    }
    // Per-row defs: map each row to a SearchEntityResult (null = drop), then score
    // its scoreParts here so the scorer stays the single source of ranking truth.
    for (const row of res.rows) {
      const er = res.def.search!.toResult(row, ctx);
      if (!er) continue;
      const { scoreParts: parts, ...rest } = er;
      // `rest.type` is the wide EntityType (includes "task"); searchable defs never
      // include tasks, so it's always a SearchResultType at runtime — assert it.
      push(HISTORY({ ...rest, score: scoreParts(parts) } as SearchResult));
    }
  }

  // FULL-TEXT augmentation for DOCUMENTS — instant, Groq-free. The registry net
  // only ilike-matches a few document COLUMNS; the Postgres FTS index (content_tsv)
  // reads INSIDE the file body (the OCR'd / typed text) with ranking + a highlighted
  // snippet. So searching a passport number, a reference, or a phrase that lives
  // only in a scanned PDF now surfaces that document with the matching excerpt.
  // Merge: boost + snippet an existing hit, or add one the column-net missed.
  try {
    const { data: fts } = await sb.rpc("search_documents", { p_query: query, p_limit: perTypeLimit });
    for (const r of (fts ?? []) as Array<Record<string, unknown>>) {
      const id = r.id as number;
      const snippet = String(r.snippet ?? "").replace(/\s+/g, " ").trim();
      const rankBoost = Math.min(20, Math.round(((r.rank as number) ?? 0) * 20));
      const existing = out.find((o) => o.type === "document" && o.id === id);
      if (existing) {
        if (snippet) existing.subtitle = snippet;
        existing.score += 6 + rankBoost;
      } else {
        const href = r.person_id ? `/documents?person=${r.person_id}` : r.company_id ? `/documents?company=${r.company_id}` : "/documents";
        out.push({
          type: "document", id,
          title: r.title as string,
          subtitle: snippet || (r.doc_type as string) || (r.category as string) || "Document",
          href,
          badge: (r.reference_no as string) || undefined,
          score: 42 + rankBoost,
        });
      }
    }
  } catch (e) {
    console.error("Document FTS augmentation error:", e);
  }

  // Rank globally, then keep at most `perTypeLimit` of each type so no single
  // type floods the list, then sort the survivors by score again.
  out.sort((x, y) => y.score - x.score);
  const counts: Record<string, number> = {};
  const kept = out.filter((r) => {
    counts[r.type] = (counts[r.type] ?? 0) + 1;
    return counts[r.type] <= perTypeLimit;
  });
  return kept.sort((x, y) => y.score - x.score).slice(0, includeHistory ? 40 : 24);
}

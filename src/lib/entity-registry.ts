// Entity registry — the SINGLE SOURCE OF TRUTH for every indexable/searchable
// entity in the COS system.
//
// Each EntityDef describes one of the 12 SourceType entities: which table it
// lives in, which columns feed the search index, how to turn a row into the
// indexable text, and whether a given row is "active" (current/live) or
// "history" (archived/closed/inactive but KEPT and labelled, never deleted).
//
// Both the per-write hooks (src/lib/index-hooks.ts) and the nightly catch-all
// (src/lib/embeddings-reindex.ts) derive from this one table, so they can never
// drift: add an entity here once and it auto-indexes on the cron AND can be
// wired into write paths with reindexEntity(type, id).
//
// Pure / server-safe: DB reads via the supabase-js client `sb` only, no React.
// Everything is best-effort — callers must treat reads as nullable and never let
// an index path throw into a write path.

import { sb } from "@/db/supabase";
import type { SourceType, Lifecycle } from "@/lib/embeddings";

export type EntityType = SourceType;

/** A plain DB row as returned by supabase-js (column → value). */
export type EntityRow = Record<string, unknown>;

// ── Read-surface (search) shared shapes ──────────────────────────────────────
//
// One SearchResult is what the deep-index search (src/lib/search.ts) and the
// command palette render. We mirror its shape here so each EntityDef can own the
// row→result mapping for its own type. The only difference from search.ts'
// SearchResult is that the registry returns `scoreParts` (the ordered fields fed
// to the in-memory scorer) INSTEAD of a numeric `score` — the scorer + history
// penalty live in search.ts and stay the single source of ranking truth, so the
// registry never duplicates that logic.

/** Lifecycle-aware result a search EntityDef yields per row. */
export type SearchEntityResult = {
  type: EntityType;
  id: number;
  title: string;
  subtitle: string;
  href: string;
  badge?: string;
  lifecycle: Lifecycle;
  /** Documents only: original file name, for the palette's file-type icon. */
  fileName?: string;
  /** Ordered fields (primary first) the caller feeds to its scorer. */
  scoreParts: (string | null | undefined)[];
};

/**
 * A fully-built search result, as search.ts emits it (numeric `score`). The
 * governance escape-hatch (searchCustom) returns these directly because it
 * computes its own scores via the injected scorer.
 */
export type ScoredSearchResult = Omit<SearchEntityResult, "scoreParts"> & { score: number };

/** The in-memory scorer search.ts owns, injected so governance can self-score. */
export type SearchScorer = (parts: (string | null | undefined)[]) => number;

/** Context handed to searchCustom so it can read tokens + score like the loop. */
export type SearchCustomCtx = {
  /** Lowercased, trimmed query. */
  q: string;
  /** Literal user tokens (strict — every one must match). */
  tokens: string[];
  /** Whether archived/closed/terminal rows should be included + labelled. */
  includeHistory: boolean;
  /** Score a parts array exactly as the main loop does. */
  score: SearchScorer;
  /** Read the first element of a possibly-array supabase relation. */
  one: <T>(rel: T | T[] | null | undefined) => T | null;
};

/**
 * How an entity participates in the deep-index search. A type either provides a
 * row-by-row mapping (`select` + `toResult`, the common case) OR an escape-hatch
 * `searchCustom` (governance, which fans out over four tables → many results).
 */
export type EntitySearch = {
  /** The exact supabase `.select(...)` string search.ts uses for this type. */
  select: string;
  /**
   * The current-only DB filter this type applies when NOT including history:
   *  - SET (e.g. { column: "archived", value: false }) → the loop adds
   *    `.eq(column, value)` only when includeHistory is off (documents, vendors).
   *  - UNSET → no DB pre-filter; the small/typo-critical tables fetch whole and
   *    `toResult` drops history rows in-memory (returns null) so near-miss
   *    spellings still surface (people, assets — and vendors ALSO drop in-memory
   *    as belt-and-braces on top of their DB filter).
   * Either way `toResult` still labels lifecycle + drops in-memory where search.ts
   * did, so the two stay in lockstep regardless of the pre-filter.
   */
  currentFilter?: { column: string; value: unknown };
  /** Optional `.order(column, { ascending })` for a per-type default ordering. */
  order?: { column: string; ascending: boolean };
  /**
   * OPTIONAL date column search.ts may range-filter on when the query carries a
   * date phrase ("invoices from June", "2025"). Best-effort + additive: only
   * applied when the def declares it AND a phrase parses; otherwise ignored.
   */
  dateColumn?: string;
  /**
   * OPTIONAL company FK column search.ts may equality-filter on when the query
   * names a company. Defaults to "company_id" when the select string contains it;
   * set explicitly to override or disable. Best-effort — no name match = no filter.
   */
  companyColumn?: string;
  /** Per-table fetch cap (mirrors search.ts' `.limit(...)`). */
  limit: number;
  /**
   * Which columns the OR-ilike net filters on (free-text tables only). When set,
   * search.ts applies `.or(orIlike(cols, netTokens))`. Omitted = no ilike
   * pre-filter (small tables fetched whole + ranked in memory).
   */
  ilikeColumns?: string[];
  /**
   * Build the lifecycle-aware result for one row. Returns null to DROP the row
   * (e.g. an archived person when includeHistory is off). MUST reproduce
   * search.ts' exact title/subtitle/href/badge/lifecycle for this type.
   */
  toResult(row: EntityRow, ctx: SearchCustomCtx): SearchEntityResult | null;
};

/** Trace participation: which table + columns the GENERIC fallback reads, or a
 *  marker that the route keeps a hand-written branch for this type. */
export type EntityTrace =
  | { mode: "bespoke" }
  | { mode: "generic"; table: string };

export type EntityDef = {
  /** The SourceType this def indexes under. */
  type: EntityType;
  /** Physical table name in Postgres. */
  table: string;
  /** Primary-key column (default "id"). */
  idColumn: string;
  /** Columns to SELECT (must cover everything lifecycleFor reads, plus the LIGHT
   *  fields textFor needs). Kept blob-free so the per-write hooks and the light
   *  paths don't drag heavy columns (e.g. a document's extracted_text) on every
   *  read. Anything textFor reads that ISN'T here must live in indexSelectColumns. */
  selectColumns: string[];
  /** OPTIONAL heavy select used ONLY by the embed/reindex paths (allRows +
   *  reindexEntity), where the full body is genuinely needed to build the vector.
   *  Superset of selectColumns; defaults to selectColumns when absent. This is the
   *  ONE place a large blob (extracted_text) is fetched — the search select stays
   *  light, so keyword search never pulls it. */
  indexSelectColumns?: string[];
  /** Build the content string to index from a row (mirrors allRows' join). Reads
   *  from indexSelectColumns fields; each read is null-guarded so a light row
   *  (missing the blob) simply omits it. */
  textFor(row: EntityRow): string;
  /** Decide active vs history for a row (mirrors the existing lifecycle rules). */
  lifecycleFor(row: EntityRow): Lifecycle;

  // ── Read-surface knowledge (lifted from search.ts / trace / palette) ───────

  /** Heading used in the command palette + any grouped result list. */
  uiLabel: string;
  /** Position in the palette's TYPE_ORDER (lower = earlier). */
  searchOrder: number;
  /**
   * How this type participates in the deep-index search. Most types provide a
   * per-row `EntitySearch`; governance instead provides `searchCustom` because
   * it fans out over four tables. Types not in the deep index (tasks — they keep
   * their rich task rows in the palette) leave both undefined.
   */
  search?: EntitySearch;
  /**
   * Escape-hatch: build ALL results for this type directly (governance only).
   * Mutually exclusive with `search`. Lifts search.ts' governance block verbatim.
   */
  searchCustom?: (ctx: SearchCustomCtx) => Promise<ScoredSearchResult[]>;
  /** How the trace route handles this type (bespoke branch vs generic table). */
  trace?: EntityTrace;
};

// ── Shared helpers ───────────────────────────────────────────────────────────

/** Join non-empty parts with newlines — identical to embeddings-reindex's join. */
const join = (...parts: (string | null | undefined)[]) => parts.filter(Boolean).join("\n");

const lc = (s: unknown) => (typeof s === "string" ? s : s == null ? "" : String(s)).toLowerCase();
const str = (v: unknown): string => (typeof v === "string" ? v : v == null ? "" : String(v));
const num = (v: unknown): number => Number(v);

// Read a (possibly null) raw string straight through, like `r.foo as string|null`.
// search.ts uses `r.foo as string | null` directly; this mirrors that — a blank
// string stays a blank string (filter()/`?? undefined` handle it downstream).
const sx = (v: unknown): string | null => (v == null ? null : (v as string));

// dd Mon yyyy — identical to search.ts' toLocaleDateString call for dates.
const fmtDate = (v: unknown): string | null => {
  if (!v) return null;
  const d = new Date(v as string);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
};

// "This record has run its course" → index as history. Kept in step with the
// canonical sets in src/lib/search.ts and src/lib/embeddings-reindex.ts so
// search-filtering and re-indexing agree on what counts as past. Compared
// case-insensitively, the same way both of those do.
const CLOSED_TASK_STATUSES = new Set(["completed", "closed"]);
const RISK_DONE = new Set(["closed", "resolved", "mitigated", "accepted", "done"]);
const PIPELINE_DONE = new Set(["issued", "receipt received", "paid", "completed", "done", "closed"]);
const COMMITMENT_DONE = new Set(["expired", "ended", "terminated", "lapsed", "closed", "renewed"]);

// ── Governance composite-id scheme ───────────────────────────────────────────
//
// The single "governance" SourceType addresses FOUR physical tables
// (cap_table / beneficial_owners / signatories / key_persons). A source-table id
// isn't globally unique across them, so we use a STABLE COMPOSITE id:
//   compositeId = base + row.id
// where base = 1e6 cap_table, 2e6 beneficial_owner, 3e6 signatory, 4e6 key_person.
// All governance rows are treated as active (board-level standing facts).
//
// This MUST stay byte-for-byte identical to embeddings-reindex.ts' GOV_BASE.
export const GOV_BASE = {
  capTable: 1_000_000,
  beneficialOwner: 2_000_000,
  signatory: 3_000_000,
  keyPerson: 4_000_000,
} as const;

type GovSub = {
  base: number;
  table: string;
  selectColumns: string[];
  textFor(row: EntityRow): string;
};

// One descriptor per governance sub-table. Mirrors collectGovernance() exactly.
const GOVERNANCE_SUBS: GovSub[] = [
  {
    base: GOV_BASE.capTable,
    table: "cap_table",
    selectColumns: ["id", "holder", "holder_type", "note"],
    textFor: (r) => join("Shareholder", str(r.holder), str(r.holder_type), str(r.note)),
  },
  {
    base: GOV_BASE.beneficialOwner,
    table: "beneficial_owners",
    selectColumns: ["id", "person_name", "interests", "flag"],
    textFor: (r) => join("Beneficial owner", str(r.person_name), str(r.interests), str(r.flag)),
  },
  {
    base: GOV_BASE.signatory,
    table: "signatories",
    selectColumns: ["id", "name", "scope", "note"],
    textFor: (r) => join("Signatory", str(r.name), str(r.scope), str(r.note)),
  },
  {
    base: GOV_BASE.keyPerson,
    table: "key_persons",
    selectColumns: ["id", "name", "risk", "note"],
    textFor: (r) => join("Key person", str(r.name), str(r.risk), str(r.note)),
  },
];

/** A governance row tagged ready for the registry: composite id + content. */
export type GovernanceRow = { id: number; content: string; lifecycle: Lifecycle };

/**
 * Fetch ALL governance entities (cap table, UBOs, signatories, key persons) as
 * registry rows, each with its STABLE COMPOSITE id (GOV_BASE + row.id) and
 * indexable content. All are lifecycle "active". Mirrors collectGovernance()
 * in embeddings-reindex.ts. Best-effort: a sub-table that errors is skipped.
 */
export async function getGovernanceRows(): Promise<GovernanceRow[]> {
  const out: GovernanceRow[] = [];
  for (const sub of GOVERNANCE_SUBS) {
    let data: EntityRow[] | null = null;
    try {
      ({ data } = await sb.from(sub.table).select(sub.selectColumns.join(",")));
    } catch {
      data = null;
    }
    for (const r of data ?? []) out.push({ id: sub.base + num(r.id), content: sub.textFor(r), lifecycle: "active" });
  }
  return out;
}

/**
 * Fetch ONE governance row by its composite id. Decomposes the id into
 * (sub-table, row id), reads that single source row, and returns its registry
 * shape. null if the id doesn't map to a sub-table or the row is gone.
 */
export async function getGovernanceRowById(compositeId: number): Promise<GovernanceRow | null> {
  // Find the sub whose base bracket the id falls into (bases are 1e6 apart and
  // row ids are far below 1e6, so floor-to-million identifies the table).
  const sub = [...GOVERNANCE_SUBS]
    .sort((a, b) => b.base - a.base)
    .find((s) => compositeId >= s.base && compositeId < s.base + GOV_BASE.capTable);
  if (!sub) return null;
  const rowId = compositeId - sub.base;
  if (!Number.isInteger(rowId) || rowId <= 0) return null;
  try {
    const { data } = await sb.from(sub.table).select(sub.selectColumns.join(",")).eq("id", rowId).limit(1).maybeSingle();
    if (!data) return null;
    return { id: compositeId, content: sub.textFor(data as unknown as EntityRow), lifecycle: "active" };
  } catch {
    return null;
  }
}

// ── Governance search escape-hatch ───────────────────────────────────────────
//
// The single "governance" SourceType fans out over FOUR tables (cap_table,
// beneficial_owners, signatories, key_persons), so it can't use the per-row
// `EntitySearch` shape — it returns MANY results per query. This lifts search.ts'
// governance block verbatim: same selects, same titles/subtitles/hrefs/badges,
// all lifecycle "active" (board-level reference data, never history). Best-effort:
// a sub-table that errors is skipped. Scores come from the injected scorer so
// ranking stays identical to the rest of the search.
async function governanceSearch(ctx: SearchCustomCtx): Promise<ScoredSearchResult[]> {
  const { score, one } = ctx;
  const out: ScoredSearchResult[] = [];
  // Best-effort fetch: a table that errors yields [] and never breaks the rest.
  const safe = async (p: PromiseLike<{ data: unknown }>): Promise<EntityRow[]> => {
    try {
      const { data } = await p;
      return (Array.isArray(data) ? data : []) as EntityRow[];
    } catch (e) {
      console.error("Governance search table error:", e);
      return [];
    }
  };
  const companyHref = (id: number | null | undefined) => (id ? `/companies/${id}` : "/companies");

  const [capRows, beneficialOwners, signatories, keyPersons] = await Promise.all([
    safe(sb.from("cap_table").select("id,company_id,holder,shares,pct,holder_type,note, companies(name)").limit(400)),
    safe(sb.from("beneficial_owners").select("id,person_name,interests,flag").limit(200)),
    safe(sb.from("signatories").select("id,company_id,name,scope,note, companies(name)").limit(300)),
    safe(sb.from("key_persons").select("id,name,risk,note").limit(200)),
  ]);

  for (const r of capRows) {
    const company = one<{ name?: string }>(r.companies as never)?.name ?? null;
    const pct = r.pct != null ? `${Math.round((r.pct as number) * 100) / 100}%` : null;
    const role = ["Shareholder", company, pct].filter(Boolean).join(" · ");
    out.push({
      type: "governance", id: r.id as number,
      title: r.holder as string,
      subtitle: role || "Shareholder",
      href: companyHref(r.company_id as number | null),
      badge: sx(r.holder_type) ?? undefined,
      lifecycle: "active",
      score: score([r.holder as string, company, sx(r.holder_type), sx(r.note)]),
    });
  }
  for (const r of beneficialOwners) {
    out.push({
      type: "governance", id: r.id as number,
      title: r.person_name as string,
      subtitle: ["Beneficial owner", sx(r.interests)].filter(Boolean).join(" · ") || "Beneficial owner",
      href: "/companies",
      badge: sx(r.flag) ?? undefined,
      lifecycle: "active",
      score: score([r.person_name as string, sx(r.interests), sx(r.flag)]),
    });
  }
  for (const r of signatories) {
    const company = one<{ name?: string }>(r.companies as never)?.name ?? null;
    const role = r.scope ? `Signatory (${r.scope as string})` : "Signatory";
    out.push({
      type: "governance", id: r.id as number,
      title: r.name as string,
      subtitle: [role, company].filter(Boolean).join(" · ") || role,
      href: companyHref(r.company_id as number | null),
      lifecycle: "active",
      score: score([r.name as string, sx(r.scope), company, sx(r.note)]),
    });
  }
  for (const r of keyPersons) {
    out.push({
      type: "governance", id: r.id as number,
      title: r.name as string,
      subtitle: "Key person",
      href: "/companies",
      badge: sx(r.risk) ?? undefined,
      lifecycle: "active",
      score: score([r.name as string, sx(r.risk), sx(r.note)]),
    });
  }
  return out;
}

// ── Entity definitions (the 12 SourceType entities) ──────────────────────────
//
// Each textFor/lifecycleFor MIRRORS embeddings-reindex.ts' allRows() exactly so
// coverage and labelling never change. Governance is handled out-of-band via
// getGovernanceRows()/getGovernanceRowById() because of its composite ids, but
// still has a def so getEntityDef("governance") works for the hooks.

export const ENTITY_DEFS: EntityDef[] = [
  {
    // Tasks — archived OR Completed/Closed = history; otherwise active.
    type: "task",
    table: "tasks",
    idColumn: "id",
    selectColumns: ["id", "code", "action_item", "latest_update", "comments", "category", "priority", "status", "archived"],
    textFor: (r) => join(str(r.code), str(r.action_item), str(r.latest_update), str(r.comments), str(r.category), str(r.priority), str(r.status)),
    lifecycleFor: (r) =>
      (r.archived as boolean) || CLOSED_TASK_STATUSES.has(lc(r.status)) ? "history" : "active",
    // Tasks keep their rich action rows in the palette (served by /api/search's
    // own task path), so they are excluded from the keyword `SEARCHABLE_DEFS`
    // loop below. This `search` block exists ONLY so the SEMANTIC (meaning) layer
    // in search.ts can resolve task hits from hybridSearch via getEntityDef.
    uiLabel: "Tasks",
    searchOrder: -1, // not in TYPE_ORDER; sentinel so it never sorts into it
    trace: { mode: "bespoke" },
    search: {
      // last_updated_at + deadline are selected so search.ts rankBoost can apply
      // the recency nudge AND a true overdue boost (deadline in the past + open).
      select: "id,code,action_item,latest_update,category,priority,status,archived,last_updated_at,deadline, companies!company_id(name)",
      limit: 100,
      toResult: (r, ctx) => {
        const company = ctx.one<{ name?: string }>(r.companies as never)?.name ?? null;
        const closed = (r.archived as boolean) || CLOSED_TASK_STATUSES.has(lc(r.status));
        if (closed && !ctx.includeHistory) return null;
        return {
          type: "task", id: r.id as number,
          title: (r.action_item as string) || (r.code as string),
          subtitle: [sx(r.code), company, sx(r.status)].filter(Boolean).join(" · ") || "Task",
          href: `/task/${r.code}`,
          badge: closed ? "Closed" : undefined,
          lifecycle: closed ? "history" : "active",
          scoreParts: [r.action_item as string, sx(r.code), company, sx(r.latest_update), sx(r.category), sx(r.priority), sx(r.status)],
        };
      },
    },
  },
  {
    // Documents — archived = history.
    type: "document",
    table: "documents",
    idColumn: "id",
    // Documents are filed by hand and no longer carry an extracted body, so the
    // index (when semantic search is on) sees only what the owner typed. Nothing
    // re-indexes a document on write any more — the ⌘K hit comes from the plain
    // `search` block below, which is a straight SQL ilike.
    selectColumns: ["id", "title", "doc_type", "issuer", "category", "reference_no", "notes", "archived"],
    textFor: (r) =>
      join(str(r.title), str(r.doc_type), str(r.issuer), str(r.category), str(r.reference_no), str(r.notes)),
    lifecycleFor: (r) => ((r.archived as boolean) ? "history" : "active"),
    uiLabel: "Documents",
    searchOrder: 4,
    trace: { mode: "bespoke" },
    search: {
      select: "id,title,category,doc_type,issuer,reference_no,file_name,company_id,person_id,archived, companies(name), people(name)",
      ilikeColumns: ["title", "category", "doc_type", "issuer", "reference_no"],
      currentFilter: { column: "archived", value: false },
      dateColumn: "issue_date",
      limit: 60,
      toResult: (r, ctx) => {
        const company = ctx.one<{ name?: string }>(r.companies as never)?.name ?? null;
        const person = ctx.one<{ name?: string }>(r.people as never)?.name ?? null;
        const owner = person || company;
        const href = r.person_id ? `/documents?person=${r.person_id}` : r.company_id ? `/documents?company=${r.company_id}` : `/documents`;
        const archived = (r.archived as boolean) === true;
        return {
          type: "document", id: r.id as number,
          title: r.title as string,
          subtitle: [sx(r.category), owner].filter(Boolean).join(" · ") || "Document",
          href,
          badge: archived ? (sx(r.doc_type) ?? "Archived") : (sx(r.doc_type) ?? undefined),
          lifecycle: archived ? "history" : "active",
          fileName: sx(r.file_name) ?? undefined,
          scoreParts: [r.title as string, sx(r.category), sx(r.doc_type), sx(r.issuer), sx(r.reference_no), owner],
        };
      },
    },
  },
  {
    // People — inactive (archived/left) = history.
    type: "person",
    table: "people",
    idColumn: "id",
    selectColumns: ["id", "name", "role", "staff_category", "notes", "nationality", "national_id", "passport_no", "date_of_birth", "email", "phone", "address", "emergency_contact_name", "emergency_contact_phone", "start_date", "person_type", "active"],
    // Index EVERY meaningful person detail so ORI/search can find someone by their
    // passport, national ID, nationality, birthday (the year is in the formatted
    // date), phone, email, address or emergency contact — not just name/role.
    textFor: (r) => join(
      str(r.name), str(r.role), str(r.staff_category), str(r.person_type), str(r.notes),
      str(r.nationality), str(r.national_id), str(r.passport_no), fmtDate(r.date_of_birth),
      str(r.email), str(r.phone), str(r.address), str(r.emergency_contact_name), str(r.emergency_contact_phone),
      fmtDate(r.start_date),
    ),
    lifecycleFor: (r) => ((r.active as boolean) === false ? "history" : "active"),
    uiLabel: "People",
    searchOrder: 0,
    trace: { mode: "bespoke" },
    search: {
      // Small, typo-critical table: fetch whole + rank in memory (NO ilike net,
      // NO DB current-filter); archived rows are dropped in-memory below.
      select: "id,name,role,email,phone,nationality,passport_no,national_id,date_of_birth,address,company_id,active, companies!company_id(name)",
      limit: 500,
      toResult: (r, ctx) => {
        const company = ctx.one<{ name?: string }>(r.companies as never)?.name ?? null;
        const archived = (r.active as boolean) === false;
        if (archived && !ctx.includeHistory) return null;
        return {
          type: "person", id: r.id as number,
          title: r.name as string,
          subtitle: [sx(r.role), company].filter(Boolean).join(" · ") || "Person",
          href: `/people?person=${r.id}`,
          badge: archived ? "Archived" : undefined,
          lifecycle: archived ? "history" : "active",
          scoreParts: [r.name as string, sx(r.role), company, sx(r.email), sx(r.phone), sx(r.passport_no), sx(r.national_id), sx(r.nationality), fmtDate(r.date_of_birth), sx(r.address)],
        };
      },
    },
  },
  {
    // Companies — inactive = history (rare; all 7 are normally active).
    type: "company",
    table: "companies",
    idColumn: "id",
    selectColumns: ["id", "name", "legal_name", "code", "code_prefix", "file_prefix", "tin", "vrn", "registration_no", "address", "phone", "email", "aliases", "active"],
    // Index the company's identifiers + contact so ORI/search finds it by TIN, VRN,
    // registration number, address, phone, email or brand prefix — not just name.
    textFor: (r) => join(
      str(r.name), str(r.legal_name), str(r.code), str(r.file_prefix),
      str(r.tin), str(r.vrn), str(r.registration_no),
      str(r.address), str(r.phone), str(r.email),
      Array.isArray(r.aliases) ? (r.aliases as string[]).join(" ") : str(r.aliases),
    ),
    lifecycleFor: (r) => ((r.active as boolean) === false ? "history" : "active"),
    uiLabel: "Companies",
    searchOrder: 1,
    trace: { mode: "bespoke" },
    search: {
      select: "id,name,code,code_prefix,file_prefix,legal_name,tin,vrn,registration_no,address,phone,email",
      limit: 100,
      toResult: (r) => ({
        // Companies always surface as live (all 7 are active reference data).
        type: "company", id: r.id as number,
        title: r.name as string,
        subtitle: [sx(r.code), sx(r.legal_name)].filter(Boolean).join(" · ") || "Company",
        href: `/companies/${r.id}`,
        badge: sx(r.code_prefix) ?? undefined,
        lifecycle: "active",
        scoreParts: [r.name as string, sx(r.code), sx(r.code_prefix), sx(r.file_prefix), sx(r.legal_name), sx(r.tin), sx(r.vrn), sx(r.registration_no), sx(r.address), sx(r.phone), sx(r.email)],
      }),
    },
  },
  {
    /**
     * Notes — Phase 6 of memory/notes_module_plan.md. Archived = history.
     *
     * ⚠️ OWNER-ONLY, and that has a consequence here that no other def has: notes
     * never reach the staff portal, so anything that surfaces a note must be an
     * admin surface. The command palette and ORI Ask are, which is why this is
     * safe; if a portal search is ever built it must NOT read this type.
     *
     * The indexed text is `body_text`, the DERIVED plain-text column — never
     * `body_json`, which is a tree of ProseMirror braces and would embed as noise.
     * That is exactly why the two columns exist (§2 of the plan).
     */
    type: "note",
    table: "notes",
    idColumn: "id",
    selectColumns: ["id", "title", "archived", "kind", "updated_at"],
    // The body is only pulled on the embed path, so keyword search and the
    // per-write hooks never drag a long note's text around.
    indexSelectColumns: ["id", "title", "body_text", "archived", "kind", "updated_at"],
    textFor: (r) => join(str(r.title), str(r.body_text)),
    lifecycleFor: (r) => ((r.archived as boolean) ? "history" : "active"),
    uiLabel: "Notes",
    searchOrder: 5,
    trace: { mode: "generic", table: "notes" },
    search: {
      select: "id,title,body_text,archived,kind,updated_at",
      currentFilter: { column: "archived", value: false },
      order: { column: "updated_at", ascending: false },
      dateColumn: "updated_at",
      limit: 300,
      toResult: (r, ctx) => {
        const archived = (r.archived as boolean) === true;
        if (archived && !ctx.includeHistory) return null;
        const title = str(r.title).trim();
        const body = str(r.body_text).replace(/\s+/g, " ").trim();
        // An untitled note is NORMAL in this module — the owner types the body
        // first and the title later, or never. Falling back to the first line is
        // the same rule `noteTitle()` follows on the shelf.
        const shown = title || body.slice(0, 60) || "Untitled note";
        return {
          type: "note", id: r.id as number,
          title: shown,
          subtitle: (title ? body.slice(0, 90) : "") || (str(r.kind) === "daily" ? "Daily page" : "Note"),
          href: `/notes/${r.id}`,
          badge: archived ? "Archived" : str(r.kind) === "daily" ? "Daily" : undefined,
          lifecycle: archived ? "history" : "active",
          scoreParts: [shown, body],
        };
      },
    },
  },
  {
    // Vendors — inactive = history.
    type: "vendor",
    table: "vendors",
    idColumn: "id",
    selectColumns: ["id", "name", "category", "location", "contact_name", "active"],
    textFor: (r) => join(str(r.name), str(r.category), str(r.location), str(r.contact_name)),
    lifecycleFor: (r) => ((r.active as boolean) === false ? "history" : "active"),
    uiLabel: "Vendors",
    searchOrder: 7,
    trace: { mode: "generic", table: "vendors" },
    search: {
      select: "id,name,category,location,contact_name,company_id,active, companies(name)",
      currentFilter: { column: "active", value: true },
      limit: 300,
      toResult: (r, ctx) => {
        const company = ctx.one<{ name?: string }>(r.companies as never)?.name ?? null;
        const inactive = (r.active as boolean) === false;
        if (inactive && !ctx.includeHistory) return null;
        return {
          type: "vendor", id: r.id as number,
          title: r.name as string,
          subtitle: [sx(r.category), sx(r.location), company].filter(Boolean).join(" · ") || "Vendor",
          href: `/hrms/assets?tab=vendors`,
          badge: inactive ? "Inactive" : undefined,
          lifecycle: inactive ? "history" : "active",
          scoreParts: [r.name as string, sx(r.category), sx(r.location), sx(r.contact_name)],
        };
      },
    },
  },
  {
    // Assets — archived (or retired) = history.
    type: "asset",
    table: "assets",
    idColumn: "id",
    selectColumns: ["id", "name", "tag", "category", "serial_no", "status", "archived"],
    textFor: (r) => join(str(r.name), str(r.tag), str(r.category), str(r.serial_no)),
    lifecycleFor: (r) => ((r.archived as boolean) || str(r.status) === "retired" ? "history" : "active"),
    uiLabel: "Assets",
    searchOrder: 8,
    trace: { mode: "generic", table: "assets" },
    search: {
      select: "id,name,tag,category,serial_no,status,archived, holder:people!assets_assigned_to_person_id_people_id_fk(name)",
      limit: 500,
      toResult: (r, ctx) => {
        const holder = ctx.one<{ name?: string }>(r.holder as never)?.name ?? null;
        const archived = (r.archived as boolean) === true;
        if (archived && !ctx.includeHistory) return null;
        return {
          type: "asset", id: r.id as number,
          title: (r.name as string) || (r.tag as string) || "Asset",
          subtitle: [sx(r.tag), sx(r.category), holder ? `with ${holder}` : null].filter(Boolean).join(" · ") || "Asset",
          href: `/hrms/assets`,
          // search.ts: live badge = status; history badge = base ?? "Archived".
          badge: archived ? (sx(r.status) ?? "Archived") : (sx(r.status) ?? undefined),
          lifecycle: archived ? "history" : "active",
          scoreParts: [sx(r.name), sx(r.tag), sx(r.category), sx(r.serial_no)],
        };
      },
    },
  },
  {
    // Governance — four physical tables under one type with composite ids.
    // Handled out-of-band by getGovernanceRows()/getGovernanceRowById(); this def
    // exists so getEntityDef("governance") resolves for the hooks. table/columns
    // are nominal (cap_table is the first sub-table). DO NOT iterate this def
    // generically — branch on type === "governance" and use the helpers.
    type: "governance",
    table: "cap_table",
    idColumn: "id",
    selectColumns: GOVERNANCE_SUBS[0].selectColumns,
    textFor: (r) => GOVERNANCE_SUBS[0].textFor(r),
    lifecycleFor: () => "active",
    uiLabel: "Governance",
    searchOrder: 2,
    // Governance has no trace (not in the route's generic table map; the palette
    // also hides the trace button for it). Leave `trace` undefined.
    // Search fans out over four tables → escape-hatch instead of a per-row def.
    // Lifts search.ts' governance block verbatim. All rows are lifecycle "active".
    searchCustom: governanceSearch,
  },
  {
    // Risks — Open = active; closed/resolved/mitigated/accepted/done = history.
    type: "risk",
    table: "risks",
    idColumn: "id",
    selectColumns: ["id", "code", "title", "description", "status"],
    textFor: (r) => join(str(r.code), str(r.title), str(r.description)),
    lifecycleFor: (r) => (RISK_DONE.has(lc(r.status)) ? "history" : "active"),
    uiLabel: "Risks",
    searchOrder: 3,
    trace: { mode: "generic", table: "risks" },
    search: {
      select: "id,code,category,title,description,likelihood,impact,owner,mitigation,status",
      limit: 300,
      toResult: (r, ctx) => {
        const done = RISK_DONE.has(lc(r.status));
        if (done && !ctx.includeHistory) return null;
        const l = (r.likelihood as number | null) ?? null;
        const i = (r.impact as number | null) ?? null;
        const band = l != null && i != null ? `L${l}×I${i}` : null;
        // No company link + no dedicated page survives → href home.
        return {
          type: "risk", id: r.id as number,
          title: r.title as string,
          subtitle: [sx(r.code), sx(r.status)].filter(Boolean).join(" · ") || "Risk",
          href: "/",
          // live badge = band ?? status; history badge = base ?? "Closed".
          badge: done ? (band ?? sx(r.status) ?? "Closed") : (band ?? sx(r.status) ?? undefined),
          lifecycle: done ? "history" : "active",
          scoreParts: [r.title as string, sx(r.code), sx(r.category), sx(r.status), sx(r.owner)],
        };
      },
    },
  },
  {
    // Pipeline — terminal stage OR archived = history.
    type: "pipeline",
    table: "pipeline",
    idColumn: "id",
    selectColumns: ["id", "subject", "type", "stage", "archived"],
    textFor: (r) => join(str(r.subject), str(r.type), str(r.stage)),
    lifecycleFor: (r) =>
      (r.archived as boolean) || PIPELINE_DONE.has(lc(r.stage)) ? "history" : "active",
    uiLabel: "Applications",
    searchOrder: 9,
    trace: { mode: "generic", table: "pipeline" },
    search: {
      select: "id,subject,type,stage,control_no,company_id,archived, companies(name)",
      ilikeColumns: ["subject", "type", "stage", "control_no", "next_action", "owner"],
      limit: 200,
      toResult: (r, ctx) => {
        const company = ctx.one<{ name?: string }>(r.companies as never)?.name ?? null;
        const archived = (r.archived as boolean) === true;
        const terminal = PIPELINE_DONE.has(lc(r.stage));
        const isHistory = archived || terminal;
        if (isHistory && !ctx.includeHistory) return null;
        const title = (r.type as string) || (r.subject as string) || "Application";
        const stage = sx(r.stage);
        return {
          type: "pipeline", id: r.id as number,
          title,
          subtitle: [sx(r.subject), company, stage].filter(Boolean).join(" · ") || "Pipeline",
          href: "/hrms/pipeline",
          // live badge = stage; history badge = base(stage) ?? (archived?"Archived":"Issued").
          badge: isHistory ? (stage ?? (archived ? "Archived" : "Issued")) : (stage ?? undefined),
          lifecycle: isHistory ? "history" : "active",
          scoreParts: [title, sx(r.subject), company, stage, sx(r.control_no)],
        };
      },
    },
  },
  {
    // Commitments — archived OR ended/expired/terminated/etc. = history.
    type: "commitment",
    table: "commitments",
    idColumn: "id",
    selectColumns: ["id", "title", "counterparty", "reference", "status", "archived"],
    textFor: (r) => join(str(r.title), str(r.counterparty), str(r.reference)),
    lifecycleFor: (r) =>
      (r.archived as boolean) || COMMITMENT_DONE.has(lc(r.status)) ? "history" : "active",
    uiLabel: "Commitments",
    searchOrder: 10,
    trace: { mode: "generic", table: "commitments" },
    search: {
      select: "id,kind,title,counterparty,reference,company_id,end_date,notice_days,status,archived, companies(name)",
      ilikeColumns: ["title", "counterparty", "reference", "kind", "status"],
      limit: 200,
      toResult: (r, ctx) => {
        const company = ctx.one<{ name?: string }>(r.companies as never)?.name ?? null;
        const archived = (r.archived as boolean) === true;
        const ended = COMMITMENT_DONE.has(lc(r.status));
        const isHistory = archived || ended;
        if (isHistory && !ctx.includeHistory) return null;
        // notice-by = end − notice_days (the date the renewal/notice window opens).
        let noticeBy: string | null = null;
        if (r.end_date) {
          const end = new Date(r.end_date as string);
          if (!Number.isNaN(end.getTime())) {
            const nd = (r.notice_days as number | null) ?? 0;
            noticeBy = fmtDate(new Date(end.getTime() - nd * 86_400_000));
          }
        }
        const kind = sx(r.kind);
        return {
          type: "commitment", id: r.id as number,
          title: r.title as string,
          subtitle: [company, noticeBy ? `notice by ${noticeBy}` : null].filter(Boolean).join(" · ") || (r.kind as string) || "Commitment",
          href: "/hrms/commitments",
          // live badge = kind; history badge = base(kind) ?? (ended?"Expired":"Archived").
          badge: isHistory ? (kind ?? (ended ? "Expired" : "Archived")) : (kind ?? undefined),
          lifecycle: isHistory ? "history" : "active",
          scoreParts: [r.title as string, sx(r.counterparty), sx(r.reference), company, kind],
        };
      },
    },
  },
  {
    // Capital projects — archived = history. Added Aug 2026: a project could be
    // opened from its own screen but could not be FOUND from the search bar,
    // which is the one place the owner starts from.
    //
    // ⚠️ The project record only. Budget lines and requisitions stay out until
    // there is a reason to index 900 of them per job — the palette is for
    // finding the thing, and the thing is the project.
    type: "project",
    table: "projects",
    idColumn: "id",
    selectColumns: ["id", "name", "variant", "client", "location", "po_number", "status", "archived"],
    textFor: (r) =>
      join(str(r.name), str(r.variant), str(r.client), str(r.location), str(r.po_number)),
    lifecycleFor: (r) => ((r.archived as boolean) === true ? "history" : "active"),
    uiLabel: "Projects",
    searchOrder: 6,
    trace: { mode: "generic", table: "projects" },
    search: {
      select: "id,name,variant,client,location,po_number,status,company_id,archived, companies(name)",
      ilikeColumns: ["name", "variant", "client", "location", "po_number", "status"],
      limit: 200,
      toResult: (r, ctx) => {
        const company = ctx.one<{ name?: string }>(r.companies as never)?.name ?? null;
        const archived = (r.archived as boolean) === true;
        if (archived && !ctx.includeHistory) return null;
        return {
          type: "project", id: r.id as number,
          title: r.name as string,
          subtitle: [sx(r.client), sx(r.location), company].filter(Boolean).join(" · ") || "Project",
          href: `/projects/${r.id as number}`,
          badge: archived ? "Archived" : sx(r.status) ?? undefined,
          lifecycle: archived ? "history" : "active",
          scoreParts: [r.name as string, sx(r.client), sx(r.location), sx(r.po_number), company],
        };
      },
    },
  },
  // ── The PES trading module (Stages 2–5) ────────────────────────────────────
  //
  // ⚠️ These four exist because each carries a REFERENCE NUMBER somebody quotes
  // down the phone: "where is PO 24322", "what happened to that bill of lading",
  // "has SS/26/1 been paid". A search box that cannot answer those is not a
  // search box. Everything else in the module — the balances, the conversion,
  // the report — is worked out on its own screen and has nothing to index.
  //
  // ⚠️ They link to a FILTERED LIST, not to a record page, because these records
  // open in place on their list. When the module is split up and each gets its
  // own page, only these hrefs change.
  {
    type: "ops_order",
    table: "ops_order_lines",
    idColumn: "id",
    selectColumns: ["id", "po_no", "description", "client", "supplier", "status", "archived"],
    textFor: (r) => join(str(r.po_no), str(r.description), str(r.client), str(r.supplier),
      str(r.quotation_no), str(r.prof_no), str(r.status)),
    lifecycleFor: (r) => ((r.archived as boolean) ? "history" : "active"),
    uiLabel: "Order lines",
    searchOrder: 11,
    trace: { mode: "generic", table: "ops_order_lines" },
    search: {
      select: "id,po_no,description,client,cost_centre,supplier,quotation_no,prof_no,status,company_id,archived",
      ilikeColumns: ["po_no", "description", "client", "supplier", "quotation_no", "prof_no", "status"],
      limit: 120,
      toResult: (r, ctx) => {
        const archived = (r.archived as boolean) === true;
        if (archived && !ctx.includeHistory) return null;
        const po = r.po_no as string;
        return {
          type: "ops_order", id: r.id as number,
          title: (r.description as string) || po,
          subtitle: [sx(po), sx(r.client), sx(r.supplier)].filter(Boolean).join(" · ") || "Order line",
          href: `/ops?co=${r.company_id as number}&oq=${encodeURIComponent(po)}`,
          badge: archived ? "Archived" : sx(r.status) ?? undefined,
          lifecycle: archived ? "history" : "active",
          scoreParts: [po, r.description as string, sx(r.client), sx(r.supplier), sx(r.quotation_no), sx(r.prof_no)],
        };
      },
    },
  },
  {
    type: "ops_shipment",
    table: "ops_shipments",
    idColumn: "id",
    selectColumns: ["id", "bl_no", "supplier", "origin", "clearing_agent", "status", "archived"],
    textFor: (r) => join(str(r.bl_no), str(r.supplier), str(r.origin), str(r.clearing_agent), str(r.status)),
    lifecycleFor: (r) => ((r.archived as boolean) ? "history" : "active"),
    uiLabel: "Shipments",
    searchOrder: 12,
    trace: { mode: "generic", table: "ops_shipments" },
    search: {
      select: "id,bl_no,supplier,origin,mode,clearing_agent,status,company_id,archived",
      ilikeColumns: ["bl_no", "supplier", "origin", "clearing_agent", "status"],
      limit: 80,
      toResult: (r, ctx) => {
        const archived = (r.archived as boolean) === true;
        if (archived && !ctx.includeHistory) return null;
        const bl = r.bl_no as string;
        return {
          type: "ops_shipment", id: r.id as number,
          title: bl,
          subtitle: [sx(r.supplier), sx(r.origin), sx(r.clearing_agent)].filter(Boolean).join(" · ") || "Shipment",
          href: `/ops/imports?co=${r.company_id as number}&sq=${encodeURIComponent(bl)}`,
          badge: archived ? "Archived" : sx(r.status) ?? undefined,
          lifecycle: archived ? "history" : "active",
          scoreParts: [bl, sx(r.supplier), sx(r.origin), sx(r.clearing_agent)],
        };
      },
    },
  },
  {
    type: "ops_enquiry",
    table: "ops_enquiries",
    idColumn: "id",
    selectColumns: ["id", "rfq_no", "client", "description", "quotation_no", "po_no", "archived"],
    textFor: (r) => join(str(r.rfq_no), str(r.client), str(r.description), str(r.quotation_no), str(r.po_no)),
    lifecycleFor: (r) => ((r.archived as boolean) ? "history" : "active"),
    uiLabel: "Enquiries",
    searchOrder: 13,
    trace: { mode: "generic", table: "ops_enquiries" },
    search: {
      select: "id,rfq_no,client,description,quotation_no,po_no,assigned_to,outcome,company_id,archived",
      ilikeColumns: ["rfq_no", "client", "description", "quotation_no", "po_no", "assigned_to"],
      limit: 80,
      toResult: (r, ctx) => {
        const archived = (r.archived as boolean) === true;
        if (archived && !ctx.includeHistory) return null;
        const rfq = r.rfq_no as string;
        return {
          type: "ops_enquiry", id: r.id as number,
          title: (r.description as string) || rfq,
          subtitle: [sx(rfq), sx(r.client), sx(r.quotation_no)].filter(Boolean).join(" · ") || "Enquiry",
          href: `/ops/funnel?co=${r.company_id as number}&fq=${encodeURIComponent(rfq)}`,
          badge: archived ? "Archived" : sx(r.outcome) ?? (r.po_no ? "Won" : undefined),
          lifecycle: archived ? "history" : "active",
          scoreParts: [rfq, sx(r.description), sx(r.client), sx(r.quotation_no), sx(r.po_no)],
        };
      },
    },
  },
  {
    type: "ops_invoice",
    table: "ops_invoices",
    idColumn: "id",
    selectColumns: ["id", "delivery_note_no", "invoice_no", "client", "status", "archived"],
    textFor: (r) => join(str(r.delivery_note_no), str(r.invoice_no), str(r.client), str(r.status)),
    lifecycleFor: (r) => ((r.archived as boolean) ? "history" : "active"),
    uiLabel: "Deliveries",
    searchOrder: 14,
    trace: { mode: "generic", table: "ops_invoices" },
    search: {
      select: "id,delivery_note_no,invoice_no,client,status,company_id,archived",
      ilikeColumns: ["delivery_note_no", "invoice_no", "client", "status"],
      limit: 80,
      toResult: (r, ctx) => {
        const archived = (r.archived as boolean) === true;
        if (archived && !ctx.includeHistory) return null;
        // Whichever reference it has — a delivery that has not been billed yet
        // has no invoice number at all.
        const ref = (r.invoice_no as string | null) ?? (r.delivery_note_no as string | null) ?? "";
        return {
          type: "ops_invoice", id: r.id as number,
          title: ref,
          subtitle: [sx(r.client), r.invoice_no ? "invoiced" : "not billed yet"]
            .filter(Boolean).join(" · ") || "Delivery",
          href: `/ops/invoices?co=${r.company_id as number}&iq=${encodeURIComponent(ref)}`,
          badge: archived ? "Archived" : sx(r.status) ?? undefined,
          lifecycle: archived ? "history" : "active",
          scoreParts: [ref, sx(r.delivery_note_no), sx(r.client)],
        };
      },
    },
  },
];

const DEF_BY_TYPE = new Map<EntityType, EntityDef>(ENTITY_DEFS.map((d) => [d.type, d]));

/** Look up the EntityDef for a type. undefined for an unknown type. */
export function getEntityDef(type: EntityType): EntityDef | undefined {
  return DEF_BY_TYPE.get(type);
}

/** True for the special-cased governance type (composite ids, four tables). */
export function isGovernance(type: EntityType): type is "governance" {
  return type === "governance";
}

// ── Read-surface derivations (search / trace / palette) ───────────────────────

/**
 * The defs that participate in the deep-index search (have a `search` per-row
 * mapping OR a `searchCustom` escape-hatch), in palette order. src/lib/search.ts
 * loops over these — adding one EntityDef with a `search` makes a new entity
 * searchable WITHOUT touching search.ts. Tasks are excluded (they keep their rich
 * task rows in the palette, served separately).
 */
export const SEARCHABLE_DEFS: EntityDef[] = ENTITY_DEFS
  // Tasks are served as rich rows by /api/search's own path, so they stay OUT of
  // the keyword loop (their `search` block is used ONLY by the semantic layer).
  .filter((d) => (d.search || d.searchCustom) && d.type !== "task")
  .sort((a, b) => a.searchOrder - b.searchOrder);

// The route's old GENERIC_TABLE had a few aliases the registry can't model as
// EntityDefs: every generic type accepted by BOTH its singular and plural form,
// plus `decision`/`decisions` (the `decisions` table has no SourceType / EntityDef
// of its own). We rebuild that exact alias→table map from the registry's generic
// defs and add the non-entity `decision` aliases, so getTraceDef stays a faithful
// drop-in for the route's switch + GENERIC_TABLE lookup.
const GENERIC_TRACE_TABLES: Record<string, string> = (() => {
  const map: Record<string, string> = {};
  for (const d of ENTITY_DEFS) {
    if (d.trace?.mode !== "generic") continue;
    map[d.type] = d.trace.table;     // singular SourceType (e.g. "vendor")
    map[d.trace.table] = d.trace.table; // plural table name (e.g. "vendors")
  }
  // Aliases with no EntityDef (the route handled these explicitly).
  map.decision = "decisions";
  map.decisions = "decisions";
  return map;
})();

/**
 * The trace handling for a type, as the /api/trace route needs it: either a
 * hand-written bespoke branch ({ mode: "bespoke" }) or a generic table
 * ({ mode: "generic", table }). Returns undefined for types with no trace
 * (e.g. governance — the route's default branch yields nothing for it). Accepts
 * the same singular/plural aliases the route's lowercased switch + GENERIC_TABLE
 * accepted, so it is a faithful drop-in.
 */
export function getTraceDef(type: string): EntityTrace | undefined {
  const t = type.trim().toLowerCase();
  // Bespoke types keep their hand-written route branch.
  const def = DEF_BY_TYPE.get(t as EntityType);
  if (def?.trace?.mode === "bespoke") return def.trace;
  // Otherwise resolve the generic table (covers singular + plural + decision).
  const table = GENERIC_TRACE_TABLES[t];
  return table ? { mode: "generic", table } : undefined;
}

/**
 * Ordered list for the command palette's TYPE_ORDER + grouped headings. Re-exported
 * from the CLIENT-SAFE entity-meta module (which has no server/DB import) so the
 * command palette can consume it without dragging this file's Supabase client into
 * the browser bundle. Single source of the palette order lives in entity-meta.ts.
 */
export { SEARCH_PALETTE_ORDER } from "@/lib/entity-meta";

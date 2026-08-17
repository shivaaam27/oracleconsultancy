// Conversational memory for Ask COS (and any future assistant surface).
//
// Purpose: let the assistant remember what it has already answered, the owner's
// stated working preferences, and stable facts — then RECALL the most relevant
// of those on a later question. This is a self-learning layer that needs NO AI
// call: storing is a single insert; recall is recency + keyword/token overlap
// ranked in memory, exactly like the deterministic scorer in src/lib/search.ts.
//
// Server-safe and BEST-EFFORT: every function swallows its own errors and
// degrades gracefully (returns []/false) so memory can never break a request.
// The backing table is `ai_memory` (migration 0095); reads/writes go through the
// service-role supabase-js client `sb`.

import { sb } from "@/db/supabase";
import { expandQuery } from "@/lib/synonyms";

// One stored memory row in the shape callers consume. "macro" reuses this table
// (no migration) — a named, natural-language step list the owner can recall and
// have ORI's agent execute; name lives in `question`, the steps in `answer`.
export type MemoryKind = "qa" | "preference" | "fact" | "macro";

export type Memory = {
  kind: MemoryKind;
  question: string | null;
  answer: string | null;
  createdAt: string; // ISO timestamp
};

export type MemoryRow = Memory & { id: number; recipient: string; tags: string | null };

// Keep stored answers bounded — a memory is a reminder, not a transcript.
const MAX_ANSWER = 600;
// How many recent rows we pull into memory to rank against a query. Bounded so
// recall stays cheap even for a chatty recipient. Raised modestly so paraphrased
// questions can still reach an older-but-relevant preference/fact.
const RECALL_POOL = 300;

// Half-life (days) for the recency decay applied to a matched row's keyword
// score — a memory keeps most of its weight for a couple of weeks, then fades.
const RECENCY_HALFLIFE_DAYS = 21;

const TABLE = "ai_memory";

function truncate(s: string, max: number): string {
  const t = s.trim();
  return t.length <= max ? t : t.slice(0, max - 1).trimEnd() + "…";
}

function cleanRecipient(recipient: string | null | undefined): string {
  const r = (recipient ?? "").trim();
  return r || "admin";
}

/**
 * Remember a question/answer exchange. The answer is truncated to ~600 chars.
 * Best-effort: never throws.
 */
export async function recordQA(
  recipient: string,
  question: string,
  answer: string,
): Promise<boolean> {
  const q = (question ?? "").trim();
  const a = (answer ?? "").trim();
  if (!q && !a) return false;
  try {
    const { error } = await sb.from(TABLE).insert({
      recipient: cleanRecipient(recipient),
      kind: "qa",
      question: q || null,
      answer: a ? truncate(a, MAX_ANSWER) : null,
      tags: deriveTags(`${q} ${a}`),
      created_at: new Date().toISOString(),
    });
    return !error;
  } catch {
    return false;
  }
}

/**
 * Remember a learned preference or a stable fact about the recipient or their
 * world (e.g. "prefers British spelling", "DSC Ltd VRN is 40-xxxxxx").
 * `kind` defaults to "preference"; pass "fact" for objective data.
 * Best-effort: never throws.
 */
export async function rememberPreference(
  recipient: string,
  text: string,
  kind: "preference" | "fact" = "preference",
): Promise<boolean> {
  const t = (text ?? "").trim();
  if (!t) return false;
  try {
    const { error } = await sb.from(TABLE).insert({
      recipient: cleanRecipient(recipient),
      kind,
      question: null,
      answer: truncate(t, MAX_ANSWER),
      tags: deriveTags(t),
      created_at: new Date().toISOString(),
    });
    return !error;
  } catch {
    return false;
  }
}

/**
 * Recall the most relevant past memories for this recipient against `query`.
 * Combines recency with keyword/token overlap (synonym-expanded for breadth)
 * over question + answer + tags. Pure SQL fetch + in-memory ranking — no AI.
 * Best-effort: returns [] on any error.
 */
export async function recallMemories(
  recipient: string,
  query: string,
  limit = 5,
): Promise<Memory[]> {
  const q = (query ?? "").trim();
  try {
    const { data, error } = await sb
      .from(TABLE)
      .select("kind, question, answer, tags, created_at")
      .eq("recipient", cleanRecipient(recipient))
      .order("created_at", { ascending: false })
      .limit(RECALL_POOL);
    if (error || !data) return [];

    const rows = data as Array<{
      kind: string;
      question: string | null;
      answer: string | null;
      tags: string | null;
      created_at: string;
    }>;

    // No query → just the most recent memories.
    if (!q) {
      return rows.slice(0, limit).map(toMemory);
    }

    // Synonym-expanded recall tokens (always include the literal query words).
    let tokens: string[];
    try {
      tokens = expandQuery(q);
    } catch {
      tokens = [];
    }
    const literal = q
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length >= 2);
    const all = Array.from(new Set([...literal, ...tokens]));

    // `now` for the recency component; the row's own timestamp drives a smooth
    // half-life decay, and rank index adds a gentle tie-break among equals.
    const now = Date.now();
    const scored = rows.map((r, idx) => ({
      row: r,
      score: scoreMemory(r, all, now, idx),
    }));

    // Drop zero-overlap rows so recall stays on-topic; if nothing overlaps at
    // all, fall back to the most recent so the caller still gets context.
    const hits = scored.filter((s) => s.score > 0);
    const pool = hits.length > 0 ? hits : scored.slice(0, limit);
    pool.sort((a, b) => b.score - a.score);

    // Dedup near-identical memories (same preference/fact re-stated over time, or
    // a repeated Q/A) so the top slots aren't wasted on echoes — keep the highest
    // scored instance of each. Newest survives ties (pool is score-sorted, and
    // scoreMemory already tilts fresh rows up).
    const out: Memory[] = [];
    const seen = new Set<string>();
    for (const s of pool) {
      const sig = dedupSig(s.row);
      if (seen.has(sig)) continue;
      seen.add(sig);
      out.push(toMemory(s.row));
      if (out.length >= limit) break;
    }
    return out;
  } catch {
    return [];
  }
}

/**
 * List stored memories for a recipient (management UI), newest first.
 * Best-effort: returns [] on any error.
 */
export async function listMemories(
  recipient: string,
  limit = 100,
): Promise<MemoryRow[]> {
  try {
    const { data, error } = await sb
      .from(TABLE)
      .select("id, recipient, kind, question, answer, tags, created_at")
      .eq("recipient", cleanRecipient(recipient))
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error || !data) return [];
    return (data as Array<Record<string, unknown>>).map((r) => ({
      id: Number(r.id),
      recipient: String(r.recipient ?? ""),
      kind: (r.kind as MemoryKind) ?? "qa",
      question: (r.question as string | null) ?? null,
      answer: (r.answer as string | null) ?? null,
      tags: (r.tags as string | null) ?? null,
      createdAt: String(r.created_at ?? ""),
    }));
  } catch {
    return [];
  }
}

// ---- saved macros (kind="macro") ----------------------------------------
// A macro is a NAMED natural-language routine (a step list). It reuses ai_memory
// with kind="macro": name → `question`, steps → `answer`. Recall + execution is
// deterministic here (surface the steps); the actual doing is the agent's job.

export type Macro = { name: string; steps: string | null; createdAt: string };

/** Save (or re-save) a named macro. A repeat name is stored as a fresh row;
 *  findMacro/listMacros keep the NEWEST per name, so re-saving overwrites in
 *  effect without a delete. Best-effort: never throws. */
export async function rememberMacro(
  recipient: string,
  name: string,
  steps: string,
): Promise<boolean> {
  const n = (name ?? "").trim();
  const s = (steps ?? "").trim();
  if (!n || !s) return false;
  try {
    const { error } = await sb.from(TABLE).insert({
      recipient: cleanRecipient(recipient),
      kind: "macro",
      question: truncate(n, 120),
      answer: truncate(s, MAX_ANSWER),
      tags: deriveTags(`${n} ${s}`),
      created_at: new Date().toISOString(),
    });
    return !error;
  } catch {
    return false;
  }
}

/** List saved macros for a recipient, newest-per-name first. Best-effort → []. */
export async function listMacros(recipient: string, limit = 50): Promise<Macro[]> {
  try {
    const { data, error } = await sb
      .from(TABLE)
      .select("question, answer, created_at")
      .eq("recipient", cleanRecipient(recipient))
      .eq("kind", "macro")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error || !data) return [];
    const seen = new Set<string>();
    const out: Macro[] = [];
    for (const r of data as Array<Record<string, unknown>>) {
      const name = String(r.question ?? "").trim();
      if (!name) continue;
      const key = name.toLowerCase();
      if (seen.has(key)) continue; // newest wins (rows are desc by created_at)
      seen.add(key);
      out.push({ name, steps: (r.answer as string | null) ?? null, createdAt: String(r.created_at ?? "") });
      if (out.length >= limit) break;
    }
    return out;
  } catch {
    return [];
  }
}

/** Find one macro by name — exact (case-insensitive) first, else the closest
 *  token/substring match so "morning" reaches "Morning routine". Best-effort. */
export async function findMacro(recipient: string, name: string): Promise<Macro | null> {
  const wanted = (name ?? "").trim().toLowerCase();
  if (!wanted) return null;
  const all = await listMacros(recipient, 200);
  if (all.length === 0) return null;
  const exact = all.find((m) => m.name.toLowerCase() === wanted);
  if (exact) return exact;
  const contains = all.find((m) => m.name.toLowerCase().includes(wanted) || wanted.includes(m.name.toLowerCase()));
  if (contains) return contains;
  // Loose: any shared word ≥3 chars.
  const words = wanted.split(/\s+/).filter((w) => w.length >= 3);
  return all.find((m) => { const mn = m.name.toLowerCase(); return words.some((w) => mn.includes(w)); }) ?? null;
}

/**
 * Forget a single memory by id. Best-effort: returns false on any error.
 */
export async function forgetMemory(id: number): Promise<boolean> {
  if (!Number.isFinite(id)) return false;
  try {
    const { error } = await sb.from(TABLE).delete().eq("id", id);
    return !error;
  } catch {
    return false;
  }
}

// ---- internals ----------------------------------------------------------

function toMemory(r: {
  kind: string;
  question: string | null;
  answer: string | null;
  created_at: string;
}): Memory {
  return {
    kind: (r.kind as MemoryKind) ?? "qa",
    question: r.question ?? null,
    answer: r.answer ?? null,
    createdAt: String(r.created_at ?? ""),
  };
}

/**
 * Score one stored row against the (synonym-expanded) recall tokens. Mirrors the
 * additive token-overlap idea in search.ts: exact-word > prefix > substring, with
 * the question weighted above the answer/tags. Overlap is deliberately LOOSE so
 * paraphrased questions still land: a query token matches a stored word by exact,
 * either-direction prefix, or shared stem. Matched scores then decay by the row's
 * age (half-life) so a fresh memory outranks a stale one of equal relevance.
 */
function scoreMemory(
  row: { question: string | null; answer: string | null; tags: string | null; created_at?: string },
  tokens: string[],
  now: number,
  rankIdx: number,
): number {
  // Question is the strongest signal (it's what was asked before), then answer,
  // then tags. Each field scored independently and weighted.
  const fields: Array<[string, number]> = [
    [(row.question ?? "").toLowerCase(), 1.0],
    [(row.answer ?? "").toLowerCase(), 0.6],
    [(row.tags ?? "").toLowerCase(), 0.5],
  ];

  let s = 0;
  for (const t of tokens) {
    if (t.length < 2) continue;
    let best = 0;
    for (const [field, weight] of fields) {
      if (!field) continue;
      const words = field.split(/[\s\-_/,]+/).filter(Boolean);
      if (words.some((w) => w === t)) best = Math.max(best, 30 * weight);
      // Either-direction prefix: token→word ("passport"→"passports") AND
      // word→token ("visa"→"visas"), so plurals/stems match both ways.
      else if (words.some((w) => (t.length >= 4 && w.startsWith(t)) || (w.length >= 4 && t.startsWith(w)))) best = Math.max(best, 20 * weight);
      // Shared stem (first 4 chars) — looser catch for morphological variants.
      else if (t.length >= 5 && words.some((w) => w.length >= 5 && w.slice(0, 4) === t.slice(0, 4))) best = Math.max(best, 10 * weight);
      else if (field.includes(t)) best = Math.max(best, 12 * weight);
    }
    s += best;
  }

  if (s <= 0) return 0;

  // Recency decay: multiply the keyword score by a half-life factor of the row's
  // age. A same-day memory keeps ~all its weight; one a half-life old keeps half.
  const ageDays = row.created_at ? Math.max(0, (now - new Date(row.created_at).getTime()) / 86_400_000) : rankIdx * 0.5;
  const decay = Math.pow(0.5, ageDays / RECENCY_HALFLIFE_DAYS);
  // Blend: keep most of the raw relevance, let decay tilt it (never zero it out).
  return s * (0.6 + 0.4 * decay);
}

/** A stable-ish signature for dedup — a preference/fact keys on its answer text,
 *  a Q/A on its question. Collapses whitespace + case so re-stated memories fold. */
function dedupSig(row: { kind: string; question: string | null; answer: string | null }): string {
  const norm = (v: string | null) => (v ?? "").toLowerCase().replace(/\s+/g, " ").trim();
  const key = row.kind === "qa" ? (norm(row.question) || norm(row.answer)) : norm(row.answer);
  return `${row.kind}:${key.slice(0, 120)}`;
}

/**
 * Derive comma-joined topic tags from text via the shared synonym brain — gives
 * recall extra surface to match on without storing the full body twice. Bounded.
 */
function deriveTags(text: string): string | null {
  try {
    const tags = expandQuery(text).slice(0, 12);
    return tags.length ? tags.join(",") : null;
  } catch {
    return null;
  }
}

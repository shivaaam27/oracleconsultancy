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

// One stored memory row in the shape callers consume.
export type MemoryKind = "qa" | "preference" | "fact";

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
// recall stays cheap even for a chatty recipient.
const RECALL_POOL = 200;

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
 * world (e.g. "prefers British spelling", "Dar Spices VRN is 40-xxxxxx").
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

    // `now` for the recency component; rank index gives a gentle freshness tilt
    // even among rows that tie on keyword overlap (rows arrive newest-first).
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
    return pool.slice(0, limit).map((s) => toMemory(s.row));
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
 * the question weighted above the answer/tags, plus a small recency tilt.
 */
function scoreMemory(
  row: { question: string | null; answer: string | null; tags: string | null },
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
    let best = 0;
    for (const [field, weight] of fields) {
      if (!field) continue;
      const words = field.split(/[\s\-_/]+/);
      if (words.some((w) => w === t)) best = Math.max(best, 30 * weight);
      else if (words.some((w) => w.startsWith(t))) best = Math.max(best, 20 * weight);
      else if (field.includes(t)) best = Math.max(best, 12 * weight);
    }
    s += best;
  }

  // Recency tilt: newest rows (low rankIdx, rows arrive newest-first) get a small
  // additive bonus so fresh memory wins ties. Bounded so it never overrides a
  // clearly stronger keyword match.
  if (s > 0) s += Math.max(0, 8 - rankIdx * 0.4);
  return s;
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

import "server-only";
import { sb } from "@/db/supabase";
import { AI_FAST } from "@/lib/ai-models";
import { callAIText } from "@/lib/ai-json";
import type { SmartAnswer } from "@/lib/smart-answer";

/* Retrieval + formatting helpers for the admin Ask chat (/api/ask).
 * Everything here is best-effort and MUST fail open: on any error the caller
 * falls back to today's behaviour — never regress, never throw. */

/** Render an instant SmartAnswer (from resolveSmartAnswer) as plain chat text,
 *  so PHASE 0 can return it in the SAME shape the streaming client expects (a
 *  text stream), not raw JSON. Keeps it tight and readable — title, optional
 *  note, then one line per row with its badge. */
export function formatSmartAnswer(a: SmartAnswer): string {
  const lines: string[] = [];
  const head = a.count > 0 && a.rows.length ? `${a.title} (${a.count})` : a.title;
  lines.push(head);
  if (a.note) lines.push(a.note);
  if (a.rows.length) {
    lines.push("");
    for (const r of a.rows) {
      const badge = r.badge ? ` — ${r.badge}` : "";
      const sub = r.sub ? ` (${r.sub})` : "";
      lines.push(`• ${r.label}${badge}${sub}`);
    }
    if (a.href && a.count > a.rows.length) lines.push(`…and ${a.count - a.rows.length} more.`);
  }
  return lines.join("\n").trim();
}

/** Condense the last few conversation turns + the new question into ONE
 *  standalone retrieval query via a single fast AI call. Follow-ups like
 *  "and his passport?" become self-contained ("<person>'s passport number").
 *  FAIL OPEN: on any error/timeout/empty result, return the plain concatenation
 *  the route used before (last user turn + question) so retrieval never regresses. */
export async function rewriteRetrievalQuery(
  history: { role: "user" | "assistant"; content: string }[],
  question: string,
  apiKey: string,
): Promise<string> {
  const lastUser = [...history].reverse().find((m) => m.role === "user")?.content || "";
  const fallback = `${lastUser} ${question}`.trim() || question;
  // No history to fold in → nothing to rewrite; skip the call entirely.
  if (!history.length) return question.trim() || fallback;
  try {
    const convo = history
      .slice(-4)
      .map((m) => `${m.role === "user" ? "Principal" : "ORI"}: ${m.content.slice(0, 300)}`)
      .join("\n");
    const result = await callAIText({
      apiKey,
      model: AI_FAST,
      maxTokens: 60,
      temperature: 0,
      messages: [
        {
          role: "system",
          content:
            "Rewrite the principal's latest message into ONE standalone search query for a database lookup, resolving pronouns and references from the conversation. Output ONLY the query text — no quotes, no preamble, no explanation. If it is already standalone, return it unchanged.",
        },
        { role: "user", content: `Conversation so far:\n${convo}\n\nLatest message: ${question}\n\nStandalone query:` },
      ],
    });
    const text = (result.ok ? result.text : "")?.replace(/^["']|["']$/g, "").trim() ?? "";
    // Guard against a degenerate rewrite (empty, or the model refusing/echoing
    // an instruction) — fall back to the deterministic concatenation.
    if (!text || text.length > 300 || /^(sorry|i (can'?t|cannot)|as an ai)/i.test(text)) return fallback;
    return text;
  } catch {
    return fallback;
  }
}

/** Does the question ask about portal opens / logins / engagement / last-seen?
 *  Same regex family engagementAnswer uses, so the two stay in lock-step. */
export function isEngagementQuestion(q: string): boolean {
  return /\b(open|opens|opened|log ?in|logs? in|logged in|active|last seen|engage|engagement|use the (app|site|portal)|how often|online)\b/i.test(q);
}

export type ActivitySlice = {
  people: Array<{ name: string; opens: number; days: number; lastSeen: string | null; lastPath: string | null }>;
  topPaths: Array<{ path: string; count: number }>;
};

/** For engagement questions, add a small activity_events slice to the context so
 *  the LLM can reason over portal opens itself (per named person: opens/active
 *  days/last-seen/last path, plus the most-hit paths overall). Cheap, bounded,
 *  best-effort — returns null on any error. `named` is the matched people. */
export async function fetchActivitySlice(
  named: Array<{ id: number; name: string }>,
  windowDays = 14,
): Promise<ActivitySlice | null> {
  try {
    const since = new Date(Date.now() - windowDays * 86_400_000).toISOString();
    const ids = named.slice(0, 8).map((p) => p.id);
    const people: ActivitySlice["people"] = [];
    if (ids.length) {
      const { data } = await sb
        .from("activity_events")
        .select("person_id,at,path")
        .in("person_id", ids)
        .gte("at", since)
        .order("at", { ascending: false });
      const rows = (data ?? []) as Array<{ person_id: number; at: string; path: string | null }>;
      const byPerson = new Map<number, Array<{ at: string; path: string | null }>>();
      for (const r of rows) {
        const arr = byPerson.get(r.person_id) ?? [];
        arr.push({ at: r.at, path: r.path });
        byPerson.set(r.person_id, arr);
      }
      for (const p of named.slice(0, 8)) {
        const evs = byPerson.get(p.id) ?? [];
        people.push({
          name: p.name,
          opens: evs.length,
          days: new Set(evs.map((e) => e.at.slice(0, 10))).size,
          lastSeen: evs[0]?.at ? evs[0].at.slice(0, 16).replace("T", " ") : null,
          lastPath: evs[0]?.path ?? null,
        });
      }
    }
    // Overall most-hit paths in the window (portfolio-wide, owner scope).
    const { data: pathRows } = await sb
      .from("activity_events")
      .select("path")
      .gte("at", since)
      .not("path", "is", null)
      .limit(500);
    const counts = new Map<string, number>();
    for (const r of (pathRows ?? []) as Array<{ path: string | null }>) {
      if (!r.path) continue;
      counts.set(r.path, (counts.get(r.path) ?? 0) + 1);
    }
    const topPaths = [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([path, count]) => ({ path, count }));
    if (!people.length && !topPaths.length) return null;
    return { people, topPaths };
  } catch {
    return null;
  }
}

/** Deterministic relevance prune within a char budget. Ranks each item by how
 *  many query tokens its serialised JSON contains (ties keep original order via
 *  a stable index), then keeps items from the top down until the running size
 *  hits `budgetChars`. Always keeps at least `minKeep` so a sparse-overlap query
 *  never empties a slice. Pure + fail-open (returns the input on any error). */
export function pruneByBudget<T>(
  items: T[],
  queryTokens: string[],
  budgetChars: number,
  minKeep = 3,
): T[] {
  try {
    if (items.length <= minKeep) return items;
    const toks = queryTokens.filter((t) => t.length > 2);
    const scored = items.map((it, i) => {
      const hay = JSON.stringify(it).toLowerCase();
      let s = 0;
      for (const t of toks) if (hay.includes(t)) s++;
      return { it, i, s, len: hay.length };
    });
    scored.sort((a, b) => (b.s - a.s) || (a.i - b.i));
    const kept: T[] = [];
    let used = 0;
    for (const x of scored) {
      if (kept.length >= minKeep && used + x.len > budgetChars) continue;
      kept.push(x.it);
      used += x.len;
    }
    // Preserve the caller's original ordering among the kept items.
    const keepSet = new Set(kept);
    return items.filter((it) => keepSet.has(it));
  } catch {
    return items;
  }
}

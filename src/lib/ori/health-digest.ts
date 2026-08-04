// health-digest.ts — the weekly "system health & cost" summary.
//
// Composed once a week from what the app can READ about itself: AI usage
// (ai_usage ledger), the semantic index size (embeddings row count), open-task
// and document counts, and Trash size. It never measures true Supabase egress —
// the app cannot see that — so the digest says so explicitly and points at the
// dashboard for the real bandwidth figure.
//
// Best-effort throughout: every gather is guarded and returns a safe zero, so a
// single failed count can never sink the digest, and a digest failure can never
// break the morning-run cron that calls it. Pure-ish: no side effects beyond the
// read-only counts it sums.

import { sb } from "@/db/supabase";
import { monthlySpend } from "@/lib/ai-spend";

/** One head-count query (no rows pulled). Returns 0 on any error. */
async function countOf(
  build: () => PromiseLike<{ count: number | null }>,
): Promise<number> {
  try {
    const { count } = await build();
    return count ?? 0;
  } catch {
    return 0;
  }
}

export interface HealthDigest {
  title: string;
  /** One-line push body. */
  line: string;
  /** The full multi-line summary (in-app feed / log). */
  detail: string;
  stats: {
    aiCallsToday: number;
    aiTokensToday: number;
    aiCallsMonth: number;
    aiCostMonth: number;
    embeddings: number;
    openTasks: number;
    documents: number;
  };
}

/** Start-of-today ISO in Dar es Salaam (UTC+3, no DST) — matches the app's EAT
 *  date handling elsewhere (ai-spend.eatMonthStartISO, cockpit-now). */
function eatTodayStartISO(now = new Date()): string {
  const ymd = now.toLocaleDateString("en-CA", { timeZone: "Africa/Nairobi" }); // YYYY-MM-DD
  return new Date(`${ymd}T00:00:00+03:00`).toISOString();
}

function fmtTokens(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 100_000 ? 0 : 1)}k`;
  return String(n);
}

/**
 * Compose the weekly health & cost digest. Best-effort: any gather that fails
 * contributes a zero, so the digest is always well-formed. The caller decides
 * WHEN (once a week) and HOW to deliver it.
 */
export async function composeHealthDigest(): Promise<HealthDigest> {
  const todayISO = eatTodayStartISO();

  // AI usage — today (calls + tokens from the ledger) and this month (the
  // ai-spend helper already sums the EAT calendar month, incl. est cost).
  const [aiToday, month] = await Promise.all([
    (async () => {
      try {
        const { data } = await sb
          .from("ai_usage")
          .select("prompt_tokens,completion_tokens")
          .gte("at", todayISO);
        const rows = data ?? [];
        let tokens = 0;
        for (const r of rows as Array<{ prompt_tokens: number | null; completion_tokens: number | null }>) {
          tokens += (r.prompt_tokens ?? 0) + (r.completion_tokens ?? 0);
        }
        return { calls: rows.length, tokens };
      } catch {
        return { calls: 0, tokens: 0 };
      }
    })(),
    monthlySpend(),
  ]);

  // Index size + entity counts — all head-only count queries.
  const [embeddings, openTasks, documents] = await Promise.all([
    countOf(() => sb.from("embeddings").select("*", { count: "exact", head: true })),
    countOf(() =>
      sb
        .from("tasks")
        .select("*", { count: "exact", head: true })
        .eq("archived", false)
        .not("status", "in", '("Completed","Closed")'),
    ),
    countOf(() =>
      sb.from("documents").select("*", { count: "exact", head: true }).eq("archived", false),
    ),
  ]);

  const stats: HealthDigest["stats"] = {
    aiCallsToday: aiToday.calls,
    aiTokensToday: aiToday.tokens,
    aiCallsMonth: month.calls,
    aiCostMonth: month.cost,
    embeddings,
    openTasks,
    documents,
  };

  const costMonth = stats.aiCostMonth > 0 ? ` · £${stats.aiCostMonth.toFixed(2)} est this month` : "";
  const line =
    `Weekly check: ${stats.openTasks} open task${stats.openTasks === 1 ? "" : "s"}, ` +
    `${stats.documents} doc${stats.documents === 1 ? "" : "s"}, ` +
    `${stats.aiCallsToday} AI call${stats.aiCallsToday === 1 ? "" : "s"} today${costMonth}.`;

  const detail = [
    "System health & cost — weekly digest",
    "",
    `AI usage today: ${stats.aiCallsToday} call${stats.aiCallsToday === 1 ? "" : "s"} · ${fmtTokens(stats.aiTokensToday)} tokens`,
    `AI usage this month: ${stats.aiCallsMonth} call${stats.aiCallsMonth === 1 ? "" : "s"}${
      stats.aiCostMonth > 0 ? ` · £${stats.aiCostMonth.toFixed(2)} est cost` : " · free tier (£0 est)"
    }`,
    `Search index: ${stats.embeddings.toLocaleString()} indexed record${stats.embeddings === 1 ? "" : "s"}`,
    `Open tasks: ${stats.openTasks} · Documents: ${stats.documents}`,
    "",
    "Note: true Supabase bandwidth/egress can't be measured from inside the app — read it from the Supabase dashboard (Reports → Usage).",
  ].join("\n");

  return { title: "Weekly system health & cost", line, detail, stats };
}

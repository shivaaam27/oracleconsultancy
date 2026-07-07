// /api/ai-usage/models — the live per-model AI usage dashboard feed.
//
// Reads the existing `ai_usage` ledger (see lib/ai-spend.ts) — invents no new
// store. Admin-gated by the edge proxy (like /api/ai-usage, /api/pulse) — no
// explicit auth here. Best-effort throughout: any failure fails OPEN to zeros so
// the dashboard renders "nothing yet" rather than erroring.
//
// IMPORTANT — quota reset boundary: Gemini free-tier daily quotas reset at
// MIDNIGHT PACIFIC, not Dar midnight, so "today" here is computed against that
// boundary (pacificDayStartISO) and we return the next reset instant for a
// countdown. Week + trend use the Pacific day boundaries too, for consistency.
//
// FALLBACKS NOT TRACKED: the ai_usage ledger records only SUCCESSFUL calls (no
// status/429/error column — recordUsage runs after a call succeeds), so per-model
// 429/fallback counts CANNOT be derived. The payload says so via
// `fallbacksTracked: false` rather than inventing a figure.

import { NextResponse } from "next/server";
import { sb } from "@/db/supabase";
import { pacificDayStartISO, nextPacificResetISO } from "@/lib/ai-spend";
import { dailyQuotaFor, tierOf, CHAT_MODELS, type ModelTier } from "@/lib/ai-models";
import { getAppSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

type Row = {
  at: string | null;
  model: string | null;
  prompt_tokens: number | null;
  completion_tokens: number | null;
};

/** Map any model id to a tier for the rollup. tierOf() only matches the ladder
 *  HEADS, so fall back to a name-shape heuristic: gemma/lite = fast lane, the
 *  best flashes = smart lane; unknown → "smart" (the interactive-chat default). */
function tierFor(model: string | null): ModelTier {
  if (!model) return "smart";
  const t = tierOf(model);
  if (t) return t;
  if (/^gemma/i.test(model) || /flash-lite/i.test(model)) return "fast";
  return "smart";
}

export async function GET() {
  const resetsAt = nextPacificResetISO();
  try {
    const dayStart = pacificDayStartISO();
    // 7-day window (inclusive of today) against Pacific day boundaries.
    const weekStart = new Date(new Date(dayStart).getTime() - 6 * 24 * 3600 * 1000).toISOString();

    const { data } = await sb
      .from("ai_usage")
      .select("at,model,prompt_tokens,completion_tokens")
      .gte("at", weekStart);
    const rows = (data ?? []) as Row[];

    // Per-model TODAY aggregation.
    const today = new Map<string, { calls: number; tokens: number }>();
    let weekCalls = 0, weekTokens = 0, todayCalls = 0, todayTokens = 0;
    const tier: Record<ModelTier, { calls: number; tokens: number }> = {
      fast: { calls: 0, tokens: 0 },
      smart: { calls: 0, tokens: 0 },
      vision: { calls: 0, tokens: 0 },
    };
    // 7-day-per-day trend, keyed by the Pacific calendar date (YYYY-MM-DD).
    const trend = new Map<string, { calls: number; tokens: number }>();
    const dayKey = (iso: string) =>
      new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });

    for (const r of rows) {
      const tok = (r.prompt_tokens ?? 0) + (r.completion_tokens ?? 0);
      weekCalls += 1;
      weekTokens += tok;
      const k = r.at ? dayKey(r.at) : "";
      if (k) {
        const d = trend.get(k) ?? { calls: 0, tokens: 0 };
        d.calls += 1; d.tokens += tok;
        trend.set(k, d);
      }
      // TODAY slice.
      if (r.at && r.at >= dayStart) {
        todayCalls += 1;
        todayTokens += tok;
        const name = r.model ?? "unknown";
        const m = today.get(name) ?? { calls: 0, tokens: 0 };
        m.calls += 1; m.tokens += tok;
        today.set(name, m);
        tier[tierFor(r.model)].calls += 1;
        tier[tierFor(r.model)].tokens += tok;
      }
    }

    // Per-model rows, busiest first, with quota → remaining → pct.
    const models = [...today.entries()]
      .map(([model, v]) => {
        const quota = dailyQuotaFor(model);
        const remaining = quota != null ? Math.max(0, quota - v.calls) : null;
        const pct = quota != null ? Math.min(100, Math.round((v.calls / quota) * 100)) : null;
        return { model, tier: tierFor(model), calls: v.calls, tokens: v.tokens, quota: quota ?? null, remaining, pct };
      })
      .sort((a, b) => b.calls - a.calls);

    // The chat PICKER options: every eligible CHAT_MODELS id with its quota +
    // calls-used-today + remaining (so the picker shows "22/30 today" inline even
    // for models that haven't been called yet). Plus the current pinned setting.
    let currentChatModel = "auto";
    try { currentChatModel = (await getAppSettings()).chatModel || "auto"; } catch {}
    const chatModels = CHAT_MODELS.map((model) => {
      const used = today.get(model)?.calls ?? 0;
      const quota = dailyQuotaFor(model);
      return {
        model,
        quota: quota ?? null,
        used,
        remaining: quota != null ? Math.max(0, quota - used) : null,
      };
    });

    // 7-day trend as an ordered array (oldest → today), one entry per calendar day.
    const trendDays: { date: string; calls: number; tokens: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const iso = new Date(new Date(dayStart).getTime() - i * 24 * 3600 * 1000).toISOString();
      const key = dayKey(iso);
      const d = trend.get(key) ?? { calls: 0, tokens: 0 };
      trendDays.push({ date: key, calls: d.calls, tokens: d.tokens });
    }

    return NextResponse.json({
      models,
      tiers: [
        { tier: "fast", ...tier.fast },
        { tier: "smart", ...tier.smart },
        { tier: "vision", ...tier.vision },
      ],
      totals: {
        today: { calls: todayCalls, tokens: todayTokens },
        week: { calls: weekCalls, tokens: weekTokens },
      },
      trend: trendDays,
      chatModels,
      currentChatModel,
      resetsAt,
      fallbacksTracked: false, // ledger records successes only — no 429/fallback column
    });
  } catch {
    // Fail OPEN — empty dashboard, never a 5xx.
    return NextResponse.json({
      models: [],
      tiers: [
        { tier: "fast", calls: 0, tokens: 0 },
        { tier: "smart", calls: 0, tokens: 0 },
        { tier: "vision", calls: 0, tokens: 0 },
      ],
      totals: { today: { calls: 0, tokens: 0 }, week: { calls: 0, tokens: 0 } },
      trend: [],
      chatModels: CHAT_MODELS.map((model) => ({
        model, quota: dailyQuotaFor(model) ?? null, used: 0,
        remaining: dailyQuotaFor(model) ?? null,
      })),
      currentChatModel: "auto",
      resetsAt,
      fallbacksTracked: false,
    });
  }
}

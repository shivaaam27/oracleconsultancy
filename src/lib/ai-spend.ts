// ai-spend.ts — the AI usage ledger + monthly spend ceiling.
//
// Every successful Groq call records a row in `ai_usage` (best-effort, never
// throws — recording must never break an AI feature). From that ledger we can
// sum the current calendar month's spend and, when the owner sets a monthly cap,
// gracefully turn AI off once the budget is reached (a Tier-3 "spend" guardrail
// from the self-running roadmap: spend is NEVER allowed to run away silently).
//
// IMPORTANT DEFAULTS — today's behaviour is preserved:
//   - Per-model rates default to 0 (Groq free tier is free), so est_cost is 0 and
//     monthlySpend() is 0 until a paid rate is configured here.
//   - The spend cap defaults to 0 = UNLIMITED (see settings.aiMonthlySpendCap), so
//     isOverSpendCap() is false and AI stays on exactly as before.
// The ledger + cap machinery is fully live the moment a real rate + cap are set.
//
// Server-only (touches the DB via supabase-js). Keep it dependency-free.

import { sb } from "@/db/supabase";

/** Cost rate for a model, in the SAME currency as the cap (USD-ish/£ — the owner
 *  picks; the figure is just summed). Per 1,000 tokens, split in/out so a future
 *  paid model with asymmetric pricing is exact. All 0 today = free tier. */
type ModelRate = { inPer1k: number; outPer1k: number };

/**
 * Per-model cost rates. Match on a model-id PREFIX (so a versioned id like
 * "llama-3.1-8b-instant" still resolves). DEFAULT is 0 because Groq's free tier
 * costs nothing today — set a real rate here (or the catch-all "default") the day
 * a paid model is used and the whole ledger + cap machinery starts costing it.
 *
 * Example once paid:  "llama-3.3-70b": { inPer1k: 0.00059, outPer1k: 0.00079 }
 */
export const MODEL_RATES: Record<string, ModelRate> = {
  // intentionally empty of paid rates today — everything resolves to the 0 default
  default: { inPer1k: 0, outPer1k: 0 },
};

/** Resolve the rate for a model id (prefix match), falling back to "default". */
function rateFor(model: string | null | undefined): ModelRate {
  if (model) {
    for (const [prefix, rate] of Object.entries(MODEL_RATES)) {
      if (prefix !== "default" && model.startsWith(prefix)) return rate;
    }
  }
  return MODEL_RATES.default ?? { inPer1k: 0, outPer1k: 0 };
}

/** Estimate the cost of one call from token counts + the model's rate. 0 today. */
export function estimateCost(model: string | null | undefined, promptTokens: number, completionTokens: number): number {
  const r = rateFor(model);
  const cost = (promptTokens / 1000) * r.inPer1k + (completionTokens / 1000) * r.outPer1k;
  return Number.isFinite(cost) && cost > 0 ? Number(cost.toFixed(4)) : 0;
}

export interface RecordUsageInput {
  model: string | null | undefined;
  /** Call-site label, e.g. "ask" | "extract" | "translate" | "ai". */
  source: string;
  promptTokens?: number | null;
  completionTokens?: number | null;
}

/**
 * Record one AI call in the ledger. Best-effort: swallows ALL errors (a missing
 * table on an un-migrated DB, an offline DB, anything) so usage tracking can
 * never break an AI feature. Fire-and-forget from the AI call wrappers.
 */
export async function recordUsage(input: RecordUsageInput): Promise<void> {
  try {
    const promptTokens = Math.max(0, Math.round(input.promptTokens ?? 0));
    const completionTokens = Math.max(0, Math.round(input.completionTokens ?? 0));
    const estCost = estimateCost(input.model, promptTokens, completionTokens);
    await sb.from("ai_usage").insert({
      at: new Date().toISOString(),
      model: input.model ?? null,
      source: input.source || "ai",
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      est_cost: estCost,
    });
    // A spend-affecting row may flip the cap — clear the short cache so the next
    // check re-reads (no-op when no cap is set, which is the default).
    if (estCost > 0) overCacheAt = 0;
  } catch {
    // best-effort only
  }
}

/** Start-of-month ISO in Dar es Salaam (UTC+3, no DST), matching the rest of the
 *  app's EAT date handling (see lib/cockpit-now.ts / lib/derive.ts). */
function eatMonthStartISO(now = new Date()): string {
  // YYYY-MM in Dar es Salaam, then the 1st at 00:00 +03:00 → a UTC instant.
  const ym = now.toLocaleDateString("en-CA", { timeZone: "Africa/Nairobi" }).slice(0, 7); // YYYY-MM
  return new Date(`${ym}-01T00:00:00+03:00`).toISOString();
}

export interface MonthlySpend {
  cost: number;
  promptTokens: number;
  completionTokens: number;
  calls: number;
}

/**
 * Sum est_cost + tokens for the current EAT calendar month. Best-effort: returns
 * zeros on any error (so callers — and the cap check — degrade safely).
 */
export async function monthlySpend(): Promise<MonthlySpend> {
  try {
    const since = eatMonthStartISO();
    const { data } = await sb
      .from("ai_usage")
      .select("est_cost,prompt_tokens,completion_tokens")
      .gte("at", since);
    const rows = data ?? [];
    let cost = 0, promptTokens = 0, completionTokens = 0;
    for (const r of rows as Array<{ est_cost: string | number | null; prompt_tokens: number | null; completion_tokens: number | null }>) {
      cost += Number(r.est_cost ?? 0) || 0;
      promptTokens += r.prompt_tokens ?? 0;
      completionTokens += r.completion_tokens ?? 0;
    }
    return { cost: Number(cost.toFixed(4)), promptTokens, completionTokens, calls: rows.length };
  } catch {
    return { cost: 0, promptTokens: 0, completionTokens: 0, calls: 0 };
  }
}

// --- the spend cap, with a brief cache so it doesn't add a DB read per call ---

let overCacheValue = false;
let overCacheAt = 0;
const OVER_CACHE_MS = 60_000; // 60s

/**
 * True ONLY when a monthly spend cap is set (settings 'ai.monthlySpendCap' > 0)
 * AND the current month's spend has reached it. Cached for ~60s so it doesn't add
 * a DB round-trip to every AI call. Defaults to false (cap 0 = unlimited), so AI
 * stays on exactly as today until the owner sets a real ceiling.
 *
 * Best-effort: any error → false (fail OPEN, never block AI on a transient DB
 * hiccup; the cap is a soft budget guard, not a hard kill switch).
 */
export async function isOverSpendCap(): Promise<boolean> {
  const now = Date.now();
  if (now - overCacheAt < OVER_CACHE_MS) return overCacheValue;
  let result = false;
  try {
    // Local import to avoid a settings ⇄ ai-spend cycle at module load.
    const { getAppSettings } = await import("./settings");
    const { aiMonthlySpendCap } = await getAppSettings();
    if (aiMonthlySpendCap > 0) {
      const { cost } = await monthlySpend();
      result = cost >= aiMonthlySpendCap;
    }
  } catch {
    result = false; // fail open
  }
  overCacheValue = result;
  overCacheAt = now;
  return result;
}

/** Test/admin hook: drop the cached cap result so the next check re-reads. */
export function clearSpendCapCache(): void {
  overCacheAt = 0;
}

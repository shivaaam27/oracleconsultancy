// /api/ai-usage — a cheap read of TODAY's AI spend for the command-palette
// "AI today" stat. Admin-gated by the edge proxy (like /api/pulse, /api/search)
// — no explicit auth here. Best-effort throughout: any failure fails OPEN to
// zeros so the palette simply renders nothing rather than erroring.
//
// Reuses the existing `ai_usage` ledger (see lib/ai-spend.ts) — does NOT invent
// a new store. Sums today's rows in the EAT calendar day.

import { NextResponse } from "next/server";
import { sb } from "@/db/supabase";

/** Start-of-today ISO in Dar es Salaam (UTC+3, no DST), matching the app's EAT
 *  date handling (mirrors eatMonthStartISO in lib/ai-spend.ts). */
function eatDayStartISO(now = new Date()): string {
  const ymd = now.toLocaleDateString("en-CA", { timeZone: "Africa/Nairobi" }); // YYYY-MM-DD
  return new Date(`${ymd}T00:00:00+03:00`).toISOString();
}

export async function GET() {
  try {
    const since = eatDayStartISO();
    const { data } = await sb
      .from("ai_usage")
      .select("est_cost,prompt_tokens,completion_tokens")
      .gte("at", since);
    const rows = (data ?? []) as Array<{
      est_cost: string | number | null;
      prompt_tokens: number | null;
      completion_tokens: number | null;
    }>;
    let cost = 0, tokens = 0;
    for (const r of rows) {
      cost += Number(r.est_cost ?? 0) || 0;
      tokens += (r.prompt_tokens ?? 0) + (r.completion_tokens ?? 0);
    }

    // Cap (settings 'ai.monthlySpendCap'; 0 = unlimited). Best-effort.
    let cap: number | undefined;
    let pct: number | undefined;
    try {
      const { getAppSettings } = await import("@/lib/settings");
      const { aiMonthlySpendCap } = await getAppSettings();
      if (aiMonthlySpendCap > 0) {
        cap = aiMonthlySpendCap;
        // Today's cost against the monthly cap — a soft "how much of budget used".
        pct = Math.min(100, Math.round((cost / aiMonthlySpendCap) * 100));
      }
    } catch {
      // no cap available — leave undefined
    }

    return NextResponse.json({ today: { calls: rows.length, tokens }, cap, pct });
  } catch {
    return NextResponse.json({ today: { calls: 0, tokens: 0 } });
  }
}

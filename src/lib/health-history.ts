import { sb } from "@/db/supabase";

/**
 * A lightweight daily history of the portfolio compliance-health score, stored
 * as a JSON array under a single `settings` row. We record one point per day so
 * the Home gauge can show a real "vs last reading" delta — no invented numbers.
 * Returns the most recent earlier-day value (or null if today is the first).
 */
const KEY = "v2.healthHistory";
type Point = { d: string; v: number };

export async function recordHealthPoint(value: number): Promise<number | null> {
  const today = new Date().toISOString().slice(0, 10);
  const { data } = await sb.from("settings").select("value").eq("key", KEY).maybeSingle();

  let history: Point[] = [];
  if (data?.value) {
    try {
      const parsed = JSON.parse(data.value as string);
      if (Array.isArray(parsed)) history = parsed;
    } catch {
      /* corrupt value — start fresh */
    }
  }

  const prior = [...history].reverse().find((p) => p.d !== today);
  const idx = history.findIndex((p) => p.d === today);
  if (idx >= 0) history[idx].v = value;
  else history.push({ d: today, v: value });
  history = history.slice(-30);

  await sb.from("settings").upsert({ key: KEY, value: JSON.stringify(history) }, { onConflict: "key" });
  return prior ? prior.v : null;
}

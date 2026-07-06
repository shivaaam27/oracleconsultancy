import "server-only";
import { sb } from "@/db/supabase";

/* Activity telemetry (Phase 3) — owner-only engagement signal. Best-effort: a
 * failed write never breaks a page load. Separate from activity.ts (the Live
 * activity feed over task updates). */

export type ActivityKind = "login" | "open" | "view";

/** Record one activity event. `who` = "admin" or "person:<id>". */
export async function logActivity(input: { who: string; personId?: number | null; kind: ActivityKind; path?: string | null }): Promise<void> {
  try {
    await sb.from("activity_events").insert({
      who: input.who,
      person_id: input.personId ?? null,
      kind: input.kind,
      path: input.path ?? null,
      at: new Date().toISOString(),
    });
  } catch { /* telemetry is best-effort */ }
}

export type AppOpenStats = { opens: number; days: number; lastSeen: string | null };

/** How often a person opened the app in the last `windowDays` (distinct days + total). */
export async function appOpenStats(personId: number, windowDays = 30): Promise<AppOpenStats> {
  const since = new Date(Date.now() - windowDays * 86_400_000).toISOString();
  const { data } = await sb.from("activity_events")
    .select("at").eq("person_id", personId).gte("at", since).order("at", { ascending: false });
  const rows = (data ?? []) as { at: string }[];
  const days = new Set(rows.map((r) => r.at.slice(0, 10))).size;
  return { opens: rows.length, days, lastSeen: rows[0]?.at ?? null };
}

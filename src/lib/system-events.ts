import { sb } from "@/db/supabase";

export type EventStatus = "ok" | "error" | "skip";

export async function recordEvent(
  kind: string,
  status: EventStatus,
  details?: Record<string, unknown>
): Promise<void> {
  try {
    await sb.from("system_events").insert({
      kind,
      status,
      details: details ? JSON.stringify(details) : null,
      created_at: new Date().toISOString(),
    });
  } catch {
    // Telemetry must never crash the caller.
  }
}

export async function lastEvent(kind: string): Promise<{ at: Date; status: string } | null> {
  const { data, error } = await sb
    .from("system_events")
    .select("created_at,status")
    .eq("kind", kind)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return { at: new Date(data.created_at as string), status: data.status as string };
}

export async function lastSuccessfulEvent(kind: string): Promise<Date | null> {
  const { data } = await sb
    .from("system_events")
    .select("created_at")
    .eq("kind", kind)
    .eq("status", "ok")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  return new Date(data.created_at as string);
}

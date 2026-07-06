import "server-only";
import { sb } from "@/db/supabase";

/* ORI proactive radar (Phase 5) — deterministic anomaly detection the owner can
 * ask for ("what needs my attention", "anything slipping"). Each finding is one
 * line with a severity tone. Bounded + best-effort. */

export type RadarTone = "danger" | "warn" | "muted";
export type RadarFinding = { label: string; detail: string; tone: RadarTone; href: string };

const DAY = 86_400_000;
const OPEN = '("Completed","Closed")';

export async function buildRadar(): Promise<RadarFinding[]> {
  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  const findings: RadarFinding[] = [];

  // Open tasks (id, deadline, status, last_updated_at) — one read, reused below.
  const { data: openTasks } = await sb.from("tasks")
    .select("id,deadline,status,last_updated_at,owner_id")
    .eq("archived", false).not("status", "in", OPEN).limit(3000);
  const tasks = (openTasks ?? []) as { id: number; deadline: string | null; status: string; last_updated_at: string | null; owner_id: number | null }[];

  // 1) Overdue
  const overdue = tasks.filter((t) => t.deadline && new Date(t.deadline).getTime() < now);
  if (overdue.length) findings.push({ label: `${overdue.length} overdue task${overdue.length === 1 ? "" : "s"}`, detail: "past their deadline and still open", tone: "danger", href: "/?tab=tasks&flag=overdue" });

  // 2) Due within 3 days
  const soon = tasks.filter((t) => t.deadline && new Date(t.deadline).getTime() >= now && new Date(t.deadline).getTime() < now + 3 * DAY);
  if (soon.length) findings.push({ label: `${soon.length} due within 3 days`, detail: "coming up — make sure they're on track", tone: "warn", href: "/?tab=tasks" });

  // 3) Silent tasks — open, no activity in 7+ days
  const silent = tasks.filter((t) => t.last_updated_at && now - new Date(t.last_updated_at).getTime() > 7 * DAY);
  if (silent.length) findings.push({ label: `${silent.length} task${silent.length === 1 ? "" : "s"} gone quiet`, detail: "no update in over a week", tone: "warn", href: "/?tab=tasks" });

  // 4) Blocked / escalated piling up
  const stuck = tasks.filter((t) => t.status === "Blocked" || t.status === "Escalated");
  if (stuck.length) findings.push({ label: `${stuck.length} blocked or escalated`, detail: "waiting on a decision or unblock", tone: "danger", href: "/?tab=tasks" });

  // 5) Disengaged staff — people with an open task but no app-open in 7 days
  const ownerIds = [...new Set(tasks.map((t) => t.owner_id).filter((x): x is number => x != null))];
  if (ownerIds.length) {
    const weekAgo = new Date(now - 7 * DAY).toISOString();
    const [{ data: people }, { data: acts }] = await Promise.all([
      sb.from("people").select("id,name").in("id", ownerIds).eq("active", true),
      sb.from("activity_events").select("person_id").in("person_id", ownerIds).eq("kind", "open").gte("at", weekAgo),
    ]);
    const seen = new Set(((acts ?? []) as { person_id: number }[]).map((a) => a.person_id));
    const quiet = ((people ?? []) as { id: number; name: string }[]).filter((p) => !seen.has(p.id));
    // Only report if we actually have telemetry (avoid a false "everyone's absent"
    // before any activity has been recorded).
    if (quiet.length && seen.size > 0) {
      findings.push({ label: `${quiet.length} with open tasks haven't opened the app this week`, detail: quiet.slice(0, 4).map((p) => p.name).join(", ") + (quiet.length > 4 ? "…" : ""), tone: "warn", href: "/people" });
    }
  }

  // 6) Documents expiring in 30 days
  const { count: expiring } = await sb.from("documents")
    .select("id", { count: "exact", head: true })
    .eq("archived", false).not("expiry_date", "is", null)
    .gte("expiry_date", nowIso).lte("expiry_date", new Date(now + 30 * DAY).toISOString());
  if (expiring) findings.push({ label: `${expiring} document${expiring === 1 ? "" : "s"} expiring in 30 days`, detail: "renew before they lapse", tone: "warn", href: "/documents" });

  // Severity order: danger first, then warn.
  const rank = { danger: 0, warn: 1, muted: 2 } as const;
  return findings.sort((a, b) => rank[a.tone] - rank[b.tone]);
}

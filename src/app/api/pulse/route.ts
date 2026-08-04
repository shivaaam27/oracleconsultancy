// /api/pulse — the estate's live snapshot. Serves TWO consumers, additively:
//  1. the Oracle Intelligence chat opener — KPI counts ({overdue,dueSoon,…}) so
//     ORI opens knowing the shape of the day (original behaviour, unchanged);
//  2. the command-palette "Today" strip — `pulse`: the ~12 most recent NOTABLE
//     events across the portfolio (task updates, new tasks, check-ins, requests,
//     docs filed), newest-first, for owner/admin oversight.
// Cheap + read-only. Admin-gated by the edge proxy (like /api/search) — no
// explicit auth here. Best-effort throughout: any failed stream just yields
// nothing rather than an error.

import { NextResponse } from "next/server";
import { getAllTasks, computeGlobalKpis } from "@/lib/queries";
import { sb } from "@/db/supabase";

export type PulseItem = { label: string; detail: string; when: string; href?: string };

function ago(isoTs: string | null): string {
  if (!isoTs) return "";
  const ms = Date.now() - new Date(isoTs).getTime();
  const mins = Math.floor(ms / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function author(by: string | null): string {
  if (!by) return "System";
  if (by === "ai-command") return "ORI";
  if (by === "meeting-mode") return "Meeting";
  if (by === "web-ui") return "You";
  if (by.startsWith("portal-dir:")) return by.slice(11);
  if (by.startsWith("portal-mgr:")) return by.slice(11);
  if (by.startsWith("portal-hr:")) return by.slice(10);
  if (by.startsWith("portal:")) return by.slice(7);
  return "Management";
}

const firstName = (r: Record<string, unknown>, key: string): string | null => {
  const p = r[key] as { name?: string } | { name?: string }[] | null;
  return (Array.isArray(p) ? p[0]?.name : p?.name) ?? null;
};

/** The ~12 most recent notable events across the estate, newest-first. */
async function buildPulse(): Promise<PulseItem[]> {
  type Raw = PulseItem & { ts: number };
  const events: Raw[] = [];

  const [updatesR, newTasksR, checkinsR, requestsR, docsR] = await Promise.all([
    sb.from("task_updates").select("body,created_at,created_by,tasks(code,action_item)").is("deleted_at", null).order("created_at", { ascending: false }).limit(8),
    sb.from("tasks").select("code,action_item,created_date,companies(name)").eq("archived", false).not("created_date", "is", null).order("created_date", { ascending: false }).limit(6),
    sb.from("attendance").select("status,updated_at,people(name)").order("updated_at", { ascending: false }).limit(6),
    sb.from("requests").select("code,title,created_at,people:requester_id(name)").order("created_at", { ascending: false }).limit(4),
    sb.from("documents").select("title,created_at,companies(name)").eq("archived", false).order("created_at", { ascending: false }).limit(4),
  ]);

  for (const u of (updatesR.data ?? []) as Record<string, unknown>[]) {
    const t = u.tasks as { code?: string; action_item?: string } | { code?: string; action_item?: string }[] | null;
    const tt = Array.isArray(t) ? t[0] : t;
    const when = u.created_at as string;
    events.push({
      label: `${author(u.created_by as string | null)} updated [${tt?.code ?? "?"}]`,
      detail: ((u.body as string) ?? "").trim().replace(/\s+/g, " ").slice(0, 80) || (tt?.action_item ?? ""),
      when: ago(when),
      href: tt?.code ? `/task/${tt.code}` : undefined,
      ts: new Date(when).getTime(),
    });
  }
  for (const t of (newTasksR.data ?? []) as Record<string, unknown>[]) {
    const when = t.created_date as string;
    events.push({
      label: `New task [${t.code}]`,
      detail: [(t.action_item as string) ?? "", firstName(t, "companies")].filter(Boolean).join(" · ").slice(0, 90),
      when: ago(when),
      href: `/task/${t.code}`,
      ts: new Date(when).getTime(),
    });
  }
  for (const a of (checkinsR.data ?? []) as Record<string, unknown>[]) {
    const when = a.updated_at as string;
    events.push({
      label: `${firstName(a, "people") ?? "Someone"} · ${(a.status as string) ?? "Present"}`,
      detail: "Attendance check-in",
      when: ago(when),
      href: "/hrms/leave",
      ts: new Date(when).getTime(),
    });
  }
  for (const r of (requestsR.data ?? []) as Record<string, unknown>[]) {
    const when = r.created_at as string;
    events.push({
      label: `Request [${r.code}]`,
      detail: [(r.title as string) ?? "", firstName(r, "people")].filter(Boolean).join(" · ").slice(0, 90),
      when: ago(when),
      href: "/portal",
      ts: new Date(when).getTime(),
    });
  }
  for (const d of (docsR.data ?? []) as Record<string, unknown>[]) {
    const when = (d.filed_at as string | null) ?? (d.created_at as string);
    events.push({
      label: "Document filed",
      detail: [(d.title as string) ?? "", firstName(d, "companies")].filter(Boolean).join(" · ").slice(0, 90),
      when: ago(when),
      href: "/documents",
      ts: new Date(when).getTime(),
    });
  }

  return events
    .sort((a, b) => b.ts - a.ts)
    .slice(0, 12)
    .map(({ ts: _ts, ...rest }) => rest);
}

export async function GET() {
  try {
    const [tasks, pulse] = await Promise.all([getAllTasks(), buildPulse().catch(() => [])]);
    const k = computeGlobalKpis(tasks);

    const start = new Date(); start.setHours(0, 0, 0, 0);
    const end = new Date(); end.setHours(23, 59, 59, 999);
    const { data: meetings } = await sb
      .from("meetings")
      .select("id,title,meeting_date")
      .gte("meeting_date", start.toISOString())
      .lte("meeting_date", end.toISOString());

    return NextResponse.json({
      overdue: k.overdue,
      dueSoon: k.dueSoon,
      critical: k.critical,
      escalated: k.escalated,
      open: k.open,
      meetingsToday: (meetings ?? []).length,
      pulse,
    });
  } catch (e) {
    console.error("Pulse error:", e);
    return NextResponse.json({ overdue: 0, dueSoon: 0, critical: 0, escalated: 0, open: 0, meetingsToday: 0, pulse: [] });
  }
}

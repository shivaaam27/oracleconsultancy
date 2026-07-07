// /api/briefing — ORI's DAILY BRIEFING (Phase 6, "magic layer").
//
// A single glanceable snapshot of "where the estate is right now", composed
// entirely from EXISTING deterministic pieces — no AI call, cheap, read-only:
//   • radar      — the proactive anomaly scan (src/lib/ori/radar.ts)
//   • changed    — the most recent notable activity across the portfolio
//                  (the same task-update / new-task / check-in / request / doc
//                   streams the "what happened" digest reads)
//   • suggestions— a few suggested next-actions DERIVED from the radar +
//                  per-company slipping counts ("3 tasks slipping at Terra
//                  Green → review").
// Admin-gated by the edge proxy (like /api/pulse and /api/search) — no explicit
// auth here. Best-effort throughout: any failed stream just yields nothing
// rather than an error, so the briefing degrades to a partial card.

import { NextResponse } from "next/server";
import { sb } from "@/db/supabase";
import { buildRadar, type RadarFinding } from "@/lib/ori/radar";

export type BriefingChange = { label: string; detail: string; when: string; href?: string };
export type BriefingSuggestion = { label: string; hint: string; href: string };

const DAY = 86_400_000;

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

/** The most recent notable events across the estate (last few days), newest-first.
 *  Mirrors the "what happened" streams — best-effort, each stream independent. */
async function buildChanged(): Promise<BriefingChange[]> {
  type Raw = BriefingChange & { ts: number };
  const events: Raw[] = [];
  const sinceIso = new Date(Date.now() - 3 * DAY).toISOString();

  const [updatesR, newTasksR, checkinsR, requestsR, docsR] = await Promise.all([
    sb.from("task_updates").select("body,created_at,created_by,tasks(code,action_item)").is("deleted_at", null).gte("created_at", sinceIso).order("created_at", { ascending: false }).limit(8),
    sb.from("tasks").select("code,action_item,created_date,companies(name)").eq("archived", false).gte("created_date", sinceIso).order("created_date", { ascending: false }).limit(6),
    sb.from("attendance").select("status,updated_at,people(name)").gte("updated_at", sinceIso).order("updated_at", { ascending: false }).limit(6),
    sb.from("requests").select("code,title,created_at,people:requester_id(name)").gte("created_at", sinceIso).order("created_at", { ascending: false }).limit(4),
    sb.from("documents").select("title,filed_at,created_at,companies(name)").eq("archived", false).eq("intake_state", "filed").gte("created_at", sinceIso).order("created_at", { ascending: false }).limit(4),
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
    events.push({ label: `New task [${t.code}]`, detail: [(t.action_item as string) ?? "", firstName(t, "companies")].filter(Boolean).join(" · ").slice(0, 90), when: ago(when), href: `/task/${t.code}`, ts: new Date(when).getTime() });
  }
  for (const a of (checkinsR.data ?? []) as Record<string, unknown>[]) {
    const when = a.updated_at as string;
    events.push({ label: `${firstName(a, "people") ?? "Someone"} · ${(a.status as string) ?? "Present"}`, detail: "Attendance check-in", when: ago(when), href: "/hrms/leave", ts: new Date(when).getTime() });
  }
  for (const r of (requestsR.data ?? []) as Record<string, unknown>[]) {
    const when = r.created_at as string;
    events.push({ label: `Request [${r.code}]`, detail: [(r.title as string) ?? "", firstName(r, "people")].filter(Boolean).join(" · ").slice(0, 90), when: ago(when), href: "/portal", ts: new Date(when).getTime() });
  }
  for (const d of (docsR.data ?? []) as Record<string, unknown>[]) {
    const when = (d.filed_at as string | null) ?? (d.created_at as string);
    events.push({ label: "Document filed", detail: [(d.title as string) ?? "", firstName(d, "companies")].filter(Boolean).join(" · ").slice(0, 90), when: ago(when), href: "/documents", ts: new Date(when).getTime() });
  }

  return events.sort((a, b) => b.ts - a.ts).slice(0, 10).map(({ ts: _ts, ...rest }) => rest);
}

/** Suggested next-actions DERIVED from the radar + a per-company slipping count.
 *  Everything here already surfaced in the radar; suggestions turn a finding into
 *  a concrete "→ review" call to action. Bounded to a handful. */
async function buildSuggestions(radar: RadarFinding[]): Promise<BriefingSuggestion[]> {
  const out: BriefingSuggestion[] = [];

  // Per-company slipping (overdue) breakdown — "3 tasks slipping at Terra Green".
  try {
    const nowIso = new Date().toISOString();
    const { data } = await sb.from("tasks")
      .select("company_id,companies(name)")
      .eq("archived", false)
      .not("status", "in", '("Completed","Closed")')
      .not("deadline", "is", null)
      .lt("deadline", nowIso)
      .limit(3000);
    const byCompany = new Map<string, { name: string; id: number; n: number }>();
    for (const r of (data ?? []) as Record<string, unknown>[]) {
      const id = r.company_id as number | null;
      const name = firstName(r, "companies");
      if (id == null || !name) continue;
      const key = String(id);
      const cur = byCompany.get(key) ?? { name, id, n: 0 };
      cur.n += 1;
      byCompany.set(key, cur);
    }
    const worst = [...byCompany.values()].sort((a, b) => b.n - a.n).slice(0, 3);
    for (const c of worst) {
      out.push({
        label: `${c.n} task${c.n === 1 ? "" : "s"} slipping at ${c.name} → review`,
        hint: "Open, deadline passed, still not done",
        href: `/companies/${c.id}`,
      });
    }
  } catch { /* best-effort */ }

  // Fold in the other radar findings (non-overdue) as one-line prompts so the
  // owner has a next step for each concern, not just a count.
  for (const f of radar) {
    if (out.length >= 6) break;
    if (/overdue/i.test(f.label)) continue; // covered by the per-company breakdown
    out.push({ label: `${f.label} → review`, hint: f.detail, href: f.href });
  }

  return out.slice(0, 6);
}

export async function GET() {
  try {
    const radar = await buildRadar().catch((): RadarFinding[] => []);
    const [changed, suggestions] = await Promise.all([
      buildChanged().catch((): BriefingChange[] => []),
      buildSuggestions(radar).catch((): BriefingSuggestion[] => []),
    ]);
    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      radar,
      changed,
      suggestions,
    });
  } catch (e) {
    console.error("Briefing error:", e);
    return NextResponse.json({ generatedAt: new Date().toISOString(), radar: [], changed: [], suggestions: [] });
  }
}

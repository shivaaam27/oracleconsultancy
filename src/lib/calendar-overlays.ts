// Read-only cross-system overlays for the calendar: task deadlines, approved
// leave, public holidays, document/contract renewals, and people milestones
// (birthdays, work anniversaries, probation-end). All derived at read time —
// nothing is written. Server-only (uses the service-role client).

import { sb } from "@/db/supabase";
import type { OverlayItem } from "@/lib/calendar-overlays-shared";

const EAT = "Africa/Dar_es_Salaam";

/** y-m-d in Dar es Salaam for a stored timestamp. */
function dayKey(value: string | Date): string {
  return new Date(value).toLocaleDateString("en-CA", { timeZone: EAT });
}
/** Month/day (MM-DD) of a stored date, read in EAT. */
function monthDay(value: string | Date): string {
  return new Date(value).toLocaleDateString("en-CA", { timeZone: EAT }).slice(5);
}
function inRange(key: string, from: string, to: string): boolean {
  return key >= from && key <= to;
}
function addDaysKey(key: string, n: number): string {
  const d = new Date(`${key}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

const OPEN_EXCLUDED = ["Completed", "Closed"];

/**
 * Build overlay items for the window [fromKey, toKey] (inclusive, yyyy-mm-dd).
 * The window is typically ~13 months so the calendar can page without refetching.
 */
export async function listOverlayItems(fromKey: string, toKey: string): Promise<OverlayItem[]> {
  const fromIso = `${fromKey}T00:00:00Z`;
  const toIso = `${addDaysKey(toKey, 1)}T00:00:00Z`;
  const items: OverlayItem[] = [];

  const [tasksRes, leaveRes, holRes, docRes, peopleRes] = await Promise.all([
    sb.from("tasks").select("id,code,action_item,company_id,deadline,status")
      .eq("archived", false).not("deadline", "is", null).gte("deadline", fromIso).lt("deadline", toIso),
    sb.from("leave_requests").select("id,person_id,start_date,end_date,status, person:people!leave_requests_person_id_people_id_fk(name)")
      .eq("status", "Approved").lt("start_date", toIso).gte("end_date", fromIso),
    sb.from("public_holidays").select("id,date,name").gte("date", fromIso).lt("date", toIso),
    sb.from("documents").select("id,title,category,company_id,expiry_date")
      .eq("archived", false).not("expiry_date", "is", null).gte("expiry_date", fromIso).lt("expiry_date", toIso),
    sb.from("people").select("id,name,date_of_birth,start_date,probation_end_date").eq("active", true),
  ]);

  // Task deadlines (open tasks only).
  for (const t of tasksRes.data ?? []) {
    if (OPEN_EXCLUDED.includes((t.status as string) ?? "")) continue;
    const code = t.code as string;
    items.push({
      id: `task-${t.id}`,
      kind: "task",
      title: `${code}: ${t.action_item as string}`,
      dayKey: dayKey(t.deadline as string),
      href: `/?tab=tasks&task=${code}`,
      companyId: (t.company_id as number) ?? null,
    });
  }

  // Approved leave — one item per day across the span, clamped to the window.
  for (const l of leaveRes.data ?? []) {
    const name = pickName(l.person);
    let k = dayKey(l.start_date as string);
    const end = dayKey(l.end_date as string);
    const start = k < fromKey ? fromKey : k;
    k = start;
    let guard = 0;
    while (k <= end && k <= toKey && guard < 400) {
      if (k >= fromKey) {
        items.push({ id: `leave-${l.id}-${k}`, kind: "leave", title: `${name} — leave`, dayKey: k, href: "/hrms/leave", companyId: null });
      }
      k = addDaysKey(k, 1);
      guard++;
    }
  }

  // Public holidays.
  for (const h of holRes.data ?? []) {
    items.push({ id: `hol-${h.id}`, kind: "holiday", title: h.name as string, dayKey: dayKey(h.date as string), href: "/hrms/leave", companyId: null });
  }

  // Document / contract renewals (expiry dates).
  for (const d of docRes.data ?? []) {
    items.push({
      id: `doc-${d.id}`,
      kind: "renewal",
      title: `${d.title as string} expires`,
      dayKey: dayKey(d.expiry_date as string),
      href: "/documents",
      companyId: (d.company_id as number) ?? null,
    });
  }

  // People milestones — birthdays + work anniversaries recur yearly, so expand
  // across every year the window touches; probation-end is a one-off.
  const fromYear = Number(fromKey.slice(0, 4));
  const toYear = Number(toKey.slice(0, 4));
  for (const p of peopleRes.data ?? []) {
    const name = p.name as string;
    if (p.date_of_birth) {
      const md = monthDay(p.date_of_birth as string);
      for (let y = fromYear; y <= toYear; y++) {
        const k = `${y}-${md}`;
        if (inRange(k, fromKey, toKey)) items.push({ id: `bd-${p.id}-${y}`, kind: "birthday", title: `${name} — birthday`, dayKey: k, href: `/people`, companyId: null });
      }
    }
    if (p.start_date) {
      const md = monthDay(p.start_date as string);
      const startYear = Number(dayKey(p.start_date as string).slice(0, 4));
      for (let y = fromYear; y <= toYear; y++) {
        const yrs = y - startYear;
        if (yrs < 1) continue;
        const k = `${y}-${md}`;
        if (inRange(k, fromKey, toKey)) items.push({ id: `anniv-${p.id}-${y}`, kind: "anniversary", title: `${name} — ${yrs} yr${yrs === 1 ? "" : "s"}`, dayKey: k, href: `/people`, companyId: null });
      }
    }
    if (p.probation_end_date) {
      const k = dayKey(p.probation_end_date as string);
      if (inRange(k, fromKey, toKey)) items.push({ id: `prob-${p.id}`, kind: "probation", title: `${name} — probation ends`, dayKey: k, href: `/people`, companyId: null });
    }
  }

  return items;
}

function pickName(embed: unknown): string {
  if (Array.isArray(embed)) return (embed[0]?.name as string) ?? "Someone";
  if (embed && typeof embed === "object" && "name" in embed) return (embed as { name: string }).name;
  return "Someone";
}

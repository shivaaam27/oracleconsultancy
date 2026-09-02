import "server-only";
import { sb } from "@/db/supabase";
import { listCalendarEvents } from "@/lib/calendar";
import { leaveMetrics } from "@/lib/leave";

// "Right now" data for the Administrator — today's events, who's on leave, leave to
// approve, upcoming birthdays, and the live headcount. All cheap reads; reused, not new.

export type NowEvent = { id: number; title: string; startAt: string; allDay: boolean };
export type NowBirthday = { name: string; inDays: number };

export type CockpitNowData = {
  events: NowEvent[];
  onLeaveToday: number;
  pendingLeave: number;
  birthdays: NowBirthday[];
  headcount: number;
};

/** Start/end ISO for "today" in Dar es Salaam (UTC+3), so today's events are right. */
function eatTodayWindow(): { from: string; to: string } {
  const ymd = new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Nairobi" }); // YYYY-MM-DD
  const from = new Date(`${ymd}T00:00:00+03:00`);
  const to = new Date(from.getTime() + 86_400_000);
  return { from: from.toISOString(), to: to.toISOString() };
}

function daysUntilBirthday(dobIso: string): number {
  const dob = new Date(dobIso);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let next = new Date(now.getFullYear(), dob.getMonth(), dob.getDate());
  if (next.getTime() < today.getTime()) next = new Date(now.getFullYear() + 1, dob.getMonth(), dob.getDate());
  return Math.round((next.getTime() - today.getTime()) / 86_400_000);
}

export async function gatherCockpitNow(): Promise<CockpitNowData> {
  const { from, to } = eatTodayWindow();
  const [events, leave, peopleRes, countRes] = await Promise.all([
    listCalendarEvents({ from, to }).catch(() => []),
    leaveMetrics().catch(() => ({ pending: 0, onLeaveToday: 0, approvedThisMonth: 0 })),
    sb.from("people").select("name,date_of_birth").eq("active", true).not("date_of_birth", "is", null),
    sb.from("people").select("id", { count: "exact", head: true }).eq("active", true),
  ]);

  const birthdays: NowBirthday[] = (peopleRes.data ?? [])
    .map((p) => ({ name: (p.name as string) ?? "", inDays: daysUntilBirthday(p.date_of_birth as string) }))
    .filter((b) => b.name && b.inDays <= 7)
    .sort((a, b) => a.inDays - b.inDays)
    .slice(0, 2);

  return {
    events: events.slice(0, 3).map((e) => ({ id: e.id, title: e.title, startAt: e.startAt, allDay: e.allDay })),
    onLeaveToday: leave.onLeaveToday,
    pendingLeave: leave.pending,
    birthdays,
    headcount: countRes.count ?? 0,
  };
}

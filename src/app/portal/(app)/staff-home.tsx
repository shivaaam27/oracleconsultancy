/**
 * Studio Home for a member of STAFF (26 Sept 2026, mockup board S_Home) — the
 * owner's Home, for one person. The same grid and the same component
 * (`StudioHome`), so every card is the owner's and directors' size:
 *
 *   ┌──────── their tasks, a bar each ────────┐┌─ Today (check-in) ─┐
 *   ┌─ Due today ─┐ ┌─ Needs you ─┐ ┌─ My to-do list ─┐
 *
 * Only THEIR tasks (`visibleTaskIds`, the same rule the old portal Home used),
 * worked out with the same meaning of late / due soon as everywhere else.
 * Nothing here is new ability: the check-in, the to-dos and the notice all call
 * the portal's existing actions.
 */
import Link from "next/link";
import { Sparkles } from "lucide-react";
import type { PortalPerson } from "@/lib/portal/portal-auth";
import { visibleTaskIds } from "@/lib/portal/portal-auth";
import { getAllTasks, type TaskRow } from "@/lib/tasks/queries";
import { personAttendanceToday, personAttendanceWeek } from "@/lib/people/attendance";
import { listSelfTodos } from "@/lib/tasks/todo-reminders";
import { scopedUpcomingMeetings } from "@/lib/portal/portal-meetings-data";
import { feedForPersonId } from "@/lib/messaging/announcements";
import { getGivenName } from "@/lib/people/names";
import { withReturn } from "@/lib/nav/return-to";
import { portalTaskHref } from "@/lib/portal/portal-task-href";
import { StudioHome, type StudioHomeData, type HomeItem } from "@/components/studio/home/studio-home";
import { StaffCheckinCard, StaffCheckinFold, StaffTodoCard, StaffTodoFold } from "@/components/studio/home/staff-cards";

const DAY = 86_400_000;
const QUIET_MS = 7 * DAY;
const eatDay = (ms: number) => Math.floor((ms + 3 * 3_600_000) / DAY);
const WEEKDAY = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];


export async function StaffStudioHome({ me }: { me: PortalPerson }) {
  const [all, ids, today, week, todos, meetings, feed] = await Promise.all([
    getAllTasks(),
    visibleTaskIds(me),
    personAttendanceToday(me.id),
    personAttendanceWeek(me.id),
    listSelfTodos(me.id),
    scopedUpcomingMeetings(me, { daysAhead: 8 }).catch(() => []),
    (async () => {
      try {
        // Cached per request, so the portal frame's read of it is reused.
        return await feedForPersonId(me.id);
      } catch { return []; }
    })(),
  ]);
  const mine = new Set(ids);
  const rows = all.filter((r) => mine.has(r.id));

  const nowMs = Date.now();
  const todayN = eatDay(nowMs);
  const eatNow = new Date(nowMs + 3 * 3_600_000);
  const open = rows.filter((r) => r.status !== "Completed" && r.status !== "Closed");
  const isLate = (r: TaskRow) => r.flag === "overdue" || r.flag === "escalate-now";
  const isSoon = (r: TaskRow) => r.flag === "due-soon";
  const isQuiet = (r: TaskRow) => !r.lastUpdatedAt || nowMs - r.lastUpdatedAt.getTime() >= QUIET_MS;
  const href = (code: string) => withReturn(portalTaskHref(code), "/portal");
  const daysLate = (r: TaskRow) => (typeof r.daysToDeadline === "number" ? Math.abs(Math.min(0, r.daysToDeadline)) : 0);
  const shortDay = (r: TaskRow) => new Date(r.deadline!.getTime() + 3 * 3_600_000).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", timeZone: "UTC" });

  /* the hero — one bar per open task, worst to the right (as the owner's) */
  type Band = "quiet" | "moving" | "soon" | "late";
  const bandOf = (r: TaskRow): Band => (isLate(r) ? "late" : isSoon(r) ? "soon" : isQuiet(r) ? "quiet" : "moving");
  const ORDER: Band[] = ["quiet", "moving", "soon", "late"];
  const PRI_H: Record<string, number> = { Critical: 66, High: 54, Medium: 42, Low: 32 };
  const bars = [...open]
    .sort((a, b) => ORDER.indexOf(bandOf(a)) - ORDER.indexOf(bandOf(b)) || daysLate(a) - daysLate(b))
    .map((r) => ({ band: bandOf(r), h: (PRI_H[r.priority] ?? 40) + ((r.id * 37) % 9) - 4, wide: r.priority === "Critical" || r.escalation === "Yes", label: `${r.code} · ${r.actionItem}`, href: href(r.code) }));
  const counts = { quiet: 0, moving: 0, soon: 0, late: 0 } as Record<Band, number>;
  for (const b of bars) counts[b.band]++;
  const month = eatNow.getUTCMonth(), year = eatNow.getUTCFullYear();
  const doneThisMonth = rows.filter((r) => (r.status === "Completed" || r.status === "Closed") && r.closedDate && r.closedDate.getMonth() === month && r.closedDate.getFullYear() === year);
  const monthName = eatNow.toLocaleDateString("en-GB", { month: "long", timeZone: "UTC" });

  /* Due — today (tasks + today's meetings), and this week */
  const dayOf = (r: TaskRow) => (r.deadline ? eatDay(r.deadline.getTime()) : null);
  const weekEnd = todayN + ((7 - eatNow.getUTCDay()) % 7);
  const dueToday = open.filter((r) => !isLate(r) && dayOf(r) === todayN);
  const dueWeek = open.filter((r) => { const d = dayOf(r); return !isLate(r) && d !== null && d >= todayN && d <= weekEnd; }).sort((a, b) => (dayOf(a) ?? 0) - (dayOf(b) ?? 0));
  const weekdayOf = (r: TaskRow) => WEEKDAY[new Date(r.deadline!.getTime() + 3 * 3_600_000).getUTCDay()];
  const weekWords = (() => {
    if (dueWeek.length === 0) return "nothing else due this week";
    const days = [...new Set(dueWeek.map(weekdayOf))];
    if (days.length === 1) return dueWeek.length === 1 ? `on ${days[0]}` : dueWeek.length === 2 ? `both on ${days[0]}` : `all on ${days[0]}`;
    return `from ${days[0]} to ${days[days.length - 1]}`;
  })();
  const todaysMeetings: HomeItem[] = meetings
    .filter((m) => eatDay(new Date(m.startAt).getTime()) === todayN)
    .map((m) => ({ title: m.title, sub: "", right: m.allDay ? "All day" : new Date(m.startAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Nairobi" }), dot: "#2490EF", href: "/portal/meetings" }));
  const meetingWords = todaysMeetings.length ? `${todaysMeetings.length} ${todaysMeetings.length === 1 ? "meeting" : "meetings"}` : "no meetings";

  /* Needs you — late and due soon, worst first */
  const needs = [...open.filter(isLate).sort((a, b) => daysLate(b) - daysLate(a)), ...open.filter(isSoon).sort((a, b) => (dayOf(a) ?? 0) - (dayOf(b) ?? 0))];

  /* the live notice that still needs them (the old banner) */
  const waiting = feed.filter((a) => (a.requireAck ? !a.ackAt : !a.seenAt));

  const data: StudioHomeData = {
    greeting: `${eatNow.getUTCHours() < 12 ? "Good morning" : eatNow.getUTCHours() < 17 ? "Good afternoon" : "Good evening"}, ${getGivenName(me.name.replace(/^(Mr|Mrs|Ms|Miss|Dr)\.?\s+/i, ""))} · ${eatNow.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" })}`,
    openCount: open.length,
    announcements: waiting.length ? { count: waiting.length, first: waiting[0].title } : null,
    late: counts.late,
    soon: counts.soon,
    done: doneThisMonth.length,
    bars,
    legend: [
      { label: "Quiet 7+ days", n: counts.quiet, color: "#CFE05A", href: "/portal/tasks?quiet=1" },
      { label: "Moving", n: counts.moving, color: "#19C37D", href: "/portal/tasks?flag=on-track" },
      { label: "Due soon", n: counts.soon, color: "#F5A524", href: "/portal/tasks?flag=due-soon" },
      { label: "Late", n: counts.late, color: "#E0479E", href: "/portal/tasks?flag=overdue" },
    ],
    due: {
      today: {
        n: dueToday.length,
        sub: `${dueToday.length === 1 ? "task" : "tasks"} due · ${meetingWords}`,
        items: [
          ...todaysMeetings,
          ...dueToday.map((r) => ({ title: r.actionItem, sub: "", right: r.code, dot: "#F5A524", href: href(r.code) })),
          ...(dueToday.length === 0 && counts.late ? [{ title: `${counts.late} late ${counts.late === 1 ? "task" : "tasks"} — open the list`, sub: "", right: "View", dot: "#E0479E", href: "/portal/tasks?flag=overdue" }] : []),
        ],
      },
      week: {
        n: dueWeek.length,
        sub: weekWords,
        items: dueWeek.map((r) => ({ title: r.actionItem, sub: "", right: shortDay(r), dot: dayOf(r) === todayN ? "#E0479E" : "#F5A524", href: href(r.code) })),
      },
    },
    cards: [[
      { kind: "list", kicker: "Tasks", title: "Needs you", sub: needs.length ? "Late and due soon · worst first" : "Nothing late or due soon",
        more: needs.length ? { label: "All my tasks", href: "/portal/tasks" } : undefined,
        items: needs.map((r) => isLate(r)
          ? { title: r.actionItem, sub: `${r.code} · ${r.companyName}`, right: `${daysLate(r)}d late`, dot: "#E0479E", rightColor: "#C2327F", href: href(r.code) }
          : { title: r.actionItem, sub: `${r.code} · ${r.companyName}`, right: shortDay(r), dot: "#F5A524", rightColor: "#B7700A", href: href(r.code) }),
        empty: "Nothing late, nothing due soon. Well done." },
    ]],
  };

  const checkin = {
    status: today.status,
    editable: today.editable,
    lockReason: today.lockReason,
    dateLabel: eatNow.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }),
    week: week.days.map((d) => ({ date: d.date, label: DOW[d.dow], status: d.status, isToday: d.isToday })),
  };

  return (
    <StudioHome
      data={data}
      links={{ late: "/portal/tasks?flag=overdue", soon: "/portal/tasks?flag=due-soon", done: "/portal/tasks?done=1", announcements: "/portal/announcements" }}

      heroAction={
        <Link href="/portal/profile#kpi" className="inline-flex h-8 items-center gap-1.5 rounded-[9px] bg-[#1F2023] px-3 text-xs font-medium text-[#E6E6E3] transition-colors hover:bg-[#26282C]">
          <Sparkles size={13} />How I did in {monthName}
        </Link>
      }
      aside={<StaffCheckinCard c={checkin} />}
      after={<StaffTodoCard items={todos} />}
      phone={{ before: <StaffCheckinFold c={checkin} />, after: <StaffTodoFold items={todos} /> }}
    />
  );
}

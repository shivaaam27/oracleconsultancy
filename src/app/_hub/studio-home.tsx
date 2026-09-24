/**
 * Studio Home (Phase 3, mockup board Home) — the server half.
 *
 * Every figure is worked out HERE from the same task rows the Tasks page uses
 * (`getAllTasks`), with the same meaning of "late" (flag overdue or
 * escalate-now) and "due soon" (flag due-soon), so Home and Tasks can never
 * disagree. The client (`components/studio/home/studio-home.tsx`) only lays
 * it out.
 *
 * What the old Home carried and where it lives now (Coverage board):
 *  - Needs you → card 1 "Late, needs you"; company heat → card 3 "Company
 *    health"; ORI recap → card 3 "What ORI did"; Run automations, Send the
 *    Brief, Approvals → card 3 "Run the day"; today's diary → the Due card's
 *    Today view. Announcements keep their banner above.
 */
import type { TaskRow } from "@/lib/queries";
import { sb } from "@/db/supabase";
import { getAppSettings, getEmailConfig } from "@/lib/settings";
import { listRecentActivity } from "@/lib/activity";
import { getGivenName } from "@/lib/names";
import { gatherCockpitNow } from "@/lib/cockpit-now";
import { listApprovals, listCockpitActivity } from "@/lib/cockpit";
import { getAutomationConfig } from "@/lib/automation";
import { taskHref } from "@/lib/task-href";
import { withReturn } from "@/lib/return-to";
import { listAnnouncements } from "@/lib/announcements";
import { isLive } from "@/lib/announcements-shared";
import { StudioHome, type StudioHomeData, type HomeItem } from "@/components/studio/home/studio-home";
import { HomeActions } from "./home-actions";
import type { Viewer } from "@/lib/viewer";

const DAY = 86_400_000;
const QUIET_MS = 7 * DAY;
/** A Dar es Salaam day number, whatever zone the server runs in. */
const eatDay = (ms: number) => Math.floor((ms + 3 * 3_600_000) / DAY);
const WEEKDAY = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function greeting(hourEat: number) {
  return hourEat < 12 ? "Good morning" : hourEat < 17 ? "Good afternoon" : "Good evening";
}

/**
 * A DIRECTOR gets this same Home (portal unification, Sept 2026) — "the same
 * home, cut down": the figures come from THEIR companies' tasks only, and what
 * is the owner's alone stays out — Run the day, Controls held, What ORI did,
 * the diary and the team register, and links to pages a director cannot open
 * yet. Those are not even fetched for them, so none of it travels in the page.
 */
export async function StudioHomeServer({ rows: allRows, viewer }: { rows: TaskRow[]; viewer: Viewer }) {
  const director = viewer.kind === "director" ? viewer : null;
  const scope = viewer.scope;
  const rows = scope ? allRows.filter((r) => scope.includes(r.companyId)) : allRows;
  const soon30 = new Date(Date.now() + 30 * DAY).toISOString();
  const nowIso = new Date().toISOString();
  const none = <T,>(v: T) => Promise.resolve(v);
  const [settings, nowData, approvals, autonomy, automation, companiesRes, activityAll, emailCfg, dirRow, docCountRes, soonDocs, expiredDocs] = await Promise.all([
    getAppSettings(),
    director ? none({ events: [], headcount: 0, onLeaveToday: 0, pendingLeave: 0, birthdays: [] } as unknown as Awaited<ReturnType<typeof gatherCockpitNow>>) : gatherCockpitNow(),
    director ? none([] as Awaited<ReturnType<typeof listApprovals>>) : listApprovals(),
    director ? none([] as Awaited<ReturnType<typeof listCockpitActivity>>) : listCockpitActivity(8),
    getAutomationConfig(),
    sb.from("companies").select("id,name"),
    listRecentActivity(director ? 40 : 10),
    director ? none(null) : getEmailConfig(),
    sb.from("settings").select("value").eq("key", "director.outreachPaused").maybeSingle(),
    sb.from("documents").select("id", { count: "exact", head: true }).eq("archived", false),
    // What is ABOUT to expire, soonest first — then what expired most recently.
    // (Ascending over everything put 2024's long-dead papers at the top.)
    sb.from("documents").select("id,title,expiry_date,company_id,category", { count: "exact" }).eq("archived", false).gte("expiry_date", nowIso).lte("expiry_date", soon30).order("expiry_date", { ascending: true }).limit(8),
    sb.from("documents").select("id,title,expiry_date,company_id,category", { count: "exact" }).eq("archived", false).lt("expiry_date", nowIso).order("expiry_date", { ascending: false }).limit(6),
  ]);
  const docRows = [...(soonDocs.data ?? []), ...(expiredDocs.data ?? [])];
  // A director's activity is their companies' activity.
  const codesInView = new Set(rows.map((r) => r.code));
  const activity = director ? activityAll.filter((a) => codesInView.has(a.code)).slice(0, 10) : activityAll;
  // What staff are seeing right now — carried in the hero, not a banner above
  // it (the old Home's "Live announcements" strip).
  let live: { title: string }[] = [];
  if (!director) try { live = (await listAnnouncements(false)).filter((a) => isLive(a, new Date())); } catch { /* decoration */ }

  const nowMs = Date.now();
  const today = eatDay(nowMs);
  const eatNow = new Date(nowMs + 3 * 3_600_000);
  const back = "/";
  const open = rows.filter((r) => r.status !== "Completed" && r.status !== "Closed");
  const isLate = (r: TaskRow) => r.flag === "overdue" || r.flag === "escalate-now";
  const isSoon = (r: TaskRow) => r.flag === "due-soon";
  const isQuiet = (r: TaskRow) => !r.lastUpdatedAt || nowMs - r.lastUpdatedAt.getTime() >= QUIET_MS;
  const href = (code: string) => withReturn(taskHref(code), back);
  const who = (r: TaskRow) => (r.assignees.length === 0 ? "nobody yet" : r.assignees.length === 1 ? r.assignees[0] : `${r.assignees[0]} +${r.assignees.length - 1}`);
  const daysLate = (r: TaskRow) => (typeof r.daysToDeadline === "number" ? Math.abs(Math.min(0, r.daysToDeadline)) : 0);

  /* ---------- the hero: one bar per open task, worst to the right ---------- */
  type Band = "quiet" | "moving" | "soon" | "late";
  const bandOf = (r: TaskRow): Band => (isLate(r) ? "late" : isSoon(r) ? "soon" : isQuiet(r) ? "quiet" : "moving");
  const ORDER: Band[] = ["quiet", "moving", "soon", "late"];
  const PRI_H: Record<string, number> = { Critical: 66, High: 54, Medium: 42, Low: 32 };
  const bars = [...open]
    .sort((a, b) => ORDER.indexOf(bandOf(a)) - ORDER.indexOf(bandOf(b)) || daysLate(a) - daysLate(b))
    .map((r) => ({
      band: bandOf(r),
      // Taller = more important; a small stable wobble so equal bars do not read as a wall.
      h: (PRI_H[r.priority] ?? 40) + ((r.id * 37) % 9) - 4,
      wide: r.priority === "Critical" || r.escalation === "Yes",
      label: `${r.code} · ${r.actionItem}`,
      href: href(r.code),
    }));
  const counts = { quiet: 0, moving: 0, soon: 0, late: 0 } as Record<Band, number>;
  for (const b of bars) counts[b.band]++;
  const month = eatNow.getUTCMonth(), year = eatNow.getUTCFullYear();
  const doneThisMonth = rows.filter((r) => (r.status === "Completed" || r.status === "Closed") && r.closedDate && r.closedDate.getMonth() === month && r.closedDate.getFullYear() === year);

  /* ---------- the Due card: today, and this week ---------- */
  const dayOf = (r: TaskRow) => (r.deadline ? eatDay(r.deadline.getTime()) : null);
  const weekEnd = today + ((7 - eatNow.getUTCDay()) % 7); // through Sunday
  const dueToday = open.filter((r) => !isLate(r) && dayOf(r) === today);
  const dueWeek = open.filter((r) => { const d = dayOf(r); return !isLate(r) && d !== null && d >= today && d <= weekEnd; })
    .sort((a, b) => (dayOf(a) ?? 0) - (dayOf(b) ?? 0));
  const weekdayOf = (r: TaskRow) => WEEKDAY[new Date(r.deadline!.getTime() + 3 * 3_600_000).getUTCDay()];
  const shortDay = (r: TaskRow) => new Date(r.deadline!.getTime() + 3 * 3_600_000).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", timeZone: "UTC" });
  const weekWords = (() => {
    if (dueWeek.length === 0) return "nothing else due this week";
    const days = [...new Set(dueWeek.map(weekdayOf))];
    if (days.length === 1) return dueWeek.length === 1 ? `on ${days[0]}` : dueWeek.length === 2 ? `both on ${days[0]}` : `all on ${days[0]}`;
    return `from ${days[0]} to ${days[days.length - 1]}`;
  })();
  const eventTime = (iso: string, allDay: boolean) => (allDay ? "All day" : new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Nairobi" }));
  const todayEvents: HomeItem[] = nowData.events.map((e) => ({ title: e.title, sub: "", right: eventTime(e.startAt, e.allDay), dot: "#2490EF", href: "/calendar" }));

  /* ---------- card 1: tasks ---------- */
  const late = open.filter(isLate).sort((a, b) => daysLate(b) - daysLate(a));
  const waiting = open.filter((r) => r.waiting || r.blockedOnPersonId != null);
  const silent = open.filter((r) => !r.latestActivity).sort((a, b) => +(a.createdDate ?? 0) - +(b.createdDate ?? 0));

  /* ---------- card 2: people ---------- */
  const idByName = new Map<string, number>();
  for (const r of rows) r.assignees.forEach((n, i) => { if (r.assigneeIds[i] != null) idByName.set(n, r.assigneeIds[i]); });
  const personHref = (n: string) => (idByName.has(n) ? `/?tab=tasks&who=${idByName.get(n)}` : "/?tab=tasks");
  const load = new Map<string, { open: number; late: number }>();
  for (const r of open) for (const n of r.assignees) {
    const e = load.get(n) ?? { open: 0, late: 0 };
    e.open++; if (isLate(r)) e.late++;
    load.set(n, e);
  }
  const people = [...load.entries()].map(([name, e]) => ({ name, ...e })).sort((a, b) => b.open - a.open);
  const avg = people.length ? people.reduce((s, p) => s + p.open, 0) / people.length : 0;
  const mostLate = [...people].sort((a, b) => b.late - a.late)[0];
  const finished = new Map<string, number>();
  for (const r of doneThisMonth) for (const n of r.assignees) finished.set(n, (finished.get(n) ?? 0) + 1);
  const finishers = [...finished.entries()].sort((a, b) => b[1] - a[1]);
  const clean = (n: string) => n.replace(/^(Mr|Mrs|Ms|Miss|Dr|Chef)\.?\s+/i, "");

  /* ---------- card 3: companies & the day ---------- */
  const companyNames = new Map((companiesRes.data ?? []).filter((c) => !scope || scope.includes(c.id as number)).map((c) => [c.id as number, c.name as string]));
  const byCo = new Map<number, { name: string; open: number; late: number; soon: number }>();
  for (const r of open) {
    const e = byCo.get(r.companyId) ?? { name: companyNames.get(r.companyId) ?? r.companyName, open: 0, late: 0, soon: 0 };
    e.open++; if (isLate(r)) e.late++; else if (isSoon(r)) e.soon++;
    byCo.set(r.companyId, e);
  }
  const cos = [...byCo.values()].sort((a, b) => b.late - a.late || b.soon - a.soon || b.open - a.open);
  const busiest = [...cos].sort((a, b) => b.open - a.open);
  const monthName = eatNow.toLocaleDateString("en-GB", { month: "long", timeZone: "UTC" });
  const pct = (n: number) => Math.max(0, Math.min(1, n));
  const lateTone = (n: number) => (n > 0 ? "#C2327F" : undefined);

  const data: StudioHomeData = {
    greeting: `${greeting(eatNow.getUTCHours())}, ${getGivenName(director ? director.name.replace(/^(Mr|Mrs|Ms|Miss|Dr)\.?\s+/i, "") : settings.operatorName || "Chief")} · ${eatNow.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" })}`,
    openCount: open.length,
    announcements: live.length ? { count: live.length, first: live[0].title } : null,
    late: counts.late,
    soon: counts.soon,
    done: doneThisMonth.length,
    bars,
    legend: [
      { label: "Quiet 7+ days", n: counts.quiet, color: "#CFE05A", href: "/?tab=tasks&quiet=1" },
      { label: "Moving", n: counts.moving, color: "#19C37D", href: "/?tab=tasks&flag=on-track" },
      { label: "Due soon", n: counts.soon, color: "#F5A524", href: "/?tab=tasks&flag=due-soon" },
      { label: "Late", n: counts.late, color: "#E0479E", href: "/?tab=tasks&flag=overdue" },
    ],
    due: {
      today: {
        n: dueToday.length,
        sub: dueToday.length
          ? `${todayEvents.length ? `and ${todayEvents.length} in the diary` : "nothing in the diary"}`
          : counts.late ? `nothing due today — ${counts.late} already late` : "nothing due today",
        items: [
          ...todayEvents,
          ...dueToday.map((r) => ({ title: r.actionItem, sub: "", right: r.code, dot: "#F5A524", href: href(r.code) })),
          ...(dueToday.length === 0 && counts.late ? [{ title: `${counts.late} late tasks — open the list`, sub: "", right: "View", dot: "#E0479E", href: "/?tab=tasks&flag=overdue" }] : []),
        ],
      },
      week: {
        n: dueWeek.length,
        sub: weekWords,
        items: dueWeek.map((r) => ({ title: r.actionItem, sub: "", right: shortDay(r), dot: dayOf(r) === today ? "#E0479E" : "#F5A524", href: href(r.code) })),
      },
    },
    cards: [
      [
        { kind: "list", kicker: "Tasks", title: "Late, needs you", sub: late.length ? `${late.length} late · worst first` : "Nothing is late", more: late.length ? { label: `All ${late.length} late`, href: "/?tab=tasks&flag=overdue" } : undefined,
          items: late.map((r) => ({ title: r.actionItem, sub: `${r.code} · ${who(r)}`, right: `${daysLate(r)}d late`, dot: "#E0479E", rightColor: "#C2327F", href: href(r.code) })),
          empty: "Nothing is late. Well done." },
        { kind: "list", kicker: "Tasks", title: "Waiting on someone", sub: "Blocked, or waiting on someone outside", more: waiting.length ? { label: "Show them all", href: "/?tab=tasks&status=Blocked" } : undefined,
          items: waiting.map((r) => ({ title: r.actionItem, sub: r.blockedReason || r.latestActivity?.body || r.status, right: r.code, dot: "#F5A524", href: href(r.code) })),
          empty: "Nothing is stuck on anyone." },
        { kind: "list", kicker: "Tasks", title: "No updates yet", sub: "Nobody has said a word", more: silent.length ? { label: "Quiet tasks", href: "/?tab=tasks&quiet=1" } : undefined,
          items: silent.map((r) => ({ title: r.actionItem, sub: `${r.code} · ${r.companyName}`, right: r.deadline ? shortDay(r) : "No date", dot: "#CFE05A", href: href(r.code) })),
          empty: "Every open task has had an update." },
        { kind: "list", kicker: "Tasks", title: "Latest activity", sub: "What moved, newest first", more: { label: "The whole activity log", href: "/activity" },
          items: activity.map((a) => ({ title: `${a.isOri ? "ORI" : clean(a.author)} · ${a.actionItem}`, sub: `“${a.body.length > 90 ? `${a.body.slice(0, 90)}…` : a.body}”`, right: ago(a.createdAt), dot: a.isOri ? "#8B5CF6" : "#2490EF", href: href(a.code) })),
          empty: "Nothing has moved yet today." },
      ],
      [
        { kind: "gauge", kicker: "People", title: "Team load", sub: "Open tasks per person", big: avg ? avg.toFixed(1) : "0", bigSub: "open each, on average",
          fill: people[0] ? pct(avg / people[0].open) : 0,
          note: people[0]
            ? `${clean(people[0].name)} carries ${people[0].open}${people[0].open > avg * 1.5 ? " — well above average" : ""}.${mostLate && mostLate.late ? ` ${clean(mostLate.name)} has ${mostLate.late} of ${mostLate.open} late.` : ""}`
            : "Nobody has open tasks.",
          href: "/people" },
        { kind: "list", kicker: "People", title: "Who is carrying most", sub: "Open · late",
          items: people.map((p) => ({ title: clean(p.name), sub: `${p.open} open`, right: p.late ? `${p.late} late` : "none late", dot: p.late ? "#E0479E" : "#19C37D", rightColor: lateTone(p.late), href: personHref(p.name) })),
          empty: "Nobody has open tasks." },
        { kind: "list", kicker: "People", title: "Finished this month", sub: `${monthName} · completed tasks`,
          items: finishers.map(([n, c], i) => ({ title: clean(n), sub: i === 0 ? "Most finished" : "", right: `${c} done`, dot: "#19C37D", rightColor: "#111214", href: "/?tab=tasks&done=1" })),
          empty: "Nothing finished yet this month." },
        { kind: "list", kicker: "People", title: "Team today", sub: `${nowData.headcount} people · ${nowData.onLeaveToday} on leave`,
          items: [
            { title: "On leave today", sub: nowData.onLeaveToday ? "Marked on the register" : "Everyone is in", right: String(nowData.onLeaveToday), dot: nowData.onLeaveToday ? "#F5A524" : "#19C37D", href: "/hrms/leave" },
            { title: "Leave to approve", sub: nowData.pendingLeave ? "Waiting for your yes" : "Nothing waiting", right: String(nowData.pendingLeave), dot: nowData.pendingLeave ? "#E0479E" : "#B9BBBF", rightColor: nowData.pendingLeave ? "#C2327F" : undefined, href: "/hrms/leave" },
            ...nowData.birthdays.map((b) => ({ title: `${clean(b.name)}’s birthday`, sub: b.inDays === 0 ? "Today" : b.inDays === 1 ? "Tomorrow" : `In ${b.inDays} days`, right: b.inDays === 0 ? "Today" : `${b.inDays}d`, dot: "#8B5CF6", href: "/people" })),
            { title: "Everyone", sub: "The people directory", right: String(nowData.headcount), dot: "#2490EF", href: "/people" },
          ],
          empty: "" },
        { kind: "list", kicker: "Records", title: "Files", sub: `${docCountRes.count ?? 0} on file · ${soonDocs.count ?? 0} expiring within 30 days · ${expiredDocs.count ?? 0} expired`, more: { label: "Files Management", href: "/files" },
          items: docRows.map((d) => {
            const expMs = new Date(d.expiry_date as string).getTime();
            const expired = expMs < nowMs;
            const days = Math.ceil((expMs - nowMs) / DAY);
            const right = expired ? (eatDay(expMs) === today ? "Expired today" : "Expired") : eatDay(expMs) === today ? "Today" : `${days} ${days === 1 ? "day" : "days"}`;
            return { title: d.title as string, sub: `${companyNames.get(d.company_id as number) ?? "No company"}${d.category ? ` · ${d.category}` : ""}`, right, dot: expired ? "#E0479E" : "#F5A524", rightColor: expired ? "#C2327F" : "#B7700A", href: "/files" };
          }),
          empty: "Nothing expires in the next 30 days." },
      ],
      [
        { kind: "list", kicker: "Companies", title: "Company health", sub: "Most late first",
          items: cos.map((c) => ({ title: c.name, sub: `${c.open} open`, right: c.late ? `${c.late} late` : c.soon ? `${c.soon} due soon` : "none late", dot: c.late ? "#E0479E" : c.soon ? "#F5A524" : "#19C37D", rightColor: c.late ? "#C2327F" : c.soon ? "#B7700A" : undefined, href: `/?tab=tasks&company=${encodeURIComponent(c.name)}` })),
          empty: "No open work anywhere." },
        { kind: "gauge", kicker: "Companies", title: "Where the work is", sub: "Companies with open tasks", big: String(cos.length), bigSub: `of ${companyNames.size} companies have open work`,
          fill: companyNames.size ? pct(cos.length / companyNames.size) : 0,
          note: busiest.length ? `${busiest[0].name} has the most (${busiest[0].open}).${busiest.length > 1 ? ` ${busiest[busiest.length - 1].name} has ${busiest[busiest.length - 1].open === 1 ? "one" : busiest[busiest.length - 1].open}.` : ""}` : "",
          href: "/companies" },
        { kind: "actions", kicker: "Controls", title: "Run the day", sub: automation.paused ? "Automations are paused" : "The levers that were on Home",
          approvals: approvals.length },
        { kind: "controls", kicker: "Controls", title: "Controls held", sub: "What runs on its own — tap to switch",
          state: {
            automationPaused: automation.paused,
            outreachPaused: (dirRow.data?.value as string | null) === "1",
            aiEnabled: settings.aiEnabled,
            emailConnected: emailCfg !== null,
            emailTestMode: emailCfg?.testMode ?? false,
          } },
        { kind: "list", kicker: "ORI", title: "What ORI did", sub: autonomy.length ? "On its own — each one can be undone" : "Nothing done on its own lately",
          more: { label: "Open Approvals", href: "/approvals" },
          items: autonomy.map((a) => ({ title: a.summary, sub: a.detail ?? "", right: ago(a.createdAt), dot: "#8B5CF6", href: "/approvals" })),
          empty: "When ORI files, renames or chases something by itself, it shows here." },
      ],
    ],
  };

  if (director) {
    // Cut down: only what a director can act on and open. The owner's levers
    // and the pages not yet shared with directors (People, Files, Calendar,
    // Companies, Activity, Approvals, HR) come out; the rest is unchanged.
    const OPEN = (href: string | undefined) => !href || href.startsWith("/?") || href === "/" || href.startsWith("/task/") || href.startsWith("/portal/");
    const OWNER_ONLY = new Set(["Run the day", "Controls held", "What ORI did", "Team today", "Files"]);
    data.cards = data.cards.map((col) =>
      col
        .filter((c) => !OWNER_ONLY.has(c.title))
        .map((c) => {
          const out = { ...c } as typeof c & { href?: string; more?: { label: string; href: string } };
          if (out.href === "/people") out.href = "/portal/directory";
          if (!OPEN(out.href)) delete out.href;
          if (out.more && !OPEN(out.more.href)) delete out.more;
          return out;
        }),
    );
    return <StudioHome data={data} />;
  }
  return (
    <>
      <HomeActions />
      <StudioHome data={data} />
    </>
  );
}

function ago(iso: string) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))}m`;
  if (s < 86400) return `${Math.round(s / 3600)}h`;
  return `${Math.round(s / 86400)}d`;
}

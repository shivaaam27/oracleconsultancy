import { sb } from "@/db/supabase";
import { getViewer, type Viewer } from "@/lib/viewer";
import { getAllTasks, type TaskRow } from "@/lib/queries";
import { gatherCockpitNow } from "@/lib/cockpit-now";
import { taskHref } from "@/lib/task-href";
import { StudioShell, type StudioFootNote } from "./shell";

/**
 * Server half of the Studio footer. Its left corner is "What needs you now"
 * (owner, 25 Sept 2026): the few things worth acting on, most urgent first —
 * late tasks, the next meeting today, what is due today, unread updates, the
 * next deadline — which the footer steps through, each a door to the place
 * that deals with it. For a director, all of it is their companies only.
 *
 * ⚠️ OWNER OR DIRECTOR ONLY. The root layout renders this on EVERY page (the
 * portal and the public /e/ /r/ links too) and hides it only on the client, so
 * anyone else gets an empty footer and none of this data leaves the server
 * (portal audit, 25 Sept 2026). Decoration: a failure shows nothing.
 */
export async function StudioShellServer() {
  const v = await getViewer();
  if (!v) return <StudioShell needs={[]} />;
  let needs: NonNullable<StudioFootNote>[] = [];
  try {
    needs = await whatNeedsYou(v);
  } catch {
    /* decoration — never block the page */
  }
  const director = v.kind === "director" ? { name: v.name, outbox: !!v.person.caps.navOutbox, createTasks: !!v.person.caps.createTasks, brief: !!v.person.caps.directorBrief, cleaning: !!v.person.caps.cleaningOverview, role: v.role === "manager" ? "Manager" : "Director" } : null;
  return <StudioShell needs={needs} director={director} />;
}

const DAY = 86_400_000;
const eatDay = (ms: number) => Math.floor((ms + 3 * 3_600_000) / DAY);
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

async function whatNeedsYou(v: Viewer): Promise<NonNullable<StudioFootNote>[]> {
  const scope = v.scope;
  const [all, views, now] = await Promise.all([
    getAllTasks(),
    sb.from("task_views").select("task_id,last_viewed_at").eq("viewer", v.kind === "director" ? `person:${v.person.id}` : "admin"),
    // The diary is the owner's today; a director's calendar comes with their view of it.
    v.kind === "owner" ? gatherCockpitNow().catch(() => null) : Promise.resolve(null),
  ]);
  const rows = (scope ? all.filter((r) => scope.includes(r.companyId)) : all)
    .filter((r) => r.status !== "Completed" && r.status !== "Closed");
  const nowMs = Date.now();
  const today = eatDay(nowMs);
  const isLate = (r: TaskRow) => r.flag === "overdue" || r.flag === "escalate-now";

  const out: NonNullable<StudioFootNote>[] = [];

  const late = rows.filter(isLate);
  if (late.length) out.push({ label: "Needs you", text: plural(late.length, "task is late", "tasks are late"), href: "/?tab=tasks&flag=overdue", tone: "late" });

  const next = now?.events
    .filter((e) => !e.allDay && new Date(e.startAt).getTime() > nowMs)
    .sort((a, b) => a.startAt.localeCompare(b.startAt))[0];
  if (next) {
    const at = new Date(next.startAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Nairobi" });
    out.push({ label: "Next meeting", text: `${at} · ${next.title}`, href: "/calendar", tone: "info" });
  }

  const dueToday = rows.filter((r) => !isLate(r) && r.deadline && eatDay(r.deadline.getTime()) === today);
  if (dueToday.length) {
    out.push(dueToday.length === 1
      ? { label: "Due today", text: dueToday[0].actionItem, href: taskHref(dueToday[0].code), tone: "soon" }
      : { label: "Due today", text: plural(dueToday.length, "task", "tasks"), href: "/?tab=tasks&flag=due-soon", tone: "soon" });
  }

  // Unread = the same rule as the Tasks page: someone has updated it since
  // this viewer last opened it (a task with no updates never counts).
  const seen = new Map((views.data ?? []).map((r) => [r.task_id as number, new Date(r.last_viewed_at as string).getTime()]));
  const unread = rows.filter((r) => {
    const upd = r.lastUpdatedAt?.getTime() ?? 0;
    const s = seen.get(r.id);
    return !!r.latestUpdate && upd > 0 && (s === undefined || upd > s);
  });
  if (unread.length) out.push({ label: "Unread", text: plural(unread.length, "update to read", "updates to read"), href: "/?tab=tasks&unread=1", tone: "info" });

  const upcoming = rows
    .filter((r) => r.deadline && eatDay(r.deadline.getTime()) > today)
    .sort((a, b) => a.deadline!.getTime() - b.deadline!.getTime())[0];
  if (upcoming) {
    const when = upcoming.deadline!.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "Africa/Nairobi" }).replace(",", "");
    out.push({ label: "Next deadline", text: `${when} · ${upcoming.actionItem}`, href: taskHref(upcoming.code) });
  }

  if (!out.length) out.push({ label: "All clear", text: "Nothing needs you right now" });
  return out;
}

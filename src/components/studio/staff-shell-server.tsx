import type { PortalPerson } from "@/lib/portal-auth";
import { visibleTaskIds } from "@/lib/portal-auth";
import { getAllTasks, type TaskRow } from "@/lib/queries";
import { portalRoleBadge } from "@/lib/portal-labels";
import { StudioShell, type StudioFootNote } from "./shell";

/**
 * The Studio footer for a member of STAFF (26 Sept 2026). The portal layout
 * draws it on the pages rebuilt for staff; the root layout's own footer stays
 * hidden on /portal. Its left corner is the same "what needs you now", from
 * their own tasks only. Decoration: a failure shows nothing.
 */
const DAY = 86_400_000;
const eatDay = (ms: number) => Math.floor((ms + 3 * 3_600_000) / DAY);
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export async function StaffShellServer({ me }: { me: PortalPerson }) {
  let needs: NonNullable<StudioFootNote>[] = [];
  try {
    const [all, ids] = await Promise.all([getAllTasks(), visibleTaskIds(me)]);
    const mine = new Set(ids);
    const rows = all.filter((r) => mine.has(r.id) && r.status !== "Completed" && r.status !== "Closed");
    const isLate = (r: TaskRow) => r.flag === "overdue" || r.flag === "escalate-now";
    const today = eatDay(Date.now());
    const late = rows.filter(isLate);
    if (late.length) needs.push(late.length === 1
      ? { label: "Late", text: late[0].actionItem, href: `/portal/task/${encodeURIComponent(late[0].code)}`, tone: "late" }
      : { label: "Needs you", text: plural(late.length, "task is late", "tasks are late"), href: "/portal/tasks?flag=overdue", tone: "late" });
    const dueToday = rows.filter((r) => !isLate(r) && r.deadline && eatDay(r.deadline.getTime()) === today);
    if (dueToday.length) needs.push(dueToday.length === 1
      ? { label: "Due today", text: dueToday[0].actionItem, href: `/portal/task/${encodeURIComponent(dueToday[0].code)}`, tone: "soon" }
      : { label: "Due today", text: plural(dueToday.length, "task", "tasks"), href: "/portal/tasks?flag=due-soon", tone: "soon" });
  } catch {
    needs = [];
  }
  return <StudioShell needs={needs} director={{ name: me.name, role: [portalRoleBadge(me.portalRole, me.portalDesignation), me.role].filter(Boolean).join(" · "), outbox: false, createTasks: false, brief: false, staff: true, staffTasks: me.caps.navTasks, staffCleaning: me.caps.cleaningLog }} />;
}

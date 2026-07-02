import "server-only";
import { getAllTasks } from "@/lib/queries";
import { getCompanyLogoMap } from "@/lib/company-brand";
import { portalUpdateAuthor } from "@/lib/update-author";
import type { CommandTask } from "@/components/portal-tasks-command";

const CLOSED = new Set(["Completed", "Closed"]);

/** Short "2d ago" / "5h ago" relative time for the latest-update line. */
function relTime(iso: string, now: Date): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const mins = Math.round((now.getTime() - then) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 7) return `${days}d ago`;
  const wks = Math.round(days / 7);
  if (wks < 5) return `${wks}w ago`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

/** Build the Aurora command-view task list (the SAME shape for every portal role)
 *  from `getAllTasks`, filtered to the viewer's visible task ids. Owner, status,
 *  priority, deadline, the overdue flag and the latest update match task management
 *  exactly. `viewerId` drives the "mine" flag. */
export async function buildCommandTasks(ids: number[], viewerId: number, viewerName = ""): Promise<CommandTask[]> {
  const idSet = new Set(ids);
  const [allRows, logoMap] = await Promise.all([getAllTasks(), getCompanyLogoMap()]);
  const rows = allRows.filter((r) => idSet.has(r.id));

  const now = new Date();
  const t0 = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dayMs = 86400000;
  const toInput = (d: Date | null) =>
    d ? new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10) : null;

  return rows.map((r): CommandTask => {
    const isDone = CLOSED.has(r.status);
    const overdue = r.flag === "overdue" || r.flag === "escalate-now";
    const dl = r.deadline;
    const dlDay = dl ? new Date(dl.getFullYear(), dl.getMonth(), dl.getDate()) : null;
    const diff = dlDay ? Math.round((dlDay.getTime() - t0.getTime()) / dayMs) : null;
    const withinSoon = !isDone && !overdue && diff != null && diff >= 0 && diff <= 7;
    const dueLabel = diff == null ? null : diff < 0 ? `${Math.abs(diff)}d overdue` : diff === 0 ? "due today" : `in ${diff}d`;
    const ownerName = r.owner || r.assignees[0] || null;
    const accountableId = r.ownerId ?? r.assigneeIds[0] ?? null;
    const act = r.latestActivity;
    const note = act ? act.body : (r.latestUpdate || null);
    const mine = (r.ownerId === viewerId) || r.assigneeIds.includes(viewerId);
    return {
      taskId: r.id,
      code: r.code,
      actionItem: r.actionItem,
      createdByPersonId: r.createdByPersonId,
      requiresAttachment: r.requiresAttachment,
      companyId: r.companyId,
      companyName: r.companyName,
      companyAccent: r.companyAccent,
      companyLogoUrl: logoMap.get(r.companyId) ?? null,
      overdue,
      priority: r.priority,
      dueLabel,
      deadlineInput: toInput(r.deadline),
      accountableId,
      accountableName: ownerName,
      leadIds: r.leadIds.length ? r.leadIds : (accountableId != null ? [accountableId] : []),
      assignees: r.assignees,
      assigneeIds: r.assigneeIds,
      description: r.comments?.trim() || null,
      category: r.category ?? null,
      risk: r.risk ?? null,
      escalated: (r.escalation ?? "No") === "Yes",
      status: r.status,
      statusLabel: r.status,
      note: note ? note.slice(0, 160) : null,
      updateAuthor: act ? portalUpdateAuthor(act.by, viewerName) : null,
      updateAgo: act ? relTime(act.atISO, now) : null,
      raisedByMe: mine,
      isDone,
      withinSoon,
      // Recency signal (latest of created / updated / newest activity) — drives
      // "most recent first" ordering within every group.
      sortAt: r.lastActivityISO,
      closedAt: r.closedDate ? r.closedDate.toISOString() : null,
    };
  });
}

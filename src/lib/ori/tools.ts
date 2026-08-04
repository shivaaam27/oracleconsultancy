import "server-only";
import { sb } from "@/db/supabase";
import { escapeLike, insertTaskWithUniqueCodeSb } from "@/lib/db-helpers";
import { reindexEntity } from "@/lib/index-hooks";
import { createCalendarEvent, updateCalendarEvent } from "@/lib/calendar";
import { setTaskBlocker, clearTaskBlocker, adminTogglePin } from "@/app/task/actions";
import { setProbationDateAction } from "@/app/people/actions";
import { recordAttendanceAction } from "@/app/hrms/leave/actions";
import { renameDocumentAction, archiveDocumentAction } from "@/app/documents/actions";
import { cancelEventAction } from "@/app/calendar/actions";
import { publishAnnouncementAction } from "@/app/announcements/actions";
import { adminRemindTask, deleteTaskQuick } from "@/app/task/actions";
import { sendDraftEmail } from "@/app/outbox/actions";
import { canAutoSend, type SendChannel } from "@/lib/guardrails";
// Domain tool arrays — each REUSES existing server actions/helpers and mirrors the
// ToolDef shape; spread into TOOLS below so they auto-register into TOOL_BY_NAME.
import { PEOPLE_TOOLS } from "@/lib/ori/tools-people";
import { DOCUMENT_TOOLS } from "@/lib/ori/tools-documents";
import { CALENDAR_TOOLS } from "@/lib/ori/tools-calendar";
import { GOVERNANCE_TOOLS } from "@/lib/ori/tools-governance";
import { OPS_TOOLS } from "@/lib/ori/tools-ops";
import { PORTAL_TOOLS } from "@/lib/ori/tools-portal";
import { WATCHER_TOOLS } from "@/lib/ori/tools-watchers";
import { SMART_TOOLS } from "@/lib/ori/tools-smart";

/**
 * ORI tool registry (Phase 0 of the "complete brain" plan). A tool is one typed
 * capability ORI can call from the agent loop (src/lib/ori/agent.ts). Each tool
 * declares:
 *   - a machine name + description (fed to the planner so it knows what exists),
 *   - the parameters it accepts (name → {type, required, description}) so the
 *     planner fills them and we can ASK for the ones still missing,
 *   - a safety `tier`: 1 read · 2 internal write · 3 outward/destructive (send/
 *     publish/delete). Tier ≥2 always needs the owner's confirm before it runs.
 *   - `run(args)` — performs the action and returns a human-readable result.
 *
 * This is the single source of "what ORI can do"; the agent, the confirm preview
 * and (later) the portals all derive from it. Adding a capability = one ToolDef.
 */

export type ToolTier = 1 | 2 | 3;
export type ToolParam = { type: "string" | "number" | "date" | "string[]"; required: boolean; description: string };
/** An executed write can carry an `undo` spec — a registered undo-handler kind +
 *  the payload to reverse it. The /api/ori route turns it into an undo token the
 *  owner can one-tap to reverse the step. Reuses the app's undo framework. */
export type ToolResult = { ok: boolean; message: string; redirect?: string; undo?: { kind: string; payload: unknown } };
export type ToolDef = {
  name: string;
  tier: ToolTier;
  description: string;
  params: Record<string, ToolParam>;
  run: (args: Record<string, unknown>) => Promise<ToolResult>;
};

export const nowIso = () => new Date().toISOString();
export const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

const WEEKDAY_INDEX: Record<string, number> = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
const WEEKDAY_NAME = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/* ------------------------------- resolvers ------------------------------- */

export async function resolveCompany(name: string): Promise<{ id: number; code: string; name: string } | null> {
  const token = str(name);
  if (!token) return null;
  const safe = escapeLike(token);
  const { data: exact } = await sb.from("companies").select("id,code,name").ilike("name", safe).limit(1).maybeSingle();
  if (exact) return { id: exact.id as number, code: exact.code as string, name: exact.name as string };
  const { data } = await sb.from("companies").select("id,code,name").ilike("name", `%${safe}%`).limit(1).maybeSingle();
  return data ? { id: data.id as number, code: data.code as string, name: data.name as string } : null;
}

export async function resolvePerson(name: string): Promise<{ id: number; name: string } | null> {
  const token = str(name);
  if (!token) return null;
  const { data } = await sb.from("people").select("id,name").eq("active", true).ilike("name", `%${escapeLike(token)}%`).limit(1).maybeSingle();
  return data ? { id: data.id as number, name: data.name as string } : null;
}

export async function resolveTask(code: string): Promise<{ id: number; code: string; company_id: number; status: string } | null> {
  const token = str(code);
  if (!token) return null;
  const { data } = await sb.from("tasks").select("id,code,company_id,status").ilike("code", escapeLike(token)).maybeSingle();
  return (data as { id: number; code: string; company_id: number; status: string } | null) ?? null;
}

/** Snapshot a task's full field set + assignees BEFORE a mutation, shaped for the
 *  existing "task.update" undo handler (undo-handlers/tasks.ts) so a status change
 *  or reassignment is one-tap reversible. */
export async function snapshotTaskForUndo(taskId: number): Promise<{ kind: string; payload: unknown } | undefined> {
  const { data: t } = await sb.from("tasks")
    .select("id,code,company_id,action_item,department_id,status,priority,risk,escalation,category,deadline,meeting_date,comments,latest_update,last_updated_at,closed_date")
    .eq("id", taskId).maybeSingle();
  if (!t) return undefined;
  const { data: as } = await sb.from("task_assignees").select("person_id").eq("task_id", taskId);
  const r = t as Record<string, unknown>;
  return {
    kind: "task.update",
    payload: {
      taskId, taskCode: r.code, companyId: r.company_id,
      before: {
        actionItem: r.action_item, departmentId: r.department_id, status: r.status, priority: r.priority,
        risk: r.risk, escalation: r.escalation, category: r.category, deadline: r.deadline,
        meetingDate: r.meeting_date, comments: r.comments, latestUpdate: r.latest_update,
        lastUpdatedAt: r.last_updated_at, closedDate: r.closed_date,
      },
      beforeAssignees: ((as ?? []) as { person_id: number }[]).map((x) => x.person_id),
    },
  };
}

/** Snapshot a task's owner + assignees for undo (reuses the ori.task.reassign
 *  handler, which restores owner_id — unchanged here — and the assignee list). */
async function snapshotAssigneesForUndo(taskId: number): Promise<{ kind: string; payload: unknown }> {
  const { data: bt } = await sb.from("tasks").select("owner_id,last_updated_at").eq("id", taskId).maybeSingle();
  const { data: ba } = await sb.from("task_assignees").select("person_id").eq("task_id", taskId);
  return {
    kind: "ori.task.reassign",
    payload: {
      taskId,
      prevOwnerId: (bt as { owner_id?: number | null })?.owner_id ?? null,
      prevLastUpdatedAt: (bt as { last_updated_at?: string | null })?.last_updated_at ?? null,
      prevAssignees: ((ba ?? []) as { person_id: number }[]).map((x) => x.person_id),
    },
  };
}

/** Insert an ORI automation rule; returns the new rule id (or null on failure).
 *  taskId may be null for rules that aren't bound to one task (recurring_task). */
async function createRule(taskId: number | null, companyId: number | null, kind: string, config: Record<string, unknown>): Promise<number | null> {
  const { data, error } = await sb.from("automation_rules").insert({
    task_id: taskId, company_id: companyId, kind, config, active: true, done: false,
    created_by: "ai-command", created_at: nowIso(),
  }).select("id").single();
  return error ? null : (data.id as number);
}

export async function resolveDocument(ref: string): Promise<{ id: number; title: string; archived: boolean } | null> {
  const token = str(ref);
  if (!token) return null;
  // Numeric ref → id; else fuzzy title match on non-archived docs.
  if (/^\d+$/.test(token)) {
    const { data } = await sb.from("documents").select("id,title,archived").eq("id", Number(token)).maybeSingle();
    return data ? { id: data.id as number, title: (data.title as string) ?? "", archived: Boolean(data.archived) } : null;
  }
  const { data } = await sb.from("documents").select("id,title,archived").ilike("title", `%${escapeLike(token)}%`).order("updated_at", { ascending: false }).limit(1).maybeSingle();
  return data ? { id: data.id as number, title: (data.title as string) ?? "", archived: Boolean(data.archived) } : null;
}

export async function resolveEvent(ref: string): Promise<{ id: number; title: string } | null> {
  const token = str(ref);
  if (!token) return null;
  if (/^\d+$/.test(token)) {
    const { data } = await sb.from("calendar_events").select("id,title").eq("id", Number(token)).maybeSingle();
    return data ? { id: data.id as number, title: (data.title as string) ?? "" } : null;
  }
  const { data } = await sb.from("calendar_events").select("id,title").neq("status", "cancelled").ilike("title", `%${escapeLike(token)}%`).order("start_at", { ascending: false }).limit(1).maybeSingle();
  return data ? { id: data.id as number, title: (data.title as string) ?? "" } : null;
}

/** Parse a natural deadline the planner passes as an ISO date OR "in N days".
 *  The planner is told today's date, so it should send ISO; this is a backstop. */
export function parseDeadline(v: unknown): Date | null {
  const s = str(v);
  if (!s) return null;
  const rel = s.match(/in\s+(\d+)\s*days?/i);
  if (rel) { const d = new Date(); d.setDate(d.getDate() + Number(rel[1])); return d; }
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(s) ? `${s}T09:00:00+03:00` : s);
  return isNaN(d.getTime()) ? null : d;
}

/* --------------------------------- tools --------------------------------- */

export const TOOLS: ToolDef[] = [
  {
    name: "create_task",
    tier: 2,
    description: "Create a new task for a company, optionally with a deadline, priority and assignees.",
    params: {
      company: { type: "string", required: true, description: "Which portfolio company the task is for (name)." },
      title: { type: "string", required: true, description: "What the task is — the action item." },
      deadline: { type: "date", required: false, description: "Due date as YYYY-MM-DD (or 'in N days')." },
      priority: { type: "string", required: false, description: "Critical | High | Medium | Low." },
      assignees: { type: "string[]", required: false, description: "People to assign, by name." },
    },
    async run(args) {
      const company = await resolveCompany(str(args.company));
      if (!company) return { ok: false, message: `Couldn't match a company called "${str(args.company)}".` };
      const title = str(args.title);
      if (!title) return { ok: false, message: "The task needs a title." };
      const priority = ["Critical", "High", "Medium", "Low"].includes(str(args.priority)) ? str(args.priority) : "Medium";
      const now = new Date();
      const task = await insertTaskWithUniqueCodeSb(company.id, company.code, {
        actionItem: title, status: "Not Started", priority, escalation: "No",
        deadline: parseDeadline(args.deadline), createdDate: now, lastUpdatedAt: now, archived: false,
      });
      const names: string[] = [];
      const list = Array.isArray(args.assignees) ? (args.assignees as unknown[]) : [];
      for (const a of list) {
        const p = await resolvePerson(str(a));
        if (p) { await sb.from("task_assignees").upsert({ task_id: task.id, person_id: p.id }, { ignoreDuplicates: true }); names.push(p.name); }
      }
      await sb.from("audit_log").insert({ task_id: task.id, task_code: task.code, company_id: company.id, entry_type: "CREATE", field: "Task", old_value: null, new_value: title, change_reason: "Created via ORI", created_at: nowIso(), created_by: "ai-command" });
      void reindexEntity("task", task.id);
      const who = names.length ? ` · assigned to ${names.join(", ")}` : "";
      return { ok: true, message: `Created ${task.code}: ${title}${who}`, redirect: `/task/${task.code}`, undo: { kind: "task.create", payload: { taskId: task.id } } };
    },
  },
  {
    name: "add_task_update",
    tier: 2,
    description: "Add a progress update / note to a task, optionally moving its status.",
    params: {
      taskCode: { type: "string", required: true, description: "The task code, e.g. DAR-007." },
      body: { type: "string", required: true, description: "The update text." },
      status: { type: "string", required: false, description: "Optional new status." },
    },
    async run(args) {
      const t = await resolveTask(str(args.taskCode));
      if (!t) return { ok: false, message: `Task ${str(args.taskCode)} not found.` };
      const body = str(args.body);
      if (!body) return { ok: false, message: "The update is empty." };
      // Snapshot the fields the update touches so it can be reversed.
      const { data: bt } = await sb.from("tasks").select("latest_update,last_updated_at,status,closed_date").eq("id", t.id).maybeSingle();
      const before = (bt as Record<string, unknown>) ?? {};
      const { data: ins } = await sb.from("task_updates").insert({ task_id: t.id, body, created_at: nowIso(), created_by: "ai-command" }).select("id").single();
      const patch: Record<string, unknown> = { latest_update: body, last_updated_at: nowIso() };
      const status = str(args.status);
      if (status && status !== t.status) patch.status = status;
      await sb.from("tasks").update(patch).eq("id", t.id);
      void reindexEntity("task", t.id);
      const undo = ins?.id
        ? { kind: "task.update.add", payload: { taskUpdateId: ins.id, taskId: t.id, taskCode: t.code, companyId: t.company_id, before: { latestUpdate: before.latest_update ?? null, lastUpdatedAt: before.last_updated_at ?? null, status: before.status ?? t.status, closedDate: before.closed_date ?? null } } }
        : undefined;
      return { ok: true, message: `Added an update to ${t.code}${status ? ` and set it to ${status}` : ""}.`, redirect: `/task/${t.code}`, undo };
    },
  },
  {
    name: "set_task_status",
    tier: 2,
    description: "Change a task's status.",
    params: {
      taskCode: { type: "string", required: true, description: "The task code." },
      status: { type: "string", required: true, description: "Not Started | In Progress | Under Review | Blocked | Waiting External | Escalated | Completed | Closed." },
    },
    async run(args) {
      const t = await resolveTask(str(args.taskCode));
      if (!t) return { ok: false, message: `Task ${str(args.taskCode)} not found.` };
      const valid = ["Not Started", "In Progress", "Under Review", "Blocked", "Waiting External", "Escalated", "Completed", "Closed"];
      const status = str(args.status);
      if (!valid.includes(status)) return { ok: false, message: `"${status}" isn't a valid status.` };
      const undo = await snapshotTaskForUndo(t.id);
      const patch: Record<string, unknown> = { status, last_updated_at: nowIso() };
      const isClosed = status === "Completed" || status === "Closed";
      const wasClosed = t.status === "Completed" || t.status === "Closed";
      if (isClosed && !wasClosed) patch.closed_date = nowIso();
      else if (!isClosed && wasClosed) patch.closed_date = null;
      await sb.from("tasks").update(patch).eq("id", t.id);
      void reindexEntity("task", t.id);
      return { ok: true, message: `${t.code} → ${status}.`, redirect: `/task/${t.code}`, undo };
    },
  },
  {
    name: "reassign_task",
    tier: 2,
    description: "Reassign a task to a person (becomes owner and sole assignee).",
    params: {
      taskCode: { type: "string", required: true, description: "The task code." },
      assignee: { type: "string", required: true, description: "The person to reassign to, by name." },
    },
    async run(args) {
      const t = await resolveTask(str(args.taskCode));
      if (!t) return { ok: false, message: `Task ${str(args.taskCode)} not found.` };
      const p = await resolvePerson(str(args.assignee));
      if (!p) return { ok: false, message: `Couldn't find an active person called "${str(args.assignee)}".` };
      // Snapshot owner + assignees (the shared task.update handler doesn't restore
      // owner_id, so reassign has its own undo kind).
      const { data: bt } = await sb.from("tasks").select("owner_id,last_updated_at").eq("id", t.id).maybeSingle();
      const { data: ba } = await sb.from("task_assignees").select("person_id").eq("task_id", t.id);
      const undo = {
        kind: "ori.task.reassign",
        payload: {
          taskId: t.id,
          prevOwnerId: (bt as { owner_id?: number | null })?.owner_id ?? null,
          prevLastUpdatedAt: (bt as { last_updated_at?: string | null })?.last_updated_at ?? null,
          prevAssignees: ((ba ?? []) as { person_id: number }[]).map((x) => x.person_id),
        },
      };
      await sb.from("tasks").update({ owner_id: p.id, last_updated_at: nowIso() }).eq("id", t.id);
      await sb.from("task_assignees").delete().eq("task_id", t.id);
      await sb.from("task_assignees").upsert({ task_id: t.id, person_id: p.id }, { ignoreDuplicates: true });
      void reindexEntity("task", t.id);
      return { ok: true, message: `Reassigned ${t.code} to ${p.name}.`, redirect: `/task/${t.code}`, undo };
    },
  },
  {
    name: "add_assignees",
    tier: 2,
    description: "Add one or more people to a task's assignees (without removing the existing ones).",
    params: {
      taskCode: { type: "string", required: true, description: "The task code." },
      assignees: { type: "string[]", required: true, description: "People to add, by name." },
    },
    async run(args) {
      const t = await resolveTask(str(args.taskCode));
      if (!t) return { ok: false, message: `Task ${str(args.taskCode)} not found.` };
      const undo = await snapshotAssigneesForUndo(t.id);
      const list = Array.isArray(args.assignees) ? (args.assignees as unknown[]) : [];
      const added: string[] = [];
      const missed: string[] = [];
      for (const a of list) {
        const name = str(a);
        if (!name) continue;
        const p = await resolvePerson(name);
        if (p) { await sb.from("task_assignees").upsert({ task_id: t.id, person_id: p.id }, { ignoreDuplicates: true }); added.push(p.name); }
        else missed.push(name);
      }
      if (added.length === 0) return { ok: false, message: `Couldn't match ${missed.length ? missed.join(", ") : "anyone"} to add.` };
      await sb.from("tasks").update({ last_updated_at: nowIso() }).eq("id", t.id);
      void reindexEntity("task", t.id);
      const tail = missed.length ? ` (couldn't match ${missed.join(", ")})` : "";
      return { ok: true, message: `Added ${added.join(", ")} to ${t.code}${tail}.`, redirect: `/task/${t.code}`, undo };
    },
  },
  {
    name: "remove_assignees",
    tier: 2,
    description: "Remove one or more people from a task's assignees.",
    params: {
      taskCode: { type: "string", required: true, description: "The task code." },
      assignees: { type: "string[]", required: true, description: "People to remove, by name." },
    },
    async run(args) {
      const t = await resolveTask(str(args.taskCode));
      if (!t) return { ok: false, message: `Task ${str(args.taskCode)} not found.` };
      const undo = await snapshotAssigneesForUndo(t.id);
      const list = Array.isArray(args.assignees) ? (args.assignees as unknown[]) : [];
      const removed: string[] = [];
      for (const a of list) {
        const name = str(a);
        if (!name) continue;
        const p = await resolvePerson(name);
        if (p) { await sb.from("task_assignees").delete().eq("task_id", t.id).eq("person_id", p.id); removed.push(p.name); }
      }
      if (removed.length === 0) return { ok: false, message: "Couldn't match anyone to remove." };
      await sb.from("tasks").update({ last_updated_at: nowIso() }).eq("id", t.id);
      void reindexEntity("task", t.id);
      return { ok: true, message: `Removed ${removed.join(", ")} from ${t.code}.`, redirect: `/task/${t.code}`, undo };
    },
  },
  {
    name: "create_event",
    tier: 2,
    description: "Create a calendar event / meeting.",
    params: {
      title: { type: "string", required: true, description: "Event title." },
      date: { type: "date", required: true, description: "Date as YYYY-MM-DD." },
      time: { type: "string", required: false, description: "Start time HH:MM (24h); omit for all-day." },
      company: { type: "string", required: false, description: "Company the event relates to." },
      location: { type: "string", required: false, description: "Where it is." },
    },
    async run(args) {
      const title = str(args.title);
      if (!title) return { ok: false, message: "The event needs a title." };
      const dateStr = /^\d{4}-\d{2}-\d{2}$/.test(str(args.date)) ? str(args.date) : new Date().toISOString().slice(0, 10);
      const time = str(args.time);
      const allDay = !time;
      const startAt = new Date(`${dateStr}T${allDay ? "09:00" : time}:00+03:00`);
      const endAt = new Date(startAt.getTime() + 60 * 60 * 1000);
      let companyId: number | undefined;
      if (str(args.company)) { const c = await resolveCompany(str(args.company)); if (c) companyId = c.id; }
      const ev = await createCalendarEvent({ title, companyId, location: str(args.location) || undefined, startAt, endAt, allDay, source: "manual", createdBy: "ai-command" });
      return { ok: true, message: `Scheduled "${title}" for ${startAt.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}${allDay ? "" : ` at ${time}`}.`, redirect: "/calendar", undo: { kind: "ori.event.create", payload: { eventId: ev.id } } };
    },
  },
  {
    name: "draft_announcement",
    tier: 2,
    description: "Create a DRAFT announcement for review (never auto-published).",
    params: {
      title: { type: "string", required: true, description: "Announcement headline." },
      body: { type: "string", required: true, description: "The message." },
    },
    async run(args) {
      const title = str(args.title);
      const body = str(args.body);
      if (!title && !body) return { ok: false, message: "Tell me what to announce." };
      const { data, error } = await sb.from("announcements").insert({
        title: title || "Untitled announcement", body: body || title, type: "operational",
        audience_kind: "all", status: "draft", created_by: "ai-command", created_at: nowIso(),
      }).select("id").single();
      if (error) return { ok: false, message: error.message };
      return { ok: true, message: `Drafted the announcement "${title || "Untitled"}" — review and publish when ready.`, redirect: `/announcements?edit=${data.id}`, undo: { kind: "ori.announcement.draft", payload: { announcementId: data.id } } };
    },
  },
  {
    name: "remind_before_deadline",
    tier: 2,
    description: "Set a STANDING RULE to remind a task's assignees a set number of days before its deadline. Fires automatically once approved.",
    params: {
      taskCode: { type: "string", required: true, description: "The task code." },
      daysBefore: { type: "number", required: false, description: "How many days before the deadline to remind (default 1)." },
      channel: { type: "string", required: false, description: "email | push | whatsapp (default push)." },
    },
    async run(args) {
      const t = await resolveTask(str(args.taskCode));
      if (!t) return { ok: false, message: `Task ${str(args.taskCode)} not found.` };
      const daysBefore = Math.max(0, Math.round(Number(args.daysBefore) || 1));
      const channel = str(args.channel) || "push";
      const rule = await createRule(t.id, t.company_id, "reminder_before_deadline", { daysBefore, channel });
      if (!rule) return { ok: false, message: "Couldn't save that reminder rule." };
      return { ok: true, message: `Reminder set: I'll nudge ${t.code}'s assignees ${daysBefore} day${daysBefore === 1 ? "" : "s"} before the deadline.`, redirect: `/task/${t.code}`, undo: { kind: "ori.automation.create", payload: { ruleId: rule } } };
    },
  },
  {
    name: "nudge_until_update",
    tier: 2,
    description: "Set a STANDING RULE to nudge a task's assignees at set times each day UNTIL they post an update. Fires automatically once approved.",
    params: {
      taskCode: { type: "string", required: true, description: "The task code." },
      times: { type: "string[]", required: false, description: "Times of day HH:MM (default 09:00 and 14:00)." },
    },
    async run(args) {
      const t = await resolveTask(str(args.taskCode));
      if (!t) return { ok: false, message: `Task ${str(args.taskCode)} not found.` };
      const times = (Array.isArray(args.times) ? (args.times as unknown[]).map(str).filter((s) => /^\d{1,2}:\d{2}$/.test(s)) : []);
      const rule = await createRule(t.id, t.company_id, "nudge_until_update", { times: times.length ? times : ["09:00", "14:00"] });
      if (!rule) return { ok: false, message: "Couldn't save that nudge rule." };
      const when = times.length ? times.join(" & ") : "09:00 & 14:00";
      return { ok: true, message: `Nudge set: I'll remind ${t.code}'s assignees at ${when} each day until they post an update.`, redirect: `/task/${t.code}`, undo: { kind: "ori.automation.create", payload: { ruleId: rule } } };
    },
  },
  {
    name: "escalate_if_no_update",
    tier: 2,
    description: "Set a STANDING RULE to escalate a task and notify a director/manager if there's no update within N days. Fires automatically once approved.",
    params: {
      taskCode: { type: "string", required: true, description: "The task code." },
      afterDays: { type: "number", required: false, description: "Escalate if no update within this many days (default 1)." },
      escalateTo: { type: "string", required: true, description: "Who to escalate to (the director/manager), by name." },
    },
    async run(args) {
      const t = await resolveTask(str(args.taskCode));
      if (!t) return { ok: false, message: `Task ${str(args.taskCode)} not found.` };
      const person = await resolvePerson(str(args.escalateTo));
      if (!person) return { ok: false, message: `Couldn't find a person called "${str(args.escalateTo)}" to escalate to.` };
      const afterDays = Math.max(0, Math.round(Number(args.afterDays) || 1));
      const rule = await createRule(t.id, t.company_id, "escalate_if_no_update", { afterDays, escalateToPersonId: person.id });
      if (!rule) return { ok: false, message: "Couldn't save that escalation rule." };
      return { ok: true, message: `Escalation set: if ${t.code} has no update in ${afterDays} day${afterDays === 1 ? "" : "s"}, I'll escalate it and alert ${person.name}.`, redirect: `/task/${t.code}`, undo: { kind: "ori.automation.create", payload: { ruleId: rule } } };
    },
  },
  {
    name: "schedule_event_after_deadline",
    tier: 2,
    description: "Set a STANDING RULE to create a calendar event automatically once a task's deadline passes. Fires automatically once approved.",
    params: {
      taskCode: { type: "string", required: true, description: "The task code." },
      title: { type: "string", required: true, description: "Title for the event to create." },
      time: { type: "string", required: false, description: "Event start time HH:MM (omit for all-day)." },
      location: { type: "string", required: false, description: "Where the event is." },
    },
    async run(args) {
      const t = await resolveTask(str(args.taskCode));
      if (!t) return { ok: false, message: `Task ${str(args.taskCode)} not found.` };
      const title = str(args.title);
      if (!title) return { ok: false, message: "What should the event be called?" };
      const rule = await createRule(t.id, t.company_id, "create_event_after_deadline", { title, time: str(args.time) || undefined, location: str(args.location) || undefined });
      if (!rule) return { ok: false, message: "Couldn't save that event rule." };
      return { ok: true, message: `Scheduled: once ${t.code}'s deadline passes, I'll create the event "${title}".`, redirect: `/task/${t.code}`, undo: { kind: "ori.automation.create", payload: { ruleId: rule } } };
    },
  },

  {
    name: "auto_close_stale",
    tier: 2,
    description: "Set a STANDING RULE to automatically CLOSE a task if it goes untouched (no update) for N days. Optionally only while it sits in a given status (e.g. 'Waiting External'). Fires automatically once approved; the close is logged and reversible.",
    params: {
      taskCode: { type: "string", required: true, description: "The task code." },
      staleDays: { type: "number", required: false, description: "Close after this many days with no update (default 7)." },
      status: { type: "string", required: false, description: "Only close while the task is in this exact status (omit = any open status)." },
    },
    async run(args) {
      const t = await resolveTask(str(args.taskCode));
      if (!t) return { ok: false, message: `Task ${str(args.taskCode)} not found.` };
      const staleDays = Math.max(1, Math.round(Number(args.staleDays) || 7));
      const statusMatch = str(args.status);
      const config: Record<string, unknown> = { staleDays };
      if (statusMatch) config.statusMatch = statusMatch;
      const rule = await createRule(t.id, t.company_id, "auto_close_stale", config);
      if (!rule) return { ok: false, message: "Couldn't save that auto-close rule." };
      const scope = statusMatch ? ` while it's "${statusMatch}"` : "";
      return { ok: true, message: `Auto-close set: if ${t.code} gets no update in ${staleDays} day${staleDays === 1 ? "" : "s"}${scope}, I'll close it.`, redirect: `/task/${t.code}`, undo: { kind: "ori.automation.create", payload: { ruleId: rule } } };
    },
  },
  {
    name: "auto_reassign_on_leave",
    tier: 2,
    description: "Set a STANDING RULE so that while a task's assignee is on APPROVED leave, the task is handed to a named fallback (or their manager) for the leave window, then handed back when they return. Fires automatically once approved.",
    params: {
      taskCode: { type: "string", required: true, description: "The task code." },
      fallback: { type: "string", required: false, description: "Who to cover the task while the assignee is on leave, by name (omit = their manager)." },
    },
    async run(args) {
      const t = await resolveTask(str(args.taskCode));
      if (!t) return { ok: false, message: `Task ${str(args.taskCode)} not found.` };
      const config: Record<string, unknown> = {};
      let coverName = "their manager";
      if (str(args.fallback)) {
        const p = await resolvePerson(str(args.fallback));
        if (!p) return { ok: false, message: `Couldn't find an active person called "${str(args.fallback)}" to cover.` };
        config.fallbackPersonId = p.id; coverName = p.name;
      }
      const rule = await createRule(t.id, t.company_id, "auto_reassign_on_leave", config);
      if (!rule) return { ok: false, message: "Couldn't save that leave-cover rule." };
      return { ok: true, message: `Leave cover set: while ${t.code}'s assignee is on approved leave, I'll hand it to ${coverName} and hand it back when they return.`, redirect: `/task/${t.code}`, undo: { kind: "ori.automation.create", payload: { ruleId: rule } } };
    },
  },
  {
    name: "recurring_task",
    tier: 2,
    description: "Set a STANDING RULE to CREATE a fresh task on a repeating cadence (e.g. every Monday, or the 1st of each month). Each occurrence is a brand-new task for the company. Fires automatically once approved.",
    params: {
      company: { type: "string", required: true, description: "Which portfolio company the recurring task is for (name)." },
      title: { type: "string", required: true, description: "What the task is each time — the action item." },
      cadence: { type: "string", required: true, description: "weekly | monthly." },
      weekday: { type: "string", required: false, description: "For weekly: Mon|Tue|Wed|Thu|Fri|Sat|Sun (default Mon)." },
      dayOfMonth: { type: "number", required: false, description: "For monthly: day of the month 1–31 (default 1)." },
      priority: { type: "string", required: false, description: "Critical | High | Medium | Low (default Medium)." },
      assignees: { type: "string[]", required: false, description: "People to assign each occurrence, by name." },
    },
    async run(args) {
      const company = await resolveCompany(str(args.company));
      if (!company) return { ok: false, message: `Couldn't match a company called "${str(args.company)}".` };
      const title = str(args.title);
      if (!title) return { ok: false, message: "The recurring task needs a title." };
      const cadence = /^month/i.test(str(args.cadence)) ? "monthly" : /^week/i.test(str(args.cadence)) ? "weekly" : "";
      if (!cadence) return { ok: false, message: "Cadence must be weekly or monthly." };
      const priority = ["Critical", "High", "Medium", "Low"].includes(str(args.priority)) ? str(args.priority) : "Medium";
      const config: Record<string, unknown> = { cadence, companyId: company.id, title, priority };
      let whenLabel: string;
      if (cadence === "weekly") {
        const wd = WEEKDAY_INDEX[str(args.weekday).slice(0, 3).toLowerCase()] ?? 1;
        config.weekday = wd;
        whenLabel = `every ${WEEKDAY_NAME[wd]}`;
      } else {
        const dom = Math.min(31, Math.max(1, Math.round(Number(args.dayOfMonth) || 1)));
        config.dayOfMonth = dom;
        whenLabel = `on day ${dom} of each month`;
      }
      const list = Array.isArray(args.assignees) ? (args.assignees as unknown[]) : [];
      const assigneeIds: number[] = [];
      const names: string[] = [];
      for (const a of list) { const p = await resolvePerson(str(a)); if (p) { assigneeIds.push(p.id); names.push(p.name); } }
      if (assigneeIds.length) config.assigneePersonIds = assigneeIds;
      const rule = await createRule(null, company.id, "recurring_task", config);
      if (!rule) return { ok: false, message: "Couldn't save that recurring-task rule." };
      const who = names.length ? `, assigned to ${names.join(", ")}` : "";
      return { ok: true, message: `Recurring task set: I'll create "${title}" for ${company.name} ${whenLabel}${who}.`, redirect: `/companies/${company.id}`, undo: { kind: "ori.automation.create", payload: { ruleId: rule } } };
    },
  },

  /* ============================ WAVE A ============================ */
  {
    name: "edit_task",
    tier: 2,
    description: "Edit a task's details — title, category, priority and/or risk. Only the fields you pass change.",
    params: {
      taskCode: { type: "string", required: true, description: "The task code." },
      title: { type: "string", required: false, description: "New action item / title." },
      category: { type: "string", required: false, description: "Finance | Operations | Marketing | HR | Legal | Technology | Sales | Admin | Meetings | Strategy | Other." },
      priority: { type: "string", required: false, description: "Critical | High | Medium | Low." },
      risk: { type: "string", required: false, description: "Critical | High | Medium | Low." },
    },
    async run(args) {
      const t = await resolveTask(str(args.taskCode));
      if (!t) return { ok: false, message: `Task ${str(args.taskCode)} not found.` };
      const patch: Record<string, unknown> = {};
      const title = str(args.title);
      if (title) patch.action_item = title;
      const category = str(args.category);
      if (category) patch.category = category;
      const priority = str(args.priority);
      if (["Critical", "High", "Medium", "Low"].includes(priority)) patch.priority = priority;
      if (formHas(args, "risk")) { const risk = str(args.risk); patch.risk = risk || null; }
      if (Object.keys(patch).length === 0) return { ok: false, message: "Tell me what to change (title, category, priority or risk)." };
      const undo = await snapshotTaskForUndo(t.id);
      patch.last_updated_at = nowIso();
      await sb.from("tasks").update(patch).eq("id", t.id);
      void reindexEntity("task", t.id);
      const changed = Object.keys(patch).filter((k) => k !== "last_updated_at").join(", ");
      return { ok: true, message: `Updated ${t.code} (${changed}).`, redirect: `/task/${t.code}`, undo };
    },
  },
  {
    name: "set_task_blocker",
    tier: 2,
    description: "Mark a task as Blocked, waiting on a specific person, with a reason.",
    params: {
      taskCode: { type: "string", required: true, description: "The task code." },
      person: { type: "string", required: true, description: "Who the task is blocked on, by name." },
      reason: { type: "string", required: true, description: "Why it's blocked." },
    },
    async run(args) {
      const t = await resolveTask(str(args.taskCode));
      if (!t) return { ok: false, message: `Task ${str(args.taskCode)} not found.` };
      const p = await resolvePerson(str(args.person));
      if (!p) return { ok: false, message: `Couldn't find an active person called "${str(args.person)}".` };
      const reason = str(args.reason);
      if (!reason) return { ok: false, message: "A reason is required to raise a blocker." };
      const undo = await snapshotTaskForUndo(t.id);
      const res = await setTaskBlocker(t.id, p.id, reason);
      if (!res.ok) return { ok: false, message: res.error };
      return { ok: true, message: `${t.code} is now blocked, waiting on ${p.name}.`, redirect: `/task/${t.code}`, undo };
    },
  },
  {
    name: "clear_task_blocker",
    tier: 2,
    description: "Clear a task's blocker — it goes back to In Progress.",
    params: {
      taskCode: { type: "string", required: true, description: "The task code." },
      note: { type: "string", required: false, description: "Optional note on clearing it." },
    },
    async run(args) {
      const t = await resolveTask(str(args.taskCode));
      if (!t) return { ok: false, message: `Task ${str(args.taskCode)} not found.` };
      const undo = await snapshotTaskForUndo(t.id);
      await clearTaskBlocker(t.id, str(args.note) || undefined);
      return { ok: true, message: `Cleared the blocker on ${t.code} — it's live again.`, redirect: `/task/${t.code}`, undo };
    },
  },
  {
    name: "toggle_task_pin",
    tier: 2,
    description: "Pin or unpin a task update (the latest update on a task, or by update id).",
    params: {
      taskCode: { type: "string", required: false, description: "The task code (pins/unpins its latest update)." },
      updateId: { type: "number", required: false, description: "A specific task-update id to toggle." },
    },
    async run(args) {
      let updateId = Number(args.updateId);
      if (!Number.isFinite(updateId) || updateId <= 0) {
        const code = str(args.taskCode);
        if (!code) return { ok: false, message: "Tell me which task (code) or which update id to pin." };
        const t = await resolveTask(code);
        if (!t) return { ok: false, message: `Task ${code} not found.` };
        const { data: last } = await sb.from("task_updates").select("id").eq("task_id", t.id).is("deleted_at", null).order("created_at", { ascending: false }).limit(1).maybeSingle();
        if (!last) return { ok: false, message: `${t.code} has no updates to pin.` };
        updateId = last.id as number;
      }
      const fd = new FormData();
      fd.set("updateId", String(updateId));
      await adminTogglePin(fd);
      // A pin toggle is its own inverse — re-running the tool flips it back.
      return { ok: true, message: `Toggled the pin on update #${updateId}.`, undo: { kind: "ori.pin.toggle", payload: { updateId } } };
    },
  },
  {
    name: "update_person",
    tier: 2,
    description: "Edit a person's profile fields (contact details, ID numbers, address, dates, notes). Only the fields you pass change; blanks are never written over existing values.",
    params: {
      person: { type: "string", required: true, description: "Whose profile, by name." },
      email: { type: "string", required: false, description: "Email address." },
      phone: { type: "string", required: false, description: "Phone number." },
      whatsapp: { type: "string", required: false, description: "WhatsApp number." },
      role: { type: "string", required: false, description: "Job role / title." },
      nationality: { type: "string", required: false, description: "Nationality." },
      nationalId: { type: "string", required: false, description: "National ID number." },
      passportNo: { type: "string", required: false, description: "Passport number." },
      address: { type: "string", required: false, description: "Home address." },
      emergencyContactName: { type: "string", required: false, description: "Emergency contact name." },
      emergencyContactPhone: { type: "string", required: false, description: "Emergency contact phone." },
      dateOfBirth: { type: "date", required: false, description: "Date of birth YYYY-MM-DD." },
      startDate: { type: "date", required: false, description: "Employment start date YYYY-MM-DD." },
      notes: { type: "string", required: false, description: "Free-text notes." },
    },
    async run(args) {
      const p = await resolvePerson(str(args.person));
      if (!p) return { ok: false, message: `Couldn't find an active person called "${str(args.person)}".` };
      // Whitelist: named plain-profile columns only (never manager/company — those
      // carry loop-guards handled by updatePerson; ORI can't safely bypass them).
      const map: Record<string, string> = {
        email: "email", phone: "phone", whatsapp: "whatsapp", role: "role",
        nationality: "nationality", nationalId: "national_id", passportNo: "passport_no",
        address: "address", emergencyContactName: "emergency_contact_name",
        emergencyContactPhone: "emergency_contact_phone", notes: "notes",
      };
      const patch: Record<string, unknown> = {};
      for (const [argKey, col] of Object.entries(map)) {
        if (formHas(args, argKey)) { const v = str(args[argKey]); if (v) patch[col] = v; }
      }
      const dob = str(args.dateOfBirth);
      if (/^\d{4}-\d{2}-\d{2}$/.test(dob)) patch.date_of_birth = new Date(`${dob}T00:00:00Z`).toISOString();
      const start = str(args.startDate);
      if (/^\d{4}-\d{2}-\d{2}$/.test(start)) patch.start_date = new Date(`${start}T00:00:00Z`).toISOString();
      if (Object.keys(patch).length === 0) return { ok: false, message: "Tell me which detail to update." };
      const cols = Object.keys(patch).join(",");
      const { data: before } = await sb.from("people").select(cols).eq("id", p.id).maybeSingle();
      await sb.from("people").update(patch).eq("id", p.id);
      void reindexEntity("person", p.id);
      const undo = before ? { kind: "ori.person.update", payload: { personId: p.id, before } } : undefined;
      return { ok: true, message: `Updated ${p.name}'s profile (${Object.keys(patch).join(", ")}).`, redirect: `/people`, undo };
    },
  },
  {
    name: "set_probation_date",
    tier: 2,
    description: "Set (or clear) a person's probation end date. Clearing it confirms probation passed.",
    params: {
      person: { type: "string", required: true, description: "Whose probation, by name." },
      date: { type: "date", required: false, description: "Probation end date YYYY-MM-DD; omit/blank to confirm passed." },
    },
    async run(args) {
      const p = await resolvePerson(str(args.person));
      if (!p) return { ok: false, message: `Couldn't find an active person called "${str(args.person)}".` };
      const { data: before } = await sb.from("people").select("probation_end_date").eq("id", p.id).maybeSingle();
      const dateStr = str(args.date);
      const dateIso = /^\d{4}-\d{2}-\d{2}$/.test(dateStr) ? dateStr : null;
      const res = await setProbationDateAction(p.id, dateIso);
      if (!res.ok) return { ok: false, message: res.error };
      const undo = { kind: "ori.person.probation", payload: { personId: p.id, before: (before?.probation_end_date as string | null) ?? null } };
      return { ok: true, message: dateIso ? `${p.name}'s probation now ends ${dateIso}.` : `Confirmed ${p.name} passed probation.`, redirect: `/people`, undo };
    },
  },
  {
    name: "record_attendance",
    tier: 2,
    description: "Set a person's attendance status for a day (Present, Absent, On leave, Holiday, Remote, Half-day, Sick).",
    params: {
      person: { type: "string", required: true, description: "Whose attendance, by name." },
      date: { type: "date", required: true, description: "The day YYYY-MM-DD." },
      status: { type: "string", required: true, description: "Present | Absent | On leave | Holiday | Remote | Half-day | Sick." },
    },
    async run(args) {
      const p = await resolvePerson(str(args.person));
      if (!p) return { ok: false, message: `Couldn't find an active person called "${str(args.person)}".` };
      const dateStr = str(args.date);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return { ok: false, message: "Give a date as YYYY-MM-DD." };
      const status = str(args.status);
      if (!status) return { ok: false, message: "What status — Present, Absent, On leave, Holiday, Remote, Half-day or Sick?" };
      const dateIso = new Date(`${dateStr}T00:00:00Z`).toISOString();
      const { data: prior } = await sb.from("attendance").select("status").eq("person_id", p.id).eq("date", dateIso).maybeSingle();
      const res = await recordAttendanceAction(p.id, dateStr, status);
      if (!res.ok) return { ok: false, message: res.error };
      const undo = { kind: "ori.attendance.record", payload: { personId: p.id, dateIso, before: (prior?.status as string | null) ?? null } };
      return { ok: true, message: `Marked ${p.name} as ${status} on ${dateStr}.`, redirect: `/hrms/leave?view=attendance`, undo };
    },
  },

  /* ============================ WAVE B ============================ */
  {
    name: "file_document",
    tier: 2,
    description: "File a document — set its owner (a person or a company) and move it out of quarantine into the library.",
    params: {
      document: { type: "string", required: true, description: "The document — its id or a title to match." },
      person: { type: "string", required: false, description: "Owner person, by name (if it belongs to a person)." },
      company: { type: "string", required: false, description: "Owner company, by name (if it belongs to a company)." },
    },
    async run(args) {
      const doc = await resolveDocument(str(args.document));
      if (!doc) return { ok: false, message: `Couldn't find a document matching "${str(args.document)}".` };
      let owner = "";
      const patch: Record<string, unknown> = {};
      if (str(args.person)) {
        const p = await resolvePerson(str(args.person));
        if (!p) return { ok: false, message: `Couldn't find a person called "${str(args.person)}".` };
        patch.person_id = p.id; owner = p.name;
      }
      if (str(args.company)) {
        const c = await resolveCompany(str(args.company));
        if (!c) return { ok: false, message: `Couldn't match a company called "${str(args.company)}".` };
        patch.company_id = c.id; owner = owner ? `${owner} / ${c.name}` : c.name;
      }
      if (Object.keys(patch).length === 0) return { ok: false, message: "Tell me who owns it — a person or a company." };
      await sb.from("documents").update(patch).eq("id", doc.id);
      return { ok: true, message: `Filed "${doc.title}" to ${owner}.`, redirect: `/documents` };
    },
  },
  {
    name: "rename_document",
    tier: 2,
    description: "Rename a document.",
    params: {
      document: { type: "string", required: true, description: "The document — its id or current title." },
      title: { type: "string", required: true, description: "The new title." },
    },
    async run(args) {
      const doc = await resolveDocument(str(args.document));
      if (!doc) return { ok: false, message: `Couldn't find a document matching "${str(args.document)}".` };
      const title = str(args.title);
      if (!title) return { ok: false, message: "Give the document a new name." };
      const res = await renameDocumentAction(doc.id, title);
      if (!res.ok) return { ok: false, message: res.error };
      return { ok: true, message: `Renamed to "${title}".`, redirect: `/documents`, undo: { kind: "ori.document.rename", payload: { documentId: doc.id, before: doc.title } } };
    },
  },
  {
    name: "archive_document",
    tier: 2,
    description: "Archive a document (moves it out of the live library; restorable).",
    params: {
      document: { type: "string", required: true, description: "The document — its id or title." },
    },
    async run(args) {
      const doc = await resolveDocument(str(args.document));
      if (!doc) return { ok: false, message: `Couldn't find a document matching "${str(args.document)}".` };
      const res = await archiveDocumentAction(doc.id, true);
      if (!res.ok) return { ok: false, message: res.error };
      return { ok: true, message: `Archived "${doc.title}".`, redirect: `/documents`, undo: { kind: "ori.document.archive", payload: { documentId: doc.id, before: doc.archived } } };
    },
  },
  {
    name: "link_document_to_task",
    tier: 2,
    description: "Link a document to a task so it shows on the task's record.",
    params: {
      document: { type: "string", required: true, description: "The document — its id or title." },
      taskCode: { type: "string", required: true, description: "The task code." },
    },
    async run(args) {
      const doc = await resolveDocument(str(args.document));
      if (!doc) return { ok: false, message: `Couldn't find a document matching "${str(args.document)}".` };
      const t = await resolveTask(str(args.taskCode));
      if (!t) return { ok: false, message: `Task ${str(args.taskCode)} not found.` };
      const { error } = await sb.from("document_links").upsert({ document_id: doc.id, task_id: t.id, created_at: nowIso() }, { ignoreDuplicates: true });
      if (error) return { ok: false, message: error.message };
      void reindexEntity("task", t.id);
      return { ok: true, message: `Linked "${doc.title}" to ${t.code}.`, redirect: `/task/${t.code}`, undo: { kind: "ori.document.link", payload: { documentId: doc.id, taskId: t.id } } };
    },
  },
  {
    name: "reschedule_event",
    tier: 2,
    description: "Change a calendar event's date/time (and optionally title/location). Note: guests are NOT auto-emailed about the change yet — mention the reschedule to them separately.",
    params: {
      event: { type: "string", required: true, description: "The event — its id or title." },
      date: { type: "date", required: false, description: "New date YYYY-MM-DD." },
      time: { type: "string", required: false, description: "New start time HH:MM (24h); omit to keep all-day." },
      title: { type: "string", required: false, description: "New title." },
      location: { type: "string", required: false, description: "New location." },
    },
    async run(args) {
      const ev = await resolveEvent(str(args.event));
      if (!ev) return { ok: false, message: `Couldn't find an event matching "${str(args.event)}".` };
      const { data: cur } = await sb.from("calendar_events").select("title,location,start_at,end_at,all_day").eq("id", ev.id).maybeSingle();
      if (!cur) return { ok: false, message: "Event not found." };
      const before = cur as Record<string, unknown>;
      const dateStr = str(args.date);
      const time = str(args.time);
      // Only touch scheduling/title/location — a Partial patch leaves description,
      // attendees, reminders and recurrence untouched (they aren't in the payload).
      const patch: Partial<Parameters<typeof updateCalendarEvent>[1]> = {};
      const title = str(args.title); if (title) patch.title = title;
      const loc = str(args.location); if (loc) patch.location = loc;
      if (dateStr && /^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        const allDay = !time;
        patch.allDay = allDay;
        patch.startAt = new Date(`${dateStr}T${time || "09:00"}:00+03:00`).toISOString();
        patch.endAt = new Date(new Date(patch.startAt as string).getTime() + 60 * 60 * 1000).toISOString();
      } else if (time) {
        const day = String(before.start_at).slice(0, 10);
        patch.allDay = false;
        patch.startAt = new Date(`${day}T${time}:00+03:00`).toISOString();
        patch.endAt = new Date(new Date(patch.startAt as string).getTime() + 60 * 60 * 1000).toISOString();
      }
      if (Object.keys(patch).length === 0) return { ok: false, message: "Tell me the new date, time, title or location." };
      const undo = { kind: "ori.event.update", payload: { eventId: ev.id, before: { title: before.title, location: before.location, start_at: before.start_at, end_at: before.end_at, all_day: before.all_day } } };
      const updated = await updateCalendarEvent(ev.id, patch);
      return { ok: true, message: `Rescheduled "${updated.title}".`, redirect: `/calendar`, undo };
    },
  },
  {
    name: "cancel_event",
    tier: 3,
    description: "Cancel a calendar event. Guests who were invited get a cancellation email and any tasks it spawned are cleared — so this is confirmed like a send and can't be auto-undone.",
    params: {
      event: { type: "string", required: true, description: "The event — its id or title." },
    },
    async run(args) {
      const ev = await resolveEvent(str(args.event));
      if (!ev) return { ok: false, message: `Couldn't find an event matching "${str(args.event)}".` };
      const res = await cancelEventAction(ev.id);
      if (!res.ok) return { ok: false, message: res.error };
      return { ok: true, message: `Cancelled "${ev.title}".`, redirect: `/calendar` };
    },
  },

  /* ============================ WAVE C — tier 3 (send/publish/delete) ============================
   * Confirm ALWAYS (tier 3). Sends route through canAutoSend(channel) — blocked if
   * the owner hasn't opted the channel in. Deletes trash/archive, never hard-delete
   * (AUTO_HARD_DELETE_FORBIDDEN); undo restores where a clean inverse exists. */
  {
    name: "publish_announcement",
    tier: 3,
    description: "PUBLISH an existing draft announcement — it goes live and notifies the audience. (Use draft_announcement to create one first.)",
    params: {
      announcement: { type: "string", required: true, description: "The announcement — its id or a title to match a DRAFT." },
    },
    async run(args) {
      const ref = str(args.announcement);
      if (!ref) return { ok: false, message: "Which announcement — an id or title?" };
      type AnnRow = { id: number; title: string; status: string };
      let row: AnnRow | null = null;
      if (/^\d+$/.test(ref)) {
        const { data } = await sb.from("announcements").select("id,title,status").eq("id", Number(ref)).maybeSingle();
        row = (data as unknown as AnnRow) ?? null;
      } else {
        // Prefer a draft by title so we don't re-publish a live/archived one.
        const { data } = await sb.from("announcements").select("id,title,status").eq("status", "draft").ilike("title", `%${escapeLike(ref)}%`).order("created_at", { ascending: false }).limit(1).maybeSingle();
        row = (data as unknown as AnnRow) ?? null;
      }
      if (!row) return { ok: false, message: `Couldn't find a draft announcement matching "${ref}".` };
      if (row.status === "published") return { ok: false, message: `"${row.title}" is already published.` };
      const res = await publishAnnouncementAction(row.id);
      if (!res.ok) return { ok: false, message: res.error };
      // Undo: pull it back to archived (it was a draft before → the inverse is to
      // take it off the board; archive is the reversible "not live" state).
      return { ok: true, message: `Published "${row.title}" — the audience has been notified.`, redirect: `/announcements`, undo: { kind: "ori.announcement.publish", payload: { announcementId: row.id, before: row.status } } };
    },
  },
  {
    name: "send_task_reminder",
    tier: 3,
    description: "Send a reminder to a task's responsible person about the task (or all their open tasks). Only sends on a channel the owner has switched auto-send ON for; otherwise it's blocked.",
    params: {
      taskCode: { type: "string", required: true, description: "The task code." },
      allTasks: { type: "string", required: false, description: "'yes' to remind about ALL their open tasks, not just this one." },
    },
    async run(args) {
      const t = await resolveTask(str(args.taskCode));
      if (!t) return { ok: false, message: `Task ${str(args.taskCode)} not found.` };
      const all = /^(yes|true|all|1)$/i.test(str(args.allTasks));
      const res = await adminRemindTask(t.id, all);
      if (!res.ok) return { ok: false, message: res.error };
      if (res.contactMissing) return { ok: false, message: `${res.name} has no ${res.channel.toLowerCase()} contact on file — can't send the reminder.` };
      // adminRemindTask returns a compose LINK (it doesn't itself transmit); a Tier-3
      // send still goes through the guardrail so ORI can't nudge on a channel the
      // owner hasn't opted into.
      const channel = res.channel.toLowerCase() as SendChannel;
      const gated: SendChannel = channel === "email" || channel === "whatsapp" || channel === "sms" ? channel : "whatsapp";
      if (!(await canAutoSend(gated))) {
        return { ok: false, message: `Blocked by guardrail: auto-send on ${gated} is switched off. Turn it on in Settings → Automation, or open the ${res.channel.toLowerCase()} draft yourself.` };
      }
      return { ok: true, message: `Reminder ready for ${res.name} on ${res.channel.toLowerCase()}${all ? " (all open tasks)" : ""}.`, redirect: res.link ?? `/task/${t.code}` };
    },
  },
  {
    name: "send_email_draft",
    tier: 3,
    description: "Send an email draft from the Outbox (by its id). Only sends if email auto-send is switched on; otherwise blocked.",
    params: {
      draftId: { type: "number", required: true, description: "The Outbox draft id (must be an EMAIL draft)." },
    },
    async run(args) {
      const id = Number(args.draftId);
      if (!Number.isFinite(id) || id <= 0) return { ok: false, message: "Which Outbox draft (id)?" };
      if (!(await canAutoSend("email"))) {
        return { ok: false, message: "Blocked by guardrail: email auto-send is switched off. Turn it on in Settings → Automation, or send it from the Outbox yourself." };
      }
      const res = await sendDraftEmail(id);
      if (!res.ok) {
        if (res.reason === "not-email") return { ok: false, message: "That draft isn't an email." };
        if (res.reason === "no-email") return { ok: false, message: "That draft has no valid email address." };
        if (res.reason === "not-configured") return { ok: false, message: "Email sending isn't configured — set up email in Settings first." };
        return { ok: false, message: res.error ?? "Couldn't send the email." };
      }
      // No undo: a sent email can't be recalled.
      return { ok: true, message: `Sent Outbox draft #${id}.`, redirect: `/outbox` };
    },
  },
  {
    name: "delete_task",
    tier: 3,
    description: "Delete a task. It's recoverable for 10 minutes via the Undo that appears, and its audit history is kept.",
    params: {
      taskCode: { type: "string", required: true, description: "The task code." },
    },
    async run(args) {
      const t = await resolveTask(str(args.taskCode));
      if (!t) return { ok: false, message: `Task ${str(args.taskCode)} not found.` };
      // deleteTaskQuick is the redirect-free variant (deleteTask itself redirects,
      // which throws NEXT_REDIRECT server-side); it recoverably deletes (snapshots
      // the task + conversation + links) and mints its OWN 10-minute Undo token via
      // the mutate framework. So — like meeting_to_tasks — we DON'T add a second
      // tool-level undo here; duplicating it would risk a double-restore.
      const res = await deleteTaskQuick(t.code);
      if (!res.ok) return { ok: false, message: res.error ?? "Couldn't delete the task." };
      return { ok: true, message: `Deleted ${t.code}. It's recoverable for 10 minutes.`, redirect: `/registry` };
    },
  },

  /* ==================== DOMAIN WAVES (people/HR · documents · meetings &
   * letters · calendar & announcements · governance/pipeline/commitments ·
   * assets/ops/reference/settings). Each array lives in its own tools-*.ts and
   * reuses existing server actions — spread here so they register into
   * TOOL_BY_NAME with the same shape/order semantics as the core tools. ==== */
  ...PEOPLE_TOOLS,
  ...DOCUMENT_TOOLS,
  ...CALENDAR_TOOLS,
  ...GOVERNANCE_TOOLS,
  ...OPS_TOOLS,
  ...PORTAL_TOOLS,
  ...WATCHER_TOOLS,
  ...SMART_TOOLS,
];

/** True if the planner supplied this arg at all (so we don't overwrite with a blank). */
export function formHas(args: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(args, key) && args[key] != null && str(args[key]) !== "";
}

export const TOOL_BY_NAME = new Map(TOOLS.map((t) => [t.name, t]));

/** Render one ToolDef to its catalogue line — name, tier, description, params. */
function toolLine(t: ToolDef): string {
  const ps = Object.entries(t.params).map(([k, p]) => `${k}${p.required ? "*" : ""}:${p.type}`).join(", ");
  return `- ${t.name} (tier ${t.tier}) — ${t.description} params: {${ps}}`;
}

/** A small, ALWAYS-included spine — the everyday task verbs the planner must never
 *  be blind to, whatever the message says. Kept tiny so the relevance filter does
 *  the real work; these just guarantee the common path is always describable. */
const CORE_TOOL_NAMES = new Set<string>([
  "create_task", "edit_task", "set_task_status", "add_task_update",
  "reassign_task", "add_assignees", "create_event", "update_person",
]);

// Words that carry no routing signal — stripped before matching so "the report on
// the vendor" keys on "report"/"vendor", not on "the"/"on". Deliberately small.
const TOOL_STOP = new Set<string>([
  "the", "and", "for", "with", "from", "this", "that", "have", "has", "will",
  "please", "can", "you", "make", "add", "set", "get", "put", "our", "his", "her",
  "them", "then", "into", "over", "who", "what", "when", "where", "which", "how",
  "about", "any", "all", "one", "new", "now", "out", "off", "are", "was", "were",
  "not", "but", "its", "it's", "i'd", "i'll", "let", "let's",
]);

/** Tokenise a natural-language string into meaningful lowercase word stems. */
function keyTokens(s: string): string[] {
  return (s || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !TOOL_STOP.has(w));
}

// Per-tool searchable token bag (name split on "_" + description), built once.
const TOOL_TOKENS: Array<{ tool: ToolDef; nameToks: Set<string>; descToks: Set<string> }> =
  TOOLS.map((tool) => ({
    tool,
    nameToks: new Set(tool.name.toLowerCase().split(/[_\s]+/).filter((w) => w.length > 1)),
    descToks: new Set(keyTokens(tool.description)),
  }));

/**
 * Pick the tools LIKELY relevant to `message`, so the planner's prompt carries a
 * focused ~25-tool catalogue instead of all ~135 (the biggest hidden per-call
 * token cost). Scores each tool by keyword overlap of the message against its
 * name (weighted) + description, always keeps the CORE spine, and caps the rest.
 *
 * FAIL-SAFE: if the match is weak or ambiguous (too few tools score at all), it
 * returns the WHOLE catalogue rather than risk hiding a tool the planner needs.
 * A short/empty message also returns everything (nothing to match on).
 */
export function selectRelevantTools(message: string, cap = 25): ToolDef[] {
  const toks = keyTokens(message);
  // Nothing to go on → don't guess, show everything.
  if (toks.length < 2) return TOOLS;

  const tokSet = new Set(toks);
  const scored: Array<{ tool: ToolDef; score: number }> = [];
  for (const { tool, nameToks, descToks } of TOOL_TOKENS) {
    let score = 0;
    for (const t of tokSet) {
      if (nameToks.has(t)) score += 3;           // a name hit is a strong signal
      else if (descToks.has(t)) score += 1;      // a description hit is a weak one
    }
    if (score > 0) scored.push({ tool, score });
  }

  // Weak/ambiguous match → fail safe to the full catalogue. If very few tools
  // matched, the planner is better served seeing all of them than a thin slice
  // that might omit the right one.
  if (scored.length < 3) return TOOLS;

  scored.sort((a, b) => b.score - a.score);
  const picked = new Map<string, ToolDef>();
  // Always include the core spine first.
  for (const t of TOOLS) if (CORE_TOOL_NAMES.has(t.name)) picked.set(t.name, t);
  // Then the best-scoring matches up to the cap.
  for (const { tool } of scored) {
    if (picked.size >= cap) break;
    picked.set(tool.name, tool);
  }
  return [...picked.values()];
}

/** A compact catalogue the planner sees — names, tiers, params. When a `message`
 *  is given, the catalogue is pre-filtered to the tools likely relevant to it
 *  (fail-safe to the full list on a weak match); with no message, it's the full
 *  catalogue (back-compat). */
export function toolCatalogue(message?: string): string {
  const tools = message ? selectRelevantTools(message) : TOOLS;
  return tools.map(toolLine).join("\n");
}

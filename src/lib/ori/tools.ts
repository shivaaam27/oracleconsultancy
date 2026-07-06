import "server-only";
import { sb } from "@/db/supabase";
import { escapeLike, insertTaskWithUniqueCodeSb } from "@/lib/db-helpers";
import { reindexEntity } from "@/lib/index-hooks";
import { createCalendarEvent } from "@/lib/calendar";

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

const nowIso = () => new Date().toISOString();
const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/* ------------------------------- resolvers ------------------------------- */

async function resolveCompany(name: string): Promise<{ id: number; code: string; name: string } | null> {
  const token = str(name);
  if (!token) return null;
  const safe = escapeLike(token);
  const { data: exact } = await sb.from("companies").select("id,code,name").ilike("name", safe).limit(1).maybeSingle();
  if (exact) return { id: exact.id as number, code: exact.code as string, name: exact.name as string };
  const { data } = await sb.from("companies").select("id,code,name").ilike("name", `%${safe}%`).limit(1).maybeSingle();
  return data ? { id: data.id as number, code: data.code as string, name: data.name as string } : null;
}

async function resolvePerson(name: string): Promise<{ id: number; name: string } | null> {
  const token = str(name);
  if (!token) return null;
  const { data } = await sb.from("people").select("id,name").eq("active", true).ilike("name", `%${escapeLike(token)}%`).limit(1).maybeSingle();
  return data ? { id: data.id as number, name: data.name as string } : null;
}

async function resolveTask(code: string): Promise<{ id: number; code: string; company_id: number; status: string } | null> {
  const token = str(code);
  if (!token) return null;
  const { data } = await sb.from("tasks").select("id,code,company_id,status").ilike("code", escapeLike(token)).maybeSingle();
  return (data as { id: number; code: string; company_id: number; status: string } | null) ?? null;
}

/** Snapshot a task's full field set + assignees BEFORE a mutation, shaped for the
 *  existing "task.update" undo handler (undo-handlers/tasks.ts) so a status change
 *  or reassignment is one-tap reversible. */
async function snapshotTaskForUndo(taskId: number): Promise<{ kind: string; payload: unknown } | undefined> {
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

/** Parse a natural deadline the planner passes as an ISO date OR "in N days".
 *  The planner is told today's date, so it should send ISO; this is a backstop. */
function parseDeadline(v: unknown): Date | null {
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
];

export const TOOL_BY_NAME = new Map(TOOLS.map((t) => [t.name, t]));

/** A compact catalogue the planner sees — names, tiers, params. */
export function toolCatalogue(): string {
  return TOOLS.map((t) => {
    const ps = Object.entries(t.params).map(([k, p]) => `${k}${p.required ? "*" : ""}:${p.type}`).join(", ");
    return `- ${t.name} (tier ${t.tier}) — ${t.description} params: {${ps}}`;
  }).join("\n");
}

// The write half of /api/mcp — what an assistant is allowed to CHANGE in COS.
//
// STAGE 2. The two rules that govern every line here, set by the owner in Aug 2026
// (memory/mcp_stage2_safe_writes.md):
//
//   ⚠️ MCP NEVER DELETES.
//   ⚠️ MCP NEVER SENDS A MESSAGE — with ONE exception: a meeting/event invitation,
//      which the owner explicitly opened, because an event nobody is told about is
//      not worth putting in a diary.
//
// Everything else the owner can do in the command centre, an assistant can do here:
// complete and close tasks, archive them, act on several at once. Those are all
// reversible from the UI, which is exactly why they are allowed and why deleting
// is not. A person's message to another person still becomes an Outbox DRAFT.
//
// If you are adding a tool and find yourself reaching for a delete, a WhatsApp, an
// email that isn't an event invitation, or a payment — stop. That is a conversation
// with the owner, not a new registry entry.
//
// Three further rules this file keeps:
//
//  1. **Go in through the door the UI uses.** `createEventAction` pushes to Google,
//     spawns the meeting task and notifies attendees; `createCalendarEvent` only
//     writes a row. Calling the raw helper would produce an event that exists in
//     COS and nowhere else. So: actions and shared cores, never raw inserts.
//  2. **Nothing is created by accident.** Names resolve to EXISTING active people
//     and companies. An assistant that mishears a name gets an error, never a new
//     member of staff. (The web form deliberately does the opposite — the owner
//     typing a new name means it.)
//  3. **Scope is applied to the data.** Every resolver runs the caller through
//     `companyScope()`, the same helper the portal uses. A caller cannot talk
//     their way past it, because the filter is in the query, not in the wording.
//
// Every write registers an undo token stamped with the caller, so `undo_last_change`
// can pull back a mistake within ten minutes.
//
// Server-only.

import { sb } from "@/db/supabase";
import { companyScope, personCanSeeTask } from "@/lib/portal-auth";
import { callerStamp, type McpCaller } from "@/lib/mcp/auth";
import { createTaskCore, updateTaskCore, addTaskUpdateCore, type TaskRepeatRecipe } from "@/lib/task-write";
import { mutate, type Actor } from "@/lib/mutate";
import { consumeUndo } from "@/lib/undo";
import "@/lib/undo-handlers";

/* --------------------------------------------------------------- *
 * Vocabulary — what an assistant may write into a field
 * --------------------------------------------------------------- */

export const PRIORITIES = ["Critical", "High", "Medium", "Low"] as const;
export const CATEGORIES = [
  "Finance", "Operations", "Marketing", "HR", "Legal",
  "Technology", "Sales", "Admin", "Meetings", "Strategy", "Other",
] as const;
/** The non-terminal statuses — the only ones a task can be CREATED into (nothing
 *  should be born finished) and the only ones a STAFF caller may move a task to. */
export const OPEN_STATUSES = [
  "Not Started", "In Progress", "Under Review", "Blocked", "Waiting External", "Escalated",
] as const;

/** Every status, including finishing a task off — reopening one is always
 *  possible, so this is not a one-way door. Who may reach these is decided by
 *  `mayFinishTasks()`, which mirrors the portal's own rule rather than guessing
 *  from a role name. */
export const ALL_STATUSES = [
  ...OPEN_STATUSES, "Completed", "Closed",
] as const;

/** Risk shares the priority words, and is a SEPARATE field: priority is how soon,
 *  risk is how bad if it slips. Kept as its own constant so one can move without
 *  silently dragging the other. */
export const RISKS = ["Critical", "High", "Medium", "Low"] as const;

/** Escalation is a Yes/No flag on the task, not a status. Setting it to Yes ALSO
 *  moves the task to Escalated, exactly as the tick-box and the bulk bar do. */
export const ESCALATIONS = ["Yes", "No"] as const;

/** Who carries the overdue: everybody on the task ("shared") or the first name
 *  only ("lead"). Completion credit is always shared either way. */
export const ACCOUNTABILITY = ["shared", "lead"] as const;

export type WriteResult = { ok: true; [k: string]: unknown } | { ok: false; error: string };

/** The undo-token owner for everything this caller writes. Must match exactly
 *  what `undo_last_change` looks for. */
function actorFor(caller: McpCaller): Actor {
  return callerStamp(caller) as Actor;
}

/**
 * May this caller finish a task off (Completed / Closed)?
 *
 * The owner always may. A staff caller may exactly when the PORTAL would let
 * them: `canManageTask` in the portal gates completion on `manageAnyTask`, which
 * is how a director can close things and ordinary staff cannot.
 *
 * ⚠️ Do NOT write this as `caller.kind === "owner"`-style role branching. It was
 * that at first, and it quietly made a director LESS able through Claude than on
 * his own board — he could complete a task by tapping it, but not by asking. MCP
 * reach must equal portal reach, in both directions.
 *
 * Slightly stricter than the portal in one corner: the portal also lets the
 * task's own creator close it without `manageAnyTask`. Being narrower is safe;
 * being wider would not be.
 */
function mayFinishTasks(caller: McpCaller): boolean {
  if (caller.kind === "owner") return true;
  return caller.person.caps.manageAnyTask === true;
}

/* --------------------------------------------------------------- *
 * Resolvers — plain words in, scoped ids out (or nothing)
 * --------------------------------------------------------------- */

async function scopeFor(caller: McpCaller): Promise<number[] | null> {
  if (caller.kind === "owner") return null;
  return await companyScope(caller.person);
}

/**
 * A company name (or two-letter prefix) → an id the caller may write to.
 *
 * Exact name wins, then exact prefix, then a unique partial match. An AMBIGUOUS
 * name returns nothing rather than guessing — "PE" matching both PES Ltd and
 * Pamoja Plus must ask, not pick.
 */
export async function resolveCompany(
  caller: McpCaller,
  needle: string,
): Promise<{ id: number; name: string } | { error: string }> {
  const n = (needle ?? "").trim();
  if (!n) return { error: "Which company?" };

  const scope = await scopeFor(caller);
  let q = sb.from("companies").select("id,name,code_prefix").eq("active", true);
  if (scope != null) {
    if (scope.length === 0) return { error: "You have no companies you can write to." };
    q = q.in("id", scope);
  }
  const { data } = await q;
  const rows = (data ?? []) as { id: number; name: string; code_prefix: string | null }[];

  const lower = n.toLowerCase();
  const exact = rows.find((r) => r.name.toLowerCase() === lower);
  if (exact) return { id: exact.id, name: exact.name };
  const byPrefix = rows.filter((r) => (r.code_prefix ?? "").toLowerCase() === lower);
  if (byPrefix.length === 1) return { id: byPrefix[0].id, name: byPrefix[0].name };
  const partial = rows.filter((r) => r.name.toLowerCase().includes(lower));
  if (partial.length === 1) return { id: partial[0].id, name: partial[0].name };
  if (partial.length > 1) {
    return { error: `"${n}" matches more than one company: ${partial.map((r) => r.name).join(", ")}. Which one?` };
  }
  return { error: `No company called "${n}" that you can write to.` };
}

/**
 * A person's name → an ACTIVE person the caller may involve.
 *
 * Never creates anybody. Ambiguity is an error, so two people called Nayan means
 * a question back to the owner, not a coin toss.
 */
export async function resolvePerson(
  caller: McpCaller,
  needle: string,
): Promise<{ id: number; name: string; email: string | null } | { error: string }> {
  const n = (needle ?? "").trim();
  if (!n) return { error: "Which person?" };

  const { data } = await sb
    .from("people")
    .select("id,name,email,company_id")
    .eq("active", true)
    .ilike("name", `%${n}%`)
    .limit(25);
  let rows = (data ?? []) as { id: number; name: string; email: string | null; company_id: number | null }[];
  if (rows.length === 0) return { error: `No active person called "${n}".` };

  // A scoped caller may only involve people inside their companies — primary
  // company OR a person_companies link, exactly as the portal decides it.
  const scope = await scopeFor(caller);
  if (scope != null) {
    const ids = rows.map((r) => r.id);
    const { data: links } = await sb
      .from("person_companies")
      .select("person_id")
      .in("company_id", scope)
      .in("person_id", ids);
    const linked = new Set((links ?? []).map((r) => r.person_id as number));
    rows = rows.filter((r) => (r.company_id != null && scope.includes(r.company_id)) || linked.has(r.id));
    if (rows.length === 0) return { error: `"${n}" isn't in your companies.` };
  }

  const lower = n.toLowerCase();
  const exact = rows.filter((r) => r.name.toLowerCase() === lower);
  if (exact.length === 1) return { id: exact[0].id, name: exact[0].name, email: exact[0].email };
  if (rows.length === 1) return { id: rows[0].id, name: rows[0].name, email: rows[0].email };
  return { error: `"${n}" matches ${rows.map((r) => r.name).join(", ")}. Which one?` };
}

/** A task code → the task, if this caller may see it. Uses the portal's own
 *  visibility test, so MCP can never reach a task the web wouldn't show. */
export async function resolveTask(
  caller: McpCaller,
  code: string,
  opts?: { includeArchived?: boolean },
): Promise<{ id: number; code: string; status: string; companyId: number; archived: boolean } | { error: string }> {
  const c = (code ?? "").trim();
  if (!c) return { error: "Which task? Give me its code, e.g. DS-014." };
  const { data } = await sb
    .from("tasks")
    .select("id,code,status,company_id,archived")
    .ilike("code", c)
    .maybeSingle();
  if (!data) return { error: `No task with the code ${c}.` };
  // An archived task is out of the way, so it isn't a target for ordinary work —
  // only the archive tool itself asks for it (to restore one).
  if (data.archived && !opts?.includeArchived) return { error: `${data.code} is archived.` };
  if (caller.kind === "person" && !(await personCanSeeTask(caller.person, data.id as number))) {
    return { error: `You can't see ${data.code}.` };
  }
  return {
    id: data.id as number,
    code: data.code as string,
    status: data.status as string,
    companyId: data.company_id as number,
    archived: data.archived as boolean,
  };
}

/** yyyy-mm-dd → a Date at UTC midnight (the app-wide all-day convention). */
function dayToDate(value: string | undefined | null): Date | null {
  const v = (value ?? "").trim();
  if (!v) return null;
  const d = new Date(`${v.slice(0, 10)}T00:00:00Z`);
  return isNaN(d.getTime()) ? null : d;
}

/** Accept a value only if it is in the allowed list (case-insensitive). */
function oneOf<T extends string>(list: readonly T[], value: unknown): T | null {
  const v = String(value ?? "").trim().toLowerCase();
  if (!v) return null;
  return list.find((x) => x.toLowerCase() === v) ?? null;
}

/* --------------------------------------------------------------- *
 * 1 — create_task  (tier 1: safe)
 * --------------------------------------------------------------- */

/**
 * A department NAME → an existing department id.
 *
 * ⚠️ Unlike the web form, this NEVER creates one. `getOrCreateDeptSb` would add a
 * department for a typo, and departments are managed reference data with rename
 * and merge on the Companies hub — a silent "Finanace" would sit in that list
 * until somebody noticed. Same stance as people and companies (rule 2).
 */
async function resolveDepartment(needle: string): Promise<{ name: string } | { error: string }> {
  const n = (needle ?? "").trim();
  if (!n) return { error: "Which department?" };
  const { data } = await sb.from("departments").select("name").order("name");
  const rows = (data ?? []).map((d) => d.name as string);
  const lower = n.toLowerCase();
  const exact = rows.find((r) => r.toLowerCase() === lower);
  if (exact) return { name: exact };
  const partial = rows.filter((r) => r.toLowerCase().includes(lower));
  if (partial.length === 1) return { name: partial[0] };
  if (partial.length > 1) return { error: `"${n}" matches ${partial.join(", ")}. Which one?` };
  return { error: `There's no department called "${n}". The ones that exist: ${rows.join(", ") || "none yet"}.` };
}

/**
 * A repeat recipe as an assistant may give it, validated.
 *
 * The rule is the form's: weekly needs at least one weekday, monthly needs a day
 * of the month. A half-filled recipe is refused rather than silently ignored —
 * "make it repeat every Monday" that quietly doesn't is worse than an error.
 */
function parseRepeat(
  raw: { cadence?: string; weekdays?: number[]; dayOfMonth?: number } | undefined,
): { repeat: TaskRepeatRecipe } | { error: string } | null {
  if (!raw) return null;
  const cadence = raw.cadence === "monthly" ? "monthly" : raw.cadence === "weekly" ? "weekly" : null;
  if (!cadence) return { error: "A repeat is either 'weekly' or 'monthly'." };
  if (cadence === "weekly") {
    const days = Array.from(new Set((raw.weekdays ?? []).map((d) => Math.round(Number(d)))))
      .filter((d) => Number.isFinite(d) && d >= 0 && d <= 6)
      .sort((a, b) => a - b);
    if (days.length === 0) return { error: "Which days? Weekly repeats need weekdays, 0 = Sunday to 6 = Saturday." };
    return { repeat: { cadence, weekdays: days, dayOfMonth: 1 } };
  }
  const day = Math.round(Number(raw.dayOfMonth));
  if (!Number.isFinite(day) || day < 1 || day > 31) return { error: "Which day of the month? A number from 1 to 31." };
  return { repeat: { cadence, weekdays: [], dayOfMonth: day } };
}

export async function mcpCreateTask(
  caller: McpCaller,
  args: {
    company: string;
    title: string;
    assignees?: string[];
    deadline?: string;
    priority?: string;
    status?: string;
    category?: string;
    note?: string;
    department?: string;
    risk?: string;
    escalation?: string;
    meetingDate?: string;
    comments?: string;
    accountability?: string;
    repeat?: { cadence?: string; weekdays?: number[]; dayOfMonth?: number };
    requiresAttachment?: boolean;
  },
): Promise<WriteResult> {
  const title = (args.title ?? "").trim();
  if (!title) return { ok: false, error: "The task needs a title." };

  const company = await resolveCompany(caller, args.company);
  if ("error" in company) return { ok: false, error: company.error };

  // Names → existing people. One bad name fails the whole call: a task assigned
  // to nobody because a name didn't resolve is worse than an error the owner can
  // answer.
  const assigneeIds: number[] = [];
  const assigneeNames: string[] = [];
  for (const raw of args.assignees ?? []) {
    const person = await resolvePerson(caller, raw);
    if ("error" in person) return { ok: false, error: person.error };
    if (!assigneeIds.includes(person.id)) {
      assigneeIds.push(person.id);
      assigneeNames.push(person.name);
    }
  }

  const deadline = dayToDate(args.deadline);
  if (args.deadline && !deadline) return { ok: false, error: `"${args.deadline}" isn't a date I can read — use yyyy-mm-dd.` };
  const meetingDate = dayToDate(args.meetingDate);
  if (args.meetingDate && !meetingDate) return { ok: false, error: `"${args.meetingDate}" isn't a date I can read — use yyyy-mm-dd.` };

  let departmentName: string | null = null;
  if (args.department) {
    const dept = await resolveDepartment(args.department);
    if ("error" in dept) return { ok: false, error: dept.error };
    departmentName = dept.name;
  }

  const risk = args.risk ? oneOf(RISKS, args.risk) : null;
  if (args.risk && !risk) return { ok: false, error: `Risk is one of: ${RISKS.join(", ")}.` };
  const escalation = args.escalation ? oneOf(ESCALATIONS, args.escalation) : null;
  if (args.escalation && !escalation) return { ok: false, error: "Escalation is Yes or No." };

  const accountability = args.accountability ? oneOf(ACCOUNTABILITY, args.accountability) : null;
  if (args.accountability && !accountability) return { ok: false, error: "Accountability is 'shared' or 'lead'." };
  // "lead" means the FIRST name carries the overdue alone — with nobody on the
  // task there is no lead, so this would silently mean nothing.
  if (accountability === "lead" && assigneeIds.length === 0) {
    return { ok: false, error: "A lead needs somebody to be the lead — give me at least one name, or leave it shared." };
  }

  const repeat = parseRepeat(args.repeat);
  if (repeat && "error" in repeat) return { ok: false, error: repeat.error };

  // Escalating means the task is escalated: same rule the tick-box and the bulk
  // bar follow, so the three doors can't disagree.
  const status = oneOf(OPEN_STATUSES, args.status) ?? (escalation === "Yes" ? "Escalated" : "Not Started");

  const result = await createTaskCore({
    companyId: company.id,
    actionItem: title,
    departmentName,
    priority: oneOf(PRIORITIES, args.priority) ?? "Medium",
    status,
    category: oneOf(CATEGORIES, args.category),
    risk,
    escalation: escalation ?? "No",
    deadline,
    meetingDate,
    comments: (args.comments ?? "").trim() || null,
    latestUpdate: (args.note ?? "").trim() || null,
    assigneeIds,
    accountability: accountability ?? "shared",
    repeat: repeat ? repeat.repeat : null,
    requiresAttachment: args.requiresAttachment === true,
    // Who RAISED it. `canManageTask` reads this, so without it a manager who
    // asked Claude to raise a task could not then complete it on their own
    // portal — MCP reach would be narrower than the portal's for no reason. The
    // owner's key has no person row, and null is right for them.
    createdByPersonId: caller.kind === "person" ? caller.person.id : null,
    createdBy: callerStamp(caller),
    actor: actorFor(caller),
  });
  if (!result.ok) return { ok: false, error: result.error };

  return {
    ok: true,
    code: result.result.code,
    company: company.name,
    assigned: assigneeNames,
    deadline: deadline ? deadline.toISOString().slice(0, 10) : null,
    department: departmentName,
    accountability: accountability ?? "shared",
    repeats: repeat ? repeat.repeat : null,
    requiresAttachment: args.requiresAttachment === true,
    undoToken: result.undoToken ?? null,
  };
}

/* --------------------------------------------------------------- *
 * 2 — add_task_update  (tier 1: safe)
 * --------------------------------------------------------------- */

export async function mcpAddTaskUpdate(
  caller: McpCaller,
  args: { taskCode: string; note: string; newStatus?: string },
): Promise<WriteResult> {
  const note = (args.note ?? "").trim();
  if (!note) return { ok: false, error: "What should the update say?" };

  const task = await resolveTask(caller, args.taskCode);
  if ("error" in task) return { ok: false, error: task.error };

  let newStatus: string | undefined;
  if (args.newStatus) {
    // Whoever the portal would let finish a task off may do it here too; everyone
    // else is held to the open statuses. Same rule, both doors.
    const allowed = mayFinishTasks(caller) ? ALL_STATUSES : OPEN_STATUSES;
    const s = oneOf(allowed, args.newStatus);
    if (!s) {
      return { ok: false, error: `I can move ${task.code} to any of: ${allowed.join(", ")}.` };
    }
    newStatus = s;
  }

  const result = await addTaskUpdateCore({
    taskId: task.id,
    taskCode: task.code,
    body: note,
    newStatus,
    createdBy: callerStamp(caller),
    actor: actorFor(caller),
  });
  if (!result.ok) return { ok: false, error: result.error };

  return {
    ok: true,
    code: task.code,
    statusNow: newStatus ?? task.status,
    undoToken: result.undoToken ?? null,
  };
}

/* --------------------------------------------------------------- *
 * 2b — get_task / update_task / manage_task  (the rest of a task)
 * --------------------------------------------------------------- *
 *
 * `create_task` could raise a task with eight of its fields and nothing could
 * change one afterwards — an assistant could complete a task but not move its
 * deadline, and could not read the risk rating it was being asked about. These
 * three close that: read one in full, patch any field, and work the handful of
 * controls that are not fields (the blocker, somebody's part being done, a
 * correction to an update already posted).
 *
 * The rules do not bend here. `update_task` goes through `updateTaskCore`, the
 * same door the web edit form uses, so a change an assistant makes is written by
 * the same code, logs the same audit rows and offers the same undo. Nothing
 * DELETES: removing an update sets `deleted_at` and `restore_update` puts it
 * straight back, which is archiving under another name.
 */

/** Every task field an assistant may see. The list is deliberately fuller than
 *  `slimTask` on the read side: what you may change, you must be able to read. */
export async function mcpTaskDetail(
  caller: McpCaller,
  args: { taskCode: string; includeArchived?: boolean; updates?: boolean; history?: boolean },
): Promise<WriteResult> {
  const task = await resolveTask(caller, args.taskCode, { includeArchived: args.includeArchived !== false });
  if ("error" in task) return { ok: false, error: task.error };

  const { data: raw, error } = await sb.from("tasks").select("*").eq("id", task.id).maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!raw) return { ok: false, error: `No task with the code ${args.taskCode}.` };
  const t = raw as Record<string, unknown>;

  const [{ data: comp }, { data: dept }, { data: rows }] = await Promise.all([
    sb.from("companies").select("name").eq("id", t.company_id as number).maybeSingle(),
    t.department_id != null
      ? sb.from("departments").select("name").eq("id", t.department_id as number).maybeSingle()
      : Promise.resolve({ data: null }),
    sb.from("task_assignees").select("person_id,role,part_done_at").eq("task_id", task.id),
  ]);

  const personIds = new Set<number>((rows ?? []).map((r) => r.person_id as number));
  if (t.blocked_on_person_id != null) personIds.add(t.blocked_on_person_id as number);
  const { data: people } = personIds.size
    ? await sb.from("people").select("id,name").in("id", Array.from(personIds))
    : { data: [] };
  const nameById = new Map((people ?? []).map((p) => [p.id as number, p.name as string]));
  const day = (v: unknown) => (v ? new Date(v as string).toISOString().slice(0, 10) : null);

  const detail: Record<string, unknown> = {
    code: t.code,
    previousCode: t.legacy_code ?? null,
    title: t.action_item,
    company: comp?.name ?? null,
    department: (dept as { name?: string } | null)?.name ?? null,
    status: t.status,
    priority: t.priority,
    risk: t.risk ?? null,
    escalation: t.escalation ?? "No",
    category: t.category ?? null,
    deadline: day(t.deadline),
    meetingDate: day(t.meeting_date),
    createdDate: day(t.created_date),
    closedDate: day(t.closed_date),
    comments: t.comments ?? null,
    latestUpdate: t.latest_update ?? null,
    archived: Boolean(t.archived),
    accountability: (t.accountability as string) === "lead" ? "lead" : "shared",
    assignees: (rows ?? []).map((r) => ({
      name: nameById.get(r.person_id as number) ?? null,
      role: r.role as string,
      partDone: Boolean(r.part_done_at),
    })),
    blockedOn: t.blocked_on_person_id != null ? (nameById.get(t.blocked_on_person_id as number) ?? null) : null,
    blockedReason: t.blocked_reason ?? null,
  };

  // The conversation, WITH ids — an assistant asked to correct a typo in an
  // update needs the id to give back to manage_task.
  if (args.updates !== false) {
    const { data: updates } = await sb
      .from("task_updates")
      .select("id,body,created_at,created_by,edited_at,pinned_at")
      .eq("task_id", task.id)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(30);
    detail.updates = (updates ?? []).map((u) => ({
      id: u.id as number,
      body: u.body as string,
      at: u.created_at as string,
      by: u.created_by as string | null,
      edited: Boolean(u.edited_at),
      pinned: Boolean(u.pinned_at),
    }));
  }

  if (args.history) {
    const { data: audit } = await sb
      .from("audit_log")
      .select("field,old_value,new_value,change_reason,created_at,created_by")
      .eq("task_id", task.id)
      .order("created_at", { ascending: false })
      .limit(40);
    detail.history = audit ?? [];
  }

  return { ok: true, task: detail };
}

export async function mcpUpdateTask(
  caller: McpCaller,
  args: {
    taskCode: string;
    title?: string;
    company?: string;
    department?: string | null;
    status?: string;
    priority?: string;
    risk?: string | null;
    escalation?: string;
    category?: string | null;
    deadline?: string | null;
    meetingDate?: string | null;
    comments?: string | null;
    assignees?: string[];
    accountability?: string;
    requiresAttachment?: boolean;
    reason?: string;
  },
): Promise<WriteResult> {
  const task = await resolveTask(caller, args.taskCode);
  if ("error" in task) return { ok: false, error: task.error };

  const patch: Parameters<typeof updateTaskCore>[1] = {
    createdBy: callerStamp(caller),
    actor: actorFor(caller),
    changeReason: (args.reason ?? "").trim() || null,
  };
  const changed: string[] = [];

  if (args.title !== undefined) {
    const title = args.title.trim();
    if (title.length < 3) return { ok: false, error: "A title that short says nothing — give me the line in full." };
    patch.actionItem = title;
    changed.push("title");
  }

  // Moving a task between companies RE-ISSUES its code. Said out loud in the
  // result, because the code the person quoted at you stops being the answer.
  let movedTo: string | null = null;
  if (args.company !== undefined) {
    const company = await resolveCompany(caller, args.company);
    if ("error" in company) return { ok: false, error: company.error };
    if (company.id !== task.companyId) {
      patch.companyId = company.id;
      movedTo = company.name;
      changed.push("company");
    }
  }

  if (args.department !== undefined) {
    if (args.department === null || args.department.trim() === "") {
      patch.departmentName = null;
    } else {
      const dept = await resolveDepartment(args.department);
      if ("error" in dept) return { ok: false, error: dept.error };
      patch.departmentName = dept.name;
    }
    changed.push("department");
  }

  if (args.status !== undefined) {
    const allowed = mayFinishTasks(caller) ? ALL_STATUSES : OPEN_STATUSES;
    const status = oneOf(allowed, args.status);
    if (!status) return { ok: false, error: `Which status? One of: ${allowed.join(", ")}.` };
    patch.status = status;
    changed.push("status");
  }

  if (args.priority !== undefined) {
    const priority = oneOf(PRIORITIES, args.priority);
    if (!priority) return { ok: false, error: `Priority is one of: ${PRIORITIES.join(", ")}.` };
    patch.priority = priority;
    changed.push("priority");
  }

  if (args.risk !== undefined) {
    if (args.risk === null || args.risk.trim() === "") {
      patch.risk = null;
    } else {
      const risk = oneOf(RISKS, args.risk);
      if (!risk) return { ok: false, error: `Risk is one of: ${RISKS.join(", ")}.` };
      patch.risk = risk;
    }
    changed.push("risk");
  }

  if (args.escalation !== undefined) {
    const escalation = oneOf(ESCALATIONS, args.escalation);
    if (!escalation) return { ok: false, error: "Escalation is Yes or No." };
    patch.escalation = escalation;
    // Escalating moves the task to Escalated unless the same call says otherwise
    // — the rule the tick-box and the bulk bar already follow. De-escalating
    // leaves the status where it is; only a person knows what it should become.
    if (escalation === "Yes" && patch.status === undefined) patch.status = "Escalated";
    changed.push("escalation");
  }

  if (args.category !== undefined) {
    if (args.category === null || args.category.trim() === "") {
      patch.category = null;
    } else {
      const category = oneOf(CATEGORIES, args.category);
      if (!category) return { ok: false, error: `Category is one of: ${CATEGORIES.join(", ")}.` };
      patch.category = category;
    }
    changed.push("category");
  }

  for (const [key, value] of [["deadline", args.deadline], ["meetingDate", args.meetingDate]] as const) {
    if (value === undefined) continue;
    if (value === null || value.trim() === "") {
      patch[key] = null;
    } else {
      const d = dayToDate(value);
      if (!d) return { ok: false, error: `"${value}" isn't a date I can read — use yyyy-mm-dd.` };
      patch[key] = d;
    }
    changed.push(key === "deadline" ? "deadline" : "meeting date");
  }

  if (args.comments !== undefined) {
    patch.comments = args.comments === null ? null : args.comments.trim() || null;
    changed.push("comments");
  }

  // Replacing the assignees replaces ALL of them — say so in the result, because
  // "add Fatma" and "make it Fatma" are one call apart.
  let assignedNames: string[] | null = null;
  if (args.assignees !== undefined) {
    const ids: number[] = [];
    const names: string[] = [];
    for (const raw of args.assignees) {
      const person = await resolvePerson(caller, raw);
      if ("error" in person) return { ok: false, error: person.error };
      if (!ids.includes(person.id)) { ids.push(person.id); names.push(person.name); }
    }
    patch.assigneeIds = ids;
    assignedNames = names;
    changed.push("who it's for");
  }

  if (args.accountability !== undefined) {
    const mode = oneOf(ACCOUNTABILITY, args.accountability);
    if (!mode) return { ok: false, error: "Accountability is 'shared' or 'lead'." };
    if (mode === "lead" && assignedNames?.length === 0) {
      return { ok: false, error: "A lead needs somebody to be the lead — you're taking everybody off this task." };
    }
    patch.accountability = mode;
    changed.push("accountability");
  }

  if (args.requiresAttachment !== undefined) {
    patch.requiresAttachment = args.requiresAttachment === true;
    changed.push(args.requiresAttachment ? "proof required to complete" : "proof no longer required");
  }

  if (changed.length === 0) return { ok: false, error: "Nothing to change — tell me which field to move." };

  const result = await updateTaskCore(task.code, patch);
  if (!result.ok) return { ok: false, error: result.error };

  return {
    ok: true,
    code: result.result.code,
    wasCode: result.result.code === task.code ? null : task.code,
    movedToCompany: movedTo,
    changed,
    assigned: assignedNames,
    note:
      result.result.code === task.code
        ? undefined
        : `It moved company, so its code is now ${result.result.code} — ${task.code} still redirects.`,
    undoToken: result.undoToken ?? null,
  };
}

/**
 * The task controls that are not fields.
 *
 * Grouped into ONE tool with an `action` because every description here sits in
 * every conversation's prompt (the MCP forward rule) — nine of these as separate
 * tools would cost nine descriptions for a set of buttons nobody reaches for
 * often.
 */
export const TASK_ACTIONS = [
  "block", "unblock",
  "part_done", "part_reopened",
  "edit_update", "pin_update", "unpin_update", "remove_update", "restore_update",
] as const;

export async function mcpManageTask(
  caller: McpCaller,
  args: {
    action: (typeof TASK_ACTIONS)[number];
    taskCode?: string;
    person?: string;
    reason?: string;
    note?: string;
    updateId?: number;
    body?: string;
  },
): Promise<WriteResult> {
  const by = callerStamp(caller);
  const actions = await import("@/app/task/actions");

  // The update actions are addressed by update id, so the task has to be found
  // from the update before the caller's visibility can be tested — never after.
  const updateActions = new Set(["edit_update", "pin_update", "unpin_update", "remove_update", "restore_update"]);
  if (updateActions.has(args.action)) {
    const id = Math.round(Number(args.updateId));
    if (!Number.isFinite(id)) return { ok: false, error: "Which update? get_task lists them with their ids." };
    const { data: u } = await sb.from("task_updates").select("task_id").eq("id", id).maybeSingle();
    if (!u) return { ok: false, error: `There's no update with the id ${id}.` };
    const { data: t } = await sb.from("tasks").select("code").eq("id", u.task_id as number).maybeSingle();
    if (!t) return { ok: false, error: "That update's task has gone." };
    const task = await resolveTask(caller, t.code as string, { includeArchived: true });
    if ("error" in task) return { ok: false, error: task.error };

    switch (args.action) {
      case "edit_update": {
        const body = (args.body ?? "").trim();
        if (!body) return { ok: false, error: "What should it say instead?" };
        const res = await actions.editTaskUpdate(id, body, (args.reason ?? "").trim() || undefined, by);
        if (!res.ok) return { ok: false, error: res.error ?? "That update couldn't be changed." };
        return { ok: true, task: task.code, updateId: id, note: "The original wording is kept on the record and the edit is logged." };
      }
      case "pin_update":
      case "unpin_update": {
        const { data: cur } = await sb.from("task_updates").select("pinned_at").eq("id", id).maybeSingle();
        const isPinned = Boolean(cur?.pinned_at);
        const want = args.action === "pin_update";
        if (isPinned === want) return { ok: true, task: task.code, updateId: id, pinned: isPinned, note: "Already the way you asked for." };
        const res = await actions.toggleUpdatePin(id, by);
        if (!res.ok) return { ok: false, error: res.error ?? "That update couldn't be pinned." };
        return { ok: true, task: task.code, updateId: id, pinned: res.pinned };
      }
      case "remove_update": {
        // NOT a delete: `deleted_at` is set, the row stays, and restore_update
        // puts it back. Archiving, under the name the UI uses.
        const res = await actions.deleteTaskUpdate(id, (args.reason ?? "").trim() || undefined, by);
        if (!res.ok) return { ok: false, error: res.error ?? "That update couldn't be taken down." };
        return { ok: true, task: task.code, updateId: id, note: "Taken off the timeline, not deleted — restore_update brings it back." };
      }
      default: {
        const res = await actions.restoreTaskUpdate(id, by);
        if (!res.ok) return { ok: false, error: res.error ?? "That update couldn't be brought back." };
        return { ok: true, task: task.code, updateId: id, note: "Back on the timeline." };
      }
    }
  }

  const task = await resolveTask(caller, args.taskCode ?? "");
  if ("error" in task) return { ok: false, error: task.error };

  switch (args.action) {
    case "block": {
      const reason = (args.reason ?? "").trim();
      if (!reason) return { ok: false, error: "A blocker needs a reason — what is it waiting on?" };
      if (!args.person) return { ok: false, error: "Waiting on whom?" };
      const person = await resolvePerson(caller, args.person);
      if ("error" in person) return { ok: false, error: person.error };
      const res = await actions.setTaskBlocker(task.id, person.id, reason, by);
      if (!res.ok) return { ok: false, error: res.error };
      return {
        ok: true, code: task.code, blockedOn: person.name, reason,
        note: "The task is Blocked and its overdue penalty is suspended for everyone until it's cleared.",
      };
    }
    case "unblock": {
      const res = await actions.clearTaskBlocker(task.id, (args.note ?? "").trim() || undefined, by);
      if (!res.ok) return { ok: false, error: "The blocker couldn't be cleared." };
      return { ok: true, code: task.code, status: "In Progress", note: "Clearing a blocker puts the task back to In Progress." };
    }
    case "part_done":
    case "part_reopened": {
      if (!args.person) return { ok: false, error: "Whose part?" };
      const person = await resolvePerson(caller, args.person);
      if ("error" in person) return { ok: false, error: person.error };
      const { data: row } = await sb
        .from("task_assignees")
        .select("person_id")
        .eq("task_id", task.id)
        .eq("person_id", person.id)
        .maybeSingle();
      if (!row) return { ok: false, error: `${person.name} isn't on ${task.code}.` };
      const done = args.action === "part_done";
      const res = await actions.toggleMyPartDone(task.id, person.id, done, by);
      if (!res.ok) return { ok: false, error: "That couldn't be recorded." };
      return {
        ok: true, code: task.code, person: person.name, partDone: done,
        note: done
          ? "Their part is marked done — the task stays open and they're spared its overdue."
          : "Their part is open again.",
      };
    }
    default:
      return { ok: false, error: `I can do: ${TASK_ACTIONS.join(", ")}.` };
  }
}

/* --------------------------------------------------------------- *
 * 3 — create_event  (tier 2: visible, but no invitation goes out)
 * --------------------------------------------------------------- */

export async function mcpCreateEvent(
  caller: McpCaller,
  args: {
    title: string;
    start: string;
    end?: string;
    allDay?: boolean;
    company?: string;
    location?: string;
    description?: string;
    attendees?: string[];
    sendInvitations?: boolean;
    documentIds?: number[];
  },
): Promise<WriteResult> {
  const title = (args.title ?? "").trim();
  if (!title) return { ok: false, error: "The event needs a title." };
  const start = (args.start ?? "").trim();
  if (!start) return { ok: false, error: "When does it start? Use yyyy-mm-dd HH:MM (Dar es Salaam time)." };

  const allDay = args.allDay === true || /^\d{4}-\d{2}-\d{2}$/.test(start);

  // The action reads a datetime-local value ("2026-06-15T14:00") and treats it as
  // Dar es Salaam wall-clock, which is what the owner means when they say "9am".
  const toLocalInput = (v: string): string | null => {
    const s = v.trim().replace(" ", "T");
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return `${s}T00:00`;
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s)) return s.slice(0, 16);
    return null;
  };
  const startInput = toLocalInput(start);
  if (!startInput) return { ok: false, error: `"${args.start}" isn't a time I can read — use yyyy-mm-dd HH:MM.` };
  const endInput = args.end ? toLocalInput(args.end) : null;
  if (args.end && !endInput) return { ok: false, error: `"${args.end}" isn't a time I can read — use yyyy-mm-dd HH:MM.` };

  let companyId: number | null = null;
  let companyName: string | null = null;
  if (args.company) {
    const company = await resolveCompany(caller, args.company);
    if ("error" in company) return { ok: false, error: company.error };
    companyId = company.id;
    companyName = company.name;
  } else if (caller.kind === "person") {
    // A scoped caller has no claim on a company-less diary entry.
    return { ok: false, error: "Which company is this event for?" };
  }

  const attendees: { personId: number; name: string; email?: string }[] = [];
  for (const raw of args.attendees ?? []) {
    const person = await resolvePerson(caller, raw);
    if ("error" in person) return { ok: false, error: person.error };
    if (!attendees.some((a) => a.personId === person.id)) {
      attendees.push({ personId: person.id, name: person.name, ...(person.email ? { email: person.email } : {}) });
    }
  }

  // Papers to travel with the entry (a ticket, an agenda). IDS ONLY, never
  // names: attaching the wrong document to an event that then EMAILS it to
  // guests is a disclosure, not a typo, so a near-miss on a title is not a risk
  // worth taking. The assistant looks the id up with list_documents first.
  //
  // Owner keys only — the document library sits outside every portal
  // capability, exactly as create_document notes. A scoped caller asking for
  // this is told plainly rather than silently getting an event without it.
  const documentIds = [...new Set((args.documentIds ?? []).filter((n) => Number.isInteger(n) && n > 0))];
  if (documentIds.length) {
    if (caller.kind === "person") {
      return { ok: false, error: "Attaching documents to an event is something only the owner's own key can do." };
    }
    const { data } = await sb.from("documents").select("id,storage_path,archived").in("id", documentIds);
    const rows = (data ?? []) as Array<{ id: number; storage_path: string | null; archived: boolean }>;
    const missing = documentIds.filter((id) => !rows.some((r) => r.id === id));
    if (missing.length) {
      return { ok: false, error: `I couldn't find document ${missing.join(", ")} — check the id with list_documents.` };
    }
    const empty = rows.filter((r) => !r.storage_path || r.archived);
    if (empty.length) {
      return {
        ok: false,
        error: `Document ${empty.map((r) => r.id).join(", ")} has no file attached (or is archived), so there is nothing to send.`,
      };
    }
  }

  const fd = new FormData();
  fd.set("title", title);
  fd.set("startAt", startInput);
  if (endInput) fd.set("endAt", endInput);
  if (allDay) fd.set("allDay", "1");
  if (companyId != null) fd.set("companyId", String(companyId));
  if (args.location) fd.set("location", args.location.trim());
  if (args.description) fd.set("description", args.description.trim());
  if (attendees.length) fd.set("attendees", JSON.stringify(attendees));
  if (documentIds.length) fd.set("documentIds", JSON.stringify(documentIds));
  // Don't mint a Meet room off the owner's account for a diary entry nobody asked
  // to be a video call.
  fd.set("requestMeet", "0");

  const { createEventAction } = await import("@/app/calendar/actions");
  // THE ONE SEND THE OWNER OPENED (Aug 2026). Every other outbound message is a
  // draft, but an invitation is part of creating a meeting — an event nobody is
  // told about is not worth putting in a diary. It goes to attendees who have an
  // email address; `sendInvitations: false` holds it back when the owner wants to
  // pencil something in quietly.
  const autoInvite = args.sendInvitations !== false;
  const res = await createEventAction(fd, callerStamp(caller), { autoInvite });
  if (!res.ok) return { ok: false, error: res.error };
  if (res.id == null) return { ok: false, error: "The event was saved but I couldn't read it back — check the calendar." };
  const eventId = res.id;

  // Register the undo separately: the action owns the write, so we record the
  // token around it rather than threading undo through the calendar path.
  const undo = await mutate({
    kind: "mcp.event.create",
    actor: actorFor(caller),
    run: async () => ({
      result: { eventId },
      undo: { kind: "mcp.event.create", payload: { eventId } },
    }),
  });

  const invited = res.invited ?? 0;
  return {
    ok: true,
    eventId,
    title,
    company: companyName,
    starts: startInput.replace("T", " "),
    attendees: attendees.map((a) => a.name),
    invitationsSent: invited,
    note: !autoInvite
      ? "In the diary and on Google. No invitation was emailed, as asked."
      : invited > 0
        ? `In the diary and on Google. ${invited} invitation${invited === 1 ? "" : "s"} emailed.`
        : res.inviteNotConfigured
          ? "In the diary and on Google. No invitation went out — email isn't configured in Settings."
          : "In the diary and on Google. No invitation went out — none of the attendees has an email address on file.",
    taskCodes: res.taskCodes ?? [],
    undoToken: undo.ok ? undo.undoToken ?? null : null,
  };
}

/* --------------------------------------------------------------- *
 * 4 — create_document  (tier 2: a record, never a file)
 * --------------------------------------------------------------- */

export async function mcpCreateDocument(
  caller: McpCaller,
  args: {
    title: string;
    company?: string;
    person?: string;
    category?: string;
    docType?: string;
    issuer?: string;
    referenceNo?: string;
    issueDate?: string;
    expiryDate?: string;
    notes?: string;
  },
): Promise<WriteResult> {
  const title = (args.title ?? "").trim();
  if (!title) return { ok: false, error: "The document needs a title." };
  if (!args.company && !args.person) {
    return { ok: false, error: "Whose document is it? Give me a company or a person." };
  }

  let companyId: number | null = null;
  let owner = "";
  if (args.company) {
    const company = await resolveCompany(caller, args.company);
    if ("error" in company) return { ok: false, error: company.error };
    companyId = company.id;
    owner = company.name;
  }
  let personId: number | null = null;
  if (args.person) {
    const person = await resolvePerson(caller, args.person);
    if ("error" in person) return { ok: false, error: person.error };
    personId = person.id;
    owner = owner ? `${owner} / ${person.name}` : person.name;
  }

  const issueDate = dayToDate(args.issueDate);
  if (args.issueDate && !issueDate) return { ok: false, error: `"${args.issueDate}" isn't a date I can read — use yyyy-mm-dd.` };
  const expiryDate = dayToDate(args.expiryDate);
  if (args.expiryDate && !expiryDate) return { ok: false, error: `"${args.expiryDate}" isn't a date I can read — use yyyy-mm-dd.` };

  const fd = new FormData();
  fd.set("title", title);
  if (companyId != null) fd.set("companyId", String(companyId));
  if (personId != null) fd.set("personId", String(personId));
  if (args.category) fd.set("category", args.category.trim());
  if (args.docType) fd.set("docType", args.docType.trim());
  if (args.issuer) fd.set("issuer", args.issuer.trim());
  if (args.referenceNo) fd.set("referenceNo", args.referenceNo.trim());
  if (args.issueDate) fd.set("issueDate", args.issueDate.slice(0, 10));
  if (args.expiryDate) fd.set("expiryDate", args.expiryDate.slice(0, 10));
  if (args.notes) fd.set("notes", args.notes.trim());

  const { createDocumentAction } = await import("@/app/documents/actions");
  const res = await createDocumentAction(fd, callerStamp(caller));
  if (!res.ok) return { ok: false, error: res.error };
  if (res.id == null) return { ok: false, error: "The document was saved but I couldn't read it back — check the Documents page." };
  const documentId = res.id;

  const undo = await mutate({
    kind: "mcp.document.create",
    actor: actorFor(caller),
    run: async () => ({
      result: { documentId },
      undo: { kind: "mcp.document.create", payload: { documentId } },
    }),
  });

  return {
    ok: true,
    documentId,
    title,
    filedUnder: owner,
    expires: expiryDate ? expiryDate.toISOString().slice(0, 10) : null,
    note: "This is the record only — no file is attached. Upload the file itself on the Documents page.",
    undoToken: undo.ok ? undo.undoToken ?? null : null,
  };
}

/* --------------------------------------------------------------- *
 * 5 — assign_asset  (tier 2: moves a real thing to a real person)
 * --------------------------------------------------------------- */

export async function mcpAssignAsset(
  caller: McpCaller,
  args: { asset: string; person: string; notes?: string },
): Promise<WriteResult> {
  const needle = (args.asset ?? "").trim();
  if (!needle) return { ok: false, error: "Which asset? Give me its tag or its name." };

  const person = await resolvePerson(caller, args.person);
  if ("error" in person) return { ok: false, error: person.error };

  // `.or()` takes a FILTER STRING, so anything the caller typed is syntax here —
  // a comma or a bracket would smuggle in extra conditions and widen the match.
  // Reduce it to the characters a tag, name or serial actually contains. (Every
  // other lookup in this file passes values through the client, which encodes
  // them; this one call builds a filter by hand, so it sanitises by hand.)
  const safe = needle.replace(/[^\p{L}\p{N} _\-/]/gu, " ").trim();
  if (!safe) return { ok: false, error: `No asset matching "${needle}".` };

  const { data } = await sb
    .from("assets")
    .select("id,tag,name,assigned_to_person_id,assigned_to_company_id,custodian_person_id,assigned_at,status")
    .eq("archived", false)
    .or(`tag.ilike.%${safe}%,name.ilike.%${safe}%,serial_no.ilike.%${safe}%`)
    .limit(10);
  const rows = (data ?? []) as {
    id: number; tag: string | null; name: string;
    assigned_to_person_id: number | null; assigned_to_company_id: number | null;
    custodian_person_id: number | null; assigned_at: string | null; status: string;
  }[];
  if (rows.length === 0) return { ok: false, error: `No asset matching "${needle}".` };

  const lower = needle.toLowerCase();
  const exact = rows.filter((r) => (r.tag ?? "").toLowerCase() === lower || r.name.toLowerCase() === lower);
  const asset = exact.length === 1 ? exact[0] : rows.length === 1 ? rows[0] : null;
  if (!asset) {
    return { ok: false, error: `"${needle}" matches ${rows.map((r) => r.tag ?? r.name).join(", ")}. Which one?` };
  }

  // Snapshot before the handover, plus the ledger row about to be closed, so undo
  // can put the asset back with the previous holder and reopen their row.
  const before = {
    assigned_to_person_id: asset.assigned_to_person_id,
    assigned_to_company_id: asset.assigned_to_company_id,
    custodian_person_id: asset.custodian_person_id,
    assigned_at: asset.assigned_at,
    status: asset.status,
  };
  const { data: openRow } = await sb
    .from("asset_assignments")
    .select("id")
    .eq("asset_id", asset.id)
    .is("returned_at", null)
    .maybeSingle();
  const reopenAssignmentId = (openRow?.id as number | undefined) ?? null;

  const { assignAssetAction } = await import("@/app/hrms/assets/actions");
  const res = await assignAssetAction(asset.id, person.id, args.notes ?? null);
  if (!res.ok) return { ok: false, error: res.error };

  const { data: newRow } = await sb
    .from("asset_assignments")
    .select("id")
    .eq("asset_id", asset.id)
    .is("returned_at", null)
    .maybeSingle();

  const undo = await mutate({
    kind: "mcp.asset.assign",
    actor: actorFor(caller),
    run: async () => ({
      result: { assetId: asset.id },
      undo: {
        kind: "mcp.asset.assign",
        payload: {
          assetId: asset.id,
          assignmentId: (newRow?.id as number | undefined) ?? null,
          before,
          reopenAssignmentId,
        },
      },
    }),
  });

  return {
    ok: true,
    asset: asset.tag ? `${asset.tag} — ${asset.name}` : asset.name,
    assignedTo: person.name,
    undoToken: undo.ok ? undo.undoToken ?? null : null,
  };
}

/* --------------------------------------------------------------- *
 * 6 — draft_message  (tier 3 → DRAFT ONLY. Nothing leaves the building.)
 * --------------------------------------------------------------- */

export async function mcpDraftMessage(
  caller: McpCaller,
  args: { person: string; body: string; subject?: string; channel?: string },
): Promise<WriteResult> {
  const body = (args.body ?? "").trim();
  if (!body) return { ok: false, error: "What should the message say?" };

  const target = await resolvePerson(caller, args.person);
  if ("error" in target) return { ok: false, error: target.error };

  const { data: person } = await sb
    .from("people")
    .select("id,name,email,phone,whatsapp,preferred_channel,company_id")
    .eq("id", target.id)
    .maybeSingle();
  if (!person) return { ok: false, error: "Recipient not found." };

  const { pickChannel, contactForChannel } = await import("@/lib/outbox/links");
  const contact = {
    email: (person.email as string | null) ?? null,
    phone: (person.phone as string | null) ?? null,
    whatsapp: (person.whatsapp as string | null) ?? null,
    preferredChannel: (person.preferred_channel as string | null) ?? null,
  };
  const requested = oneOf(["WHATSAPP", "EMAIL", "SMS"] as const, args.channel);
  const channel = requested ?? pickChannel(contact);
  const to = contactForChannel(contact, channel);
  const subject = (args.subject ?? "").trim() || "A note from Oracle Consultancy";

  let companyName: string | null = null;
  if (person.company_id) {
    const { data: c } = await sb.from("companies").select("name").eq("id", person.company_id).maybeSingle();
    companyName = (c?.name as string | null) ?? null;
  }

  // A DRAFT. status "Draft" is the whole guarantee: the Outbox lists it, the
  // owner reads it, and it moves only when a person presses send. Nothing here
  // opens an email client, calls an API or costs money.
  const { data: inserted, error } = await sb
    .from("outbox")
    .insert({
      channel,
      recipient_name: person.name as string,
      recipient_contact: to,
      company: companyName,
      subject: channel === "EMAIL" ? subject : null,
      body,
      message_type: "ASSISTANT DRAFT",
      status: "Draft",
      source: callerStamp(caller),
      person_id: person.id,
      created_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };
  const outboxId = inserted.id as number;

  const undo = await mutate({
    kind: "mcp.outbox.draft",
    actor: actorFor(caller),
    run: async () => ({
      result: { outboxId },
      undo: { kind: "mcp.outbox.draft", payload: { outboxId } },
    }),
  });

  return {
    ok: true,
    draftId: outboxId,
    to: person.name,
    channel,
    contactMissing: !to,
    note: to
      ? "Saved as a draft in the Outbox. Nothing has been sent — open the Outbox and press send yourself."
      : `Saved as a draft, but ${person.name} has no ${channel.toLowerCase()} contact on file, so it can't be sent until that's added.`,
    undoToken: undo.ok ? undo.undoToken ?? null : null,
  };
}

/* --------------------------------------------------------------- *
 * 7 — archive_task / archive_document  (filing away, NOT deleting)
 * --------------------------------------------------------------- */

/**
 * Archive or restore a task.
 *
 * Archiving is COS's soft delete: the row stays, its history stays, and it stays
 * searchable under "include history". That reversibility is the whole reason this
 * is allowed where a real delete is not — pass `archived: false` and it's back.
 */
export async function mcpArchiveTask(
  caller: McpCaller,
  args: { taskCode: string; archived?: boolean },
): Promise<WriteResult> {
  const task = await resolveTask(caller, args.taskCode, { includeArchived: true });
  if ("error" in task) return { ok: false, error: task.error };

  const archived = args.archived !== false;
  if (task.archived === archived) {
    return { ok: true, code: task.code, archived, note: `${task.code} was already ${archived ? "archived" : "active"}.` };
  }

  const { setTaskArchived } = await import("@/app/task/actions");
  const res = await setTaskArchived(task.code, archived, callerStamp(caller));
  if (!res.ok) return { ok: false, error: res.error ?? "Could not archive the task." };

  const undo = await mutate({
    kind: "mcp.task.archive",
    taskId: task.id,
    actor: actorFor(caller),
    run: async () => ({
      result: { taskId: task.id },
      undo: { kind: "mcp.task.archive", taskId: task.id, payload: { code: task.code, before: task.archived } },
    }),
  });

  return {
    ok: true,
    code: task.code,
    archived,
    note: archived
      ? `${task.code} is archived — it's out of the way, not gone, and can be restored.`
      : `${task.code} is back in the active list.`,
    undoToken: undo.ok ? undo.undoToken ?? null : null,
  };
}

/** Archive or restore a document. Same soft-delete reasoning as a task. */
export async function mcpArchiveDocument(
  caller: McpCaller,
  args: { documentId: number; archived?: boolean },
): Promise<WriteResult> {
  const id = Number(args.documentId);
  if (!Number.isFinite(id) || id <= 0) return { ok: false, error: "Which document? Give me its id from list_documents." };

  const { data: doc } = await sb
    .from("documents")
    .select("id,title,company_id,archived")
    .eq("id", id)
    .maybeSingle();
  if (!doc) return { ok: false, error: `No document with id ${id}.` };

  // A scoped caller reaches only their companies' documents.
  const scope = await scopeFor(caller);
  if (scope != null) {
    const companyId = doc.company_id as number | null;
    if (companyId == null || !scope.includes(companyId)) {
      return { ok: false, error: "That document isn't one of yours." };
    }
  }

  const archived = args.archived !== false;
  const before = doc.archived as boolean;
  if (before === archived) {
    return { ok: true, documentId: id, archived, note: `"${doc.title}" was already ${archived ? "archived" : "active"}.` };
  }

  const { archiveDocumentAction } = await import("@/app/documents/actions");
  const res = await archiveDocumentAction(id, archived);
  if (!res.ok) return { ok: false, error: res.error };

  const undo = await mutate({
    kind: "mcp.document.archive",
    actor: actorFor(caller),
    run: async () => ({
      result: { documentId: id },
      undo: { kind: "mcp.document.archive", payload: { documentId: id, before } },
    }),
  });

  return {
    ok: true,
    documentId: id,
    title: doc.title,
    archived,
    undoToken: undo.ok ? undo.undoToken ?? null : null,
  };
}

/* --------------------------------------------------------------- *
 * 8 — bulk_task_action  (several at once — never a delete)
 * --------------------------------------------------------------- */

export const BULK_ACTIONS = ["status", "priority", "postpone", "escalate", "close", "update"] as const;
/** How many tasks one call may touch. A cap, not a ban: bulk mistakes are the
 *  expensive kind, and anything larger than this is a job for the Tasks table
 *  where the owner can see every row they're about to change. */
const BULK_LIMIT = 25;

/**
 * Apply one change to several tasks.
 *
 * `delete` is a valid `BulkAction` in the underlying function and is NOT offered
 * here — deliberately. Note there is no per-item undo on the bulk path (the UI
 * confirms first instead), so this reports exactly what it touched and the
 * assistant is told to read that back.
 */
export async function mcpBulkTaskAction(
  caller: McpCaller,
  args: {
    taskCodes: string[];
    action: (typeof BULK_ACTIONS)[number];
    value?: string;
    days?: number;
    note?: string;
  },
): Promise<WriteResult> {
  const codes = Array.from(new Set((args.taskCodes ?? []).map((c) => String(c).trim()).filter(Boolean)));
  if (codes.length === 0) return { ok: false, error: "Which tasks? Give me their codes." };
  if (codes.length > BULK_LIMIT) {
    return { ok: false, error: `That's ${codes.length} tasks — I'll do up to ${BULK_LIMIT} at a time. Do it on the Tasks page where you can see them all.` };
  }

  // Resolve every code FIRST, through the same visibility test a single change
  // uses. One unreachable code fails the whole call: a bulk change that silently
  // did 9 of the 10 you asked for is worse than one that did nothing.
  const resolved: { id: number; code: string }[] = [];
  for (const code of codes) {
    const task = await resolveTask(caller, code);
    if ("error" in task) return { ok: false, error: task.error };
    resolved.push({ id: task.id, code: task.code });
  }

  let action: { kind: string; value?: string; days?: number; body?: string };
  switch (args.action) {
    case "status": {
      const allowed = mayFinishTasks(caller) ? ALL_STATUSES : OPEN_STATUSES;
      const s = oneOf(allowed, args.value);
      if (!s) return { ok: false, error: `Which status? One of: ${allowed.join(", ")}.` };
      action = { kind: "status", value: s };
      break;
    }
    case "priority": {
      const p = oneOf(PRIORITIES, args.value);
      if (!p) return { ok: false, error: `Which priority? One of: ${PRIORITIES.join(", ")}.` };
      action = { kind: "priority", value: p };
      break;
    }
    case "postpone": {
      const days = Math.round(Number(args.days));
      if (!Number.isFinite(days) || days === 0) return { ok: false, error: "By how many days?" };
      if (Math.abs(days) > 365) return { ok: false, error: "That's more than a year — give me a number of days under 365." };
      action = { kind: "postpone", days };
      break;
    }
    case "escalate":
      action = { kind: "escalate" };
      break;
    case "close":
      if (!mayFinishTasks(caller)) return { ok: false, error: "Closing tasks off isn't something your login can do." };
      action = { kind: "close" };
      break;
    case "update": {
      const body = (args.note ?? "").trim();
      if (!body) return { ok: false, error: "What should the update say?" };
      action = { kind: "update", body };
      break;
    }
    default:
      return { ok: false, error: `I can do: ${BULK_ACTIONS.join(", ")}.` };
  }

  const { bulkUpdateTasks } = await import("@/app/task/actions");
  const res = await bulkUpdateTasks(
    resolved.map((r) => r.code),
    action as Parameters<typeof bulkUpdateTasks>[1],
    callerStamp(caller),
  );

  // Nothing changed AND something went wrong = a failure, not a quiet no-op.
  if (res.applied === 0 && res.errors.length > 0) {
    return { ok: false, error: res.errors.map((e) => `${e.code}: ${e.error}`).join("; ") };
  }

  return {
    ok: true,
    changed: res.applied,
    alreadyThatWay: res.skipped,
    tasks: resolved.map((r) => r.code),
    errors: res.errors,
    note: "There's no single undo for a bulk change — read back what changed and check it.",
  };
}

/* --------------------------------------------------------------- *
 * undo — reverse something this caller just did
 * --------------------------------------------------------------- */

/**
 * Undo an MCP write, within its ten-minute window.
 *
 * Deliberately narrow, and it is NOT a delete tool: it can only consume a token
 * this same caller created (`created_by` = their stamp), it expires with the
 * token, and each token works once. An assistant cannot point it at anything a
 * person did, or at anything another key did.
 */
export async function mcpUndoLast(
  caller: McpCaller,
  args: { token?: string },
): Promise<WriteResult> {
  const stamp = callerStamp(caller);
  let tokenId = (args.token ?? "").trim();

  if (!tokenId) {
    const { data } = await sb
      .from("undo_tokens")
      .select("id,kind,created_at")
      .eq("created_by", stamp)
      .is("consumed_at", null)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(1);
    const row = (data ?? [])[0] as { id: string; kind: string } | undefined;
    if (!row) return { ok: false, error: "Nothing of mine left to undo — anything older than ten minutes has to be changed by hand." };
    tokenId = row.id;
  } else {
    // A token belongs to whoever made the change. Never let one key reverse another's.
    const { data } = await sb.from("undo_tokens").select("created_by").eq("id", tokenId).maybeSingle();
    if (!data || (data.created_by as string) !== stamp) {
      return { ok: false, error: "That undo token isn't one of mine." };
    }
  }

  const res = await consumeUndo(tokenId);
  if (!res.ok) return { ok: false, error: res.message };
  return { ok: true, undone: true, message: res.message };
}

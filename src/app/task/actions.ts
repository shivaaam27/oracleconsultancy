"use server";

import { revalidatePath, updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { sb } from "@/db/supabase";
import {
  getOrCreatePersonSb,
  getOrCreateDeptSb,
  deptNameSb,
  logChangeSb,
  insertTaskWithUniqueCodeSb,
} from "@/lib/db-helpers";
import { mutate } from "@/lib/mutate";
import { setUndoCookie } from "@/lib/undo-cookie";

function parseDate(v: FormDataEntryValue | null): Date | null {
  if (!v || typeof v !== "string" || v.trim() === "") return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

function str(v: FormDataEntryValue | null): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

function splitNames(v: string | null): string[] {
  if (!v) return [];
  // Split on commas or " & " (with surrounding spaces). Previously included
  // " and " too, which mangled names containing "and" as a word
  // (e.g. "Rand and Co" → ["R", "Co"]). Users wanting "and" as a separator
  // should use a comma.
  return v.split(/,|\s+&\s+/).map((x) => x.trim()).filter(Boolean);
}

function isoOrNull(d: Date | null | undefined): string | null {
  return d ? d.toISOString() : null;
}

type TaskRowRaw = {
  id: number;
  code: string;
  company_id: number;
  department_id: number | null;
  action_item: string;
  owner_id: number | null;
  meeting_date: string | null;
  created_date: string | null;
  deadline: string | null;
  status: string;
  priority: string;
  category: string | null;
  risk: string | null;
  escalation: string | null;
  comments: string | null;
  latest_update: string | null;
  last_updated_at: string | null;
  closed_date: string | null;
  archived: boolean;
};

async function findTaskByCode(code: string): Promise<TaskRowRaw | null> {
  const { data, error } = await sb.from("tasks").select("*").eq("code", code).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as TaskRowRaw | null) ?? null;
}

async function loadAssignees(taskId: number): Promise<number[]> {
  const { data, error } = await sb.from("task_assignees").select("person_id").eq("task_id", taskId);
  if (error) throw new Error(error.message);
  return (data ?? []).map((a) => a.person_id as number);
}

async function allPeopleMap(): Promise<Map<number, string>> {
  const { data, error } = await sb.from("people").select("id,name");
  if (error) throw new Error(error.message);
  return new Map((data ?? []).map((p) => [p.id as number, p.name as string]));
}

export async function updateTask(code: string, formData: FormData) {
  const actionItemField = str(formData.get("actionItem"));
  const departmentName = str(formData.get("department"));
  const statusField = str(formData.get("status"));
  const priorityField = str(formData.get("priority"));
  const riskField = formData.has("risk") ? str(formData.get("risk")) : undefined;
  const escalationField = str(formData.get("escalation"));
  const categoryField = formData.has("category") ? str(formData.get("category")) : undefined;
  const deadline = parseDate(formData.get("deadline"));
  const meetingDate = parseDate(formData.get("meetingDate"));
  const comments = str(formData.get("comments"));
  const latestUpdate = str(formData.get("latestUpdate"));
  const accountableRaw = str(formData.get("accountable"));
  const changeReason = str(formData.get("changeReason"));

  const result = await mutate({
    kind: "task.update",
    run: async () => {
      const t = await findTaskByCode(code);
      if (!t) throw new Error("Task not found");

      const actionItem = actionItemField || t.action_item;
      const departmentId = await getOrCreateDeptSb(departmentName);
      const status = statusField ?? t.status;
      const priority = priorityField ?? t.priority;
      const risk = riskField === undefined ? t.risk : riskField;
      const escalation = escalationField ?? t.escalation ?? "No";
      const category = categoryField === undefined ? t.category : categoryField;
      const wasClosed = t.status === "Completed" || t.status === "Closed";
      const isClosed = status === "Completed" || status === "Closed";
      const closingNow = isClosed && !wasClosed;
      const reopeningNow = !isClosed && wasClosed;

      const [oldDeptName, newDeptName] = await Promise.all([
        deptNameSb(t.department_id),
        deptNameSb(departmentId),
      ]);

      const beforeAssignees = await loadAssignees(t.id);

      const fields: [string, unknown, unknown][] = [
        ["Action Item", t.action_item, actionItem],
        ["Department", oldDeptName, newDeptName],
        ["Status", t.status, status],
        ["Priority", t.priority, priority],
        ["Risk", t.risk, risk],
        ["Escalation", t.escalation, escalation],
        ["Category", t.category, category],
        ["Deadline", t.deadline ? new Date(t.deadline) : null, deadline],
        ["Meeting Date", t.meeting_date ? new Date(t.meeting_date) : null, meetingDate],
        ["Comments", t.comments, comments],
        ["Latest Update", t.latest_update, latestUpdate],
      ];
      for (const [f, o, n] of fields) {
        await logChangeSb(t.id, t.code, t.company_id, f, o, n, changeReason);
      }

      const newClosedDate = closingNow
        ? new Date().toISOString()
        : reopeningNow
          ? null
          : t.closed_date;

      await sb
        .from("tasks")
        .update({
          action_item: actionItem,
          department_id: departmentId,
          status,
          priority,
          risk,
          escalation,
          category,
          deadline: isoOrNull(deadline),
          meeting_date: isoOrNull(meetingDate),
          comments,
          latest_update: latestUpdate,
          last_updated_at: new Date().toISOString(),
          closed_date: newClosedDate,
        })
        .eq("id", t.id);

      const newNames = splitNames(accountableRaw);
      const pMap = await allPeopleMap();
      const oldNamesStr = beforeAssignees.map((id) => pMap.get(id)).filter(Boolean).join(", ");
      const newNamesStr = newNames.join(", ");
      if (oldNamesStr !== newNamesStr) {
        await logChangeSb(t.id, t.code, t.company_id, "Accountable", oldNamesStr, newNamesStr, changeReason);
        await sb.from("task_assignees").delete().eq("task_id", t.id);
        for (const n of newNames) {
          const pid = await getOrCreatePersonSb(n, t.company_id);
          await sb
            .from("task_assignees")
            .upsert({ task_id: t.id, person_id: pid }, { ignoreDuplicates: true });
        }
      }

      return {
        result: { code: t.code },
        undo: {
          kind: "task.update",
          taskId: t.id,
          payload: {
            taskId: t.id,
            taskCode: t.code,
            companyId: t.company_id,
            before: {
              actionItem: t.action_item,
              departmentId: t.department_id,
              status: t.status,
              priority: t.priority,
              risk: t.risk,
              escalation: t.escalation,
              category: t.category,
              deadline: t.deadline,
              meetingDate: t.meeting_date,
              comments: t.comments,
              latestUpdate: t.latest_update,
              lastUpdatedAt: t.last_updated_at,
              closedDate: t.closed_date,
            },
            beforeAssignees,
          },
        },
      };
    },
  });

  if (!result.ok) throw new Error(result.error);
  if (result.undoToken) await setUndoCookie(result.undoToken, "Task updated.");

  revalidatePath(`/task/${code}`);
  revalidatePath("/registry");
  revalidatePath("/");
  updateTag("tasks");
  redirect(`/task/${code}`);
}

export async function createTask(formData: FormData) {
  const companyId = parseInt(String(formData.get("companyId")), 10);
  const actionItem = str(formData.get("actionItem"));
  if (!companyId || !actionItem) throw new Error("Company and Action Item are required");

  const departmentName = str(formData.get("department"));
  const status = str(formData.get("status")) || "Not Started";
  const priority = str(formData.get("priority")) || "Low";
  const risk = str(formData.get("risk"));
  const escalation = str(formData.get("escalation")) || "No";
  const category = str(formData.get("category"));
  const deadline = parseDate(formData.get("deadline"));
  const meetingDate = parseDate(formData.get("meetingDate"));
  const comments = str(formData.get("comments"));
  const latestUpdate = str(formData.get("latestUpdate"));
  const accountableRaw = str(formData.get("accountable"));

  const result = await mutate({
    kind: "task.create",
    run: async () => {
      const { data: company, error: cErr } = await sb
        .from("companies")
        .select("code")
        .eq("id", companyId)
        .maybeSingle();
      if (cErr) throw new Error(cErr.message);
      if (!company) throw new Error("Company not found");

      const departmentId = await getOrCreateDeptSb(departmentName);
      const now = new Date();

      const task = await insertTaskWithUniqueCodeSb(companyId, company.code as string, {
        departmentId,
        actionItem,
        status,
        priority,
        risk,
        escalation,
        category,
        deadline,
        meetingDate,
        comments,
        latestUpdate,
        createdDate: now,
        lastUpdatedAt: now,
        archived: false,
      });

      for (const n of splitNames(accountableRaw)) {
        const pid = await getOrCreatePersonSb(n, companyId);
        await sb
          .from("task_assignees")
          .upsert({ task_id: task.id, person_id: pid }, { ignoreDuplicates: true });
      }

      await sb.from("audit_log").insert({
        task_id: task.id,
        task_code: task.code,
        company_id: companyId,
        entry_type: "CREATE",
        field: "Task",
        old_value: null,
        new_value: actionItem,
        change_reason: null,
        created_at: now.toISOString(),
        created_by: "web-ui",
      });

      return {
        result: { code: task.code },
        undo: { kind: "task.create", taskId: task.id, payload: { taskId: task.id } },
      };
    },
  });

  if (!result.ok) throw new Error(result.error);
  if (result.undoToken) await setUndoCookie(result.undoToken, "Task created.");

  revalidatePath("/registry");
  revalidatePath("/");
  updateTag("tasks");
  redirect(`/task/${result.result.code}`);
}

export async function deleteTask(code: string) {
  const result = await mutate({
    kind: "task.delete",
    run: async () => {
      const t = await findTaskByCode(code);
      if (!t) return { result: null, undo: undefined };
      const assignees = await loadAssignees(t.id);

      // Record the deletion in the audit log BEFORE removing the row, so a
      // deleted task always leaves a trace on /audit even after the undo
      // window expires. task_id will null out via the FK on delete, but
      // task_code (text) persists so the entry stays attributable.
      await sb.from("audit_log").insert({
        task_id: t.id,
        task_code: t.code,
        company_id: t.company_id,
        entry_type: "CHANGE",
        field: "Task deleted",
        old_value: t.action_item,
        new_value: "(deleted)",
        change_reason: null,
        created_at: new Date().toISOString(),
        created_by: "web-ui",
      });

      await sb.from("tasks").delete().eq("id", t.id);

      return {
        result: { deleted: true },
        undo: {
          kind: "task.delete",
          payload: {
            task: {
              code: t.code,
              companyId: t.company_id,
              departmentId: t.department_id,
              meetingDate: t.meeting_date,
              actionItem: t.action_item,
              ownerId: t.owner_id,
              createdDate: t.created_date,
              deadline: t.deadline,
              status: t.status,
              priority: t.priority,
              category: t.category,
              risk: t.risk,
              escalation: t.escalation,
              comments: t.comments,
              latestUpdate: t.latest_update,
              lastUpdatedAt: t.last_updated_at,
              closedDate: t.closed_date,
              archived: t.archived,
            },
            assignees,
          },
        },
      };
    },
  });

  if (!result.ok) throw new Error(result.error);
  if (result.undoToken) await setUndoCookie(result.undoToken, "Task deleted.");

  revalidatePath("/registry");
  revalidatePath("/");
  updateTag("tasks");
  redirect("/registry");
}

export async function addTaskUpdate(taskId: number, taskCode: string, body: string, newStatus?: string) {
  const trimmed = body.trim();
  if (!trimmed) return;

  const result = await mutate({
    kind: "task.update.add",
    taskId,
    run: async () => {
      const { data: t, error: tErr } = await sb
        .from("tasks")
        .select("status,closed_date,latest_update,last_updated_at,company_id")
        .eq("id", taskId)
        .maybeSingle();
      if (tErr) throw new Error(tErr.message);
      if (!t) throw new Error("Task not found");

      const before = {
        latestUpdate: t.latest_update as string | null,
        lastUpdatedAt: t.last_updated_at as string | null,
        status: t.status as string,
        closedDate: t.closed_date as string | null,
      };

      const { data: inserted, error: insErr } = await sb
        .from("task_updates")
        .insert({
          task_id: taskId,
          body: trimmed,
          created_at: new Date().toISOString(),
          created_by: "web-ui",
        })
        .select("id")
        .single();
      if (insErr) throw new Error(insErr.message);
      const taskUpdateId = inserted.id as number;

      const updatePayload: Record<string, unknown> = {
        latest_update: trimmed,
        last_updated_at: new Date().toISOString(),
      };

      if (newStatus) {
        const wasClosed = t.status === "Completed" || t.status === "Closed";
        const isClosed = newStatus === "Completed" || newStatus === "Closed";
        updatePayload.status = newStatus;
        if (isClosed && !wasClosed) updatePayload.closed_date = new Date().toISOString();
        else if (!isClosed && wasClosed) updatePayload.closed_date = null;

        if (t.status !== newStatus) {
          await sb.from("audit_log").insert({
            task_id: taskId,
            task_code: taskCode,
            company_id: t.company_id as number,
            entry_type: "CHANGE",
            field: "Status",
            old_value: t.status,
            new_value: newStatus,
            change_reason: trimmed,
            created_at: new Date().toISOString(),
            created_by: "web-ui",
          });
        }
      }

      await sb.from("tasks").update(updatePayload).eq("id", taskId);

      return {
        result: { taskUpdateId },
        undo: {
          kind: "task.update.add",
          taskId,
          payload: {
            taskUpdateId,
            taskId,
            taskCode,
            companyId: t.company_id as number,
            before,
          },
        },
      };
    },
  });

  if (!result.ok) throw new Error(result.error);
  if (result.undoToken) await setUndoCookie(result.undoToken, "Update added.");

  revalidatePath(`/task/${taskCode}`);
  revalidatePath("/registry");
  revalidatePath("/");
  updateTag("tasks");
}

/* ----------------------------------------------------------------------
 * Bulk operations
 * ----------------------------------------------------------------------
 * Applied to many tasks at once from the Tasks page selection toolbar.
 * Each task gets its own audit-log entry so history stays per-task.
 * No undo token (bulk undo is intentionally not supported — the user is
 * expected to confirm before applying).
 */

/* ----------------------------------------------------------------------
 * Per-update operations: edit, soft-delete, pin/unpin
 * ----------------------------------------------------------------------
 * Updates live in task_updates; corrections leaves an audit trail and
 * preserves the original body the first time you edit a row. Soft-deletes
 * are hidden from timelines but kept in the table for governance.
 *
 * The denormalised tasks.latest_update mirror is re-derived after each of
 * these ops so the task header stays in sync.
 */

async function recomputeLatestUpdateMirror(taskId: number) {
  // Pick the most recent non-deleted update and copy its body to tasks.latest_update.
  const { data: latest } = await sb
    .from("task_updates")
    .select("body,created_at")
    .eq("task_id", taskId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  await sb
    .from("tasks")
    .update({
      latest_update: latest?.body ?? null,
      last_updated_at: latest?.created_at ?? new Date().toISOString(),
    })
    .eq("id", taskId);
}

async function loadUpdate(updateId: number) {
  const { data, error } = await sb
    .from("task_updates")
    .select("id,task_id,body,original_body,edited_at,deleted_at,pinned_at,created_at")
    .eq("id", updateId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

async function findTaskMeta(taskId: number) {
  const { data } = await sb
    .from("tasks")
    .select("code,company_id")
    .eq("id", taskId)
    .maybeSingle();
  return data as { code: string; company_id: number } | null;
}

export async function editTaskUpdate(
  updateId: number,
  newBody: string,
  reason?: string
): Promise<{ ok: boolean; error?: string }> {
  const trimmed = newBody.trim();
  if (!trimmed) return { ok: false, error: "Body cannot be empty." };

  const u = await loadUpdate(updateId);
  if (!u) return { ok: false, error: "Update not found." };
  if (u.deleted_at) return { ok: false, error: "Update is deleted." };
  if (u.body === trimmed) return { ok: true };

  const t = await findTaskMeta(u.task_id);
  if (!t) return { ok: false, error: "Task not found." };

  const now = new Date().toISOString();
  await sb
    .from("task_updates")
    .update({
      body: trimmed,
      // Preserve original body only on the first edit
      original_body: u.original_body ?? u.body,
      edited_at: now,
    })
    .eq("id", updateId);

  await sb.from("audit_log").insert({
    task_id: u.task_id,
    task_code: t.code,
    company_id: t.company_id,
    entry_type: "CHANGE",
    field: "Update edited",
    old_value: u.original_body ?? u.body,
    new_value: trimmed,
    change_reason: reason ?? null,
    created_at: now,
    created_by: "web-ui",
  });

  await recomputeLatestUpdateMirror(u.task_id);
  revalidatePath(`/task/${t.code}`);
  revalidatePath(`/companies/${t.company_id}`);
  revalidatePath("/");
  updateTag("tasks");
  return { ok: true };
}

export async function deleteTaskUpdate(
  updateId: number,
  reason?: string
): Promise<{ ok: boolean; error?: string }> {
  const u = await loadUpdate(updateId);
  if (!u) return { ok: false, error: "Update not found." };
  if (u.deleted_at) return { ok: true };

  const t = await findTaskMeta(u.task_id);
  if (!t) return { ok: false, error: "Task not found." };

  const now = new Date().toISOString();
  await sb.from("task_updates").update({ deleted_at: now }).eq("id", updateId);

  await sb.from("audit_log").insert({
    task_id: u.task_id,
    task_code: t.code,
    company_id: t.company_id,
    entry_type: "CHANGE",
    field: "Update deleted",
    old_value: u.body,
    new_value: "(deleted)",
    change_reason: reason ?? null,
    created_at: now,
    created_by: "web-ui",
  });

  await recomputeLatestUpdateMirror(u.task_id);
  revalidatePath(`/task/${t.code}`);
  revalidatePath(`/companies/${t.company_id}`);
  revalidatePath("/");
  updateTag("tasks");
  return { ok: true };
}

export async function toggleUpdatePin(updateId: number): Promise<{ ok: boolean; pinned?: boolean; error?: string }> {
  const u = await loadUpdate(updateId);
  if (!u) return { ok: false, error: "Update not found." };
  if (u.deleted_at) return { ok: false, error: "Update is deleted." };

  const t = await findTaskMeta(u.task_id);
  if (!t) return { ok: false, error: "Task not found." };

  const wasPinned = !!u.pinned_at;
  const now = new Date().toISOString();
  await sb
    .from("task_updates")
    .update({ pinned_at: wasPinned ? null : now })
    .eq("id", updateId);

  await sb.from("audit_log").insert({
    task_id: u.task_id,
    task_code: t.code,
    company_id: t.company_id,
    entry_type: "CHANGE",
    field: wasPinned ? "Update unpinned" : "Update pinned",
    old_value: wasPinned ? "pinned" : null,
    new_value: wasPinned ? null : "pinned",
    change_reason: null,
    created_at: now,
    created_by: "web-ui",
  });

  revalidatePath(`/task/${t.code}`);
  revalidatePath(`/companies/${t.company_id}`);
  revalidatePath("/");
  updateTag("tasks");
  return { ok: true, pinned: !wasPinned };
}

export type BulkAction =
  | { kind: "status"; value: string }
  | { kind: "priority"; value: string }
  | { kind: "postpone"; days: number }
  | { kind: "escalate" }
  | { kind: "close" }
  | { kind: "update"; body: string };

export type BulkResult = {
  ok: boolean;
  applied: number;
  skipped: number;
  errors: { code: string; error: string }[];
};

export async function bulkUpdateTasks(codes: string[], action: BulkAction): Promise<BulkResult> {
  if (!Array.isArray(codes) || codes.length === 0) {
    return { ok: false, applied: 0, skipped: 0, errors: [{ code: "-", error: "No tasks selected" }] };
  }

  const errors: { code: string; error: string }[] = [];
  let applied = 0;
  let skipped = 0;

  for (const code of codes) {
    try {
      const t = await findTaskByCode(code);
      if (!t) {
        errors.push({ code, error: "Not found" });
        continue;
      }

      const now = new Date();
      const nowIso = now.toISOString();
      const patch: Record<string, unknown> = { last_updated_at: nowIso };
      let field = "";
      let oldVal: unknown = null;
      let newVal: unknown = null;
      let changeReason: string | null = null;

      if (action.kind === "status") {
        if (t.status === action.value) { skipped++; continue; }
        const wasClosed = t.status === "Completed" || t.status === "Closed";
        const isClosed = action.value === "Completed" || action.value === "Closed";
        patch.status = action.value;
        if (isClosed && !wasClosed) patch.closed_date = nowIso;
        else if (!isClosed && wasClosed) patch.closed_date = null;
        field = "Status";
        oldVal = t.status;
        newVal = action.value;
        changeReason = "Bulk update";
      } else if (action.kind === "priority") {
        if (t.priority === action.value) { skipped++; continue; }
        patch.priority = action.value;
        field = "Priority";
        oldVal = t.priority;
        newVal = action.value;
        changeReason = "Bulk update";
      } else if (action.kind === "postpone") {
        const base = t.deadline ? new Date(t.deadline) : new Date();
        const next = new Date(base);
        next.setDate(next.getDate() + action.days);
        patch.deadline = next.toISOString();
        field = "Deadline";
        oldVal = t.deadline ? new Date(t.deadline) : null;
        newVal = next;
        changeReason = `Bulk: postponed ${action.days}d`;
      } else if (action.kind === "escalate") {
        if (t.escalation === "Yes" && t.status === "Escalated") { skipped++; continue; }
        patch.escalation = "Yes";
        patch.status = "Escalated";
        field = "Escalation";
        oldVal = t.escalation;
        newVal = "Yes";
        changeReason = "Bulk: escalated";
      } else if (action.kind === "close") {
        if (t.status === "Closed") { skipped++; continue; }
        patch.status = "Closed";
        patch.closed_date = nowIso;
        field = "Status";
        oldVal = t.status;
        newVal = "Closed";
        changeReason = "Bulk: closed";
      } else if (action.kind === "update") {
        const body = action.body.trim();
        if (!body) { skipped++; continue; }
        // Append a task_updates row + denormalised latest_update mirror
        await sb.from("task_updates").insert({
          task_id: t.id,
          body,
          created_at: nowIso,
          created_by: "web-ui",
        });
        patch.latest_update = body;
        field = "Update";
        oldVal = null;
        newVal = body;
        changeReason = null;
      }

      if (field) {
        await logChangeSb(t.id, t.code, t.company_id, field, oldVal, newVal, changeReason);
      }
      await sb.from("tasks").update(patch).eq("id", t.id);
      applied++;
    } catch (e) {
      errors.push({ code, error: e instanceof Error ? e.message : String(e) });
    }
  }

  revalidatePath("/");
  updateTag("tasks");

  return { ok: errors.length === 0, applied, skipped, errors };
}

export async function inlineUpdateTask(
  code: string,
  field: "status" | "priority" | "deadline" | "category" | "escalation",
  value: string | null
): Promise<{ ok: boolean; undoToken?: string; error?: string }> {
  const result = await mutate({
    kind: "task.update",
    run: async () => {
      const t = await findTaskByCode(code);
      if (!t) throw new Error("Task not found");

      const beforeAssignees = await loadAssignees(t.id);

      const patch: Record<string, unknown> = { last_updated_at: new Date().toISOString() };
      let oldVal: unknown = null;
      let newVal: unknown = null;
      let fieldLabel = "";

      if (field === "status") {
        const status = value || t.status;
        oldVal = t.status;
        newVal = status;
        fieldLabel = "Status";
        const wasClosed = t.status === "Completed" || t.status === "Closed";
        const isClosed = status === "Completed" || status === "Closed";
        patch.status = status;
        if (isClosed && !wasClosed) patch.closed_date = new Date().toISOString();
        else if (!isClosed && wasClosed) patch.closed_date = null;
      } else if (field === "priority") {
        oldVal = t.priority;
        newVal = value || t.priority;
        fieldLabel = "Priority";
        patch.priority = value || t.priority;
      } else if (field === "deadline") {
        const newDate = value ? new Date(value) : null;
        oldVal = t.deadline ? new Date(t.deadline) : null;
        newVal = newDate;
        fieldLabel = "Deadline";
        patch.deadline = newDate ? newDate.toISOString() : null;
      } else if (field === "category") {
        oldVal = t.category;
        newVal = value;
        fieldLabel = "Category";
        patch.category = value;
      } else if (field === "escalation") {
        oldVal = t.escalation;
        newVal = value || "No";
        fieldLabel = "Escalation";
        patch.escalation = value || "No";
      }

      await logChangeSb(t.id, t.code, t.company_id, fieldLabel, oldVal, newVal, null);
      await sb.from("tasks").update(patch).eq("id", t.id);

      return {
        result: { code: t.code },
        undo: {
          kind: "task.update",
          taskId: t.id,
          payload: {
            taskId: t.id,
            taskCode: t.code,
            companyId: t.company_id,
            before: {
              actionItem: t.action_item,
              departmentId: t.department_id,
              status: t.status,
              priority: t.priority,
              risk: t.risk,
              escalation: t.escalation,
              category: t.category,
              deadline: t.deadline,
              meetingDate: t.meeting_date,
              comments: t.comments,
              latestUpdate: t.latest_update,
              lastUpdatedAt: t.last_updated_at,
              closedDate: t.closed_date,
            },
            beforeAssignees,
          },
        },
      };
    },
  });

  if (!result.ok) return { ok: false, error: result.error };

  revalidatePath(`/task/${code}`);
  revalidatePath("/");
  updateTag("tasks");
  return { ok: true, undoToken: result.undoToken };
}

/** Archive / unarchive a task. Undo is simply the inverse call (no token needed). */
export async function setTaskArchived(code: string, archived: boolean): Promise<{ ok: boolean; error?: string }> {
  const { data: t, error } = await sb.from("tasks").select("id,company_id").eq("code", code).maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!t) return { ok: false, error: "Task not found" };
  await sb.from("tasks").update({ archived, last_updated_at: new Date().toISOString() }).eq("id", t.id);
  await sb.from("audit_log").insert({
    task_id: t.id, task_code: code, company_id: t.company_id,
    entry_type: "CHANGE", field: "Archived",
    old_value: String(!archived), new_value: String(archived),
    change_reason: null, created_at: new Date().toISOString(), created_by: "web-ui",
  });
  revalidatePath("/"); updateTag("tasks");
  return { ok: true };
}

/** Delete a task and return an undo token (no redirect — for swipe/quick delete). */
export async function deleteTaskQuick(code: string): Promise<{ ok: boolean; undoToken?: string; error?: string }> {
  const result = await mutate({
    kind: "task.delete",
    run: async () => {
      const t = await findTaskByCode(code);
      if (!t) return { result: null, undo: undefined };
      const assignees = await loadAssignees(t.id);
      await sb.from("audit_log").insert({
        task_id: t.id, task_code: t.code, company_id: t.company_id,
        entry_type: "CHANGE", field: "Task deleted",
        old_value: t.action_item, new_value: "(deleted)",
        change_reason: null, created_at: new Date().toISOString(), created_by: "web-ui",
      });
      await sb.from("tasks").delete().eq("id", t.id);
      return {
        result: { deleted: true },
        undo: {
          kind: "task.delete",
          payload: {
            task: {
              code: t.code, companyId: t.company_id, departmentId: t.department_id,
              meetingDate: t.meeting_date, actionItem: t.action_item, ownerId: t.owner_id,
              createdDate: t.created_date, deadline: t.deadline, status: t.status,
              priority: t.priority, category: t.category, risk: t.risk, escalation: t.escalation,
              comments: t.comments, latestUpdate: t.latest_update, lastUpdatedAt: t.last_updated_at,
              closedDate: t.closed_date, archived: t.archived,
            },
            assignees,
          },
        },
      };
    },
  });
  if (!result.ok) return { ok: false, error: result.error };
  revalidatePath("/"); updateTag("tasks");
  return { ok: true, undoToken: result.undoToken };
}

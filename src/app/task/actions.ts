"use server";

import { revalidatePath, updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { sb } from "@/db/supabase";
import {
  getOrCreatePersonSb,
  getOrCreateDeptSb,
  deptNameSb,
  logChangeSb,
} from "@/lib/db-helpers";
import { mutate, type UndoSpec } from "@/lib/mutate";
import { setUndoCookie } from "@/lib/undo-cookie";
import { withTx } from "@/lib/tx";
import { computeClosedDate, computeClosedDateFrom } from "@/lib/task-status";
import { tasks as tasksTable, taskAssignees, auditLog } from "@/db/schema";
import { eq } from "drizzle-orm";
import { reindexEntity, removeEntityIndex } from "@/lib/index-hooks";
import { createTaskAttachment } from "@/lib/documents";
import { parseMentionIds } from "@/lib/mentions";
import { createNotification, notifyMany, notifyPinned, personRecipient, recipientForCreatedBy } from "@/lib/notifications";
import { broadcastPulse } from "@/lib/cos-pulse";
import { getGivenName } from "@/lib/names";

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

/** Snapshot the full conversation (every task_updates row) so a delete + Undo
 *  restores the discussion, not just the task shell (ACTTASKS-02). */
async function loadTaskUpdatesSnapshot(taskId: number) {
  const { data, error } = await sb
    .from("task_updates")
    .select("body,created_at,created_by,original_body,edited_at,deleted_at,pinned_at,parent_update_id,attachment_document_id")
    .eq("task_id", taskId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}

/** Snapshot the originating meeting/note links so provenance survives Undo. */
async function loadMeetingLinksSnapshot(taskId: number) {
  const { data, error } = await sb
    .from("meeting_tasks")
    .select("meeting_id,created_at")
    .eq("task_id", taskId);
  if (error) throw new Error(error.message);
  return data ?? [];
}

/** Build the undo payload that the registered "task.delete" handler
 *  (src/lib/undo-handlers/tasks.ts) restores: the task row, its assignees, the
 *  full conversation (task_updates) and its meeting/note provenance links. The
 *  conversation + links are snapshotted because deleting the task row cascades
 *  them away (FK onDelete: cascade) — without the snapshot, Undo would silently
 *  lose them (ACTTASKS-02). */
function taskDeleteUndo(
  t: TaskRowRaw,
  assignees: number[],
  updates: Awaited<ReturnType<typeof loadTaskUpdatesSnapshot>>,
  meetingLinks: Awaited<ReturnType<typeof loadMeetingLinksSnapshot>>
): UndoSpec {
  return {
    kind: "task.delete",
    taskId: t.id,
    payload: {
      updates,
      meetingLinks,
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
  };
}

async function allPeopleMap(): Promise<Map<number, string>> {
  const { data, error } = await sb.from("people").select("id,name");
  if (error) throw new Error(error.message);
  return new Map((data ?? []).map((p) => [p.id as number, p.name as string]));
}

/** Fire the cross-process cascade when a task's status changes: completing a task
 *  that DRIVES a pipeline case (pipeline.task_id) advances that case a stage.
 *  Guarded + dynamic-imported (avoids cycles); never affects the task write. */
async function fireTaskCascade(taskId: number, wasStatus: string, nowStatus: string) {
  if (wasStatus === nowStatus) return;
  try {
    const m = await import("@/lib/automation-reactions");
    await m.reactToTaskStatusChange(taskId, wasStatus, nowStatus);
  } catch { /* best-effort */ }
}

/** Per-task reminder (Command Centre): draft a SINGLE-task WhatsApp/Email/SMS
 *  message to the task's accountable person and return a ready-to-send deep link.
 *  Unlike the Outbox bundle (every open task per person), this is scoped to ONE
 *  task — mirrors the portal's portalRemindTask. The greeting uses the given name
 *  (honorific stripped), and the WhatsApp link carries the single-task text, not
 *  the all-tasks preview card. */
export async function adminRemindTask(
  taskId: number,
  allTasks = false,
): Promise<
  | { ok: true; link: string | null; name: string; channel: string; contactMissing: boolean }
  | { ok: false; error: string }
> {
  const { data: t } = await sb
    .from("tasks")
    .select("id,code,action_item,owner_id,company_id")
    .eq("id", taskId)
    .maybeSingle();
  if (!t) return { ok: false, error: "Task not found." };

  let personId = (t.owner_id as number | null) ?? null;
  if (!personId) {
    const { data: a } = await sb
      .from("task_assignees")
      .select("person_id")
      .eq("task_id", taskId)
      .eq("role", "accountable")
      .maybeSingle();
    personId = (a?.person_id as number | null) ?? null;
  }
  if (!personId) return { ok: false, error: "No one is responsible for this task yet." };

  const { data: person } = await sb
    .from("people")
    .select("id,name,email,phone,whatsapp,preferred_channel,company_id")
    .eq("id", personId)
    .maybeSingle();
  if (!person) return { ok: false, error: "Recipient not found." };

  const name = person.name as string;

  // Scope: this one task, or every open task the person is on.
  const { getAllTasks } = await import("@/lib/queries");
  const { isOpen } = await import("@/lib/derive");
  let rows = (await getAllTasks()).filter((x) => isOpen(x.status) && x.assigneeIds.includes(personId as number));
  if (!allTasks) rows = rows.filter((x) => x.id === taskId);
  if (rows.length === 0) return { ok: false, error: "No open tasks to remind about." };

  const { buildTaskSummaryWhatsApp } = await import("@/lib/outbox/gen");
  const { pickChannel, contactForChannel, linkFor } = await import("@/lib/outbox/links");
  const { waReminderLink } = await import("@/lib/wa-card");

  const contact = {
    email: (person.email as string | null) ?? null,
    phone: (person.phone as string | null) ?? null,
    whatsapp: (person.whatsapp as string | null) ?? null,
    preferredChannel: (person.preferred_channel as string | null) ?? null,
  };
  const channel = pickChannel(contact);
  const to = contactForChannel(contact, channel);

  // Always attach the signed preview-card link on WhatsApp (single task or full
  // summary) so the recipient can see their whole open/overdue list, not just the
  // one task being nudged about.
  const cardLink = channel === "WHATSAPP" ? waReminderLink(person.id as number) : undefined;
  const body = buildTaskSummaryWhatsApp(name, rows, cardLink, "Command Centre");
  const subject = allTasks ? "Your open tasks" : "Task reminder";
  const link = linkFor(channel, to, subject, body);

  // No Outbox draft stored — the Outbox is generated live per person; this send
  // just opens WhatsApp/email via the returned link.
  return { ok: true, link, name, channel, contactMissing: !to };
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
  const companyIdField = formData.has("companyId") ? parseInt(String(formData.get("companyId")), 10) : NaN;

  const result = await mutate({
    kind: "task.update",
    run: async () => {
      const t = await findTaskByCode(code);
      if (!t) throw new Error("Task not found");

      // Company change: the task moves to the new company and gets a fresh code
      // under that company's prefix. The old code is kept in legacy_code so any
      // saved link or reference still redirects here. History follows the task.
      const movingCompany = Number.isFinite(companyIdField) && companyIdField !== t.company_id;
      const finalCompanyId = movingCompany ? companyIdField : t.company_id;
      let finalCode = t.code;
      if (movingCompany) {
        const [{ data: newComp }, { data: oldComp }, { data: existingCodes }] = await Promise.all([
          sb.from("companies").select("name,code,code_prefix").eq("id", finalCompanyId).maybeSingle(),
          sb.from("companies").select("name").eq("id", t.company_id).maybeSingle(),
          sb.from("tasks").select("code").eq("company_id", finalCompanyId),
        ]);
        if (!newComp) throw new Error("Company not found");
        const prefix = (newComp.code_prefix as string | null) || (newComp.code as string);
        let maxNum = 0;
        for (const row of existingCodes ?? []) {
          const m = (row.code as string).match(/(\d+)$/);
          if (m) maxNum = Math.max(maxNum, parseInt(m[1], 10));
        }
        finalCode = `${prefix}-${String(maxNum + 1).padStart(3, "0")}`;

        await logChangeSb(t.id, t.code, t.company_id, "Company", (oldComp?.name as string) ?? String(t.company_id), newComp.name as string, changeReason);
        await logChangeSb(t.id, t.code, t.company_id, "Task code", t.code, finalCode, "Re-issued after company change");
      }

      const actionItem = actionItemField || t.action_item;
      const departmentId = await getOrCreateDeptSb(departmentName);
      const status = statusField ?? t.status;
      const priority = priorityField ?? t.priority;
      const risk = riskField === undefined ? t.risk : riskField;
      const escalation = escalationField ?? t.escalation ?? "No";
      const category = categoryField === undefined ? t.category : categoryField;

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

      const newClosedDate = computeClosedDateFrom(t.status, status, t.closed_date);

      const baseUpdate = {
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
      };

      if (movingCompany) {
        // Retry on code collision (someone created a task in the new company
        // between our read and this write).
        let applied = false;
        for (let attempt = 0; attempt < 5 && !applied; attempt++) {
          const { error } = await sb
            .from("tasks")
            .update({ ...baseUpdate, company_id: finalCompanyId, code: finalCode, legacy_code: t.code })
            .eq("id", t.id);
          if (!error) { applied = true; break; }
          if (!/duplicate key|unique/i.test(error.message || "")) throw new Error(error.message);
          const m = finalCode.match(/^(.*-)(\d+)$/);
          if (!m) throw new Error(error.message);
          finalCode = `${m[1]}${String(parseInt(m[2], 10) + 1).padStart(3, "0")}`;
        }
        if (!applied) throw new Error("Could not allocate a unique task code in the new company.");
        // History follows the task: re-point every audit entry to the new code.
        await sb.from("audit_log").update({ task_code: finalCode, company_id: finalCompanyId }).eq("task_id", t.id);
      } else {
        await sb.from("tasks").update(baseUpdate).eq("id", t.id);
      }
      await fireTaskCascade(t.id, t.status as string, status);

      const newNames = splitNames(accountableRaw);
      const pMap = await allPeopleMap();
      const oldNamesStr = beforeAssignees.map((id) => pMap.get(id)).filter(Boolean).join(", ");
      const newNamesStr = newNames.join(", ");
      if (oldNamesStr !== newNamesStr) {
        await logChangeSb(t.id, finalCode, finalCompanyId, "Accountable", oldNamesStr, newNamesStr, changeReason);
        await sb.from("task_assignees").delete().eq("task_id", t.id);
        for (const n of newNames) {
          const pid = await getOrCreatePersonSb(n, finalCompanyId);
          await sb
            .from("task_assignees")
            .upsert({ task_id: t.id, person_id: pid }, { ignoreDuplicates: true });
        }
      }

      // Best-effort re-index after the edit (status/action item/latest update +
      // lifecycle may all have moved). No-op unless semantic search is enabled.
      void reindexEntity("task", t.id);

      return {
        result: { code: finalCode },
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

  // After a company change the task lives at its new code; the old code path
  // still redirects via legacy_code.
  const finalCode = result.result.code;
  revalidatePath(`/task/${code}`);
  if (finalCode !== code) revalidatePath(`/task/${finalCode}`);
  revalidatePath("/registry");
  revalidatePath("/");
  updateTag("tasks");
  // Return the user to where they opened the task from (a company page, a filtered
  // list) instead of the generic Tasks list — unless the company changed (the code
  // changed too, so land on the renamed task to avoid a stale link).
  const returnTo = str(formData.get("returnTo"));
  if (returnTo && returnTo.startsWith("/") && finalCode === code) {
    revalidatePath(returnTo);
    redirect(returnTo);
  }
  redirect(`/task/${finalCode}`);
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
  // Overdue-blame mode (completion credit is always shared). "lead" marks the
  // first assignee as the accountable lead so only they carry an overdue hit.
  const accountability = str(formData.get("accountability")) === "lead" ? "lead" : "shared";

  const result = await mutate({
    kind: "task.create",
    run: async () => {
      const { data: company, error: cErr } = await sb
        .from("companies")
        .select("code, code_prefix")
        .eq("id", companyId)
        .maybeSingle();
      if (cErr) throw new Error(cErr.message);
      if (!company) throw new Error("Company not found");

      // Resolve the department + assignee people BEFORE the transaction: these
      // are idempotent get-or-create lookups (their own rows are not part of the
      // task's atomic write, and re-running them is harmless on retry).
      const departmentId = await getOrCreateDeptSb(departmentName);
      const assigneeIds: number[] = [];
      for (const n of splitNames(accountableRaw)) {
        assigneeIds.push(await getOrCreatePersonSb(n, companyId));
      }

      const now = new Date();
      const nowIso = now.toISOString();
      // Prefer the two-letter prefix (DS-001); fall back to the legacy company code.
      const prefix = (company.code_prefix as string | null) || (company.code as string);
      const closedDate = computeClosedDate(status, null, nowIso);

      // Atomic create (ACTTASKS-04 / DBSPINE-02): the task row, its assignees and
      // the CREATE audit entry either all commit or all roll back — no orphaned
      // task and no missing audit on a mid-sequence failure. The unique-code
      // allocation is retried in-transaction on a code collision.
      const task = await withTx(async (tx) => {
        let created: { id: number; code: string } | null = null;
        for (let attempt = 0; attempt < 5 && !created; attempt++) {
          const existing = await tx
            .select({ code: tasksTable.code })
            .from(tasksTable)
            .where(eq(tasksTable.companyId, companyId));
          let maxNum = 0;
          for (const row of existing) {
            const m = row.code.match(/(\d+)$/);
            if (m) maxNum = Math.max(maxNum, parseInt(m[1], 10));
          }
          const newCode = `${prefix}-${String(maxNum + 1 + attempt).padStart(3, "0")}`;
          try {
            // Nested transaction = a SAVEPOINT, so a unique-code collision rolls
            // back just this attempt (not the whole transaction, which postgres.js
            // would otherwise abort) and the next attempt can proceed.
            created = await tx.transaction(async (sp) => {
              const [inserted] = await sp
                .insert(tasksTable)
                .values({
                  code: newCode,
                  companyId,
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
                  closedDate: closedDate ? new Date(closedDate) : null,
                  archived: false,
                  accountability,
                  // In "lead" mode the first assignee owns it (carries overdue).
                  ownerId: accountability === "lead" && assigneeIds.length ? assigneeIds[0] : undefined,
                })
                .returning({ id: tasksTable.id, code: tasksTable.code });
              return inserted;
            });
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            if (!/duplicate key|unique/i.test(msg)) throw e;
            // Code collided — let the next attempt pick the next number.
          }
        }
        if (!created) throw new Error("Could not allocate a unique task code.");

        if (assigneeIds.length) {
          await tx
            .insert(taskAssignees)
            .values(assigneeIds.map((personId, i) => ({
              taskId: created!.id,
              personId,
              // In "lead" mode the first assignee is the accountable lead.
              role: accountability === "lead" && i === 0 ? "accountable" : "working",
            })))
            .onConflictDoNothing();
        }

        await tx.insert(auditLog).values({
          taskId: created.id,
          taskCode: created.code,
          companyId,
          entryType: "CREATE",
          field: "Task",
          oldValue: null,
          newValue: actionItem,
          changeReason: null,
          createdAt: now,
          createdBy: "web-ui",
        });

        return created;
      });

      // Best-effort semantic index (no-op unless semantic search is enabled).
      void reindexEntity("task", task.id);

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
  // When created from the modal flow, return to the originating section (tasks
  // list / company page) instead of the standalone task page — keeps the user
  // in context. Falls back to the task detail page for the full-page form.
  const returnTo = str(formData.get("returnTo"));
  if (returnTo && returnTo.startsWith("/")) {
    revalidatePath(returnTo);
    redirect(returnTo);
  }
  redirect(`/task/${result.result.code}`);
}

/**
 * RESERVED for a future explicit, confirmed "permanently delete" action.
 * Routine deletes now KEEP history (recoverable for 10 minutes). This permanently
 * wipes a task's audit history (audit_log doesn't cascade on task delete — the FK
 * only nulls task_id — so we remove it explicitly, along with any corrections that
 * reference those entries). Updates/assignees/meeting-links cascade with the row.
 */
async function purgeTaskHistory(taskId: number, code: string) {
  const [r1, r2] = await Promise.all([
    sb.from("audit_log").select("id").eq("task_id", taskId),
    sb.from("audit_log").select("id").eq("task_code", code),
  ]);
  const ids = [...new Set([...(r1.data ?? []), ...(r2.data ?? [])].map((r) => r.id as number))];
  if (ids.length) {
    await sb.from("corrections").delete().in("audit_log_id", ids);
    await sb.from("corrections").delete().in("corrected_by_entry_id", ids);
  }
  await sb.from("audit_log").delete().eq("task_id", taskId);
  await sb.from("audit_log").delete().eq("task_code", code);
}

export async function deleteTask(code: string) {
  const result = await mutate({
    kind: "task.delete",
    run: async () => {
      const t = await findTaskByCode(code);
      if (!t) return { result: null, undo: undefined };
      const [assignees, updates, meetingLinks] = await Promise.all([
        loadAssignees(t.id),
        loadTaskUpdatesSnapshot(t.id),
        loadMeetingLinksSnapshot(t.id),
      ]);

      // Recoverable delete: remove the task row (updates/assignees/meeting-links
      // cascade away) but KEEP its audit history — the FK nulls task_id, so the
      // audit rows survive by task_code. The conversation + meeting links are
      // snapshotted into the undo payload first so a 10-minute Undo restores the
      // task, assignees, the full discussion thread and its provenance.
      await sb.from("tasks").delete().eq("id", t.id);

      // Hard-delete: the row is gone, so drop its index entry. (A 10-minute Undo
      // re-creates the task via the create path, which re-indexes it.)
      void removeEntityIndex("task", t.id);

      return { result: { deleted: true }, undo: taskDeleteUndo(t, assignees, updates, meetingLinks) };
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
        updatePayload.status = newStatus;
        updatePayload.closed_date = computeClosedDateFrom(t.status, newStatus, t.closed_date as string | null);

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
      if (newStatus) await fireTaskCascade(taskId, t.status as string, newStatus);

      // Best-effort re-index: latest_update (and possibly status/lifecycle) moved.
      void reindexEntity("task", taskId);

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
  await broadcastPulse("task-update");
}

/* ----------------------------------------------------------------------
 * Admin conversation (T3) — FormData actions for the shared conversation
 * component, mirroring the portal ones but with full admin powers (any
 * status; createdBy "web-ui"). Supports reply, @mentions, and attachments.
 * ---------------------------------------------------------------------- */

export async function adminAddUpdate(formData: FormData): Promise<void> {
  const taskId = Number(formData.get("taskId"));
  const taskCode = String(formData.get("code") ?? "");
  const body = String(formData.get("body") ?? "").trim();
  const newStatus = String(formData.get("newStatus") ?? "").trim();
  const parentRaw = Number(formData.get("parentUpdateId"));
  const fileEntry = formData.get("attachment");
  const file = fileEntry instanceof File && fileEntry.size > 0 ? fileEntry : null;
  if (!Number.isFinite(taskId) || (!body && !file)) return;

  const { data: t } = await sb
    .from("tasks")
    .select("id,status,company_id,code,closed_date")
    .eq("id", taskId)
    .maybeSingle();
  if (!t) return;

  // Validate reply target is on the same task.
  let parentUpdateId: number | null = null;
  let parentCreatedBy: string | null = null;
  if (Number.isFinite(parentRaw) && parentRaw > 0) {
    const { data: parent } = await sb.from("task_updates").select("task_id,created_by").eq("id", parentRaw).maybeSingle();
    if (parent && (parent.task_id as number) === taskId) {
      parentUpdateId = parentRaw;
      parentCreatedBy = (parent.created_by as string | null) ?? null;
    }
  }

  const now = new Date().toISOString();

  let attachmentDocumentId: number | null = null;
  if (file) {
    attachmentDocumentId = await createTaskAttachment({
      taskId,
      companyId: t.company_id as number | null,
      file,
      createdBy: "web-ui",
    });
  }

  const messageBody = body || `📎 ${file?.name ?? "Attachment"}`;

  const { data: inserted, error: insErr } = await sb
    .from("task_updates")
    .insert({
      task_id: taskId,
      body: messageBody,
      created_at: now,
      created_by: "web-ui",
      parent_update_id: parentUpdateId,
      attachment_document_id: attachmentDocumentId,
    })
    .select("id")
    .single();
  if (insErr) throw new Error(insErr.message);

  // @mentions — re-parsed against the task's people.
  const { data: taskPeople } = await sb.from("task_assignees").select("people(id,name)").eq("task_id", taskId);
  const candidates = (taskPeople ?? [])
    .map((r) => r.people as unknown as { id: number; name: string } | null)
    .filter((p): p is { id: number; name: string } => Boolean(p));
  const mentionIds = parseMentionIds(messageBody, candidates);
  if (mentionIds.length > 0) {
    await sb.from("update_mentions").insert(mentionIds.map((personId) => ({ update_id: inserted.id as number, person_id: personId })));
  }

  // Notifications (actor "Management" from the staff perspective).
  await notifyMany(mentionIds.map(personRecipient), {
    kind: "mention",
    taskId,
    taskCode,
    title: "Management mentioned you",
    body,
    actor: "Management",
  });
  if (parentUpdateId) {
    const target = await recipientForCreatedBy(parentCreatedBy);
    if (target && target !== "admin") {
      await createNotification({ recipient: target, kind: "reply", taskId, taskCode, title: "Management replied to you", body, actor: "Management" });
    }
  }

  const patch: Record<string, unknown> = { latest_update: messageBody, last_updated_at: now };
  if (newStatus && newStatus !== t.status) {
    patch.status = newStatus;
    patch.closed_date = computeClosedDateFrom(t.status as string, newStatus, (t.closed_date as string | null) ?? null, now);
    await sb.from("audit_log").insert({
      task_id: taskId,
      task_code: taskCode,
      company_id: t.company_id as number,
      entry_type: "CHANGE",
      field: "Status",
      old_value: t.status,
      new_value: newStatus,
      change_reason: body || null,
      created_at: now,
      created_by: "web-ui",
    });
  }
  await sb.from("tasks").update(patch).eq("id", taskId);

  // Best-effort re-index: latest_update (and possibly status/lifecycle) moved.
  void reindexEntity("task", taskId);

  revalidatePath(`/task/${taskCode}`);
  revalidatePath("/");
  updateTag("tasks");
  await broadcastPulse("task-update");
}

export async function adminTogglePin(formData: FormData): Promise<void> {
  const updateId = Number(formData.get("updateId"));
  if (!Number.isFinite(updateId)) return;
  const { data: u } = await sb.from("task_updates").select("task_id,pinned_at").eq("id", updateId).maybeSingle();
  const wasPinned = Boolean(u?.pinned_at);
  const res = await toggleUpdatePin(updateId);
  if (res.ok && !wasPinned && u) {
    const { data: t } = await sb.from("tasks").select("code").eq("id", u.task_id as number).maybeSingle();
    if (t) await notifyPinned(u.task_id as number, t.code as string, "Management", null);
  }
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
 * preserves the original body the first time you edit a row. Deletes are
 * SOFT (set deleted_at) — hidden from timelines but kept in the table for
 * governance, and recoverable via restoreTaskUpdate.
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
  void reindexEntity("task", u.task_id); // latest_update mirror changed
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
  void reason;
  const u = await loadUpdate(updateId);
  if (!u) return { ok: true }; // already gone
  if (u.deleted_at) return { ok: true }; // already removed

  const t = await findTaskMeta(u.task_id);

  // Soft delete — set deleted_at so the conversation history is preserved for the
  // audit trail and the update can be brought back via restoreTaskUpdate. The
  // timeline and the latest-update mirror both filter on deleted_at IS NULL, so it
  // disappears from view immediately.
  await sb.from("task_updates").update({ deleted_at: new Date().toISOString() }).eq("id", updateId);

  await recomputeLatestUpdateMirror(u.task_id);
  void reindexEntity("task", u.task_id); // latest_update mirror changed
  if (t) {
    revalidatePath(`/task/${t.code}`);
    revalidatePath(`/companies/${t.company_id}`);
  }
  revalidatePath("/");
  updateTag("tasks");
  return { ok: true };
}

export async function restoreTaskUpdate(updateId: number): Promise<{ ok: boolean; error?: string }> {
  const u = await loadUpdate(updateId);
  if (!u) return { ok: false, error: "Update not found." };
  const t = await findTaskMeta(u.task_id);
  if (!t) return { ok: false, error: "Task not found." };

  await sb.from("task_updates").update({ deleted_at: null }).eq("id", updateId);
  await recomputeLatestUpdateMirror(u.task_id);
  void reindexEntity("task", u.task_id); // latest_update mirror changed
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
  | { kind: "delete" }
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

      // Delete the task row but KEEP its audit history (the FK nulls task_id; the
      // rows survive by task_code). Bulk delete has no per-item Undo yet — the UI
      // confirms first; grouped undo is a planned follow-up.
      if (action.kind === "delete") {
        await sb.from("tasks").delete().eq("id", t.id);
        void removeEntityIndex("task", t.id); // row gone — drop its index entry
        applied++;
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
        patch.status = action.value;
        patch.closed_date = computeClosedDateFrom(t.status, action.value, t.closed_date, nowIso);
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
        patch.closed_date = computeClosedDateFrom(t.status, "Closed", t.closed_date, nowIso);
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
      // Best-effort re-index: status/latest_update/lifecycle may have moved.
      void reindexEntity("task", t.id);
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
        patch.status = status;
        patch.closed_date = computeClosedDateFrom(t.status, status, t.closed_date);
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
        // Match the bulk toolbar and AI command: escalating also moves the task
        // into the Escalated status, so it can't be missed by status-filtered
        // views. (De-escalating leaves the current status untouched.)
        if ((value || "No") === "Yes") patch.status = "Escalated";
      }

      await logChangeSb(t.id, t.code, t.company_id, fieldLabel, oldVal, newVal, null);
      await sb.from("tasks").update(patch).eq("id", t.id);
      if (typeof patch.status === "string") await fireTaskCascade(t.id, t.status as string, patch.status);

      // Best-effort re-index: status/lifecycle may have moved.
      void reindexEntity("task", t.id);

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
  // Re-index to re-stamp lifecycle (active ↔ history). We keep history searchable,
  // so this is reindexEntity, not removeEntityIndex.
  void reindexEntity("task", t.id);
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
      const [assignees, updates, meetingLinks] = await Promise.all([
        loadAssignees(t.id),
        loadTaskUpdatesSnapshot(t.id),
        loadMeetingLinksSnapshot(t.id),
      ]);
      // Recoverable delete (see deleteTask): snapshot conversation + meeting links
      // for a faithful Undo, keep audit history, offer a 10-min Undo.
      await sb.from("tasks").delete().eq("id", t.id);
      void removeEntityIndex("task", t.id); // row gone — drop its index entry
      return { result: { deleted: true }, undo: taskDeleteUndo(t, assignees, updates, meetingLinks) };
    },
  });
  if (!result.ok) return { ok: false, error: result.error };
  if (result.undoToken) await setUndoCookie(result.undoToken, "Task deleted.");
  revalidatePath("/"); updateTag("tasks");
  return { ok: true, undoToken: result.undoToken };
}

/* ─── KPI accountability controls ──────────────────────────────────────────
 * Overdue-blame mode, documented blockers (Waiting on <person>) and per-person
 * "my part is done". These feed src/lib/kpi.ts. All post a timestamped update
 * so the record (not just the score) stays defensible. */

async function postTaskUpdate(taskId: number, body: string, by = "web-ui") {
  await sb.from("task_updates").insert({ task_id: taskId, body, created_at: new Date().toISOString(), created_by: by });
  await sb.from("tasks").update({ last_updated_at: new Date().toISOString(), latest_update: body }).eq("id", taskId);
}

/** Switch a task between "shared" and "lead" overdue-blame modes. */
export async function setTaskAccountability(taskId: number, mode: "shared" | "lead") {
  await sb.from("tasks").update({ accountability: mode }).eq("id", taskId);
  void reindexEntity("task", taskId);
  revalidatePath("/"); updateTag("tasks");
  return { ok: true as const };
}

/** Raise a documented blocker — overdue is SUSPENDED for everyone until cleared. */
export async function setTaskBlocker(taskId: number, personId: number, reason: string) {
  const r = (reason || "").trim();
  if (!r) return { ok: false as const, error: "A reason is required to raise a blocker." };
  const { data: p } = await sb.from("people").select("name").eq("id", personId).maybeSingle();
  await sb.from("tasks").update({
    blocked_on_person_id: personId, blocked_reason: r, blocked_since: new Date().toISOString(), status: "Blocked",
  }).eq("id", taskId);
  await postTaskUpdate(taskId, `⏸ Waiting on ${p?.name ?? "someone"}: ${r}`);
  void reindexEntity("task", taskId);
  revalidatePath("/"); updateTag("tasks");
  return { ok: true as const };
}

/** Clear the blocker — the task is live again and overdue blame resumes. */
export async function clearTaskBlocker(taskId: number, note?: string) {
  await sb.from("tasks").update({
    blocked_on_person_id: null, blocked_reason: null, blocked_since: null, status: "In Progress",
  }).eq("id", taskId);
  await postTaskUpdate(taskId, `▶ Blocker cleared${note ? `: ${note.trim()}` : ""}`);
  void reindexEntity("task", taskId);
  revalidatePath("/"); updateTag("tasks");
  return { ok: true as const };
}

/** Toggle a person's "my part is done" flag — spares them this task's overdue blame. */
export async function toggleMyPartDone(taskId: number, personId: number, done: boolean) {
  const { data: p } = await sb.from("people").select("name").eq("id", personId).maybeSingle();
  await sb.from("task_assignees")
    .update({ part_done_at: done ? new Date().toISOString() : null })
    .eq("task_id", taskId).eq("person_id", personId);
  await postTaskUpdate(taskId, done ? `✓ ${p?.name ?? "Someone"} marked their part done` : `↺ ${p?.name ?? "Someone"} reopened their part`);
  revalidatePath("/"); updateTag("tasks");
  return { ok: true as const };
}

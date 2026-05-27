"use server";

import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { revalidatePath, updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { insertTaskWithUniqueCode } from "@/lib/task-codes";
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
  return v.split(/,| & | and /i).map((x) => x.trim()).filter(Boolean);
}

function isoOrNull(d: Date | null | undefined): string | null {
  return d ? d.toISOString() : null;
}

async function getOrCreatePerson(name: string, companyId: number | null): Promise<number> {
  const existing = await db.select().from(schema.people).where(eq(schema.people.name, name)).limit(1);
  if (existing.length) return existing[0].id;
  const inserted = await db
    .insert(schema.people)
    .values({ name, companyId: companyId ?? undefined, active: true })
    .onConflictDoNothing({ target: schema.people.name })
    .returning();
  if (inserted.length) return inserted[0].id;
  const after = await db.select().from(schema.people).where(eq(schema.people.name, name)).limit(1);
  return after[0].id;
}

async function getOrCreateDept(name: string | null): Promise<number | null> {
  if (!name) return null;
  const existing = await db.select().from(schema.departments).where(eq(schema.departments.name, name)).limit(1);
  if (existing.length) return existing[0].id;
  const inserted = await db
    .insert(schema.departments)
    .values({ name })
    .onConflictDoNothing({ target: schema.departments.name })
    .returning();
  if (inserted.length) return inserted[0].id;
  const after = await db.select().from(schema.departments).where(eq(schema.departments.name, name)).limit(1);
  return after[0].id;
}

async function deptName(id: number | null): Promise<string | null> {
  if (id == null) return null;
  const r = await db.select({ name: schema.departments.name }).from(schema.departments).where(eq(schema.departments.id, id)).limit(1);
  return r[0]?.name ?? null;
}

async function logChange(
  taskId: number,
  taskCode: string,
  companyId: number,
  field: string,
  oldVal: unknown,
  newVal: unknown,
  reason: string | null
) {
  const fmtLocalDate = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };
  const oldS = oldVal == null ? null : oldVal instanceof Date ? fmtLocalDate(oldVal) : String(oldVal);
  const newS = newVal == null ? null : newVal instanceof Date ? fmtLocalDate(newVal) : String(newVal);
  if (oldS === newS) return;
  await db.insert(schema.auditLog).values({
    taskId,
    taskCode,
    companyId,
    entryType: "CHANGE",
    field,
    oldValue: oldS,
    newValue: newS,
    changeReason: reason,
    createdAt: new Date(),
    createdBy: "web-ui",
  });
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
      const existing = await db.select().from(schema.tasks).where(eq(schema.tasks.code, code)).limit(1);
      if (!existing.length) throw new Error("Task not found");
      const t = existing[0];

      const actionItem = actionItemField || t.actionItem;
      const departmentId = await getOrCreateDept(departmentName);
      const status = statusField ?? t.status;
      const priority = priorityField ?? t.priority;
      const risk = riskField === undefined ? t.risk : riskField;
      const escalation = escalationField ?? t.escalation ?? "No";
      const category = categoryField === undefined ? t.category : categoryField;
      const wasClosed = t.status === "Completed" || t.status === "Closed";
      const isClosed = status === "Completed" || status === "Closed";
      const closingNow = isClosed && !wasClosed;
      const reopeningNow = !isClosed && wasClosed;

      const [oldDeptName, newDeptName] = await Promise.all([deptName(t.departmentId), deptName(departmentId)]);

      // capture before-assignees for undo
      const beforeAssignees = (
        await db.select().from(schema.taskAssignees).where(eq(schema.taskAssignees.taskId, t.id))
      ).map((a) => a.personId);

      // diff & audit
      const fields: [string, unknown, unknown][] = [
        ["Action Item", t.actionItem, actionItem],
        ["Department", oldDeptName, newDeptName],
        ["Status", t.status, status],
        ["Priority", t.priority, priority],
        ["Risk", t.risk, risk],
        ["Escalation", t.escalation, escalation],
        ["Category", t.category, category],
        ["Deadline", t.deadline, deadline],
        ["Meeting Date", t.meetingDate, meetingDate],
        ["Comments", t.comments, comments],
        ["Latest Update", t.latestUpdate, latestUpdate],
      ];
      for (const [f, o, n] of fields) {
        await logChange(t.id, t.code, t.companyId, f, o, n, changeReason);
      }

      const newClosedDate = closingNow ? new Date() : reopeningNow ? null : t.closedDate;

      await db
        .update(schema.tasks)
        .set({
          actionItem,
          departmentId,
          status,
          priority,
          risk,
          escalation,
          category,
          deadline,
          meetingDate,
          comments,
          latestUpdate,
          lastUpdatedAt: new Date(),
          closedDate: newClosedDate,
        })
        .where(eq(schema.tasks.id, t.id));

      // replace assignees
      const newNames = splitNames(accountableRaw);
      const oldPeople = await db.select().from(schema.people);
      const pMap = new Map(oldPeople.map((p) => [p.id, p.name]));
      const oldNamesStr = beforeAssignees.map((id) => pMap.get(id)).filter(Boolean).join(", ");
      const newNamesStr = newNames.join(", ");
      if (oldNamesStr !== newNamesStr) {
        await logChange(t.id, t.code, t.companyId, "Accountable", oldNamesStr, newNamesStr, changeReason);
        await db.delete(schema.taskAssignees).where(eq(schema.taskAssignees.taskId, t.id));
        for (const n of newNames) {
          const pid = await getOrCreatePerson(n, t.companyId);
          try {
            await db.insert(schema.taskAssignees).values({ taskId: t.id, personId: pid });
          } catch {}
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
            companyId: t.companyId,
            before: {
              actionItem: t.actionItem,
              departmentId: t.departmentId,
              status: t.status,
              priority: t.priority,
              risk: t.risk,
              escalation: t.escalation,
              category: t.category,
              deadline: isoOrNull(t.deadline),
              meetingDate: isoOrNull(t.meetingDate),
              comments: t.comments,
              latestUpdate: t.latestUpdate,
              lastUpdatedAt: isoOrNull(t.lastUpdatedAt),
              closedDate: isoOrNull(t.closedDate),
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
      const company = await db.select().from(schema.companies).where(eq(schema.companies.id, companyId)).limit(1);
      if (!company.length) throw new Error("Company not found");
      const code = company[0].code;

      const departmentId = await getOrCreateDept(departmentName);
      const now = new Date();

      const task = await insertTaskWithUniqueCode(companyId, code, {
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
      const newCode = task.code;

      for (const n of splitNames(accountableRaw)) {
        const pid = await getOrCreatePerson(n, companyId);
        try {
          await db.insert(schema.taskAssignees).values({ taskId: task.id, personId: pid });
        } catch {}
      }

      await db.insert(schema.auditLog).values({
        taskId: task.id,
        taskCode: newCode,
        companyId,
        entryType: "CREATE",
        field: "Task",
        oldValue: null,
        newValue: actionItem,
        changeReason: null,
        createdAt: now,
        createdBy: "web-ui",
      });

      return {
        result: { code: newCode },
        undo: {
          kind: "task.create",
          taskId: task.id,
          payload: { taskId: task.id },
        },
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
      const existing = await db.select().from(schema.tasks).where(eq(schema.tasks.code, code)).limit(1);
      if (!existing.length) return { result: null, undo: undefined };
      const t = existing[0];
      const assignees = (
        await db.select().from(schema.taskAssignees).where(eq(schema.taskAssignees.taskId, t.id))
      ).map((a) => a.personId);

      await db.delete(schema.tasks).where(eq(schema.tasks.id, t.id));

      return {
        result: { deleted: true },
        undo: {
          kind: "task.delete",
          payload: {
            task: {
              code: t.code,
              companyId: t.companyId,
              departmentId: t.departmentId,
              meetingDate: isoOrNull(t.meetingDate),
              actionItem: t.actionItem,
              ownerId: t.ownerId,
              createdDate: isoOrNull(t.createdDate),
              deadline: isoOrNull(t.deadline),
              status: t.status,
              priority: t.priority,
              category: t.category,
              risk: t.risk,
              escalation: t.escalation,
              comments: t.comments,
              latestUpdate: t.latestUpdate,
              lastUpdatedAt: isoOrNull(t.lastUpdatedAt),
              closedDate: isoOrNull(t.closedDate),
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
      const taskRows = await db.select().from(schema.tasks).where(eq(schema.tasks.id, taskId)).limit(1);
      if (!taskRows.length) throw new Error("Task not found");
      const t = taskRows[0];

      const before = {
        latestUpdate: t.latestUpdate,
        lastUpdatedAt: isoOrNull(t.lastUpdatedAt),
        status: t.status,
        closedDate: isoOrNull(t.closedDate),
      };

      const inserted = await db
        .insert(schema.taskUpdates)
        .values({
          taskId,
          body: trimmed,
          createdAt: new Date(),
          createdBy: "web-ui",
        })
        .returning({ id: schema.taskUpdates.id });
      const taskUpdateId = inserted[0].id;

      const updatePayload: Partial<typeof schema.tasks.$inferInsert> = {
        latestUpdate: trimmed,
        lastUpdatedAt: new Date(),
      };

      if (newStatus) {
        const wasClosed = t.status === "Completed" || t.status === "Closed";
        const isClosed = newStatus === "Completed" || newStatus === "Closed";
        updatePayload.status = newStatus;
        if (isClosed && !wasClosed) updatePayload.closedDate = new Date();
        else if (!isClosed && wasClosed) updatePayload.closedDate = null;

        if (t.status !== newStatus) {
          await db.insert(schema.auditLog).values({
            taskId,
            taskCode,
            companyId: t.companyId,
            entryType: "CHANGE",
            field: "Status",
            oldValue: t.status,
            newValue: newStatus,
            changeReason: trimmed,
            createdAt: new Date(),
            createdBy: "web-ui",
          });
        }
      }

      await db.update(schema.tasks).set(updatePayload).where(eq(schema.tasks.id, taskId));

      return {
        result: { taskUpdateId },
        undo: {
          kind: "task.update.add",
          taskId,
          payload: {
            taskUpdateId,
            taskId,
            taskCode,
            companyId: t.companyId,
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

export async function inlineUpdateTask(
  code: string,
  field: "status" | "priority" | "deadline" | "category" | "escalation",
  value: string | null
): Promise<{ ok: boolean; undoToken?: string; error?: string }> {
  const result = await mutate({
    kind: "task.update",
    run: async () => {
      const existing = await db.select().from(schema.tasks).where(eq(schema.tasks.code, code)).limit(1);
      if (!existing.length) throw new Error("Task not found");
      const t = existing[0];

      const beforeAssignees = (
        await db.select().from(schema.taskAssignees).where(eq(schema.taskAssignees.taskId, t.id))
      ).map((a) => a.personId);

      const patch: Partial<typeof schema.tasks.$inferInsert> = { lastUpdatedAt: new Date() };
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
        if (isClosed && !wasClosed) patch.closedDate = new Date();
        else if (!isClosed && wasClosed) patch.closedDate = null;
      } else if (field === "priority") {
        oldVal = t.priority;
        newVal = value || t.priority;
        fieldLabel = "Priority";
        patch.priority = value || t.priority;
      } else if (field === "deadline") {
        const newDate = value ? new Date(value) : null;
        oldVal = t.deadline;
        newVal = newDate;
        fieldLabel = "Deadline";
        patch.deadline = newDate;
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

      await logChange(t.id, t.code, t.companyId, fieldLabel, oldVal, newVal, null);
      await db.update(schema.tasks).set(patch).where(eq(schema.tasks.id, t.id));

      return {
        result: { code: t.code },
        undo: {
          kind: "task.update",
          taskId: t.id,
          payload: {
            taskId: t.id,
            taskCode: t.code,
            companyId: t.companyId,
            before: {
              actionItem: t.actionItem,
              departmentId: t.departmentId,
              status: t.status,
              priority: t.priority,
              risk: t.risk,
              escalation: t.escalation,
              category: t.category,
              deadline: isoOrNull(t.deadline),
              meetingDate: isoOrNull(t.meetingDate),
              comments: t.comments,
              latestUpdate: t.latestUpdate,
              lastUpdatedAt: isoOrNull(t.lastUpdatedAt),
              closedDate: isoOrNull(t.closedDate),
            },
            beforeAssignees,
          },
        },
      };
    },
  });

  if (!result.ok) return { ok: false, error: result.error };

  revalidatePath(`/task/${code}`);
  revalidatePath("/task");
  revalidatePath("/registry");
  revalidatePath("/");
  updateTag("tasks");
  return { ok: true, undoToken: result.undoToken };
}

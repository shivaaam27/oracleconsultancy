"use server";

import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { insertTaskWithUniqueCode } from "@/lib/task-codes";

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
  const existing = await db.select().from(schema.tasks).where(eq(schema.tasks.code, code)).limit(1);
  if (!existing.length) throw new Error("Task not found");
  const t = existing[0];

  const actionItem = str(formData.get("actionItem")) || t.actionItem;
  const departmentName = str(formData.get("department"));
  const departmentId = await getOrCreateDept(departmentName);
  const status = str(formData.get("status")) ?? t.status;
  const priority = str(formData.get("priority")) ?? t.priority;
  const risk = formData.has("risk") ? str(formData.get("risk")) : t.risk;
  const escalation = str(formData.get("escalation")) ?? t.escalation ?? "No";
  const category = formData.has("category") ? str(formData.get("category")) : t.category;
  const deadline = parseDate(formData.get("deadline"));
  const meetingDate = parseDate(formData.get("meetingDate"));
  const comments = str(formData.get("comments"));
  const latestUpdate = str(formData.get("latestUpdate"));
  const accountableRaw = str(formData.get("accountable"));
  const changeReason = str(formData.get("changeReason"));
  const wasClosed = t.status === "Completed" || t.status === "Closed";
  const isClosed = status === "Completed" || status === "Closed";
  const closingNow = isClosed && !wasClosed;
  const reopeningNow = !isClosed && wasClosed;

  const [oldDeptName, newDeptName] = await Promise.all([deptName(t.departmentId), deptName(departmentId)]);

  // Diff & audit log
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

  // Replace assignees
  const newNames = splitNames(accountableRaw);
  const oldAssignees = await db.select().from(schema.taskAssignees).where(eq(schema.taskAssignees.taskId, t.id));
  const oldPeople = await db.select().from(schema.people);
  const pMap = new Map(oldPeople.map((p) => [p.id, p.name]));
  const oldNamesStr = oldAssignees.map((a) => pMap.get(a.personId)).filter(Boolean).join(", ");
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

  revalidatePath(`/task/${code}`);
  revalidatePath("/registry");
  revalidatePath("/");
  redirect(`/task/${code}`);
}

export async function createTask(formData: FormData) {
  const companyId = parseInt(String(formData.get("companyId")), 10);
  const actionItem = str(formData.get("actionItem"));
  if (!companyId || !actionItem) throw new Error("Company and Action Item are required");

  const company = await db.select().from(schema.companies).where(eq(schema.companies.id, companyId)).limit(1);
  if (!company.length) throw new Error("Company not found");
  const code = company[0].code;

  const departmentId = await getOrCreateDept(str(formData.get("department")));
  const status = str(formData.get("status")) || "Not Started";
  const priority = str(formData.get("priority")) || "Low";
  const accountableRaw = str(formData.get("accountable"));
  const now = new Date();

  const task = await insertTaskWithUniqueCode(companyId, code, {
    departmentId,
    actionItem,
    status,
    priority,
    risk: str(formData.get("risk")),
    escalation: str(formData.get("escalation")) || "No",
    category: str(formData.get("category")),
    deadline: parseDate(formData.get("deadline")),
    meetingDate: parseDate(formData.get("meetingDate")),
    comments: str(formData.get("comments")),
    latestUpdate: str(formData.get("latestUpdate")),
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

  revalidatePath("/registry");
  revalidatePath("/");
  redirect(`/task/${newCode}`);
}

export async function deleteTask(code: string) {
  const existing = await db.select().from(schema.tasks).where(eq(schema.tasks.code, code)).limit(1);
  if (!existing.length) return;
  await db.delete(schema.tasks).where(eq(schema.tasks.id, existing[0].id));
  revalidatePath("/registry");
  revalidatePath("/");
  redirect("/registry");
}

export async function addTaskUpdate(taskId: number, taskCode: string, body: string, newStatus?: string) {
  const trimmed = body.trim();
  if (!trimmed) return;

  await db.insert(schema.taskUpdates).values({
    taskId,
    body: trimmed,
    createdAt: new Date(),
    createdBy: "web-ui",
  });

  const updatePayload: Partial<typeof schema.tasks.$inferInsert> = {
    latestUpdate: trimmed,
    lastUpdatedAt: new Date(),
  };

  let pendingAudit: typeof schema.auditLog.$inferInsert | null = null;
  if (newStatus) {
    const task = await db.select().from(schema.tasks).where(eq(schema.tasks.id, taskId)).limit(1);
    if (task.length) {
      const t = task[0];
      const wasClosed = t.status === "Completed" || t.status === "Closed";
      const isClosed = newStatus === "Completed" || newStatus === "Closed";
      updatePayload.status = newStatus;
      if (isClosed && !wasClosed) updatePayload.closedDate = new Date();
      else if (!isClosed && wasClosed) updatePayload.closedDate = null;

      if (t.status !== newStatus) {
        pendingAudit = {
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
        };
      }
    }
  }

  await db.update(schema.tasks).set(updatePayload).where(eq(schema.tasks.id, taskId));
  if (pendingAudit) await db.insert(schema.auditLog).values(pendingAudit);
  revalidatePath(`/task/${taskCode}`);
  revalidatePath("/registry");
  revalidatePath("/");
}

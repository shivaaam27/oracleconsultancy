"use server";

import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

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
  const [row] = await db.insert(schema.people).values({ name, companyId: companyId ?? undefined, active: true }).returning();
  return row.id;
}

async function getOrCreateDept(name: string | null): Promise<number | null> {
  if (!name) return null;
  const existing = await db.select().from(schema.departments).where(eq(schema.departments.name, name)).limit(1);
  if (existing.length) return existing[0].id;
  const [row] = await db.insert(schema.departments).values({ name }).returning();
  return row.id;
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
  const oldS = oldVal == null ? null : oldVal instanceof Date ? oldVal.toISOString().slice(0, 10) : String(oldVal);
  const newS = newVal == null ? null : newVal instanceof Date ? newVal.toISOString().slice(0, 10) : String(newVal);
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
  const changeReason = str(formData.get("changeReason"));
  const closingNow = (status === "Completed" || status === "Closed") && !(t.status === "Completed" || t.status === "Closed");

  // Diff & audit log
  const fields: [string, unknown, unknown][] = [
    ["Action Item", t.actionItem, actionItem],
    ["Department", t.departmentId, departmentId],
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

  const newClosedDate = closingNow ? new Date() : t.closedDate;

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

  // Find next number for this company
  const existing = await db.select({ code: schema.tasks.code }).from(schema.tasks).where(eq(schema.tasks.companyId, companyId));
  let maxNum = 0;
  for (const e of existing) {
    const m = e.code.match(/^[A-Z]+\d+-(\d+)$/);
    if (m) maxNum = Math.max(maxNum, parseInt(m[1], 10));
  }
  const newCode = `${code}-${String(maxNum + 1).padStart(3, "0")}`;

  const departmentId = await getOrCreateDept(str(formData.get("department")));
  const status = str(formData.get("status")) || "Not Started";
  const priority = str(formData.get("priority")) || "Low";
  const accountableRaw = str(formData.get("accountable"));
  const now = new Date();

  const [task] = await db
    .insert(schema.tasks)
    .values({
      code: newCode,
      companyId,
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
    })
    .returning();

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

  if (newStatus) {
    const task = await db.select().from(schema.tasks).where(eq(schema.tasks.id, taskId)).limit(1);
    if (task.length) {
      const t = task[0];
      const closingNow = (newStatus === "Completed" || newStatus === "Closed") && !(t.status === "Completed" || t.status === "Closed");
      updatePayload.status = newStatus;
      if (closingNow) updatePayload.closedDate = new Date();

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
  revalidatePath(`/task/${taskCode}`);
  revalidatePath("/registry");
  revalidatePath("/");
}

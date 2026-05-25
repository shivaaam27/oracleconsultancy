"use server";

import { db, schema } from "@/db";
import { extractMeetingTasks, type MeetingTask } from "@/lib/meeting-parse";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

export async function parseMeetingNotes(
  notes: string,
  defaultCompanyId?: number,
): Promise<MeetingTask[]> {
  const companies = await db
    .select({ id: schema.companies.id, name: schema.companies.name, code: schema.companies.code })
    .from(schema.companies);
  const people = await db
    .select({ id: schema.people.id, name: schema.people.name })
    .from(schema.people);
  return extractMeetingTasks(notes, companies, people, defaultCompanyId);
}

export type BulkTaskInput = {
  companyId: number;
  actionItem: string;
  priority: string;
  status: string;
  deadline: string | null; // ISO date string or null
  assigneeNames: string[];
  category: string | null;
  escalation: string;
};

async function getOrCreatePerson(name: string, companyId: number): Promise<number> {
  const ex = await db.select().from(schema.people).where(eq(schema.people.name, name)).limit(1);
  if (ex.length) return ex[0].id;
  const [row] = await db.insert(schema.people).values({ name, companyId, active: true }).returning();
  return row.id;
}

async function getOrCreateDept(name: string | null): Promise<number | null> {
  if (!name) return null;
  const ex = await db.select().from(schema.departments).where(eq(schema.departments.name, name)).limit(1);
  if (ex.length) return ex[0].id;
  const [row] = await db.insert(schema.departments).values({ name }).returning();
  return row.id;
}

export async function bulkCreateTasks(tasks: BulkTaskInput[]): Promise<{ created: number }> {
  let created = 0;
  for (const t of tasks) {
    if (!t.companyId || !t.actionItem.trim()) continue;

    const company = await db.select().from(schema.companies).where(eq(schema.companies.id, t.companyId)).limit(1);
    if (!company.length) continue;
    const code = company[0].code;

    const existing = await db
      .select({ code: schema.tasks.code })
      .from(schema.tasks)
      .where(eq(schema.tasks.companyId, t.companyId));
    let maxNum = 0;
    for (const e of existing) {
      const m = e.code.match(/^[A-Z]+\d+-(\d+)$/);
      if (m) maxNum = Math.max(maxNum, parseInt(m[1], 10));
    }
    const newCode = `${code}-${String(maxNum + 1).padStart(3, "0")}`;
    const now = new Date();

    const [task] = await db.insert(schema.tasks).values({
      code: newCode,
      companyId: t.companyId,
      actionItem: t.actionItem,
      status: t.status || "Not Started",
      priority: t.priority || "Low",
      category: t.category,
      escalation: t.escalation || "No",
      deadline: t.deadline ? new Date(t.deadline) : null,
      createdDate: now,
      lastUpdatedAt: now,
      archived: false,
    }).returning();

    for (const name of t.assigneeNames) {
      const pid = await getOrCreatePerson(name, t.companyId);
      try {
        await db.insert(schema.taskAssignees).values({ taskId: task.id, personId: pid });
      } catch {}
    }

    await db.insert(schema.auditLog).values({
      taskId: task.id,
      taskCode: newCode,
      companyId: t.companyId,
      entryType: "CREATE",
      field: "Task",
      oldValue: null,
      newValue: t.actionItem,
      changeReason: "Created via Meeting Mode",
      createdAt: now,
      createdBy: "meeting-mode",
    });

    created++;
  }

  revalidatePath("/registry");
  revalidatePath("/");
  return { created };
}

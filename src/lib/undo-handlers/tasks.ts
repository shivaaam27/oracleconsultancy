import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { registerUndoHandler } from "../undo";

type TaskFields = {
  actionItem: string;
  departmentId: number | null;
  status: string;
  priority: string;
  risk: string | null;
  escalation: string | null;
  category: string | null;
  deadline: string | null;        // ISO date or null
  meetingDate: string | null;
  comments: string | null;
  latestUpdate: string | null;
  lastUpdatedAt: string | null;
  closedDate: string | null;
};

function toDate(v: string | null): Date | null {
  return v ? new Date(v) : null;
}

async function writeUndoAudit(
  taskId: number,
  taskCode: string,
  companyId: number,
  kind: string
) {
  await db.insert(schema.auditLog).values({
    taskId,
    taskCode,
    companyId,
    entryType: "UNDO",
    field: "Task",
    oldValue: null,
    newValue: null,
    changeReason: `undo of ${kind}`,
    createdAt: new Date(),
    createdBy: "web-ui",
  });
}

// task.update — restore prior field values + assignees
registerUndoHandler("task.update", async (raw) => {
  const p = raw as {
    taskId: number;
    taskCode: string;
    companyId: number;
    before: TaskFields;
    beforeAssignees: number[];
  };
  await db
    .update(schema.tasks)
    .set({
      actionItem: p.before.actionItem,
      departmentId: p.before.departmentId,
      status: p.before.status,
      priority: p.before.priority,
      risk: p.before.risk,
      escalation: p.before.escalation,
      category: p.before.category,
      deadline: toDate(p.before.deadline),
      meetingDate: toDate(p.before.meetingDate),
      comments: p.before.comments,
      latestUpdate: p.before.latestUpdate,
      lastUpdatedAt: toDate(p.before.lastUpdatedAt),
      closedDate: toDate(p.before.closedDate),
    })
    .where(eq(schema.tasks.id, p.taskId));

  await db.delete(schema.taskAssignees).where(eq(schema.taskAssignees.taskId, p.taskId));
  for (const personId of p.beforeAssignees) {
    try {
      await db.insert(schema.taskAssignees).values({ taskId: p.taskId, personId });
    } catch {
      // ignore unique violations
    }
  }
  await writeUndoAudit(p.taskId, p.taskCode, p.companyId, "task.update");
});

// task.create — hard delete the just-created task (cascade removes children)
registerUndoHandler("task.create", async (raw) => {
  const p = raw as { taskId: number };
  await db.delete(schema.tasks).where(eq(schema.tasks.id, p.taskId));
});

// task.delete — reinsert task + assignees (task_updates not restored)
registerUndoHandler("task.delete", async (raw) => {
  const p = raw as {
    task: {
      code: string;
      companyId: number;
      departmentId: number | null;
      meetingDate: string | null;
      actionItem: string;
      ownerId: number | null;
      createdDate: string | null;
      deadline: string | null;
      status: string;
      priority: string;
      category: string | null;
      risk: string | null;
      escalation: string | null;
      comments: string | null;
      latestUpdate: string | null;
      lastUpdatedAt: string | null;
      closedDate: string | null;
      archived: boolean;
    };
    assignees: number[];
  };
  const inserted = await db
    .insert(schema.tasks)
    .values({
      code: p.task.code,
      companyId: p.task.companyId,
      departmentId: p.task.departmentId,
      meetingDate: toDate(p.task.meetingDate),
      actionItem: p.task.actionItem,
      ownerId: p.task.ownerId,
      createdDate: toDate(p.task.createdDate),
      deadline: toDate(p.task.deadline),
      status: p.task.status,
      priority: p.task.priority,
      category: p.task.category,
      risk: p.task.risk,
      escalation: p.task.escalation,
      comments: p.task.comments,
      latestUpdate: p.task.latestUpdate,
      lastUpdatedAt: toDate(p.task.lastUpdatedAt),
      closedDate: toDate(p.task.closedDate),
      archived: p.task.archived,
    })
    .returning({ id: schema.tasks.id });
  const newId = inserted[0]?.id;
  if (newId) {
    for (const personId of p.assignees) {
      try {
        await db.insert(schema.taskAssignees).values({ taskId: newId, personId });
      } catch {
        // ignore
      }
    }
    await writeUndoAudit(newId, p.task.code, p.task.companyId, "task.delete");
  }
});

// task.update.add — remove the new task_updates row + restore mirrored task fields
registerUndoHandler("task.update.add", async (raw) => {
  const p = raw as {
    taskUpdateId: number;
    taskId: number;
    taskCode: string;
    companyId: number;
    before: {
      latestUpdate: string | null;
      lastUpdatedAt: string | null;
      status: string;
      closedDate: string | null;
    };
  };
  await db.delete(schema.taskUpdates).where(eq(schema.taskUpdates.id, p.taskUpdateId));
  await db
    .update(schema.tasks)
    .set({
      latestUpdate: p.before.latestUpdate,
      lastUpdatedAt: toDate(p.before.lastUpdatedAt),
      status: p.before.status,
      closedDate: toDate(p.before.closedDate),
    })
    .where(eq(schema.tasks.id, p.taskId));
  await writeUndoAudit(p.taskId, p.taskCode, p.companyId, "task.update.add");
});

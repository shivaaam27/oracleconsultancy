import { sb } from "@/db/supabase";
import { registerUndoHandler } from "../undo";

type TaskFields = {
  actionItem: string;
  departmentId: number | null;
  status: string;
  priority: string;
  risk: string | null;
  escalation: string | null;
  category: string | null;
  deadline: string | null;
  meetingDate: string | null;
  comments: string | null;
  latestUpdate: string | null;
  lastUpdatedAt: string | null;
  closedDate: string | null;
};

async function writeUndoAudit(
  taskId: number,
  taskCode: string,
  companyId: number,
  kind: string
) {
  await sb.from("audit_log").insert({
    task_id: taskId,
    task_code: taskCode,
    company_id: companyId,
    entry_type: "UNDO",
    field: "Task",
    old_value: null,
    new_value: null,
    change_reason: `undo of ${kind}`,
    created_at: new Date().toISOString(),
    created_by: "web-ui",
  });
}

registerUndoHandler("task.update", async (raw) => {
  const p = raw as {
    taskId: number;
    taskCode: string;
    companyId: number;
    before: TaskFields;
    beforeAssignees: number[];
  };
  await sb
    .from("tasks")
    .update({
      action_item: p.before.actionItem,
      department_id: p.before.departmentId,
      status: p.before.status,
      priority: p.before.priority,
      risk: p.before.risk,
      escalation: p.before.escalation,
      category: p.before.category,
      deadline: p.before.deadline,
      meeting_date: p.before.meetingDate,
      comments: p.before.comments,
      latest_update: p.before.latestUpdate,
      last_updated_at: p.before.lastUpdatedAt,
      closed_date: p.before.closedDate,
    })
    .eq("id", p.taskId);

  await sb.from("task_assignees").delete().eq("task_id", p.taskId);
  for (const personId of p.beforeAssignees) {
    await sb
      .from("task_assignees")
      .upsert({ task_id: p.taskId, person_id: personId }, { ignoreDuplicates: true });
  }
  await writeUndoAudit(p.taskId, p.taskCode, p.companyId, "task.update");
});

registerUndoHandler("task.create", async (raw) => {
  const p = raw as { taskId: number };
  await sb.from("tasks").delete().eq("id", p.taskId);
});

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
  const { data: inserted } = await sb
    .from("tasks")
    .insert({
      code: p.task.code,
      company_id: p.task.companyId,
      department_id: p.task.departmentId,
      meeting_date: p.task.meetingDate,
      action_item: p.task.actionItem,
      owner_id: p.task.ownerId,
      created_date: p.task.createdDate,
      deadline: p.task.deadline,
      status: p.task.status,
      priority: p.task.priority,
      category: p.task.category,
      risk: p.task.risk,
      escalation: p.task.escalation,
      comments: p.task.comments,
      latest_update: p.task.latestUpdate,
      last_updated_at: p.task.lastUpdatedAt,
      closed_date: p.task.closedDate,
      archived: p.task.archived,
    })
    .select("id")
    .single();
  const newId = inserted?.id as number | undefined;
  if (newId) {
    for (const personId of p.assignees) {
      await sb
        .from("task_assignees")
        .upsert({ task_id: newId, person_id: personId }, { ignoreDuplicates: true });
    }
    await writeUndoAudit(newId, p.task.code, p.task.companyId, "task.delete");
  }
});

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
  await sb.from("task_updates").delete().eq("id", p.taskUpdateId);
  await sb
    .from("tasks")
    .update({
      latest_update: p.before.latestUpdate,
      last_updated_at: p.before.lastUpdatedAt,
      status: p.before.status,
      closed_date: p.before.closedDate,
    })
    .eq("id", p.taskId);
  await writeUndoAudit(p.taskId, p.taskCode, p.companyId, "task.update.add");
});

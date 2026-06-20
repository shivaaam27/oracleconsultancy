import { sb } from "@/db/supabase";
import { registerUndoHandler } from "../undo";
import { reindexEntity, removeEntityIndex } from "@/lib/index-hooks";

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
  void reindexEntity("task", p.taskId); // fields reverted — re-index (best-effort)
});

registerUndoHandler("task.create", async (raw) => {
  const p = raw as { taskId: number };
  await sb.from("tasks").delete().eq("id", p.taskId);
  void removeEntityIndex("task", p.taskId); // row gone — drop its index entry
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
    // Snapshotted in task/actions.ts so Undo restores the discussion + provenance
    // that the task delete cascaded away (ACTTASKS-02).
    updates?: Array<{
      body: string;
      created_at: string | null;
      created_by: string | null;
      original_body: string | null;
      edited_at: string | null;
      deleted_at: string | null;
      pinned_at: string | null;
      parent_update_id: number | null;
      attachment_document_id: number | null;
    }>;
    meetingLinks?: Array<{ meeting_id: number; created_at: string | null }>;
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
    // Restore the conversation. parent_update_id is dropped to null because the
    // snapshot doesn't carry the old row ids to remap replies to — every message
    // is preserved (flattened), which is what the ACTTASKS-02 fix guarantees.
    // attachment_document_id is kept (those documents weren't deleted).
    for (const u of p.updates ?? []) {
      await sb.from("task_updates").insert({
        task_id: newId,
        body: u.body,
        created_at: u.created_at,
        created_by: u.created_by,
        original_body: u.original_body,
        edited_at: u.edited_at,
        deleted_at: u.deleted_at,
        pinned_at: u.pinned_at,
        parent_update_id: null,
        attachment_document_id: u.attachment_document_id,
      });
    }
    // Restore the originating meeting/note links (provenance).
    for (const link of p.meetingLinks ?? []) {
      await sb
        .from("meeting_tasks")
        .insert({ task_id: newId, meeting_id: link.meeting_id, created_at: link.created_at });
    }
    await writeUndoAudit(newId, p.task.code, p.task.companyId, "task.delete");
    void reindexEntity("task", newId); // task re-created — re-index (best-effort)
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
  void reindexEntity("task", p.taskId); // latest_update/status reverted — re-index
});

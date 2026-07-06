import { sb } from "@/db/supabase";
import { registerUndoHandler } from "../undo";
import { reindexEntity } from "@/lib/index-hooks";

/* Undo handlers for ORI-agent tool actions that the shared task handlers don't
 * cover: reassign (needs owner_id restored), calendar events, draft announcements.
 * Registered via undo-handlers.ts and consumed by /api/undo, exactly like the rest. */

// Reassign — restore the previous owner + assignee list.
registerUndoHandler("ori.task.reassign", async (raw) => {
  const p = raw as { taskId: number; prevOwnerId: number | null; prevLastUpdatedAt: string | null; prevAssignees: number[] };
  await sb.from("tasks").update({ owner_id: p.prevOwnerId, last_updated_at: p.prevLastUpdatedAt }).eq("id", p.taskId);
  await sb.from("task_assignees").delete().eq("task_id", p.taskId);
  for (const personId of p.prevAssignees) {
    await sb.from("task_assignees").upsert({ task_id: p.taskId, person_id: personId }, { ignoreDuplicates: true });
  }
  void reindexEntity("task", p.taskId);
});

// Calendar event creation — delete the event.
registerUndoHandler("ori.event.create", async (raw) => {
  const p = raw as { eventId: number };
  await sb.from("calendar_events").delete().eq("id", p.eventId);
});

// Draft announcement — delete the draft (it was never published).
registerUndoHandler("ori.announcement.draft", async (raw) => {
  const p = raw as { announcementId: number };
  await sb.from("announcements").delete().eq("id", p.announcementId);
});

// Automation rule creation — delete the rule (before it has fired).
registerUndoHandler("ori.automation.create", async (raw) => {
  const p = raw as { ruleId: number };
  await sb.from("automation_rules").delete().eq("id", p.ruleId);
});

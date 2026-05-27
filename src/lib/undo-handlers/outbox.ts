import { sb } from "@/db/supabase";
import { registerUndoHandler } from "../undo";

// outbox.markSent — delete the reminder + outbox rows we just inserted.
registerUndoHandler("outbox.markSent", async (raw) => {
  const p = raw as { dedupeKey: string; outboxIds: number[] };
  await sb.from("reminders").delete().eq("dedupe_key", p.dedupeKey);
  if (p.outboxIds.length) {
    await sb.from("outbox").delete().in("id", p.outboxIds);
  }
});

// meeting.bulkCreate — hard delete all just-created tasks (cascades children).
registerUndoHandler("meeting.bulkCreate", async (raw) => {
  const p = raw as { taskIds: number[] };
  if (!p.taskIds.length) return;
  await sb.from("tasks").delete().in("id", p.taskIds);
});

// person.snooze — restore prior snoozed_until value (or null).
registerUndoHandler("person.snooze", async (raw) => {
  const p = raw as { personId: number; before: string | null };
  await sb.from("people").update({ snoozed_until: p.before }).eq("id", p.personId);
});

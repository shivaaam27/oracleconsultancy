import { db, schema } from "@/db";
import { eq, inArray } from "drizzle-orm";
import { registerUndoHandler } from "../undo";

// person.snooze — restore prior snoozed_until value (or null).
registerUndoHandler("person.snooze", async (raw) => {
  const p = raw as { personId: number; before: string | null };
  await db
    .update(schema.people)
    .set({ snoozedUntil: p.before ? new Date(p.before) : null })
    .where(eq(schema.people.id, p.personId));
});

// outbox.markSent — delete the reminder + outbox rows we just inserted.
// We identify them by dedupeKey (reminders) and outbox id.
registerUndoHandler("outbox.markSent", async (raw) => {
  const p = raw as { dedupeKey: string; outboxIds: number[] };
  await db.delete(schema.reminders).where(eq(schema.reminders.dedupeKey, p.dedupeKey));
  if (p.outboxIds.length) {
    await db.delete(schema.outbox).where(inArray(schema.outbox.id, p.outboxIds));
  }
});

// meeting.bulkCreate — hard delete all just-created tasks (cascades children).
registerUndoHandler("meeting.bulkCreate", async (raw) => {
  const p = raw as { taskIds: number[] };
  if (!p.taskIds.length) return;
  await db.delete(schema.tasks).where(inArray(schema.tasks.id, p.taskIds));
});

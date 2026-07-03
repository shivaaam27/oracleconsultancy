import "server-only";
import { sb } from "@/db/supabase";
import { insertTaskWithUniqueCodeSb } from "@/lib/db-helpers";
import { getAppSettings } from "@/lib/settings";
import type { CalendarEvent } from "@/lib/calendar";

/* ------------------------------------------------------------------ *
 * Meeting-as-task — a calendar event/meeting also becomes a task so the
 * work around a meeting (prep, follow-through) lives in the task system.
 * One task PER company (owner's decision), no deadline, meetingDate = the
 * event start. The task links back via tasks.source_event_id; the event's
 * primary task is stored in calendar_events.task_id.
 * See memory/meeting_as_task_jul2026.md.
 * ------------------------------------------------------------------ */

/** Should a meeting with these companies spawn task(s), per the owner's setting? */
export function shouldCreateMeetingTasks(
  mode: "company" | "always" | "off",
  companyIds: number[],
): boolean {
  if (mode === "off") return false;
  if (mode === "always") return true;
  return companyIds.length > 0; // "company"
}

/**
 * Create one task per company for a calendar event. Attendee people become the
 * assignees. No deadline is set (meetings aren't due — they happen); the task is
 * worked on afterwards. Returns the created task ids/codes (primary first).
 * Best-effort: a failure on one company doesn't stop the others.
 */
export async function createTasksForEvent(
  event: CalendarEvent,
  opts: { companyIds: number[]; createdBy?: string; category?: string },
): Promise<{ id: number; code: string; companyId: number }[]> {
  const settings = await getAppSettings();
  const category = opts.category ?? settings.meetingTaskCategory;
  const companyIds = [...new Set(opts.companyIds.filter((c) => c != null))];
  if (companyIds.length === 0) return [];

  const attendeePersonIds = [
    ...new Set(event.attendees.map((a) => a.personId).filter((p): p is number => typeof p === "number")),
  ];
  const now = new Date();
  const created: { id: number; code: string; companyId: number }[] = [];

  for (const companyId of companyIds) {
    try {
      const task = await insertTaskWithUniqueCodeSb(companyId, "", {
        actionItem: event.title,
        status: "Not Started",
        priority: "Medium",
        category,
        comments: event.description ?? null,
        // meetingDate anchors the task to when the meeting happens; NO deadline.
        meetingDate: new Date(event.startAt),
        createdDate: now,
        lastUpdatedAt: now,
      });
      // Link the task back to its source event.
      await sb.from("tasks").update({ source_event_id: event.id }).eq("id", task.id);
      // Attendees who are known people become assignees (role "working").
      if (attendeePersonIds.length) {
        await sb.from("task_assignees").upsert(
          attendeePersonIds.map((personId) => ({ task_id: task.id, person_id: personId, role: "working" })),
          { onConflict: "task_id,person_id", ignoreDuplicates: true },
        );
      }
      created.push({ id: task.id, code: task.code, companyId });
    } catch {
      /* one company failing must not block the rest */
    }
  }

  // Record the PRIMARY task on the event for quick "does this event have a task" checks.
  if (created.length) {
    await sb
      .from("calendar_events")
      .update({ task_id: created[0].id, updated_at: now.toISOString() })
      .eq("id", event.id);
  }
  return created;
}

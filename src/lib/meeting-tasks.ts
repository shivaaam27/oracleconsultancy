import "server-only";
import { sb } from "@/db/supabase";
import { insertTaskWithUniqueCodeSb } from "@/lib/db-helpers";
import { getAppSettings } from "@/lib/settings";
import { postSystemMessage } from "@/lib/chat";
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

/* ------------------------------------------------------------------ *
 * Opportunistic auto-advance: flip a meeting's task Not Started → In
 * Progress once its start time (+ grace) has passed, and ping the people.
 * Called cheaply from page loads + the morning cron (Vercel Hobby = 1
 * cron/day, so we can't rely on a minute-precise cron; the sweep catches up
 * whenever anyone touches the app). Throttled per server instance so it
 * doesn't run on every single request. Idempotent — a task only advances once
 * because it leaves "Not Started".
 * ------------------------------------------------------------------ */

// Module-level throttle (per warm server instance). Not persisted — a cold start
// just runs it once more, which is harmless (idempotent).
let lastSweepAt = 0;
const SWEEP_THROTTLE_MS = 60_000;

export async function advanceDueMeetingTasks(opts?: { force?: boolean }): Promise<number> {
  const nowMs = Date.now();
  if (!opts?.force && nowMs - lastSweepAt < SWEEP_THROTTLE_MS) return 0;
  lastSweepAt = nowMs;

  const settings = await getAppSettings();
  if (!settings.autoAdvanceMeetingTasks) return 0;
  const graceMs = Math.max(0, settings.meetingTaskGraceMinutes) * 60_000;

  // Candidate tasks: still Not Started, spawned from an event.
  const { data: tasks } = await sb
    .from("tasks")
    .select("id,code,action_item,source_event_id")
    .eq("status", "Not Started")
    .not("source_event_id", "is", null)
    .limit(200);
  if (!tasks || tasks.length === 0) return 0;

  const eventIds = [...new Set(tasks.map((t) => t.source_event_id as number))];
  const { data: events } = await sb
    .from("calendar_events")
    .select("id,start_at,status")
    .in("id", eventIds);
  const startById = new Map<number, { start: number; cancelled: boolean }>();
  for (const e of events ?? []) {
    startById.set(e.id as number, {
      start: new Date(e.start_at as string).getTime(),
      cancelled: (e.status as string) === "cancelled",
    });
  }

  let advanced = 0;
  for (const t of tasks) {
    const info = startById.get(t.source_event_id as number);
    if (!info || info.cancelled) continue;
    if (nowMs < info.start + graceMs) continue; // meeting hasn't started (+grace) yet

    const nowIso = new Date().toISOString();
    const { error } = await sb
      .from("tasks")
      .update({ status: "In Progress", last_updated_at: nowIso })
      .eq("id", t.id)
      .eq("status", "Not Started"); // guard against a concurrent move
    if (error) continue;
    advanced += 1;

    // Audit trail (best-effort).
    try {
      await sb.from("system_events").insert({
        kind: "meeting-task-advanced",
        status: "ok",
        details: JSON.stringify({ taskId: t.id, code: t.code, reason: "meeting started" }),
        created_at: nowIso,
      });
    } catch { /* ignore */ }

    // Ping the assignees: their meeting has started and the task is now live.
    if (settings.eventAttendeePings) {
      try {
        const { data: assignees } = await sb.from("task_assignees").select("person_id").eq("task_id", t.id);
        for (const a of assignees ?? []) {
          await postSystemMessage({
            personId: a.person_id as number,
            kind: "reminders",
            title: "Task reminders",
            body: `🟢 "${t.action_item}" is starting now — the task is open for updates (${t.code}).`,
            taskCode: t.code as string,
            push: { title: "Meeting starting", body: `${t.action_item} — tap to update` },
          });
        }
      } catch { /* pings are best-effort */ }
    }
  }
  return advanced;
}

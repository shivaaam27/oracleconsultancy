import "server-only";
import { sb } from "@/db/supabase";
import { insertTaskWithUniqueCodeSb } from "@/lib/db-helpers";
import { getAppSettings } from "@/lib/settings";
import { postSystemMessage } from "@/lib/chat";
import { expandRecurrence, normaliseRecurrence } from "@/lib/ics";
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
    .select("id,code,action_item,source_event_id,company_id,meeting_date,category")
    .eq("status", "Not Started")
    .not("source_event_id", "is", null)
    .limit(200);
  if (!tasks || tasks.length === 0) return 0;

  const eventIds = [...new Set(tasks.map((t) => t.source_event_id as number))];
  const { data: events } = await sb
    .from("calendar_events")
    .select("id,start_at,end_at,status,recurrence,recurrence_until")
    .in("id", eventIds);
  const eventById = new Map<number, { start: number; cancelled: boolean; recurrence: string | null; until: string | null; startIso: string }>();
  for (const e of events ?? []) {
    eventById.set(e.id as number, {
      start: new Date(e.start_at as string).getTime(),
      cancelled: (e.status as string) === "cancelled",
      recurrence: (e.recurrence as string | null) ?? null,
      until: (e.recurrence_until as string | null) ?? null,
      startIso: e.start_at as string,
    });
  }
  const rollMode = settings.recurringMeetingTaskMode;

  let advanced = 0;
  for (const t of tasks) {
    const info = eventById.get(t.source_event_id as number);
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

    // Rolling recurrence: for a repeating meeting, spawn a fresh task for the NEXT
    // occurrence now that this one has passed (so there's always one open task for
    // the upcoming date). Gated by the setting; deduped by (event, occurrence date).
    if (rollMode === "occurrence" && normaliseRecurrence(info.recurrence)) {
      try {
        await spawnNextOccurrenceTask(t, info);
      } catch { /* rolling is best-effort */ }
    }
  }
  return advanced;
}

type SweepTask = {
  id: number; code: string; action_item: string; source_event_id: number;
  company_id: number | null; meeting_date: string | null; category: string | null;
};
type SweepEvent = { start: number; cancelled: boolean; recurrence: string | null; until: string | null; startIso: string };

/** Create the task for the NEXT occurrence of a recurring meeting after the one
 *  that just passed. Deduped by (event, occurrence date) so repeated sweeps or a
 *  concurrent run can't double-create. */
async function spawnNextOccurrenceTask(task: SweepTask, ev: SweepEvent): Promise<void> {
  if (task.company_id == null) return;
  const occStart = task.meeting_date ? new Date(task.meeting_date).getTime() : ev.start;
  const next = expandRecurrence({
    start: new Date(ev.startIso),
    recurrence: ev.recurrence,
    until: ev.until ? new Date(ev.until) : null,
    windowStart: occStart + 1000,
    windowEnd: Date.now() + 400 * 86_400_000,
    maxOccurrences: 1,
  })[0];
  if (!next) return; // series ended

  // Dedup: is there already a task for this event on that date (±1 min)?
  const lo = new Date(next.getTime() - 60_000).toISOString();
  const hi = new Date(next.getTime() + 60_000).toISOString();
  const { data: dup } = await sb
    .from("tasks")
    .select("id")
    .eq("source_event_id", task.source_event_id)
    .gte("meeting_date", lo)
    .lte("meeting_date", hi)
    .limit(1);
  if (dup && dup.length) return;

  const now = new Date();
  const created = await insertTaskWithUniqueCodeSb(task.company_id, "", {
    actionItem: task.action_item,
    status: "Not Started",
    priority: "Medium",
    category: task.category ?? undefined,
    meetingDate: next,
    createdDate: now,
    lastUpdatedAt: now,
  });
  await sb.from("tasks").update({ source_event_id: task.source_event_id }).eq("id", created.id);
  // Carry the same people forward.
  const { data: assignees } = await sb.from("task_assignees").select("person_id,role").eq("task_id", task.id);
  if (assignees && assignees.length) {
    await sb.from("task_assignees").upsert(
      assignees.map((a) => ({ task_id: created.id, person_id: a.person_id, role: a.role ?? "working" })),
      { onConflict: "task_id,person_id", ignoreDuplicates: true },
    );
  }
}

// Separate throttle for the follow-up pass.
let lastFollowupAt = 0;

/**
 * After a meeting has ended, if its task is still open, post a one-time prompt to
 * capture the outcome/minutes — so nothing decided in the meeting is forgotten.
 * Deduped per task via a sentinel update (created_by "meeting-mode").
 */
export async function postMeetingFollowups(opts?: { force?: boolean }): Promise<number> {
  const nowMs = Date.now();
  if (!opts?.force && nowMs - lastFollowupAt < SWEEP_THROTTLE_MS) return 0;
  lastFollowupAt = nowMs;

  const settings = await getAppSettings();
  if (!settings.meetingFollowupPrompt) return 0;

  const { data: tasks } = await sb
    .from("tasks")
    .select("id,code,action_item,source_event_id,meeting_date")
    .not("source_event_id", "is", null)
    .not("status", "in", "(Completed,Closed)")
    .limit(200);
  if (!tasks || tasks.length === 0) return 0;

  const eventIds = [...new Set(tasks.map((t) => t.source_event_id as number))];
  const { data: events } = await sb.from("calendar_events").select("id,start_at,end_at,status").in("id", eventIds);
  const durById = new Map<number, { durMs: number; cancelled: boolean; start: number }>();
  for (const e of events ?? []) {
    const start = new Date(e.start_at as string).getTime();
    const end = e.end_at ? new Date(e.end_at as string).getTime() : start + 3_600_000;
    durById.set(e.id as number, { durMs: Math.max(0, end - start), cancelled: (e.status as string) === "cancelled", start });
  }

  let posted = 0;
  for (const t of tasks) {
    const info = durById.get(t.source_event_id as number);
    if (!info || info.cancelled) continue;
    // The occurrence's start = the task's meeting_date (rolling) or the event start.
    const occStart = t.meeting_date ? new Date(t.meeting_date).getTime() : info.start;
    const occEnd = occStart + info.durMs;
    if (nowMs < occEnd) continue; // meeting hasn't ended yet

    // Already prompted?
    const { data: existing } = await sb
      .from("task_updates")
      .select("id")
      .eq("task_id", t.id)
      .eq("created_by", "meeting-mode")
      .ilike("body", "📝 Meeting wrapped%")
      .limit(1);
    if (existing && existing.length) continue;

    const { error } = await sb.from("task_updates").insert({
      task_id: t.id,
      body: "📝 Meeting wrapped — capture the outcome: what was decided, action points, and any minutes. Then move this on or complete it.",
      created_by: "meeting-mode",
      created_at: new Date().toISOString(),
    });
    if (!error) posted += 1;
  }
  return posted;
}

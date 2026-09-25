---
name: meeting-as-task
description: Calendar meetings that also become tasks (one per company), auto-advance to In Progress with a bell + push ping, rolling recurring tasks, follow-up prompts, and the Meetings & scheduling settings
metadata:
  type: project
---

# Meeting-as-task (built Jul 2026, current Sept 2026)

All on master. Related: calendar/Meet two-way sync + branded emails
[[calendar]], event papers [[event_attachments]].

Director's ask: when a meeting/event is created it should ALSO behave as a task —
prep + follow-through in the task system, updates posted after the meeting, NO
deadline, auto-move to In Progress when the meeting starts. Plus a richer event
form (multi-company, better date/time), attendee pings, and a self-serve
settings panel.

## Owner decisions (locked)
- **One task PER company** (a multi-company meeting spawns a task per company).
- **Opportunistic timing** — the device calendar alarm is the precise ping; a
  catch-up sweep advances tasks when anyone opens the calendar, plus the daily
  `morning-run` cron and the (externally scheduled) `/api/cron/tick`.
- **Auto-create when a company is set** (per-event "Track as a task" toggle overrides).

## Data + creation
- Migration **0109**: `tasks.source_event_id` (FK→calendar_events, ON DELETE SET
  NULL) + index. `calendar_events.task_id` holds the PRIMARY task.
- **`src/lib/meeting-tasks.ts`**: `shouldCreateMeetingTasks(mode, companyIds)` +
  `createTasksForEvent(event, {companyIds, createdBy, category})` — one task per
  company via `insertTaskWithUniqueCodeSb`, status "Not Started", **no
  deadline**, `meetingDate` = event start, attendee people → `task_assignees`
  (role "working"), sets `event.task_id`.
- `src/app/calendar/actions.ts` `createEventAction`: after creating the event,
  spawns tasks per `shouldCreateMeetingTasks` (or the form's `trackAsTask`
  override); returns `taskCodes`. `parseCompanyIds(fd)` reads `companyIds` JSON
  (multi) or single `companyId`.
- Deleting an event removes its spawned tasks (`deleteTasksForEvent`);
  cancelling one date of a recurring meeting removes that occurrence's task
  (`deleteTaskForOccurrence`, called from `skipEventOccurrence`).

## The event form
The administrator calendar is Studio: `/calendar` → `src/app/calendar/page.tsx`
→ `CalendarBoard` in `src/app/calendar/calendar-board.tsx`, whose `EventForm`
holds the fields: `DatePopover` for start/end, `CompanyMultiSelect` for
companies (first = the lead; hidden `companyId` = lead, `companyIds` = JSON
array), and a "track as a task" toggle (`trackTask` → hidden `trackAsTask`). The
portal's twin is `components/director-event-form.tsx` (also takes
`trackAsTask`).

## Auto-advance + ping
`advanceDueMeetingTasks({force?})` flips `source_event_id` tasks Not Started →
In Progress once the linked event's `start_at + graceMinutes` has passed (gated
by `autoAdvanceMeetingTasks`; skips cancelled events; `.eq("status","Not
Started")` guard = idempotent; module-level 60s throttle). Logs `system_events`
kind "meeting-task-advanced".

On a flip, when `eventAttendeePings` is on, each assignee gets **"Meeting
starting"** through **`createNotification`** (`src/lib/notifications.ts`, kind
`meeting`, urgent) — the bell, which pushes. Chat was removed 26 Sept 2026;
pings no longer go through a chat system message. Separately,
`src/lib/event-reminders.ts` sends attendee lead-time reminders ("· in an hour")
the same way, plus a branded email.

Wired into: `calendar/page.tsx` load (throttled), `morning-run` (force) and
`/api/cron/tick` (force).

## Recurring meetings + follow-ups
- **Task per occurrence (rolling)**: when a recurring meeting's task advances
  and `recurringMeetingTaskMode === "occurrence"`, `spawnNextOccurrenceTask`
  computes the next date via `expandRecurrence`, dedups by (event,
  meeting_date ±1 min), and creates a fresh Not Started task with the same
  people — always one open task for the upcoming date.
- **Follow-up prompt**: `postMeetingFollowups()` — once a meeting has ended and
  its task is still open, posts a one-time `task_updates` note (created_by
  `"meeting-mode"`, "Meeting wrapped — capture the outcome…"), deduped by that
  sentinel. Gated by `meetingFollowupPrompt`.

## Settings
Settings → Automation → card **`meeting-tasks`** ("Meetings & scheduling",
`src/app/settings/page.tsx`; keys in `src/lib/settings.ts`, saved via
`saveSettings` with `__keys`): `meetingTaskMode` (company|always|off, default
company), `meetingTaskCategory` (Meetings), `autoAdvanceMeetingTasks` (true),
`meetingTaskGraceMinutes` (0), `eventAttendeePings` (true),
`recurringMeetingTaskMode` (occurrence|series, default occurrence),
`meetingFollowupPrompt` (true), plus `managedCalendarPersonId` and
`eventReminderEmail` on the same card.

## Still open (small, not built)
- A **"from meeting" link** on the task page (`source_event_id` → the event) —
  nothing reads `source_event_id` outside `meeting-tasks.ts`.
- A daily "today's meetings" ping per attendee; minutes ↔ task link;
  RSVP → assignees.

## Notes
- Guardrails: auto-create + auto-ping are automations — keep them behind the
  settings toggles; auto-advance is reversible (audit_log). See
  `src/lib/guardrails.ts`.

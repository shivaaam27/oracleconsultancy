---
name: meeting-as-task-jul2026
description: Calendar meetings that also become tasks (one per company) + self-serve Scheduling settings; auto-advance + pings planned
metadata:
  type: project
---

# Meeting-as-task (Jul 2026)

Director's ask: when a meeting/event is created it should ALSO behave as a task —
prep + follow-through in the task system, updates posted after the meeting, NO
deadline, auto-move to In Progress when the meeting starts. Plus richer event form
(multi-company, better date/time), attendee pings, and a self-serve settings panel.

## Owner decisions (locked)
- **One task PER company** (a multi-company meeting spawns a task per company).
- **Opportunistic timing** (device calendar alarm = precise ping; a catch-up sweep
  advances tasks when anyone opens the app) — Vercel Hobby = 1 cron/day, so no
  minute-precise cron unless they go Pro.
- **Auto-create when a company is set** (per-event "Track as a task" toggle overrides).

## Phase A — BUILT, VERIFIED (real UI test), pushed
- Migration **0109**: `tasks.source_event_id` (FK→calendar_events, ON DELETE SET NULL)
  + index. (`calendar_events.task_id` already holds the PRIMARY task.)
- **`src/lib/meeting-tasks.ts`**: `shouldCreateMeetingTasks(mode, companyIds)` +
  `createTasksForEvent(event, {companyIds, createdBy, category})` — one task per company
  via `insertTaskWithUniqueCodeSb`, status "Not Started", **no deadline**, `meetingDate`
  = event start, attendee people → `task_assignees` (role "working"), sets event.task_id.
- `src/app/calendar/actions.ts` `createEventAction`: after creating the event, spawns
  tasks per `shouldCreateMeetingTasks` (or the form's `trackAsTask` on/off override);
  returns `taskCodes`. `parseCompanyIds(fd)` reads `companyIds` JSON (multi) or single
  `companyId`.
- `calendar-board.tsx` EventForm: controlled company `companyId` state + a "Track this
  meeting as a task" checkbox (new events); hidden `trackAsTask` = on only when a company
  is picked; success toast appends "· task <CODE>".
- **Settings** (`src/lib/settings.ts` + `settings/page.tsx` Automation group, card
  `meeting-tasks`): 5 new `v2.*` keys — `meetingTaskMode` (company|always|off, default
  company), `meetingTaskCategory` (Meetings), `autoAdvanceMeetingTasks` (true),
  `meetingTaskGraceMinutes` (0), `eventAttendeePings` (true). Saved via `saveSettings`
  with `__keys`/`__section=automation`. Pattern for adding a setting is in [[chat_system]]-
  adjacent settings docs.

## Phase B — auto-advance BUILT + VERIFIED (pushed); daily ping + drawer chip pending
- **Opportunistic auto-advance** (DONE): `advanceDueMeetingTasks({force?})` in
  `meeting-tasks.ts` — flips `source_event_id` tasks Not Started→In Progress once the
  linked event's `start_at + graceMinutes` has passed (gated by `autoAdvanceMeetingTasks`;
  skips cancelled events; `.eq("status","Not Started")` guard = idempotent). Module-level
  60s throttle. Logs `system_events` kind "meeting-task-advanced". On flip, pings each
  assignee via `postSystemMessage(kind:"reminders", push)` when `eventAttendeePings` on.
  Wired into `calendar/page.tsx` load (throttled) + `morning-run` cron (force). Verified:
  a past-start task auto-moved to In Progress on /calendar load.
- **STILL TODO**: a daily "you have these meetings today" ping per attendee in morning-run
  (precise-minute pings rely on the device calendar alarm); the task drawer "from meeting"
  chip (source_event_id → link to the event). Also consider calling the sweep from admin/
  portal home loads for wider coverage (throttle makes it cheap).

## Phase C — NOT built yet
- Richer event form: `FluidSelect` **multi-company**, `DatePopover` + time dropdowns
  (reuse director composer components: date-popover.tsx, fluid-select.tsx, people-picker.tsx).
- **Recurring meeting → a fresh task per occurrence** (not one eternal task).
- Optional post-meeting follow-up prompt; minutes↔task link; RSVP→assignees.

## Notes
- Reusable rich components already exist: `date-popover.tsx`, `fluid-select.tsx`,
  `attendee-picker.tsx`, `people-picker.tsx`, `bottom-sheet.tsx`, `director-event-form.tsx`,
  `director-task-form.tsx`.
- Guardrails: auto-create + auto-ping are automations — keep them behind the settings
  toggles; auto-advance is reversible (audit_log). See `src/lib/guardrails.ts`.

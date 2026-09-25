---
name: audit-trail
description: "What gets logged to audit_log, how deletion works, and where activity is shown"
metadata:
  node_type: memory
  type: project
---

# Audit Trail

`audit_log` holds field-level task history. There is no standalone audit page;
the rows feed the task timeline, the company Timeline tab, the Tasks Timeline
view and the trace panel. The server actions in `src/app/audit/actions.ts`
(edit a reason, record a correction, hide/restore an entry) are reached from
the ⋯ menus on timeline rows (`timeline-entry.tsx`; `audit-menu.tsx` on the
company Timeline tab).

## What writes it

All task writes go through `src/lib/task-write.ts`, so the web form, the portal,
MCP and ORI log the same way.

- `createTaskCore` — one `CREATE` row.
- `updateTaskCore` — one `CHANGE` row per changed field. Assignee changes are
  logged under the field `Accountable`. Closing sets `closed_date`; reopening
  clears it.
- `addTaskUpdateCore` — a status `CHANGE` row when the update moves the status.
- `/api/action` (natural-language commands) — `CHANGE` / `CREATE` rows with
  `created_by = "ai-command"`.
- Automations (`automation-time.ts`, ORI automations cron, suggestions) and
  other creators (to-dos promoted to tasks, Tax & Legal, documents, people
  journeys) write `CREATE` rows; ORI automations also write `UPDATE`.
- Undo writes `UNDO`; a recorded correction writes `CORRECTION` and a
  `corrections` row linking the two entries.

`created_by` is `"web-ui"` (owner), `"portal:<Name>"`, `"ai-command"`, or an
MCP/ORI stamp. Old rows may still say `"meeting-mode"` (the Meeting workspace is
gone; `activity.ts` and `/api/trace` still label it "Meeting").

## Deletion keeps history

- **An update or an audit row** is soft-deleted (`deleted_at`) and can be
  restored. Every timeline filters `deleted_at IS NULL`.
- **A task** (`deleteTaskQuick`) is deleted with a ten-minute undo: the task,
  its assignees and conversation are snapshotted first; its `audit_log` rows
  survive by `task_code` (the FK only nulls `task_id`).
- `purgeTaskHistory` in `src/app/task/actions.ts` (permanent wipe) is reserved
  for a future, explicitly confirmed delete; nothing calls it today.
- `scripts/purge-orphan-history.ts` cleans orphaned history left by older
  permanent deletes.

## Where activity shows

- **Task record** (`/task/[code]`, `TaskRecordPage` in `task-drawer.tsx`) — the
  task's own updates and audit rows, merged by `src/lib/timeline.ts`.
- **Home "Latest activity"** — `listRecentActivity()` in `src/lib/activity.ts`:
  the newest `task_updates` across every company, author resolved from
  `created_by` (a director's list is filtered to their tasks).
- **Tasks → Timeline view** (`?tab=tasks&view=timeline`) —
  `getRecentActivity()` in `src/lib/queries.ts`: recent updates plus audit rows,
  rendered with `TimelineEntry`.
- **Company → Timeline tab** — `companies/[id]/_tabs/timeline-tab.tsx`.

See `timeline.md` for the merge rules and components.

---
name: audit-trail
description: "What gets logged to audit_log and how timelines work"
metadata:
  node_type: memory
  type: project
---

# Audit Trail

Audit data is kept even though the standalone `/audit` page was removed. It powers per-task timelines.

## Task Action Logging

Implemented mainly in `src/app/task/actions.ts`.

- `createTask` writes a `CREATE` audit entry.
- `updateTask` diffs task fields and writes one `CHANGE` row per changed field.
- `addTaskUpdate` writes a status-change audit row when `newStatus` changes.
- Closing a task sets `closedDate`; reopening clears it.
- Assignee changes are logged as `Accountable`.

## AI Command Logging

`/api/action` writes mutation audit rows with `createdBy: "ai-command"`.

Entry types include:

- `STATUS`
- `ESCALATION`
- `PRIORITY`
- `CREATE`

## Meeting Workspace Logging

Tasks created from Meeting Workspace:

- write `audit_log.entry_type = "CREATE"`;
- use `created_by = "meeting-mode"`;
- use change reason `Created via Meeting Mode`;
- are linked back through `meeting_tasks`.

## Timeline Behaviour

Timeline rendering combines:

- `task_updates`
- `audit_log`

`src/lib/timeline.ts` handles:

- stable sorting;
- merging status changes into updates;
- suppressing noisy edit/delete/pin audit rows;
- grouping bursts of field edits;
- hoisting pinned updates.

Task detail pages, the task drawer, and the global activity feed all use this
model. The drawer + global feed render through the shared `TimelineEntry`
component (icon node + actor + relative time + optional task chip). The global
feed (`getRecentActivity`) aggregates updates + audit across all tasks.

See `memory/timeline.md` for the full picture (three scopes, event model, the
shared component, and the activity-feed query).

## Corrections

`corrections` links an erroneous audit entry to the entry that corrected it. No UI writes this table yet.

---
title: Timeline & Activity
description: "The timeline scopes, the shared event model, the TimelineEntry component and the delete model"
---

# Timeline & Activity

Timelines show **what has happened** to work, as opposed to the list (current
state) and the board (workflow). Every scope is built on the same event model.

## Scopes

1. **Tasks → Timeline view** — `/?tab=tasks&view=timeline`, one of the five
   views in the Studio Tasks switcher (`components/studio/tasks/studio-tasks.tsx`;
   List · Cards · Board · Calendar · Timeline). On a phone only List and Board
   show in the switcher; Timeline is tablet and up.
   - `src/app/task/_views/timeline-view.tsx`, two lenses:
     - **Activity** (default): events across every task, grouped by day, newest
       first, with an "All companies" filter.
     - **Schedule**: tasks on a date axis (origin / deadline / last activity),
       grouped by month.
   - Data: `getRecentActivity(limit)` in `src/lib/queries.ts` (recent
     `task_updates` + `audit_log`, `deleted_at` null). `tasks-section.tsx` loads
     it only when `view=timeline`, with a `taskMeta` map (id → code, legacy code,
     company, title) so rows get task chips; unresolved rows fall back to a
     code-only chip.
2. **Per-task** — the task record page `/task/[code]` (`TaskRecordPage` in
   `src/components/task-drawer.tsx`, Studio details and update cards). The
   legacy drawer (`?task=CODE`) uses the same code.
3. **Per-company** — company record → Timeline tab
   (`src/app/companies/[id]/_tabs/timeline-tab.tsx`, with `audit-menu.tsx`).
   Still has its own row rendering, not `TimelineEntry`.

Home's **"Latest activity"** card is separate and simpler: `listRecentActivity()`
in `src/lib/activity.ts` reads only recent `task_updates` (see
`audit_trail.md`).

## Event model

Two tables, merged by `src/lib/timeline.ts`:

- `task_updates` → `update` items (body, edited/pinned metadata).
- `audit_log` → `audit` items (CREATE, CHANGE, UNDO, CORRECTION…).

Helpers:

- `sortTimeline` — newest first; an update sorts before an audit row at the
  same time.
- `mergeStatusIntoUpdates` — folds a status change into the update that caused
  it (a `from → to` chip instead of two rows).
- `suppressUpdateMetaAudits` / `suppressNoReasonAudits` — hide edit/pin meta rows
  and reason-less imported changes (rows stay in the database).
- `groupFieldEdits` / `summariseEditGroup` — collapse a burst of edits into one
  "Edited N fields" item.
- `groupBulkRuns` — collapse a bulk run into one summary.
- `liftPinnedUpdates` — pinned updates first (per-task only).
- `parseTimelineFilter` / `applyTimelineFilter` — filter by kind.
- `cleanReason`, `formatAuditValue`, `splitCodeRefs` — display helpers.

The task page runs
`liftPinnedUpdates(groupFieldEdits(suppressUpdateMetaAudits(mergeStatusIntoUpdates(sortTimeline(raw)))))`.

## `TimelineEntry`

`src/components/timeline-entry.tsx` renders one row for the task page and the
Tasks Timeline view: a coloured node by event type, the actor (`created_by` →
"You", "AI", "Meeting" for old rows, or the name), relative time (exact on
hover), and an optional task chip. Its ⋯ menu removes a row
(`deleteTaskUpdate` / `deleteAuditEntry`) or records a correction
(`recordCorrection`). "Task created" cannot be removed.

## Delete model — history is kept

- Removing an **update** or an **audit row** is a soft delete (`deleted_at`);
  `restoreTaskUpdate` / `restoreAuditEntry` bring it back.
- Deleting a **task** (`deleteTaskQuick`) has a ten-minute undo; its audit rows
  survive by `task_code`.

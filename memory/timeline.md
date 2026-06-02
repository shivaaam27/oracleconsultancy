---
title: Timeline & Activity
description: "The three timeline scopes, the shared event model, and the unified TimelineEntry component"
---

# Timeline & Activity

Timelines trace **what has happened** to work — distinct from the Table (current
state) and Board (workflow). There are **three scopes**, all built on the same
event model so they read consistently.

## Scopes

1. **Global activity feed** — the hub Timeline view (`view=timeline`).
   - `src/app/task/_views/timeline-view.tsx`
   - Two lenses via a toggle:
     - **Activity** (default): a chronological event feed across every task/company,
       grouped by day (Today / Yesterday / weekday-date), newest first.
     - **Schedule**: tasks placed on a date axis (Origin / Deadline / Last activity),
       grouped by month. This is the older "tasks on a timeline" lens, kept as a
       secondary view.
2. **Per-task timeline** — the task drawer History and the `/task/[code]` page.
   - Drawer: `src/components/task-drawer.tsx` (uses the shared `TimelineEntry`).
   - Full page: `src/app/task/[code]/page.tsx` (richer; its own edit/pin menus).
3. **Per-company timeline** — the company page Timeline tab.
   - `src/app/companies/[id]/_tabs/timeline-tab.tsx` (richer; `UpdateMenu`/`AuditMenu`).
   - Not yet migrated to `TimelineEntry`; candidate for future unification.

## Event model

Events come from two tables, merged and normalised by `src/lib/timeline.ts`:

- `task_updates` → `update` items (body, edited/pinned metadata).
- `audit_log` → `audit` items (field change, CREATE, ESCALATION, etc.).

`timeline.ts` helpers (shared by every scope):

- `sortTimeline` — newest first, stable tiebreak (update before audit).
- `mergeStatusIntoUpdates` — folds a status-change audit into the update that
  triggered it (shows a compact `from → to` chip instead of duplicate rows).
- `suppressUpdateMetaAudits` / `suppressNoReasonAudits` — hide noise (edit/pin
  meta rows, reason-less imported field changes). Rows stay in the DB.
- `groupFieldEdits` — collapses a burst of same-task edits into one "Edited N
  fields" group (keyed by task code/id + a time window).
- `liftPinnedUpdates` — hoists pinned updates to the top (per-task only).
- `summariseEditGroup` — label for an edit group ("Edited N fields", or "Updated"
  when no concrete fields).

## Shared component — `TimelineEntry`

`src/components/timeline-entry.tsx` renders one event row, used by the drawer and
the global feed (and available for the company tab later). It owns the **visual
language**:

- A coloured **icon node** by event type: created (blue), status (info; green when
  Completed/Closed, red when Blocked), update (accent), escalation/delete (red),
  deadline/date (amber), generic edit (muted) — plus a connector line.
- **Actor** (`createdBy` → "You" for web-ui, "AI" for ai-command, "Meeting" for
  meeting-mode, else the raw value) and **relative time** ("2h ago", exact on hover).
- An optional clickable **task chip** (code + title) for the global/company scopes;
  per-task scope omits it. Falls back to a code-only chip for orphaned/legacy events
  so the feed stays traceable. `relTime()` is exported for reuse.

## Controls

- **Company filter** (Activity feed): an "All companies" select narrows events to
  one company. The list is derived from tasks that have activity; orphaned/legacy
  events (no resolvable task) only appear under "All".
- **Per-entry delete (permanent)**: `TimelineEntry` has a ⋯ menu (drawer + global
  feed) that **hard-deletes** the underlying row(s) — updates via
  `deleteTaskUpdate`, audits via `deleteAuditEntry` (which also clears any
  `corrections` referencing them). Instant, no undo. "Task created" (CREATE) is not
  deletable. Edit-groups delete all the audit rows they fold.

## Delete model — permanent

Deletes are **permanent wipes** (not soft-delete), reflected everywhere:

- **Task delete** (`deleteTask` / `deleteTaskQuick`) calls `purgeTaskHistory` to
  remove the task's `audit_log` rows (these do *not* cascade — the FK only nulls
  `task_id`) plus referencing `corrections`, then deletes the task (updates,
  assignees, meeting-links cascade). No tombstone, no undo. A confirm guards the
  task-level delete; single timeline entries delete instantly.
- The legacy `deleted_at` columns and `restore*` actions remain in the codebase
  but are no longer the delete path.

## Data hygiene

- `scripts/purge-orphan-history.ts --apply` permanently deletes orphaned history
  (audit/update rows whose task no longer exists) — the phantom "multiple
  companies" in the timeline. Run once after switching to permanent delete; with
  `purgeTaskHistory` in place no new orphans are created.
- `scripts/tidy-audit-noise.ts` (dry-run only, **not applied**) could prune
  reason-less field-change residue, but those are real per-task history shown as
  "Edited N fields"; leave unless you deliberately want to prune.

## Global feed data

`getRecentActivity(limit)` in `src/lib/queries.ts` returns recent `task_updates` +
`audit_log` rows (deleted_at null, newest first). `tasks-section.tsx` fetches it
only when `view=timeline` and passes a `taskMeta` map (id → code/legacyCode/company/
title) so the client can attach task chips. The client resolves a task by `task_id`,
then by `task_code`/legacy code, then degrades to a code-only chip.

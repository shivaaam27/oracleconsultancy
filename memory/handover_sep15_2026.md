# Handover — 15 Sep 2026: task delete bugs, and recurring tasks on the administrator

Branch `claude/loving-sammet-c26363` (worktree). **Not committed** when this was written.
Migration **0166 applied and proved by effect** (column present; 17 tasks backfilled
against 11 live rules).

## 1. What the owner asked

He compared the director portal's task management with the administrator's and
found: no recurring-tasks section on the administrator, no way to know which
tasks recur or to edit their recurrence, and "delete is not a smooth process".

## 2. The six delete bugs (all fixed)

All in `src/app/task/actions.ts`, `task-drawer.tsx`, `task-row-actions.tsx`,
`_views/selection.tsx`, `lib/undo-handlers/tasks.ts`:

1. **Two "deleted" toasts.** `deleteTaskQuick` set the `cos_undo` cookie AND
   returned the token; every caller showed its own Undo toast and `UndoBanner`
   (root layout) read the cookie on the next FULL page load — a second "Task
   deleted. Undo" up to a minute later, on whatever page. **The cookie is for
   form actions that redirect; a client-called action must not set it.**
2. The delete's database error was discarded — a refused delete still said
   "deleted" and offered an Undo. Now checked.
3. Record page pushed `/?tab=tasks` then refreshed the page it had left; Back
   landed on the dead record. Now `router.replace`, no stray refresh.
4. `deleteTask` (form + `/registry` double redirect) had no caller — removed.
   `deleteTaskQuick` is THE delete.
5. Row `⋯` menu deleted on one click — now a Keep/Delete confirm row in the menu.
6. Bulk delete had no undo. Now ONE grouped token (`task.delete.bulk`) for ten
   minutes; single and bulk share `snapshotForDelete` / `restoreDeletedTask`.

## 3. Recurring tasks

⚠️ **UNTIL NOW NOTHING JOINED A TASK TO ITS REPEAT RULE.** A rule is an
`automation_rules` row of kind `recurring_task` written with `task_id` NULL on
purpose (the cron evaluates it against a synthetic open task), and the copies
the cron makes carried nothing back. So the list could not say "this repeats".

- **Migration 0166: `tasks.recurring_rule_id`** (SET NULL on delete — a rule is
  soft-deleted, its occurrences are still real work). Set on the seed task
  (`task-write.ts`, `portal/actions.ts`) and on every copy the cron makes
  (`api/cron/ori-automations`). Carried through the delete snapshot and undo.
  The backfill matched by title + company ONCE — flagged in the SQL header; a
  wrong pairing shows on the record and can be stopped from there.
- **`src/lib/recurring-task-rules.ts`** — the ONE shape and checks (client-safe).
  Two doors: the portal's `automations-actions.ts` (own rules) and the admin's
  **`src/app/task/recurring-actions.ts`** (every rule, plus `taskRecurrence` /
  `setTaskRecurrence` / `stopTaskRecurrence` for the record).
- **`/task/recurring`** — the administrator's list, rail entry "Recurring tasks"
  under Task Management → Work. Same panel as the portal
  (`portal-recurring-tasks.tsx` now takes its actions as props;
  `RecurringTaskSheet` is the exported form).
- **Tasks tab**: a ↻ glyph on a row that repeats, a "Recurring" filter on the
  rail (`?flag=recurring` — filtered on the row fact, not a computed flag), and
  an "N recurring" link on the stats row to the rules page.
- **Task record**: a "Repeats" sidebar block — the schedule, "Change how it
  repeats" (opens the sheet), "Stop" (two-step; switches the rule off and
  unlinks every occurrence), or "Make this task repeat" pre-filled from the task.
- ⚠️ ORI Automation (`/ori-automations`) still lists these rules too — it can
  pause/cancel but not edit. Left as is; the edit lives on the new page.

## 4. Not verified live

I cannot sign in (passwords). `tsc` clean, 1,361 tests pass, the route is
behind the gate. **The owner must open `/task/recurring`, a recurring task's
record, and try a row-menu delete.**

## 5. Director-portal parity on the administrator (later the same day)

Built everything the director had that the administrator lacked, except
"message the task group" (not asked for):

- **Archive / Restore** — `setTaskArchived` finally has callers: a button on the
  record's action bar (Archive ↔ Restore, Undo in the toast), "Archive" in the
  row `⋯` menu, and bulk **Archive** / **Restore** (Undo = the inverse call).
- **Copy to other companies** — `copyTaskToCompany(code, companyId)` in
  `task/actions.ts`, through `createTaskCore` (audited, indexed, undoable).
  `TaskCopyToCompanies` now takes `actions` as a prop — one control, two doors
  (portal default; the admin passes copy + archive-as-undo). Shown on the record
  action bar when there is more than one company and the task is not archived.
- **Bulk deadlines** — a date per selected task in one save (`set-deadlines`);
  blank clears. The selection context now carries `infoOf(code)` (title +
  current deadline) via `OrderRegistrar`'s `info` prop; the List and Cards views
  pass it, the Board view (`orderedCodes`) does not and falls back to the code.
- ⚠️ Not looked at in the browser — the pane stopped responding while the
  Claude window was hidden. `tsc` clean, 1,361 tests pass, dev server compiled
  without errors.

---
name: audit-trail
description: "What gets logged to audit_log, when, and how status changes flow through task updates"
metadata: 
  node_type: memory
  type: project
  originSessionId: ce50e4c8-def7-4b23-a6ab-4d8b492e1b43
---

Implemented in [src/app/task/actions.ts](../src/app/task/actions.ts).

## When entries are written
- **CREATE** â€” `createTask` writes one entry: `entryType: "CREATE", field: "Task", oldValue: null, newValue: <actionItem>`.
- **CHANGE** â€” `updateTask` diffs 12 fields and writes one `entryType: "CHANGE"` row per changed field:
  `Action Item, Department, Status, Priority, Risk, Escalation, Category, Deadline, Meeting Date, Comments, Latest Update, Accountable`.
  The `changeReason` from the form is attached to every diff in the batch.
- **CHANGE / Status** â€” `addTaskUpdate` writes a status-change audit row whenever the optional `newStatus` differs from current. The update body is used as `changeReason`.

## Date formatting
`logChange` formats `Date` values as local `YYYY-MM-DD` (avoids midnight-UTC drift in old/new comparisons). String comparison after formatting â†’ skips writing a row if old == new.

## Status close/reopen side effects
- Transition into `Completed` or `Closed` â†’ `closedDate = now()`.
- Transition out of closed â†’ `closedDate = null`.
Handled in both `updateTask` and `addTaskUpdate`.

## Assignee changes
Assignees are joined as comma-separated `name1, name2` for old/new comparison; a single audit row is written under `field: "Accountable"`.

## Corrections (forward-looking)
`corrections` table links an erroneous audit entry to the audit entry that fixed it (`auditLogId â†’ correctedByEntryId`). No UI writes this yet â€” intended for a "mark this audit entry as corrected" flow.

## Author attribution
- UI-driven actions write `createdBy: "web-ui"`.
- AI command actions (via [`/api/action`](../src/app/api/action/route.ts)) write `createdBy: "ai-command"`. Useful for filtering AI-driven changes in `/audit`.
- Import script writes `createdBy: "import"` (if added — currently no audit writes from import).

## Entry types beyond CREATE/CHANGE
`/api/action` writes additional `entryType` values that the original `updateTask` path does not use:
- `STATUS` — from `complete` / `set_status` commands. `field: "status"`, `changeReason: "Set via command"` (or "Marked complete via command").
- `ESCALATION` — from `escalate` command. `field: "escalation"`, old/new = previous escalation flag → `"Yes"`.
- `PRIORITY` — from `set_priority` command. `field: "priority"`.

When reading the audit log, treat `CHANGE | STATUS | ESCALATION | PRIORITY` as the family of "field changed" entries; `CREATE` is the only structurally different one.

---
name: audit-trail
description: "What gets logged to audit_log, when, and how status changes flow through task updates"
metadata: 
  node_type: memory
  type: project
  originSessionId: ce50e4c8-def7-4b23-a6ab-4d8b492e1b43
---

Implemented in [src/app/task/actions.ts](../../../OneDrive/Documents/COS%20System/cos-system/src/app/task/actions.ts).

## When entries are written
- **CREATE** — `createTask` writes one entry: `entryType: "CREATE", field: "Task", oldValue: null, newValue: <actionItem>`.
- **CHANGE** — `updateTask` diffs 12 fields and writes one `entryType: "CHANGE"` row per changed field:
  `Action Item, Department, Status, Priority, Risk, Escalation, Category, Deadline, Meeting Date, Comments, Latest Update, Accountable`.
  The `changeReason` from the form is attached to every diff in the batch.
- **CHANGE / Status** — `addTaskUpdate` writes a status-change audit row whenever the optional `newStatus` differs from current. The update body is used as `changeReason`.

## Date formatting
`logChange` formats `Date` values as local `YYYY-MM-DD` (avoids midnight-UTC drift in old/new comparisons). String comparison after formatting → skips writing a row if old == new.

## Status close/reopen side effects
- Transition into `Completed` or `Closed` → `closedDate = now()`.
- Transition out of closed → `closedDate = null`.
Handled in both `updateTask` and `addTaskUpdate`.

## Assignee changes
Assignees are joined as comma-separated `name1, name2` for old/new comparison; a single audit row is written under `field: "Accountable"`.

## Corrections (forward-looking)
`corrections` table links an erroneous audit entry to the audit entry that fixed it (`auditLogId → correctedByEntryId`). No UI writes this yet — intended for a "mark this audit entry as corrected" flow.

## Author attribution
All actions hard-code `createdBy: "web-ui"`. There's no user auth, so this is essentially a constant; left as a column so a future multi-user mode could populate it.

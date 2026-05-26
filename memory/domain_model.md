---
name: domain-model
description: "Statuses, priorities, derived flags, and the constants that drive UI colour and risk"
metadata: 
  node_type: memory
  type: project
  originSessionId: ce50e4c8-def7-4b23-a6ab-4d8b492e1b43
---

## Statuses (in display order)
`Not Started, In Progress, Under Review, Blocked, Waiting External, Escalated, Completed, Closed`.

Open = anything except `Completed` and `Closed` (see `isOpen` in [derive.ts](../../../OneDrive/Documents/COS%20System/cos-system/src/lib/derive.ts)).

## Priorities & Risk
`Critical, High, Medium, Low`. Same scale for both.

## Escalation
String column, default `"No"`. Set to `"Yes"` when escalation language appears in capture or user manually toggles.

## Derived flags ([derive.ts](../../../OneDrive/Documents/COS%20System/cos-system/src/lib/derive.ts))

Thresholds (constants — change here if business rules shift):
- `DUE_SOON_DAYS = 3`
- `AGING_CRITICAL_DAYS = 30`
- `BLOCKED_STALLED_DAYS = 14`

`flag(task)` returns one of (in priority order):
| Flag | Condition |
|------|-----------|
| `closed` | status ∈ {Completed, Closed} |
| `escalated` | status = Escalated |
| `stalled` | status = Blocked AND daysOpen > 14 |
| `no-deadline` | open and no deadline set |
| `escalate-now` | priority = Critical AND past deadline |
| `overdue` | past deadline (non-critical) |
| `due-soon` | deadline within 3 days |
| `aging` | daysOpen > 30 |
| `on-track` | otherwise |

Each flag has a label (emoji + text) and a Tailwind colour class in `flagLabel` / `flagColor`.

## Risk score (company KPI)
`riskScore = round(((overdue * 3 + blocked * 2 + aging) / total) * 100)`.
Used to sort companies on the dashboard. Badge tone: >50 danger, >20 warn, else success.

## Task codes
Format: `<COxx>-NNN` (zero-padded 3-digit serial within company). Allocator is `insertTaskWithUniqueCode` in [task/actions.ts](../../../OneDrive/Documents/COS%20System/cos-system/src/app/task/actions.ts): finds max existing serial per company, increments, retries on uniqueness collision up to 5x.

## Category taxonomy
Used by quick-capture parser + AI extractor (must stay in sync):
`Finance, Operations, Marketing, HR, Legal, Technology, Sales, Admin, Meetings, Strategy, Other`.

## Channels
For outbox/reminders: `WHATSAPP`, `EMAIL`, `SMS` (uppercase string).

## Date semantics
- `today()` (derive.ts) zeroes hours/min/sec — comparisons are date-only.
- `daysOpen` measures from `createdDate` to either `closedDate` (if closed) or today.
- `daysToDeadline` returns `"done"` if closed, `null` if no deadline, else integer.

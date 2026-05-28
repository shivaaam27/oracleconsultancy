---
name: domain-model
description: "Statuses, priorities, derived flags, task codes, and risk rules"
metadata:
  node_type: memory
  type: project
---

# Domain Model

## Companies

Oracle Group has 7 portfolio companies:

- CO01 Dar Spices
- CO02 Cocozuri Chocolat
- CO03 Terra Green
- CO04 Oracle Consultancy
- CO05 PES Ltd
- CO06 MES Ltd
- CO07 Pamoja Plus

## Task Codes

Format: `<COxx>-NNN`, for example `CO01-001`.

Allocation uses read-max-then-insert with retries in helper paths. If task creation becomes highly concurrent, consider a stronger Postgres-side allocator.

## Statuses

Display order:

`Not Started, In Progress, Under Review, Blocked, Waiting External, Escalated, Completed, Closed`

Open means anything except `Completed` or `Closed`.

## Priorities and Risk

`Critical, High, Medium, Low`.

## Escalation

String column, usually `"No"` or `"Yes"`.

## Categories

`Finance, Operations, Marketing, HR, Legal, Technology, Sales, Admin, Meetings, Strategy, Other`.

Keep parser/AI prompts aligned with this list.

## Derived Flags

Defined in `src/lib/derive.ts`.

Thresholds:

- `DUE_SOON_DAYS = 3`
- `AGING_CRITICAL_DAYS = 30`
- `BLOCKED_STALLED_DAYS = 14`

Flag order:

| Flag | Condition |
|---|---|
| `closed` | Completed or Closed |
| `escalated` | status is Escalated |
| `stalled` | Blocked and open longer than 14 days |
| `no-deadline` | open with no deadline |
| `escalate-now` | Critical and past deadline |
| `overdue` | past deadline |
| `due-soon` | deadline within 3 days |
| `aging` | open longer than 30 days |
| `on-track` | none of the above |

## Risk Score

Company KPI risk score:

`round(((overdue * 3 + blocked * 2 + aging) / total) * 100)`

Badge tone:

- above 50: danger
- above 20: warn
- otherwise: success

## Date Semantics

- Comparisons are date-oriented.
- `daysOpen` measures from created date to closed date or today.
- `daysToDeadline` is `done`, `null`, or an integer day count.

## Channels

Outbox/reminders use uppercase channel strings:

- `WHATSAPP`
- `EMAIL`
- `SMS`

Product direction is a single user-facing "Messages" workflow once real dispatch exists.

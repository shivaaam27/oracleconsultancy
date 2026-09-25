---
name: domain-model
description: "Statuses, priorities, derived flags, task codes, and risk rules"
metadata:
  node_type: memory
  type: project
---

# Domain Model

## Companies

The portfolio companies live in the **`companies`** table — read them from
there, never hard-code the list. There were seven at the start and there are
about fourteen now; some have been renamed (DS was "Dar Spices", CC was
"Cocozuri Chocolat") while keeping their prefix.

Each company has a two-letter **`code_prefix`** (DS, CC, TG, OC, PE, ME, …).
It is what task codes are built from, so it should not change once tasks exist
(moving a task to another company re-issues its code). The older `code` column
(`CO01`…) survives only as a fallback prefix.

## Task Codes

Format: `<PREFIX>-NNN` (e.g. `DS-001`). Legacy `COxx-NNN` codes are kept in
`tasks.legacy_code` so old links still resolve.

Allocation is in `createTaskCore` (`src/lib/tasks/task-write.ts`): read the highest
number for the prefix, insert, and retry up to five times on a collision.

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

Defined in `src/lib/tasks/derive.ts`.

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

Company KPI (`computeCompanyKpis` in `queries.ts`; `computeCompanyKpisForCompanies` in `company-kpis.ts`) includes `total, open, inProgress, overdue, dueSoon, blocked, critical, escalated, completed, closed, aging, riskScore`. (`inProgress` = status "In Progress"; surfaced on the Director Brief.)

Risk score:

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

Email sends through `src/lib/email/send.ts` (Gmail SMTP or Resend). WhatsApp can send for real through Twilio (`src/lib/messaging/whatsapp.ts`) when its env vars are set; otherwise it falls back to `wa.me` links. Person-to-person messages from MCP are only ever Outbox drafts.

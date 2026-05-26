---
name: database-schema
description: "All 12 tables, their columns, relationships, and the why behind non-obvious choices"
metadata: 
  node_type: memory
  type: project
  originSessionId: ce50e4c8-def7-4b23-a6ab-4d8b492e1b43
---

Defined in [src/db/schema.ts](../../../OneDrive/Documents/COS%20System/cos-system/src/db/schema.ts). Migration: [drizzle/0000_flaky_amphibian.sql](../../../OneDrive/Documents/COS%20System/cos-system/drizzle/0000_flaky_amphibian.sql).

## Core entities

### companies
`id, name (unique), code (unique, e.g. "CO01"), active`. Code is used as task code prefix.

### departments
`id, name (unique)`. Auto-created on demand by `getOrCreateDept` in task actions.

### people
`id, name (unique), email, phone, whatsapp, preferred_channel, role, company_id → companies, manager_id, contact_status, active, notes`.
- `name` is unique — used as the natural key when importing/auto-creating.
- `manager_id` has no FK constraint (self-reference left soft).

### tasks
`id, code (unique e.g. "CO01-007"), company_id (NOT NULL → companies), department_id → departments, meeting_date, action_item (NOT NULL), owner_id → people, created_date, deadline, status (default "Not Started"), priority (default "Low"), category, risk, escalation (default "No"), comments, latest_update, last_updated_at, closed_date, archived`.
- `owner_id` is the single owner; **assignees are M2M** via `task_assignees`.
- `latest_update` is a denormalised mirror of the most recent `task_updates.body` — updated by `addTaskUpdate`.

### task_assignees (M2M join)
`(task_id, person_id)` composite PK. Cascade delete on either side.

### task_updates
`id, task_id (cascade), body, created_at, created_by`. Append-only timeline of progress notes per task.

## Governance

### audit_log
`id, external_id, task_id (set null on delete), task_code, company_id, entry_type ("CREATE"|"CHANGE"|...), field, old_value, new_value, change_reason, created_at, created_by`. Written by `logChange` in task actions and by `addTaskUpdate` when status changes.

### corrections
`id, audit_log_id → audit_log, corrected_by_entry_id → audit_log, status (default "Open"), created_at`. Links an erroneous audit entry to the entry that fixed it. Currently no UI writes this — wired in schema for future correction flow.

## Outreach

### reminders
`id, task_id (set null), person_id (set null), channel, message_type, escalation_level, sent_at, dedupe_key (UNIQUE), created_at`. Unique index on `dedupe_key` enforces idempotency.

### outbox
`id, channel, recipient_name, recipient_contact, company, subject, body (NOT NULL), message_type, status (default "Ready"), contact_status, notes, created_at, sent_at`. One row per dispatched message; `reminders` row is the dedupe ledger, `outbox` is the human-visible record.

## Analytics

### daily_snapshots
`id, snapshot_date, company_id, total, open, overdue, due_soon, blocked, critical, escalated, completed, closed, risk_score`. Time-series of company KPIs. Currently no scheduled job writes to this — table is ready for cron.

## Config

### settings
`key (PK), value`. Imported from `_Settings` sheet. Also used by the UI for nav-pins / nav-recents JSON blobs (see [/api/prefs/](../../../OneDrive/Documents/COS%20System/cos-system/src/app/api/prefs/)).

## Conventions
- All timestamps stored as Postgres `timestamp` (no timezone) in `mode: "date"`. Application is single-user, single-TZ — no TZ logic.
- Soft delete = `archived: boolean` on tasks. People/companies use `active`.
- No row-level security; no auth — Supabase service key effectively gates the whole app.

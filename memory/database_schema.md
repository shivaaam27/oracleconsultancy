---
name: database-schema
description: "Current database tables, relationships, and non-obvious conventions"
metadata:
  node_type: memory
  type: project
---

# Database Schema

Defined in `src/db/schema.ts`. SQL migrations live in `drizzle/`; latest Meeting Workspace migration is `drizzle/0008_meeting_workspace.sql`.

## Core

### companies
`id, name, code, active, accent_color`.

`code` is used as the task-code prefix: `CO01`, `CO02`, etc.

### departments
`id, name`.

Auto-created by helper paths when a task references a new department.

### people
`id, name, email, phone, whatsapp, preferred_channel, role, company_id, manager_id, contact_status, active, notes, snoozed_until, person_type, related_person_id`.

`person_type` is `internal`, `external`, or `expat`.

### person_companies
Join table for secondary company associations.

`person_id, company_id, relationship`.

Used for external contacts such as brokers, agents, vendors, or specialists who serve companies without being employed there.

### tasks
`id, code, company_id, department_id, meeting_date, action_item, owner_id, created_date, deadline, status, priority, category, risk, escalation, comments, latest_update, last_updated_at, closed_date, archived`.

`latest_update` is denormalised from the newest `task_updates.body`. Keep it in sync if bulk-editing updates.

### task_assignees
Many-to-many join between tasks and people.

Composite primary key: `(task_id, person_id)`.

### task_updates
`id, task_id, body, created_at, created_by, original_body, edited_at, deleted_at, pinned_at`.

Supports edit history, soft-delete, and pinned updates in task timelines.

## Meetings

### meetings
`id, title, company_id, meeting_date, attendees, raw_notes, minutes, created_at, updated_at, created_by`.

`company_id` is nullable for group-wide meetings.

### meeting_tasks
Links tasks created from Meeting Workspace back to their source meeting.

`meeting_id, task_id, created_at`.

Composite primary key: `(meeting_id, task_id)`.

## Governance

### audit_log
`id, external_id, task_id, task_code, company_id, entry_type, field, old_value, new_value, change_reason, created_at, created_by, deleted_at`.

Audit data powers per-task timelines. The standalone audit page was removed.

### corrections
`id, audit_log_id, corrected_by_entry_id, status, created_at`.

Schema exists, but no UI flow writes corrections yet.

## Outreach

### reminders
`id, task_id, person_id, channel, message_type, escalation_level, sent_at, dedupe_key, created_at`.

`dedupe_key` has a unique index for idempotency.

### outbox
`id, channel, recipient_name, recipient_contact, company, subject, body, message_type, status, contact_status, notes, created_at, sent_at`.

Human-readable send history. Real WhatsApp/email/SMS dispatch is not implemented yet.

## Analytics and System

### daily_snapshots
`id, snapshot_date, company_id, total, open, overdue, due_soon, blocked, critical, escalated, completed, closed, risk_score`.

Unique index on `(company_id, snapshot_date)`. `/api/cron/snapshots` can write snapshots; production scheduling still needs verification.

### settings
`key, value`.

Stores typed `v2.*` app settings plus nav pins/recents JSON.

### system_events
`id, kind, status, details, created_at`.

Used by cron/health/error style event logging.

### undo_tokens
`id, kind, payload, task_id, created_by, created_at, expires_at, consumed_at`.

Supports undo flows. `/api/cron/cleanup` removes expired tokens.

## Conventions

- Timestamps use Postgres `timestamp` with Drizzle `mode: "date"`.
- Soft delete: `tasks.archived`, `people.active`, `companies.active`, `task_updates.deleted_at`, `audit_log.deleted_at`.
- Supabase pooler transaction mode requires `prepare: false` and `max: 1` in `src/db/index.ts`.
- Newer write paths often use the server-side Supabase client in `src/db/supabase.ts`.

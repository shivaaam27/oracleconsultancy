---
name: database-schema
description: "Current database tables, relationships, and non-obvious conventions"
metadata:
  node_type: memory
  type: project
---

# Database Schema

Defined in `src/db/schema.ts`. SQL migrations live in `drizzle/`; latest is `drizzle/0018_document_files.sql`. Notable recent migrations: `0013` (todos.important), `0014` (all wall-clock columns → `timestamptz`), `0015` (todos.person_id), `0016` (outbox draft columns), `0017` (documents + document_links), `0018` (documents.storage_path/file_name).

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
`id, channel, recipient_name, recipient_contact, company, subject, body, message_type, status, contact_status, notes, source, person_id, todo_id, scheduled_for, created_at, sent_at`.

Now backs **two** flows: (1) the legacy human-readable send record (`status` "Sent"); (2) **persisted drafts** (`status` "Draft", `source` of `task`/`todo`/`adhoc`, optional `person_id`/`todo_id`, optional `scheduled_for`). The Outbox page renders a Drafts section above the live task reminders. See `outbox_and_reminders.md`. Real WhatsApp/email/SMS dispatch is still not server-side — sending is via channel deep-links (`wa.me`/`mailto:`/`sms:`) plus manual "Mark sent".

## To-dos

### todos
`id, title, done, important, due_at, company_id, person_id, task_id, created_at, completed_at`.

The personal to-do list (Workbook → To-do). `important` is the star flag; `person_id` is the assignee (feeds Outbox reminders); `task_id` links a to-do that was **promoted to a tracked task**. See `todos.md`.

## Compliance & Documents

### documents
`id, title, company_id?, person_id?, category, doc_type, issuer, reference_no, issue_date, expiry_date, reminder_lead_days, file_url?, storage_path?, file_name?, notes, archived, created_at, updated_at, created_by`.

Tracks licences, contracts, certificates, registrations, insurance, leases, permits, immigration/visas, tax filings. `file_url` is an optional external link (Drive/email). **In-app uploads** (Phase 4, migration `0018`): `storage_path` is the object key in the private Supabase Storage bucket **`documents`** (created via `scripts/create-documents-bucket.ts`, 20 MB limit) and `file_name` is the original name. Files are served via short-lived signed URLs (`signDocumentFile` / `getDocumentFileLinkAction`). Uploads ride server actions, so `next.config.ts` sets `serverActions.bodySizeLimit: "25mb"`. Owned by a company and/or a person (both `set null` on delete). Lifecycle status (Valid / Expiring / Expired / No expiry / Archived) is **derived** at read time in `src/lib/documents.ts` (`deriveDocStatus`), never stored — mirrors `derive.ts` for tasks. `reminder_lead_days` (default 30, category defaults in `DEFAULT_LEAD_DAYS`) drives expiry reminders. Soft-delete via `archived`. Indexes on `expiry_date` and `company_id`.

### document_links
`document_id, task_id, created_at`. Composite PK `(document_id, task_id)`. Links a renewal/action task back to its document; mirrors `meeting_tasks`.

## Analytics and System

### daily_snapshots
`id, snapshot_date, company_id, total, open, overdue, due_soon, blocked, critical, escalated, completed, closed, risk_score`.

Unique index on `(company_id, snapshot_date)`. `/api/cron/snapshots` can write snapshots; production scheduling still needs verification.

### settings
`key, value`.

Stores typed `v2.*` app settings plus nav pins/recents JSON.

Current typed settings include risk thresholds, weather location, AI master switch, `v2.voiceLanguage`, and `v2.voiceDictionary`.

### system_events
`id, kind, status, details, created_at`.

Used by cron/health/error style event logging.

### undo_tokens
`id, kind, payload, task_id, created_by, created_at, expires_at, consumed_at`.

Supports undo flows. `/api/cron/cleanup` removes expired tokens.

## Conventions

- **Timestamps are `timestamptz`** (Drizzle `mode: "date", withTimezone: true`) as of migration `0014`. Previously they were `timestamp without time zone`, which lost the offset on read and showed times ~3h off for the UTC+3 (Dar es Salaam) operator. All writes use `.toISOString()` (UTC); both read paths (Drizzle/postgres.js and the Supabase JS client) now return offset-aware instants, and the browser renders them in the viewer's local zone. Do not revert columns to plain `timestamp`.
- Soft delete: `tasks.archived`, `people.active`, `companies.active`, `task_updates.deleted_at`, `audit_log.deleted_at`.
- Supabase pooler transaction mode requires `prepare: false` and `max: 1` in `src/db/index.ts`.
- Newer write paths often use the server-side Supabase client in `src/db/supabase.ts`.

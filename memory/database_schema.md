---
name: database-schema
description: "Current database tables, relationships, and non-obvious conventions"
metadata:
  node_type: memory
  type: project
---

# Database Schema

Defined in `src/db/schema.ts`. SQL migrations live in `drizzle/`; latest is `drizzle/0017_yummy_mad_thinker.sql` (HRMS stock tables — see note below). Notable recent migrations: `0013` (todos.important), `0014` (all wall-clock columns → `timestamptz`), `0015` (todos.person_id), `0016` (outbox draft columns), `0017` (documents + document_links), `0018` (documents.storage_path/file_name).

> Migration-numbering note: `0017_documents_compliance` and `0018_document_files` were applied manually (outside the Drizzle journal, like the `0000` baseline), so the journal's last entry was `0016`. When the HRMS stock tables were generated, drizzle-kit numbered them `0017_yummy_mad_thinker` and re-emitted the (already-existing) documents tables; that file was trimmed by hand to the three new `stock_*` tables only before `db:migrate`. Future `db:generate` runs see a clean snapshot.

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

### reporting_lines — migration 0030 (organogram)
Secondary / "dotted-line" reporting for the org chart. `person_id, manager_id, note`; composite PK `(person_id, manager_id)`, both FK→people (cascade). The **primary** manager stays on `people.manager_id` (the solid line the tree is drawn from); this table holds *additional* managers a person also reports to (matrix/functional), rendered as dotted lines. Synced in `src/app/people/actions.ts` (`syncReportingLines`, excludes self + the primary manager); surfaced as `Person.secondaryManagers` in `src/lib/people-queries.ts`; edited via the "Also reports to" field on the person form.

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

## HRMS — Stock Control

`/hrms` is a **hub** of registry cards (`src/components/hrms/registry-card.tsx`, live stats). First registry: **OECR — Office Equipment Control Registry** at `/hrms/oecr` (tabs: Dashboard / Register / Purchases / Issues; `HrmsShell` with back-link to the hub). Second card **OCR — Office Cleaning Registry** is a "Coming soon" placeholder only (no module/route yet). Mirrors the Excel stock workbook. Pure maths (source of truth) lives in `src/lib/stock-shared.ts` (client-safe, incl. `fmtMoney` → TZS); Supabase helpers in `src/lib/stock.ts`; server actions in `src/app/hrms/actions.ts`. UI components under `src/components/hrms/`. Items support edit/archive/**delete**; movements (purchases & issues) support edit + delete (simple, no reverse-entry trail — owner's call for stationery). **Current stock is never stored** — it is derived at read time: `currentStock = openingStock + Σ purchases − Σ issues` (same pattern as `deriveDocStatus`). `stockStatus` → `OK` / `Reorder` (≤ reorderLevel) / `Out of Stock` (≤ 0).

### stock_items
`id, code (unique, e.g. ST-001), name, category, unit, opening_stock, reorder_level, unit_cost, archived, created_at, updated_at, created_by`. Soft-delete via `archived`.

### stock_purchases
Stock IN. `id, date, item_code (FK→stock_items.code, cascade), qty, unit_cost, supplier, ref (invoice/PO), created_at, created_by`. Each row raises the item's current stock.

### stock_issues
Stock OUT. `id, date, item_code (FK→stock_items.code, cascade), qty, issued_to, company_id (FK→companies, set null — tags the issue to one of the 7 portfolio companies, replaces the demo's free-text "entity"), notes, created_at, created_by`. `recordIssue` blocks taking stock negative by default (`InsufficientStockError`); pass `{ allowNegative: true }` to override.

## HRMS — OCR (Office Cleaning Registry)

Second registry under `/hrms`, at `/hrms/ocr`. Digital version of the paper daily cleaning checklist — **one shared "Oracle Office" register**. Pure helpers/types in `src/lib/cleaning-shared.ts`; Supabase helpers in `src/lib/cleaning.ts`. Completion % is **derived** (done ticks ÷ active areas), never stored. Phase 1 = data layer + areas list page; the daily checklist UI is Phase 2.

### cleaning_areas
The editable "columns" of the register. `id, name, sort_order, active, created_at`. Seeded on first run with `DEFAULT_CLEANING_AREAS` (Reception, Directors Office, Staff Working Area, Board Room 1/2, "Daniel, Ashit and Jitesh Office", Admin Office, Kitchen, Office/Staff Washroom, Bathing Area, Outside Area) via `ensureDefaultAreas()` (no-op once any area exists). Retire via `active=false`.

### cleaning_days
One row per calendar date (unique index on `date`, stored at UTC midnight). `id, date, attendance_person_id (FK people, set null), note, signed_by_person_id (FK people, set null), signed_by_name, signed_at, created_at, updated_at`. Sign-off = tap-to-confirm + name; `signed_at` locks the day. `ensureDay(date)` creates the day plus blank checks for every active area.

### cleaning_checks
One tick per (day, area). `id, day_id (FK cleaning_days, cascade), area_id (FK cleaning_areas, cascade), done, done_at, comment`. Unique index `(day_id, area_id)`. `setCheck` upserts a tick + timestamps `done_at`.

## HR compliance (per-person required documents) — migration 0020

### requirement_profiles / requirement_items
A profile per person type (`applies_to_type`) lists the documents that type must/may provide. Items: `label, category, mandatory, expiry_tracked, default_lead_days, sort_order`. Seeded via `scripts/seed-requirement-profiles.ts`. See `src/lib/requirements.ts`.

### person_requirements
Snapshot of a person's checklist (so later profile edits don't rewrite history). Per item: `status` (missing/requested/received/verified/waived, plus `removed` to hide a standard item) + optional `document_id`. Effective status derives expiry; score = verified-mandatory / mandatory → 100%. Unique on `(person_id, item_id)`. **Sync with template** (`syncPersonRequirements` in `src/lib/requirements.ts`) re-adds new profile items and restores previously-removed standard items on demand; surfaced as a button on the person drawer Document compliance section and an inline "add an item to request" in Prepare pack (saves a real person requirement).

### journey_step_templates — migration 0031
Editable onboarding/offboarding step templates, **per person type**. `kind` (onboarding|offboarding), `applies_to_type`, `label`, `offset_days` (days from anchor: start date for onboarding, today for offboarding), `active`, `sort_order`. Seeded once from the hard-coded defaults in `src/lib/onboarding.ts` (`seedJourneyTemplates`); thereafter edited via **Documents → Manage onboarding steps** (`/api/journey-templates`, `JourneyTemplatesButton`). `startJourney` creates a person's journey (todos tagged `kind`) from these; **Sync with template** (`syncJourneyToTemplate`) appends missing template steps to an existing journey (matched by label). Edits/deletes don't rewrite journeys already created.

## HRMS — Assets & Vendors — migrations 0022/0023

### assets / asset_assignments
Durable, individually-tracked equipment (laptops, phones, vehicles) — distinct from consumable OECR stock. `assets`: `tag` (unique-nullable), name, category, serial_no, company_id, vendor_id (supplier), location, status (in_store|assigned|maintenance|retired), assigned_to_person_id, assigned_to_company_id, custodian_person_id, assigned_at, purchase_date/cost, archived. `asset_assignments` = assign/return ledger (open row = currently held). Offboarding (archive person) auto-returns held assets. `src/lib/assets.ts`.

### vendors
Suppliers/contractors/landlords/utilities. `name, category, company_id, contact_name, email, phone, location, notes, active`. Their **contracts are `documents` rows** linked via `documents.vendor_id`. `src/lib/vendors.ts`.

## HRMS — Leave & Attendance (Tanzania ELR Act 2004) — migrations 0025/0026

### leave_types
`name, color, paid, default_days` (total entitlement per cycle), `cycle_months` (Annual 12, Sick 36), `half_pay_days` (Sick 63 of 126), active, sort_order. Seeded via `scripts/seed-leave-types.ts` (Annual 28, Sick 126[63+63], Maternity 84, Paternity 3, Compassionate 4, Unpaid 0).

### public_holidays
`date, name, company_id` (null = all). Excluded from leave-day counts.

### leave_requests
`person_id, leave_type_id, start_date, end_date, half_day, days, reason, status` (Pending/Approved/Rejected/Cancelled), `decided_by/decided_at, notes`. Working days counted **Mon–Sat minus holidays** (half-day = 0.5). Balances derived (entitlement − approved over the type's cycle window). `src/lib/leave.ts`.

### attendance
Daily register, one row per `(person_id, date)` (unique). `status` (Present/Absent/On leave/Holiday/Remote/Half-day/Sick), note. (Register UI = phase 4.2, pending.)

## Letters — migration 0029

### letters
System-wide branded PDF letters. `type` (template id), `title, company_id, person_id, ref, letter_date, addressee, subject, body, letterhead_snapshot` (JSON frozen at Issue), `status` (Draft/Issued), issued_at. Draft renders live company letterhead; Issued uses the frozen snapshot. `src/lib/letters.ts`, routes `/letters` + `/letters/[id]/print`. Per-company letterhead lives on `companies` (branding cols, migrations 0027/0028: typed fields + logo, or designed header/footer images, or full-page background + body margins; `letterhead_mode` = typed|images|background).

## New columns on existing tables

- **people** (migrations 0019/0024): `department_id`, `start_date`, `date_of_birth`, `nationality`, `national_id`, `passport_no`, `address`, `emergency_contact_name`, `emergency_contact_phone`, `probation_end_date`. `person_type` default now `local_staff`.
- **todos** (0021): `kind` ("onboarding"|"offboarding"|null) + `sort_order` — journey steps; excluded from the Workbook/pack todo lists.
- **documents** (0023): `vendor_id` (links a contract to a vendor).
- **companies** (0027/0028): letterhead/branding cols (see Letters above).

## Inbox — manual bundles

`inbox` also accepts in-app bundles: pasted text + multiple uploaded files (stored in the `documents` bucket under `inbox/`, recorded in `attachments` JSON with `storagePath`). Unified "Process" opens the doc review queue and can enrich the person profile (blanks-only).

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

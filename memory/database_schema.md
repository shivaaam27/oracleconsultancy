---
name: database-schema
description: "Current database tables by area, what is live and what is kept but unreachable"
metadata:
  node_type: memory
  type: project
---

# Database Schema

Source of truth: `src/db/schema.ts` (99 tables). Migrations live in `drizzle/`;
**the latest is `0172_announcement_delivered.sql`**. Three more tables exist only
in migrations, not in `schema.ts`: `embeddings` (semantic index, RPC-driven),
`tours` and `tour_completions` (the old staff tour — its code was removed Sept 2026;
the tables are kept, unread, for the next one).

Recent migrations worth knowing:

| No. | What |
|---|---|
| 0114 | Document intelligence stripped — nine tables and fifteen `documents` columns dropped |
| 0139 / 0140 | RLS on for every table, every anon/authenticated grant revoked (tables, then functions) |
| 0145–0165 | CocoZuri, marketing, ledger, recruitment — tables all dropped again by 0167. Kept because the journal is append-only |
| 0166 | `tasks.recurring_rule_id` — a task points at the repeat rule it came from |
| 0167 | Five modules removed: **72 tables dropped** (data gone, not archived) |
| 0168 | Drops `cz_events`, the one CocoZuri table 0167 missed |
| 0169 | `folders` + `documents.folder_id / deleted_at / starred / file_size` (Files Management) |
| 0170 | `task_subtasks` |
| 0171 | `assets.warranty_until`, `assets.checked_at`, `asset_services` |
| 0172 | `announcements.delivered_at` (scheduled posts deliver at go-live) |

Conventions:

- Every wall-clock column is `timestamptz` (since 0014). Write `.toISOString()`.
- RLS is on everywhere with no policies; Oracle reads and writes as the service
  role / `postgres`. Never grant to `anon`. Run `npm run db:check-security` after
  schema work. Create tables through migrations, never the Supabase dashboard.
- A hand-written migration needs a journal `when` later than the newest applied
  one (use `Date.now()`), or drizzle skips it silently.
- A second FK from a table to `companies` breaks PostgREST `companies(name)`
  embeds — use `companies!company_id(name)`.
- Four FKs to `people` are ON DELETE NO ACTION (`tasks.owner_id`,
  `tasks.created_by_person_id`, `tasks.blocked_on_person_id`,
  `department_heads.head_person_id`); the person-delete action clears them first.

## Organisation and people

- **companies** — `name`, `code`, **`code_prefix`** (two letters, the task-code
  prefix), `file_prefix`, `accent_color`, `active`, `aliases`; letterhead/profile
  fields (`legal_name`, `address`, `phone`, `email`, `registration_no`, `tin`,
  `vrn`, `incorporation_date`, `logo_path`, signatory, letterhead images and
  margins); `authorised_shares` / `issued_shares`. Never hard-code the list.
- **departments**, **sites** (shared work/residence locations), **job_titles**
  (managed role list; `people.role` stays free text), **department_heads**
  (per-company head of a department).
- **people** — contact fields, `role`, `company_id`, `department_id`,
  `manager_id`, HR profile (`start_date`, `date_of_birth`, `nationality`,
  `national_id`, `passport_no`, `address`, emergency contact,
  `probation_end_date`), `person_type`, `staff_category`, `previous_staff_ids`,
  `work_site_id` / `residence_site_id`, `active`, `snoozed_until`; portal auth
  (`portal_password_hash`, `portal_enabled_at`, `portal_last_login_at`,
  **`portal_role`** staff | manager | director | receptionist,
  `portal_designation`, `director_company_id`). Staff IDs are computed
  (`src/lib/staff-id.ts`), not stored.
- **person_companies** (secondary company links), **director_companies** (a
  director's company scope), **reporting_lines** ("also reports to"; the primary
  manager stays `people.manager_id`).
- **person_events** — person-record change log.
- **journey_step_templates** — onboarding/offboarding step templates; the steps
  themselves are `todos` rows with a `kind`.

Only `src/lib/portal-access.ts` may write `portal_role`, `director_companies` or
`director_company_id`.

## Sign-in and MCP

- **webauthn_credentials** — passkeys; `person_id` null = owner. Public key only.
- **mcp_keys** (bearer keys, SHA-256), **mcp_oauth_clients**,
  **mcp_oauth_codes**, **mcp_oauth_tokens** (claude.ai / phone OAuth).
- **push_subscriptions** — web-push endpoints per recipient.

## Tasks

- **tasks** — `code`, `legacy_code`, `company_id`, `department_id`,
  `action_item`, `owner_id`, `created_date`, `meeting_date`, `deadline`,
  `status`, `priority`, `category`, `risk`, `escalation`, `accountability`,
  `comments`, `latest_update` / `last_updated_at` (mirrors the newest update),
  `closed_date`, `archived`, `created_by_person_id`, `requires_attachment`
  (proof gate), `creator_close_only` (written, never read), block fields
  (`blocked_on_person_id`, `blocked_reason`, `blocked_since`),
  `recurring_rule_id`, `source_event_id`.
- **task_assignees** — `(task_id, person_id)`, `role`, `part_done_at`.
- **task_updates** — the conversation: `body`, `created_by`, `original_body` /
  `edited_at`, `deleted_at` (soft), `pinned_at`, `parent_update_id`,
  `attachment_document_id`.
- **update_mentions**, **update_acks**, **task_views** (last viewed per viewer,
  drives "unread").
- **task_subtasks** — a checklist inside a task (`title`, `done_at`,
  `sort_order`).
- **audit_log** — field-level history (`entry_type`, `field`, `old_value`,
  `new_value`, `change_reason`, `created_by`, soft `deleted_at`). See
  `audit_trail.md`.
- **corrections** — links an audit row to the row that corrected it.
- **automation_rules** — standing rules, including repeat rules
  (`kind = 'recurring_task'`) and ORI automations.
- **automation_events** — what automations did (with undo data).
- **undo_tokens** — ten-minute undo payloads.
- **daily_snapshots** — nightly per-company counts (company momentum strip).

All task writes go through `src/lib/task-write.ts`.

## Calendar, announcements, notifications

- **calendar_events** (+ Google sync fields, recurrence, attendees),
  **event_categories**, **event_documents** (papers that travel with an event).
- **announcements** (`status`, `publish_at`, `expires_at`, `published_at`,
  **`delivered_at`**, audience, `require_ack`, `deliver_channels`),
  **announcement_receipts**, **announcement_reactions**,
  **announcement_comments**.
- **notifications** — the bell (`kind`, `task_id`/`task_code`, `read_at`).
  `thread_id` and `request_id` survive from removed features.

## Files, notes, to-dos

- **documents** — `title`, `company_id` / `person_id` / `vendor_id`, `category`,
  `doc_type`, `issuer`, `reference_no`, `issue_date`, `expiry_date`,
  `reminder_lead_days`, `file_url`, `storage_path`, `file_name`, `file_size`,
  **`folder_id`**, `starred`, `deleted_at` (Deleted, kept 30 days), `archived`.
  Status (valid/expiring/expired) is derived, never stored.
- **folders** — `name`, `parent_id`, `color`, `company_id` / `person_id`,
  `deleted_at`.
- **document_links** — document ↔ task.
- **notes**, **note_folders**, **note_tags**, **note_links**,
  **note_revisions**, **note_offline_edits** — owner-only Notes (see
  `notes_module_plan.md`).
- **todos** — `title`, `done`, `important`, `kind` (self / onboarding /
  offboarding), `sort_order`, `due_at`, `remind_at`, `pushed`, `company_id`,
  `person_id`, `task_id`, `note_id`.
- **brief_notes** — the owner's notes on the report.

## Outreach

- **outbox** — drafts and sent records (`channel`, recipient, `body`, `status`,
  `source`, `person_id`, `todo_id`, `scheduled_for`).
- **reminders** — per-task reminder log; `dedupe_key` is unique.

## Operations (HR and office)

- **assets** (tag, category, serial, company, vendor, status, assignee /
  custodian, purchase, **`warranty_until`**, **`checked_at`**),
  **asset_assignments**, **asset_services** (service/repair log).
- **site_tools**, **site_tool_movements** — tools on site.
- **vendors** — supplier register (shared; untouched by 0167).
- **stock_items**, **stock_purchases**, **stock_issues** — Supplies. Current
  stock is derived.
- **cleaning_areas**, **cleaning_days**, **cleaning_checks** — Cleaning.
- **attendance** — one row per person per day; **public_holidays**.
- **leave_types** — still read by `lib/leave.ts`.
- **recurring_obligations**, **obligation_company** — Tax & Legal.

## Governance and facts

**facts** (append-only fact ledger), **cap_table**, **beneficial_owners**,
**key_persons**, **signatories**, **resolutions**, **risks**, **decisions** —
shown on the company profile and the entity graph.

## AI and system

- **ai_memory**, **ai_usage** (spend ledger), **ai_jobs** (queue left from the
  retired ORI cloud worker).
- **settings** (key/value; includes saved views and permissions),
  **system_events** (job health, CSP reports), **activity_events** (page-visit
  telemetry), **number_series**.
- **embeddings** (migration-only) — semantic index with `lifecycle`.

## Kept, but no screen reaches them

The tables stay; the features are gone. Do not build on them without asking.

| Table(s) | Removed feature | Still touched by code? |
|---|---|---|
| `chat_threads`, `chat_participants`, `chat_messages`, `chat_message_mentions`, `chat_message_hidden` | Chat (26 Sept 2026) | No |
| `pipeline`, `commitments` | Pipeline / Commitments (26 Sept 2026) | Only a `target_table` check in `automation-time.ts` |
| `inbox` | Document intake (Aug 2026) | No |
| `letters` | Letters (Jul 2026) | No |
| `requests`, `request_updates`, `request_recipients` | Requests (Jul 2026) | `requests` read by `/api/briefing`, `/api/pulse` and an ORI undo handler |
| `leave_requests` | Leave module (Jul 2026) | Read only — approved leave shows on the attendance register and in Ask |
| `meetings`, `meeting_tasks` | Meeting workspace (Jul 2026) | Read by the task record and `/api/pulse`; ORI's agent can still insert a meeting |
| `compliance_events` | Document compliance (Aug 2026) | No |
| `number_series` | Ledger numbering | No |

Everything the ledger, CocoZuri, Orders & Imports, Capital projects, Marketing,
Recruitment, requirement profiles / person requirements and document intake
owned has been **dropped**, not kept.

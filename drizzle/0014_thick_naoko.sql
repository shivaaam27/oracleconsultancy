-- Convert all wall-clock timestamp columns to `timestamptz`.
-- Existing values were written via JS `.toISOString()` (UTC) into tz-naive
-- columns, so reinterpret them AT TIME ZONE 'UTC' to preserve the instant.
ALTER TABLE "audit_log" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone USING "created_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "audit_log" ALTER COLUMN "deleted_at" SET DATA TYPE timestamp with time zone USING "deleted_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "corrections" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone USING "created_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "daily_snapshots" ALTER COLUMN "snapshot_date" SET DATA TYPE timestamp with time zone USING "snapshot_date" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "inbox" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone USING "created_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "inbox" ALTER COLUMN "filed_at" SET DATA TYPE timestamp with time zone USING "filed_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "meeting_tasks" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone USING "created_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "meetings" ALTER COLUMN "meeting_date" SET DATA TYPE timestamp with time zone USING "meeting_date" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "meetings" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone USING "created_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "meetings" ALTER COLUMN "updated_at" SET DATA TYPE timestamp with time zone USING "updated_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "meetings" ALTER COLUMN "pinned_at" SET DATA TYPE timestamp with time zone USING "pinned_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "outbox" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone USING "created_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "outbox" ALTER COLUMN "sent_at" SET DATA TYPE timestamp with time zone USING "sent_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "people" ALTER COLUMN "snoozed_until" SET DATA TYPE timestamp with time zone USING "snoozed_until" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "reminders" ALTER COLUMN "sent_at" SET DATA TYPE timestamp with time zone USING "sent_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "reminders" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone USING "created_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "system_events" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone USING "created_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "task_updates" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone USING "created_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "task_updates" ALTER COLUMN "edited_at" SET DATA TYPE timestamp with time zone USING "edited_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "task_updates" ALTER COLUMN "deleted_at" SET DATA TYPE timestamp with time zone USING "deleted_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "task_updates" ALTER COLUMN "pinned_at" SET DATA TYPE timestamp with time zone USING "pinned_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "tasks" ALTER COLUMN "meeting_date" SET DATA TYPE timestamp with time zone USING "meeting_date" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "tasks" ALTER COLUMN "created_date" SET DATA TYPE timestamp with time zone USING "created_date" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "tasks" ALTER COLUMN "deadline" SET DATA TYPE timestamp with time zone USING "deadline" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "tasks" ALTER COLUMN "last_updated_at" SET DATA TYPE timestamp with time zone USING "last_updated_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "tasks" ALTER COLUMN "closed_date" SET DATA TYPE timestamp with time zone USING "closed_date" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "todos" ALTER COLUMN "due_at" SET DATA TYPE timestamp with time zone USING "due_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "todos" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone USING "created_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "todos" ALTER COLUMN "completed_at" SET DATA TYPE timestamp with time zone USING "completed_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "undo_tokens" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone USING "created_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "undo_tokens" ALTER COLUMN "expires_at" SET DATA TYPE timestamp with time zone USING "expires_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "undo_tokens" ALTER COLUMN "consumed_at" SET DATA TYPE timestamp with time zone USING "consumed_at" AT TIME ZONE 'UTC';

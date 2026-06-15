-- Merge reminders into todos: a reminder is just a to-do with a precise time +
-- a ping. Additive + idempotent. Drops the short-lived personal_reminders table.
ALTER TABLE "todos" ADD COLUMN IF NOT EXISTS "remind_at" timestamptz;
--> statement-breakpoint
ALTER TABLE "todos" ADD COLUMN IF NOT EXISTS "pushed" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "todos_remind_idx" ON "todos" ("done","remind_at");
--> statement-breakpoint
DROP TABLE IF EXISTS "personal_reminders";

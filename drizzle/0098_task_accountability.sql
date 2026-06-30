-- Idempotent: columns/FK were applied directly to the live DB on 2026-07-01
-- (KPI accountability build). IF NOT EXISTS guards let deploy re-run safely.
ALTER TABLE "task_assignees" ADD COLUMN IF NOT EXISTS "part_done_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "accountability" text DEFAULT 'shared' NOT NULL;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "blocked_on_person_id" integer;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "blocked_reason" text;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "blocked_since" timestamp with time zone;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
    WHERE tc.table_name = 'tasks' AND tc.constraint_type = 'FOREIGN KEY'
      AND kcu.column_name = 'blocked_on_person_id'
  ) THEN
    ALTER TABLE "tasks" ADD CONSTRAINT "tasks_blocked_on_person_id_people_id_fk"
      FOREIGN KEY ("blocked_on_person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END $$;

-- Subtasks (25 Sept 2026): a to-do list inside one task. Additive only.
CREATE TABLE IF NOT EXISTS "task_subtasks" (
  "id" serial PRIMARY KEY,
  "task_id" integer NOT NULL REFERENCES "tasks"("id") ON DELETE CASCADE,
  "title" text NOT NULL,
  "done_at" timestamptz,
  "sort_order" integer NOT NULL DEFAULT 0,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "created_by" text NOT NULL DEFAULT 'web-ui'
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "task_subtasks_task_idx" ON "task_subtasks" ("task_id", "sort_order");
--> statement-breakpoint
-- Locked like every other table (0139/0140): COS reaches it only through the
-- service role and postgres, both of which bypass RLS.
ALTER TABLE "task_subtasks" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON "task_subtasks" FROM anon, authenticated;
--> statement-breakpoint
REVOKE ALL ON SEQUENCE "task_subtasks_id_seq" FROM anon, authenticated;

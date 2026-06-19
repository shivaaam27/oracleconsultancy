ALTER TABLE "pipeline" ADD COLUMN IF NOT EXISTS "task_id" integer;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "pipeline" ADD CONSTRAINT "pipeline_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;

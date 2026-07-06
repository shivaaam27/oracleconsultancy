CREATE TABLE "automation_rules" (
	"id" serial PRIMARY KEY NOT NULL,
	"task_id" integer,
	"company_id" integer,
	"kind" text NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"done" boolean DEFAULT false NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_run_at" timestamp with time zone,
	"last_fired_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "automation_rules" ADD CONSTRAINT "automation_rules_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "automation_rules_live_idx" ON "automation_rules" USING btree ("active","done");--> statement-breakpoint
CREATE INDEX "automation_rules_task_idx" ON "automation_rules" USING btree ("task_id");--> statement-breakpoint
NOTIFY pgrst, 'reload schema';
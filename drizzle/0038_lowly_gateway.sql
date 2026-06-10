CREATE TABLE "task_views" (
	"task_id" integer NOT NULL,
	"viewer" text NOT NULL,
	"last_viewed_at" timestamp with time zone NOT NULL,
	CONSTRAINT "task_views_task_id_viewer_pk" PRIMARY KEY("task_id","viewer")
);
--> statement-breakpoint
ALTER TABLE "people" ADD COLUMN "portal_role" text DEFAULT 'staff' NOT NULL;--> statement-breakpoint
ALTER TABLE "task_assignees" ADD COLUMN "role" text DEFAULT 'working' NOT NULL;--> statement-breakpoint
ALTER TABLE "task_views" ADD CONSTRAINT "task_views_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
UPDATE "task_assignees" ta SET "role" = 'accountable' FROM "tasks" t WHERE t."id" = ta."task_id" AND t."owner_id" = ta."person_id";

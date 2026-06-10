CREATE TABLE "notifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"recipient" text NOT NULL,
	"kind" text NOT NULL,
	"task_id" integer,
	"task_code" text,
	"title" text NOT NULL,
	"body" text,
	"actor" text,
	"created_at" timestamp with time zone NOT NULL,
	"read_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;
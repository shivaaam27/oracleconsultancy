ALTER TABLE "outbox" ADD COLUMN "source" text;--> statement-breakpoint
ALTER TABLE "outbox" ADD COLUMN "person_id" integer;--> statement-breakpoint
ALTER TABLE "outbox" ADD COLUMN "todo_id" integer;--> statement-breakpoint
ALTER TABLE "outbox" ADD COLUMN "scheduled_for" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "outbox" ADD CONSTRAINT "outbox_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbox" ADD CONSTRAINT "outbox_todo_id_todos_id_fk" FOREIGN KEY ("todo_id") REFERENCES "public"."todos"("id") ON DELETE set null ON UPDATE no action;
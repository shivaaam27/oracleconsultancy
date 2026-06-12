CREATE TABLE "person_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"person_id" integer NOT NULL,
	"action" text NOT NULL,
	"field" text,
	"old_value" text,
	"new_value" text,
	"detail" text,
	"created_at" timestamp with time zone NOT NULL,
	"created_by" text
);
--> statement-breakpoint
ALTER TABLE "person_events" ADD CONSTRAINT "person_events_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "person_events_person_idx" ON "person_events" USING btree ("person_id");
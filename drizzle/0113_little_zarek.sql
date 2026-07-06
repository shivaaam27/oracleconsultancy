CREATE TABLE "activity_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"who" text NOT NULL,
	"person_id" integer,
	"kind" text NOT NULL,
	"path" text,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "activity_events" ADD CONSTRAINT "activity_events_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activity_events_person_idx" ON "activity_events" USING btree ("person_id","at");--> statement-breakpoint
CREATE INDEX "activity_events_at_idx" ON "activity_events" USING btree ("at");--> statement-breakpoint
NOTIFY pgrst, 'reload schema';
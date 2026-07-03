-- Phase 3: owner-managed event categories.
-- NOTE: drizzle-kit also emitted statements for google_event_id / source_event_id /
-- chat_message_hidden / chat_participants.hidden_at — those were already applied by
-- migrations 0107–0109 (the meta snapshot had drifted), so they are intentionally
-- removed here. This migration adds ONLY the event-categories table + FK column.
CREATE TABLE IF NOT EXISTS "event_categories" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "event_categories_name_unique" UNIQUE("name")
);
--> statement-breakpoint
ALTER TABLE "calendar_events" ADD COLUMN IF NOT EXISTS "category_id" integer;--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_category_id_event_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."event_categories"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

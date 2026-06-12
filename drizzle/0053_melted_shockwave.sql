ALTER TABLE "calendar_events" ADD COLUMN "reminders" text;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD COLUMN "recurrence" text;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD COLUMN "recurrence_until" timestamp with time zone;
ALTER TABLE "meetings" ADD COLUMN IF NOT EXISTS "pinned_at" timestamp;--> statement-breakpoint
ALTER TABLE "meetings" ADD COLUMN IF NOT EXISTS "folder" text;
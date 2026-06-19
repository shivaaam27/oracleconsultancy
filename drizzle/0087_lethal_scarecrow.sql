ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "intake_state" text DEFAULT 'filed' NOT NULL;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "intake_reason" text;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "trashed_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "documents_intake_state_idx" ON "documents" ("intake_state");

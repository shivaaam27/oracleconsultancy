ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "code_prefix" text;--> statement-breakpoint
ALTER TABLE "meetings" ADD COLUMN IF NOT EXISTS "kind" text DEFAULT 'meeting' NOT NULL;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "legacy_code" text;

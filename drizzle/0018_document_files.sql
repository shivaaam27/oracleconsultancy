ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "storage_path" text;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "file_name" text;

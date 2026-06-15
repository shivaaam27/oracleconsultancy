ALTER TABLE "documents" ADD COLUMN "file_hash" text;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "compilation_id" text;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "page_range" text;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "expiry_kind" text;
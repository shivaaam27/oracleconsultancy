-- DR1: store each document's full body text so ORI can read INSIDE files (not
-- just their labels). Additive + idempotent. text_source = 'typed' | 'ocr' | 'none'.
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "extracted_text" text;
--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "text_source" text;
--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "extracted_text_at" timestamptz;

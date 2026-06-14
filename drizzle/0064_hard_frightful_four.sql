ALTER TABLE "documents" ADD COLUMN "review_status" text DEFAULT 'ok' NOT NULL;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "needs_original" boolean DEFAULT false NOT NULL;
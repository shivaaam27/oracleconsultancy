ALTER TABLE "task_updates" ADD COLUMN "original_body" text;--> statement-breakpoint
ALTER TABLE "task_updates" ADD COLUMN "edited_at" timestamp;--> statement-breakpoint
ALTER TABLE "task_updates" ADD COLUMN "deleted_at" timestamp;--> statement-breakpoint
ALTER TABLE "task_updates" ADD COLUMN "pinned_at" timestamp;
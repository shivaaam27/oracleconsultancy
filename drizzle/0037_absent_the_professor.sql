ALTER TABLE "people" ADD COLUMN "portal_password_hash" text;--> statement-breakpoint
ALTER TABLE "people" ADD COLUMN "portal_enabled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "people" ADD COLUMN "portal_last_login_at" timestamp with time zone;
ALTER TABLE "announcements" ADD COLUMN "deliver_channels" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "announcements" ADD COLUMN "takeover" boolean DEFAULT false NOT NULL;
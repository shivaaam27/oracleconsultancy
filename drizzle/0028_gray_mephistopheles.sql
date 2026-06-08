ALTER TABLE "companies" ADD COLUMN "letterhead_mode" text DEFAULT 'typed' NOT NULL;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "header_image_path" text;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "footer_image_path" text;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "background_image_path" text;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "content_top_mm" integer;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "content_bottom_mm" integer;
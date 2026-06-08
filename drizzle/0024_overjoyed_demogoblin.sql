ALTER TABLE "people" ADD COLUMN "date_of_birth" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "people" ADD COLUMN "nationality" text;--> statement-breakpoint
ALTER TABLE "people" ADD COLUMN "national_id" text;--> statement-breakpoint
ALTER TABLE "people" ADD COLUMN "passport_no" text;--> statement-breakpoint
ALTER TABLE "people" ADD COLUMN "address" text;--> statement-breakpoint
ALTER TABLE "people" ADD COLUMN "emergency_contact_name" text;--> statement-breakpoint
ALTER TABLE "people" ADD COLUMN "emergency_contact_phone" text;--> statement-breakpoint
ALTER TABLE "people" ADD COLUMN "probation_end_date" timestamp with time zone;
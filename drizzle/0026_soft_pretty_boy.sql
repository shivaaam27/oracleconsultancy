ALTER TABLE "leave_types" ADD COLUMN "cycle_months" integer DEFAULT 12 NOT NULL;--> statement-breakpoint
ALTER TABLE "leave_types" ADD COLUMN "half_pay_days" integer DEFAULT 0 NOT NULL;
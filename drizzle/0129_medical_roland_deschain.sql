ALTER TABLE "project_budget_lines" ADD COLUMN "materials_amount" numeric(14, 2);--> statement-breakpoint
ALTER TABLE "project_budget_lines" ADD COLUMN "labour_amount" numeric(14, 2);--> statement-breakpoint
ALTER TABLE "project_payment_stages" ADD COLUMN "ipc_submitted" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "project_payment_stages" ADD COLUMN "ipc_processed" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "project_payment_stages" ADD COLUMN "efd_issued" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "project_payments" ADD COLUMN "total_payable" numeric(14, 2);
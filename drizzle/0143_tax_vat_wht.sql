CREATE TABLE "tax_rates" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"name" text NOT NULL,
	"kind" text DEFAULT 'VAT' NOT NULL,
	"percent" numeric(7, 4) DEFAULT '0' NOT NULL,
	"applies_to" text DEFAULT 'both' NOT NULL,
	"treatment" text DEFAULT 'standard' NOT NULL,
	"account_id" integer,
	"is_default" boolean DEFAULT false NOT NULL,
	"confirmed" boolean DEFAULT false NOT NULL,
	"notes" text,
	"archived" boolean DEFAULT false NOT NULL,
	"created_by" text DEFAULT 'web-ui' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ops_invoices" ADD COLUMN "tax_rate_id" integer;--> statement-breakpoint
ALTER TABLE "ops_invoices" ADD COLUMN "tax_percent" numeric(7, 4);--> statement-breakpoint
ALTER TABLE "ops_invoices" ADD COLUMN "tax_inclusive" boolean;--> statement-breakpoint
ALTER TABLE "ops_invoices" ADD COLUMN "efd_no" text;--> statement-breakpoint
ALTER TABLE "ops_invoices" ADD COLUMN "efd_date" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "ops_order_lines" ADD COLUMN "purchase_tax_rate_id" integer;--> statement-breakpoint
ALTER TABLE "ops_order_lines" ADD COLUMN "purchase_tax_percent" numeric(7, 4);--> statement-breakpoint
ALTER TABLE "ops_order_lines" ADD COLUMN "purchase_tax_inclusive" boolean;--> statement-breakpoint
ALTER TABLE "ops_payments" ADD COLUMN "wht_rate_id" integer;--> statement-breakpoint
ALTER TABLE "ops_payments" ADD COLUMN "wht_percent" numeric(7, 4);--> statement-breakpoint
ALTER TABLE "ops_payments" ADD COLUMN "wht_base" numeric(14, 2);--> statement-breakpoint
ALTER TABLE "tax_rates" ADD CONSTRAINT "tax_rates_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tax_rates" ADD CONSTRAINT "tax_rates_account_id_gl_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."gl_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "tax_rates_name_unique" ON "tax_rates" USING btree ("company_id","name");--> statement-breakpoint
CREATE INDEX "tax_rates_company_idx" ON "tax_rates" USING btree ("company_id","archived","kind");--> statement-breakpoint
ALTER TABLE "ops_invoices" ADD CONSTRAINT "ops_invoices_tax_rate_id_tax_rates_id_fk" FOREIGN KEY ("tax_rate_id") REFERENCES "public"."tax_rates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ops_order_lines" ADD CONSTRAINT "ops_order_lines_purchase_tax_rate_id_tax_rates_id_fk" FOREIGN KEY ("purchase_tax_rate_id") REFERENCES "public"."tax_rates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ops_payments" ADD CONSTRAINT "ops_payments_wht_rate_id_tax_rates_id_fk" FOREIGN KEY ("wht_rate_id") REFERENCES "public"."tax_rates"("id") ON DELETE set null ON UPDATE no action;
CREATE TABLE "ops_invoices" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"delivery_note_no" text,
	"delivered_date" timestamp with time zone,
	"invoice_no" text,
	"invoice_date" timestamp with time zone,
	"invoice_value" numeric(14, 2),
	"invoice_currency" text,
	"ex_rate" numeric(14, 4),
	"client" text,
	"status" text,
	"pending_with" text,
	"notes" text,
	"archived" boolean DEFAULT false NOT NULL,
	"created_by" text DEFAULT 'web-ui' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ops_order_lines" ADD COLUMN "invoice_id" integer;--> statement-breakpoint
ALTER TABLE "ops_order_lines" ADD COLUMN "delivered_qty" numeric(14, 3);--> statement-breakpoint
ALTER TABLE "ops_invoices" ADD CONSTRAINT "ops_invoices_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ops_invoices_no_unique" ON "ops_invoices" USING btree ("company_id","invoice_no");--> statement-breakpoint
CREATE INDEX "ops_invoices_company_idx" ON "ops_invoices" USING btree ("company_id","archived","invoice_date");--> statement-breakpoint
CREATE INDEX "ops_invoices_delivered_idx" ON "ops_invoices" USING btree ("company_id","delivered_date");--> statement-breakpoint
ALTER TABLE "ops_order_lines" ADD CONSTRAINT "ops_order_lines_invoice_id_ops_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."ops_invoices"("id") ON DELETE set null ON UPDATE no action;
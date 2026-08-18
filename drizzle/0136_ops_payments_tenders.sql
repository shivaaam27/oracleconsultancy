CREATE TABLE "ops_payments" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"payee" text,
	"kind" text,
	"paid_date" timestamp with time zone,
	"amount" numeric(14, 2),
	"currency" text,
	"ex_rate" numeric(14, 4),
	"reference" text,
	"order_line_id" integer,
	"shipment_id" integer,
	"notes" text,
	"archived" boolean DEFAULT false NOT NULL,
	"created_by" text DEFAULT 'web-ui' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ops_tenders" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"description" text NOT NULL,
	"client" text,
	"quote_type" text,
	"deadline" timestamp with time zone,
	"outcome" text,
	"outcome_reason" text,
	"submitted_date" timestamp with time zone,
	"enquiry_id" integer,
	"notes" text,
	"archived" boolean DEFAULT false NOT NULL,
	"created_by" text DEFAULT 'web-ui' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ops_order_lines" ADD COLUMN "production_due_date" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "ops_order_lines" ADD COLUMN "production_done_date" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "ops_order_lines" ADD COLUMN "supplier_due_date" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "ops_shipments" ADD COLUMN "ref_no" text;--> statement-breakpoint
ALTER TABLE "ops_shipments" ADD COLUMN "freight_supplier" text;--> statement-breakpoint
ALTER TABLE "ops_shipments" ADD COLUMN "freight_invoice_no" text;--> statement-breakpoint
ALTER TABLE "ops_payments" ADD CONSTRAINT "ops_payments_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ops_payments" ADD CONSTRAINT "ops_payments_order_line_id_ops_order_lines_id_fk" FOREIGN KEY ("order_line_id") REFERENCES "public"."ops_order_lines"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ops_payments" ADD CONSTRAINT "ops_payments_shipment_id_ops_shipments_id_fk" FOREIGN KEY ("shipment_id") REFERENCES "public"."ops_shipments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ops_tenders" ADD CONSTRAINT "ops_tenders_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ops_tenders" ADD CONSTRAINT "ops_tenders_enquiry_id_ops_enquiries_id_fk" FOREIGN KEY ("enquiry_id") REFERENCES "public"."ops_enquiries"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ops_payments_company_idx" ON "ops_payments" USING btree ("company_id","archived","paid_date");--> statement-breakpoint
CREATE INDEX "ops_payments_line_idx" ON "ops_payments" USING btree ("order_line_id");--> statement-breakpoint
CREATE INDEX "ops_payments_shipment_idx" ON "ops_payments" USING btree ("shipment_id");--> statement-breakpoint
CREATE INDEX "ops_payments_payee_idx" ON "ops_payments" USING btree ("company_id","payee");--> statement-breakpoint
CREATE INDEX "ops_tenders_company_idx" ON "ops_tenders" USING btree ("company_id","archived","deadline");
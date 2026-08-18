CREATE TABLE "ops_enquiries" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"rfq_no" text NOT NULL,
	"rfq_date" timestamp with time zone,
	"client" text,
	"description" text,
	"assigned_to" text,
	"quotation_no" text,
	"quotation_date" timestamp with time zone,
	"quote_currency" text,
	"quote_value" numeric(14, 2),
	"quote_ex_rate" numeric(14, 4),
	"po_no" text,
	"outcome" text,
	"outcome_reason" text,
	"remarks" text,
	"archived" boolean DEFAULT false NOT NULL,
	"created_by" text DEFAULT 'web-ui' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ops_enquiries" ADD CONSTRAINT "ops_enquiries_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ops_enquiries_company_idx" ON "ops_enquiries" USING btree ("company_id","archived","rfq_date");--> statement-breakpoint
CREATE INDEX "ops_enquiries_rfq_idx" ON "ops_enquiries" USING btree ("company_id","rfq_no");--> statement-breakpoint
CREATE INDEX "ops_enquiries_po_idx" ON "ops_enquiries" USING btree ("company_id","po_no");
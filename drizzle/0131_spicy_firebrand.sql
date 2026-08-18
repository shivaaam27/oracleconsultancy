CREATE TABLE "ops_audit" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"entity" text NOT NULL,
	"entity_id" integer,
	"label" text,
	"action" text NOT NULL,
	"field" text,
	"old_value" text,
	"new_value" text,
	"created_by" text DEFAULT 'web-ui' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ops_order_lines" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"po_no" text NOT NULL,
	"client" text,
	"cost_centre" text,
	"received_date" timestamp with time zone,
	"due_date" timestamp with time zone,
	"description" text NOT NULL,
	"qty" numeric(14, 3),
	"uom" text,
	"sale_currency" text,
	"sale_unit_price" numeric(14, 2),
	"ex_rate" numeric(14, 4),
	"kind" text,
	"quotation_no" text,
	"quoted_unit_bp" numeric(14, 2),
	"lc_factor" numeric(10, 4),
	"source" text,
	"supplier" text,
	"origin" text,
	"prof_no" text,
	"purchase_date" timestamp with time zone,
	"purchase_currency" text,
	"purchase_qty" numeric(14, 3),
	"purchase_unit_price" numeric(14, 2),
	"supplier_payment_date" timestamp with time zone,
	"status" text,
	"pending_with" text,
	"remarks" text,
	"invoice_no" text,
	"invoice_date" timestamp with time zone,
	"archived" boolean DEFAULT false NOT NULL,
	"created_by" text DEFAULT 'web-ui' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ops_audit" ADD CONSTRAINT "ops_audit_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ops_order_lines" ADD CONSTRAINT "ops_order_lines_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ops_audit_company_idx" ON "ops_audit" USING btree ("company_id","created_at");--> statement-breakpoint
CREATE INDEX "ops_audit_entity_idx" ON "ops_audit" USING btree ("company_id","entity","entity_id");--> statement-breakpoint
CREATE INDEX "ops_order_lines_company_idx" ON "ops_order_lines" USING btree ("company_id","archived","due_date");--> statement-breakpoint
CREATE INDEX "ops_order_lines_po_idx" ON "ops_order_lines" USING btree ("company_id","po_no");--> statement-breakpoint
CREATE INDEX "ops_order_lines_status_idx" ON "ops_order_lines" USING btree ("company_id","status");
CREATE TABLE "ops_shipments" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"bl_no" text NOT NULL,
	"bl_date" timestamp with time zone,
	"supplier" text,
	"origin" text,
	"mode" text,
	"clearing_agent" text,
	"dox_lodged" timestamp with time zone,
	"eta" timestamp with time zone,
	"berth_date" timestamp with time zone,
	"cleared_date" timestamp with time zone,
	"assessment_date" timestamp with time zone,
	"duty_amount" numeric(14, 2),
	"vat_amount" numeric(14, 2),
	"wharfage" numeric(14, 2),
	"agency_fees" numeric(14, 2),
	"other_costs" numeric(14, 2),
	"freight_amount" numeric(14, 2),
	"cost_currency" text,
	"ex_rate" numeric(14, 4),
	"amount_paid" numeric(14, 2),
	"paid_date" timestamp with time zone,
	"status" text,
	"pending_with" text,
	"notes" text,
	"archived" boolean DEFAULT false NOT NULL,
	"created_by" text DEFAULT 'web-ui' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ops_order_lines" ADD COLUMN "shipment_id" integer;--> statement-breakpoint
ALTER TABLE "ops_shipments" ADD CONSTRAINT "ops_shipments_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ops_shipments_bl_unique" ON "ops_shipments" USING btree ("company_id","bl_no");--> statement-breakpoint
CREATE INDEX "ops_shipments_company_idx" ON "ops_shipments" USING btree ("company_id","archived","eta");--> statement-breakpoint
ALTER TABLE "ops_order_lines" ADD CONSTRAINT "ops_order_lines_shipment_id_ops_shipments_id_fk" FOREIGN KEY ("shipment_id") REFERENCES "public"."ops_shipments"("id") ON DELETE set null ON UPDATE no action;
CREATE TABLE "projects" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"name" text NOT NULL,
	"variant" text,
	"client" text,
	"location" text,
	"po_number" text,
	"start_date" timestamp with time zone,
	"duration_days" integer,
	"quotation_value" numeric(14, 2),
	"po_value" numeric(14, 2),
	"additional_work" numeric(14, 2),
	"vat_rate" numeric(6, 4) DEFAULT '0.18' NOT NULL,
	"wht_rate" numeric(6, 4) DEFAULT '0.10' NOT NULL,
	"completion_pct" numeric(6, 4) DEFAULT '0' NOT NULL,
	"status" text DEFAULT 'Active' NOT NULL,
	"notes" text,
	"archived" boolean DEFAULT false NOT NULL,
	"created_by" text DEFAULT 'web-ui' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "projects_company_idx" ON "projects" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "projects_list_idx" ON "projects" USING btree ("archived","status","start_date");
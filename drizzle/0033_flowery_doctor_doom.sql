CREATE TABLE "company_requirements" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"source_key" text,
	"label" text NOT NULL,
	"category" text,
	"mandatory" boolean DEFAULT true NOT NULL,
	"expiry_tracked" boolean DEFAULT true NOT NULL,
	"status" text DEFAULT 'missing' NOT NULL,
	"document_id" integer,
	"auto_link" boolean DEFAULT true NOT NULL,
	"requested_at" timestamp with time zone,
	"received_at" timestamp with time zone,
	"verified_at" timestamp with time zone,
	"verified_by" text,
	"waived_reason" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "company_requirements" ADD CONSTRAINT "company_requirements_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_requirements" ADD CONSTRAINT "company_requirements_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "company_requirements_company_source_idx" ON "company_requirements" USING btree ("company_id","source_key");
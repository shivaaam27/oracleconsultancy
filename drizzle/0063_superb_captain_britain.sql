CREATE TABLE "facts" (
	"id" serial PRIMARY KEY NOT NULL,
	"entity_type" text NOT NULL,
	"person_id" integer,
	"company_id" integer,
	"field" text NOT NULL,
	"value" jsonb NOT NULL,
	"display" text,
	"effective_date" timestamp with time zone NOT NULL,
	"source" text,
	"document_id" integer,
	"source_hash" text,
	"verified" boolean DEFAULT false NOT NULL,
	"verified_at" timestamp with time zone,
	"note" text,
	"created_by" text,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "facts" ADD CONSTRAINT "facts_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "facts" ADD CONSTRAINT "facts_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "facts" ADD CONSTRAINT "facts_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "facts_person_idx" ON "facts" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "facts_company_idx" ON "facts" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "facts_field_idx" ON "facts" USING btree ("field");
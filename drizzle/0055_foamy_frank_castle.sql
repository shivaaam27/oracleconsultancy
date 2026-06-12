CREATE TABLE "compliance_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"owner_type" text NOT NULL,
	"person_id" integer,
	"company_id" integer,
	"requirement_id" integer,
	"label" text NOT NULL,
	"action" text NOT NULL,
	"detail" text,
	"document_id" integer,
	"created_at" timestamp with time zone NOT NULL,
	"created_by" text
);
--> statement-breakpoint
ALTER TABLE "compliance_events" ADD CONSTRAINT "compliance_events_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compliance_events" ADD CONSTRAINT "compliance_events_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compliance_events" ADD CONSTRAINT "compliance_events_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "compliance_events_person_idx" ON "compliance_events" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "compliance_events_company_idx" ON "compliance_events" USING btree ("company_id");
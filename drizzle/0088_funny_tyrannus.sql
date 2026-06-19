CREATE TABLE IF NOT EXISTS "automation_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"status" text DEFAULT 'suggested' NOT NULL,
	"document_id" integer,
	"target_table" text NOT NULL,
	"target_id" integer NOT NULL,
	"person_id" integer,
	"company_id" integer,
	"summary" text NOT NULL,
	"detail" text,
	"prev_value" text,
	"new_value" text,
	"created_at" timestamp with time zone NOT NULL,
	"acted_at" timestamp with time zone,
	"created_by" text DEFAULT 'automation' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "automation_events" ADD CONSTRAINT "automation_events_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_events" ADD CONSTRAINT "automation_events_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_events" ADD CONSTRAINT "automation_events_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "automation_events_status_idx" ON "automation_events" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "automation_events_document_idx" ON "automation_events" USING btree ("document_id");
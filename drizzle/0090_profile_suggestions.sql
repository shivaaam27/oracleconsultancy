CREATE TABLE IF NOT EXISTS "profile_suggestions" (
	"id" serial PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"document_id" integer,
	"person_id" integer,
	"company_id" integer,
	"field" text NOT NULL,
	"value" jsonb NOT NULL,
	"display" text,
	"summary" text NOT NULL,
	"detail" text,
	"effective_date" timestamp with time zone,
	"source" text,
	"created_at" timestamp with time zone NOT NULL,
	"acted_at" timestamp with time zone,
	"created_by" text DEFAULT 'ai-intake' NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "profile_suggestions" ADD CONSTRAINT "profile_suggestions_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "profile_suggestions" ADD CONSTRAINT "profile_suggestions_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "profile_suggestions" ADD CONSTRAINT "profile_suggestions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "profile_suggestions_status_idx" ON "profile_suggestions" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "profile_suggestions_company_idx" ON "profile_suggestions" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "profile_suggestions_person_idx" ON "profile_suggestions" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "profile_suggestions_document_idx" ON "profile_suggestions" USING btree ("document_id");

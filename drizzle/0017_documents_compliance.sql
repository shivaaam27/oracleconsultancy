CREATE TABLE IF NOT EXISTS "documents" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"company_id" integer,
	"person_id" integer,
	"category" text,
	"doc_type" text,
	"issuer" text,
	"reference_no" text,
	"issue_date" timestamp with time zone,
	"expiry_date" timestamp with time zone,
	"reminder_lead_days" integer DEFAULT 30 NOT NULL,
	"file_url" text,
	"notes" text,
	"archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"created_by" text DEFAULT 'web-ui' NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "document_links" (
	"document_id" integer NOT NULL,
	"task_id" integer NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "document_links_document_id_task_id_pk" PRIMARY KEY("document_id","task_id")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "documents" ADD CONSTRAINT "documents_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "documents" ADD CONSTRAINT "documents_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "document_links" ADD CONSTRAINT "document_links_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "document_links" ADD CONSTRAINT "document_links_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "documents_expiry_idx" ON "documents" ("expiry_date");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "documents_company_idx" ON "documents" ("company_id");

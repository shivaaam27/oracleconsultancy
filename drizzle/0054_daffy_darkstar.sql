CREATE TABLE "brief_notes" (
	"id" serial PRIMARY KEY NOT NULL,
	"body" text NOT NULL,
	"company_id" integer,
	"note_date" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"created_by" text DEFAULT 'web-ui' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "brief_notes" ADD CONSTRAINT "brief_notes_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE set null ON UPDATE no action;
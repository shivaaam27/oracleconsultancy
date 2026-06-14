CREATE TABLE "beneficial_owners" (
	"id" serial PRIMARY KEY NOT NULL,
	"person_name" text NOT NULL,
	"interests" text,
	"flag" text,
	"complete" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cap_table" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"holder" text NOT NULL,
	"shares" integer,
	"pct" double precision,
	"holder_type" text,
	"note" text
);
--> statement-breakpoint
CREATE TABLE "decisions" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"title" text NOT NULL,
	"company_id" integer,
	"type" text,
	"raised_by" text,
	"due" timestamp with time zone,
	"status" text DEFAULT 'Pending' NOT NULL,
	"context" text,
	"decision" text,
	"decided_on" timestamp with time zone,
	CONSTRAINT "decisions_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "key_persons" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"director_of" integer,
	"secretary_of" integer,
	"shareholder_of" integer,
	"signatory_of" integer,
	"risk" text,
	"note" text
);
--> statement-breakpoint
CREATE TABLE "resolutions" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer,
	"date" timestamp with time zone,
	"type" text,
	"summary" text NOT NULL,
	"document_id" integer,
	"file" text
);
--> statement-breakpoint
CREATE TABLE "risks" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"category" text,
	"title" text NOT NULL,
	"description" text,
	"likelihood" integer,
	"impact" integer,
	"owner" text,
	"mitigation" text,
	"status" text DEFAULT 'Open' NOT NULL,
	"linked" text,
	"created_at" timestamp with time zone,
	CONSTRAINT "risks_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "signatories" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"name" text NOT NULL,
	"scope" text,
	"note" text
);
--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "authorised_shares" integer;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "issued_shares" integer;--> statement-breakpoint
ALTER TABLE "cap_table" ADD CONSTRAINT "cap_table_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decisions" ADD CONSTRAINT "decisions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resolutions" ADD CONSTRAINT "resolutions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resolutions" ADD CONSTRAINT "resolutions_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signatories" ADD CONSTRAINT "signatories_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cap_table_company_idx" ON "cap_table" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "resolutions_company_idx" ON "resolutions" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "signatories_company_idx" ON "signatories" USING btree ("company_id");
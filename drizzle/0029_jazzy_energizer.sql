CREATE TABLE "letters" (
	"id" serial PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"company_id" integer,
	"person_id" integer,
	"ref" text,
	"letter_date" timestamp with time zone,
	"addressee" text,
	"subject" text,
	"body" text DEFAULT '' NOT NULL,
	"letterhead_snapshot" text,
	"status" text DEFAULT 'Draft' NOT NULL,
	"issued_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"created_by" text DEFAULT 'web-ui' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "letters" ADD CONSTRAINT "letters_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "letters" ADD CONSTRAINT "letters_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;
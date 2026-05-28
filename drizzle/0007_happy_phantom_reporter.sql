CREATE TABLE "person_companies" (
	"person_id" integer NOT NULL,
	"company_id" integer NOT NULL,
	"relationship" text,
	CONSTRAINT "person_companies_person_id_company_id_pk" PRIMARY KEY("person_id","company_id")
);
--> statement-breakpoint
ALTER TABLE "people" ADD COLUMN "person_type" text DEFAULT 'internal' NOT NULL;--> statement-breakpoint
ALTER TABLE "people" ADD COLUMN "related_person_id" integer;--> statement-breakpoint
ALTER TABLE "person_companies" ADD CONSTRAINT "person_companies_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person_companies" ADD CONSTRAINT "person_companies_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
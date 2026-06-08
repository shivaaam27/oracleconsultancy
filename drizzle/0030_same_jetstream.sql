CREATE TABLE "reporting_lines" (
	"person_id" integer NOT NULL,
	"manager_id" integer NOT NULL,
	"note" text,
	CONSTRAINT "reporting_lines_person_id_manager_id_pk" PRIMARY KEY("person_id","manager_id")
);
--> statement-breakpoint
ALTER TABLE "reporting_lines" ADD CONSTRAINT "reporting_lines_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reporting_lines" ADD CONSTRAINT "reporting_lines_manager_id_people_id_fk" FOREIGN KEY ("manager_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;
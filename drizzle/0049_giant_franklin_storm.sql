CREATE TABLE "department_heads" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"department_id" integer NOT NULL,
	"head_person_id" integer,
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "department_heads" ADD CONSTRAINT "department_heads_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "department_heads" ADD CONSTRAINT "department_heads_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "department_heads" ADD CONSTRAINT "department_heads_head_person_id_people_id_fk" FOREIGN KEY ("head_person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "dept_head_company_dept" ON "department_heads" USING btree ("company_id","department_id");
ALTER TABLE "people" ALTER COLUMN "person_type" SET DEFAULT 'local_staff';--> statement-breakpoint
ALTER TABLE "people" ADD COLUMN "department_id" integer;--> statement-breakpoint
ALTER TABLE "people" ADD COLUMN "start_date" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "people" ADD CONSTRAINT "people_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
UPDATE "people" SET "person_type" = 'local_staff' WHERE "person_type" = 'internal' OR "person_type" IS NULL;--> statement-breakpoint
UPDATE "people" SET "person_type" = 'outsider' WHERE "person_type" = 'external';
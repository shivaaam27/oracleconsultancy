CREATE TABLE "cleaning_areas" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cleaning_checks" (
	"id" serial PRIMARY KEY NOT NULL,
	"day_id" integer NOT NULL,
	"area_id" integer NOT NULL,
	"done" boolean DEFAULT false NOT NULL,
	"done_at" timestamp with time zone,
	"comment" text
);
--> statement-breakpoint
CREATE TABLE "cleaning_days" (
	"id" serial PRIMARY KEY NOT NULL,
	"date" timestamp with time zone NOT NULL,
	"attendance_person_id" integer,
	"note" text,
	"signed_by_person_id" integer,
	"signed_by_name" text,
	"signed_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cleaning_checks" ADD CONSTRAINT "cleaning_checks_day_id_cleaning_days_id_fk" FOREIGN KEY ("day_id") REFERENCES "public"."cleaning_days"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cleaning_checks" ADD CONSTRAINT "cleaning_checks_area_id_cleaning_areas_id_fk" FOREIGN KEY ("area_id") REFERENCES "public"."cleaning_areas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cleaning_days" ADD CONSTRAINT "cleaning_days_attendance_person_id_people_id_fk" FOREIGN KEY ("attendance_person_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cleaning_days" ADD CONSTRAINT "cleaning_days_signed_by_person_id_people_id_fk" FOREIGN KEY ("signed_by_person_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "cleaning_checks_day_area_idx" ON "cleaning_checks" USING btree ("day_id","area_id");--> statement-breakpoint
CREATE UNIQUE INDEX "cleaning_days_date_idx" ON "cleaning_days" USING btree ("date");
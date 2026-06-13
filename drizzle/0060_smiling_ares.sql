CREATE TABLE "sites" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "sites_name_unique" UNIQUE("name")
);
--> statement-breakpoint
ALTER TABLE "people" ADD COLUMN "work_site_id" integer;--> statement-breakpoint
ALTER TABLE "people" ADD COLUMN "residence_site_id" integer;--> statement-breakpoint
ALTER TABLE "people" ADD CONSTRAINT "people_work_site_id_sites_id_fk" FOREIGN KEY ("work_site_id") REFERENCES "public"."sites"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "people" ADD CONSTRAINT "people_residence_site_id_sites_id_fk" FOREIGN KEY ("residence_site_id") REFERENCES "public"."sites"("id") ON DELETE no action ON UPDATE no action;
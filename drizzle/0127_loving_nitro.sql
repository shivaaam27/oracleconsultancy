CREATE TABLE "project_refs" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "currency" text DEFAULT 'TZS' NOT NULL;--> statement-breakpoint
ALTER TABLE "project_refs" ADD CONSTRAINT "project_refs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "project_refs_unique" ON "project_refs" USING btree ("project_id","kind","name");--> statement-breakpoint
CREATE INDEX "project_refs_lookup" ON "project_refs" USING btree ("project_id","kind","active");
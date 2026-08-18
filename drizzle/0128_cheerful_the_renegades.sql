CREATE TABLE "project_audit" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"entity" text NOT NULL,
	"entity_id" integer,
	"label" text,
	"action" text NOT NULL,
	"field" text,
	"old_value" text,
	"new_value" text,
	"created_by" text DEFAULT 'web-ui' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "project_audit" ADD CONSTRAINT "project_audit_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "project_audit_project_idx" ON "project_audit" USING btree ("project_id","created_at");--> statement-breakpoint
CREATE INDEX "project_audit_entity_idx" ON "project_audit" USING btree ("project_id","entity","entity_id");
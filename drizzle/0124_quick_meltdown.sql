CREATE TABLE "project_budget_lines" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"item_code" text NOT NULL,
	"category" text NOT NULL,
	"sub_job" text,
	"description" text,
	"amount" numeric(14, 2) DEFAULT '0' NOT NULL,
	"qty" numeric(14, 3),
	"unit" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"notes" text,
	"created_by" text DEFAULT 'web-ui' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "project_budget_lines" ADD CONSTRAINT "project_budget_lines_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "project_budget_item_unique" ON "project_budget_lines" USING btree ("project_id","item_code");--> statement-breakpoint
CREATE INDEX "project_budget_project_idx" ON "project_budget_lines" USING btree ("project_id","sort_order");--> statement-breakpoint
CREATE INDEX "project_budget_category_idx" ON "project_budget_lines" USING btree ("project_id","category");
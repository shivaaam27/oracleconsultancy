CREATE TABLE "project_requisitions" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"item_code" text NOT NULL,
	"batch_no" text,
	"requested_date" timestamp with time zone,
	"qty_requested" numeric(14, 3),
	"rate" numeric(14, 2),
	"amount_requested" numeric(14, 2) DEFAULT '0' NOT NULL,
	"route" text,
	"supplier" text,
	"reference_no" text,
	"remarks" text,
	"amount_approved" numeric(14, 2),
	"approved_at" timestamp with time zone,
	"approved_by" text,
	"received_date" timestamp with time zone,
	"grn_no" text,
	"qty_received" numeric(14, 3),
	"amount_received" numeric(14, 2),
	"received_by" text,
	"status" text DEFAULT 'Requested' NOT NULL,
	"created_by" text DEFAULT 'web-ui' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "project_requisitions" ADD CONSTRAINT "project_requisitions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_requisitions" ADD CONSTRAINT "project_requisitions_budget_line_fk" FOREIGN KEY ("project_id","item_code") REFERENCES "public"."project_budget_lines"("project_id","item_code") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "project_requisitions_project_idx" ON "project_requisitions" USING btree ("project_id","status");--> statement-breakpoint
CREATE INDEX "project_requisitions_item_idx" ON "project_requisitions" USING btree ("project_id","item_code");--> statement-breakpoint
CREATE INDEX "project_requisitions_batch_idx" ON "project_requisitions" USING btree ("project_id","batch_no");
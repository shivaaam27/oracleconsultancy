CREATE TABLE "project_expenditures" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"spent_date" timestamp with time zone,
	"item_code" text,
	"description" text,
	"payer" text DEFAULT 'SHAO' NOT NULL,
	"amount" numeric(14, 2) DEFAULT '0' NOT NULL,
	"source" text,
	"mobile_no" text,
	"batch_no" text,
	"notes" text,
	"created_by" text DEFAULT 'web-ui' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_payment_stages" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"label" text NOT NULL,
	"threshold_pct" numeric(6, 4),
	"share_pct" numeric(6, 4),
	"amount" numeric(14, 2),
	"invoice_date" timestamp with time zone,
	"invoice_amount" numeric(14, 2),
	"received_date" timestamp with time zone,
	"amount_received" numeric(14, 2),
	"sort_order" integer DEFAULT 0 NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_payments" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"route" text NOT NULL,
	"reference_no" text,
	"batch_no" text,
	"supplier" text,
	"paid_date" timestamp with time zone,
	"amount_paid" numeric(14, 2) DEFAULT '0' NOT NULL,
	"notes" text,
	"created_by" text DEFAULT 'web-ui' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_site_days" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"person_id" integer NOT NULL,
	"day" timestamp with time zone NOT NULL,
	"meal" boolean DEFAULT false NOT NULL,
	"labour_amount" numeric(14, 2),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_site_people" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"name" text NOT NULL,
	"designation" text,
	"kind" text DEFAULT 'CASUAL LABOUR' NOT NULL,
	"daily_rate" numeric(14, 2),
	"phone" text,
	"meals_eligible" boolean DEFAULT true NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "meal_rate" numeric(14, 2);--> statement-breakpoint
ALTER TABLE "project_expenditures" ADD CONSTRAINT "project_expenditures_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_expenditures" ADD CONSTRAINT "project_expenditures_budget_line_fk" FOREIGN KEY ("project_id","item_code") REFERENCES "public"."project_budget_lines"("project_id","item_code") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_payment_stages" ADD CONSTRAINT "project_payment_stages_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_payments" ADD CONSTRAINT "project_payments_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_site_days" ADD CONSTRAINT "project_site_days_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_site_days" ADD CONSTRAINT "project_site_days_person_id_project_site_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."project_site_people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_site_people" ADD CONSTRAINT "project_site_people_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "project_expenditures_project_idx" ON "project_expenditures" USING btree ("project_id","spent_date");--> statement-breakpoint
CREATE INDEX "project_expenditures_item_idx" ON "project_expenditures" USING btree ("project_id","item_code");--> statement-breakpoint
CREATE INDEX "project_payment_stages_idx" ON "project_payment_stages" USING btree ("project_id","sort_order");--> statement-breakpoint
CREATE INDEX "project_payments_project_idx" ON "project_payments" USING btree ("project_id","route");--> statement-breakpoint
CREATE INDEX "project_payments_ref_idx" ON "project_payments" USING btree ("project_id","reference_no");--> statement-breakpoint
CREATE INDEX "project_payments_batch_idx" ON "project_payments" USING btree ("project_id","batch_no");--> statement-breakpoint
CREATE UNIQUE INDEX "project_site_days_unique" ON "project_site_days" USING btree ("person_id","day");--> statement-breakpoint
CREATE INDEX "project_site_days_project_idx" ON "project_site_days" USING btree ("project_id","day");--> statement-breakpoint
CREATE INDEX "project_site_people_idx" ON "project_site_people" USING btree ("project_id","active");
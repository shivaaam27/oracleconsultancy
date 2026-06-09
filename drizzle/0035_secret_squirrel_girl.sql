CREATE TABLE "recurring_obligations" (
	"id" serial PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"company_id" integer,
	"frequency" text NOT NULL,
	"due_rule" text,
	"due_day" integer,
	"category" text DEFAULT 'Admin' NOT NULL,
	"why" text,
	"lead_days" integer DEFAULT 14 NOT NULL,
	"owner" text,
	"notes" text,
	"last_done" timestamp with time zone,
	"next_due" timestamp with time zone,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"created_by" text DEFAULT 'web-ui' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "recurring_obligations" ADD CONSTRAINT "recurring_obligations_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
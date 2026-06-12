CREATE TABLE "site_tools" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer,
	"name" text NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"specification" text,
	"location" text,
	"condition" text DEFAULT 'good' NOT NULL,
	"purchased_date" timestamp with time zone,
	"remark" text,
	"archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"created_by" text DEFAULT 'web-ui' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "brand" text;--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "model" text;--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "department" text;--> statement-breakpoint
ALTER TABLE "site_tools" ADD CONSTRAINT "site_tools_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE set null ON UPDATE no action;
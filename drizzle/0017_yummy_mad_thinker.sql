-- HRMS Stock Control module (Phase 1). Stock register + two movement ledgers.
-- NOTE: documents/document_links were applied manually (outside the journal),
-- so drizzle-kit re-emitted them here; trimmed to the new stock tables only.
CREATE TABLE "stock_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"category" text,
	"unit" text,
	"opening_stock" integer DEFAULT 0 NOT NULL,
	"reorder_level" integer DEFAULT 0 NOT NULL,
	"unit_cost" double precision DEFAULT 0 NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"created_by" text DEFAULT 'web-ui' NOT NULL,
	CONSTRAINT "stock_items_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "stock_purchases" (
	"id" serial PRIMARY KEY NOT NULL,
	"date" timestamp with time zone NOT NULL,
	"item_code" text NOT NULL,
	"qty" integer NOT NULL,
	"unit_cost" double precision DEFAULT 0 NOT NULL,
	"supplier" text,
	"ref" text,
	"created_at" timestamp with time zone NOT NULL,
	"created_by" text DEFAULT 'web-ui' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stock_issues" (
	"id" serial PRIMARY KEY NOT NULL,
	"date" timestamp with time zone NOT NULL,
	"item_code" text NOT NULL,
	"qty" integer NOT NULL,
	"issued_to" text,
	"company_id" integer,
	"notes" text,
	"created_at" timestamp with time zone NOT NULL,
	"created_by" text DEFAULT 'web-ui' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "stock_issues" ADD CONSTRAINT "stock_issues_item_code_stock_items_code_fk" FOREIGN KEY ("item_code") REFERENCES "public"."stock_items"("code") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_issues" ADD CONSTRAINT "stock_issues_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_purchases" ADD CONSTRAINT "stock_purchases_item_code_stock_items_code_fk" FOREIGN KEY ("item_code") REFERENCES "public"."stock_items"("code") ON DELETE cascade ON UPDATE no action;

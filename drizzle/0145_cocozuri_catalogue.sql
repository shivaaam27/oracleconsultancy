-- CocoZuri Operations, Phase 1: the catalogue and the customers.
--
-- Rebuilt from 18 spreadsheets — see memory/cocozuri_ops_plan.md for what was
-- measured in them and the arithmetic faults these tables exist to stop.
--
-- ⚠️ EVERYTHING IS DATA, NOT CODE. Categories, brands, units, VAT rates and
-- invoice series are all editable columns. Nothing here is a hard-coded list
-- that would need a developer to extend.

CREATE TABLE IF NOT EXISTS "cz_products" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"name" text NOT NULL,
	"category" text,
	"brand" text,
	"uom" text DEFAULT 'PCS' NOT NULL,
	"pack_size" numeric(12, 2),
	"pack_unit" text,
	"sku" text,
	"active" boolean DEFAULT true NOT NULL,
	"notes" text,
	"archived" boolean DEFAULT false NOT NULL,
	"created_by" text DEFAULT 'web-ui' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "cz_customers" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"name" text NOT NULL,
	"short_name" text,
	"tin" text,
	"vat_no" text,
	"po_box" text,
	"address" text,
	"city" text,
	"country" text DEFAULT 'Tanzania' NOT NULL,
	"currency" text DEFAULT 'TZS' NOT NULL,
	"payment_terms_days" integer DEFAULT 30 NOT NULL,
	-- ⚠️ A COLUMN, NOT A CONSTANT. The workbooks use 7 for most customers and 0
	-- for the CZ/AP series, and nobody has confirmed 7 is right at all when the
	-- Tanzanian standard rate is 18. Keeping it here means the answer is typed on
	-- a screen rather than shipped in a build. NULL falls back to the company
	-- default in Settings.
	"vat_rate" numeric(6, 3),
	"invoice_series" text,
	"notes" text,
	"archived" boolean DEFAULT false NOT NULL,
	"created_by" text DEFAULT 'web-ui' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "cz_branches" (
	"id" serial PRIMARY KEY NOT NULL,
	"customer_id" integer NOT NULL,
	"name" text NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
-- ⚠️ A PRICE IS A ROW WITH A DATE, never a column on the product. The price list
-- is already per-customer, and an invoice must keep the price it was raised at
-- after the list moves. `customer_id` NULL = the standard list price.
CREATE TABLE IF NOT EXISTS "cz_prices" (
	"id" serial PRIMARY KEY NOT NULL,
	"product_id" integer NOT NULL,
	"customer_id" integer,
	"price" numeric(14, 2) NOT NULL,
	"currency" text DEFAULT 'TZS' NOT NULL,
	"effective_from" timestamp with time zone DEFAULT now() NOT NULL,
	"note" text,
	"created_by" text DEFAULT 'web-ui' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "cz_products" ADD CONSTRAINT "cz_products_company_id_companies_id_fk"
		FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "cz_customers" ADD CONSTRAINT "cz_customers_company_id_companies_id_fk"
		FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "cz_branches" ADD CONSTRAINT "cz_branches_customer_id_cz_customers_id_fk"
		FOREIGN KEY ("customer_id") REFERENCES "public"."cz_customers"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "cz_prices" ADD CONSTRAINT "cz_prices_product_id_cz_products_id_fk"
		FOREIGN KEY ("product_id") REFERENCES "public"."cz_products"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "cz_prices" ADD CONSTRAINT "cz_prices_customer_id_cz_customers_id_fk"
		FOREIGN KEY ("customer_id") REFERENCES "public"."cz_customers"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cz_products_list_idx" ON "cz_products" ("company_id","archived","category");
--> statement-breakpoint
-- Stops the same item being typed twice. Everything JOINS by id — matching by
-- name is the spreadsheet fault that lost 200 units a month.
CREATE UNIQUE INDEX IF NOT EXISTS "cz_products_name_idx" ON "cz_products" ("company_id","name");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cz_customers_list_idx" ON "cz_customers" ("company_id","archived");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "cz_customers_name_idx" ON "cz_customers" ("company_id","name");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "cz_branches_name_idx" ON "cz_branches" ("customer_id","name");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cz_prices_lookup_idx" ON "cz_prices" ("product_id","customer_id","effective_from");
--> statement-breakpoint
-- ⚠️ A NEW TABLE DOES NOT INHERIT THE LOCK. Migration 0139 turned RLS on for
-- every table that existed THEN; one created afterwards starts with it off.
-- `npm run db:check-security` checks RLS as well as grants.
ALTER TABLE "cz_products" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "cz_customers" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "cz_branches" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "cz_prices" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON TABLE "cz_products", "cz_customers", "cz_branches", "cz_prices" FROM anon, authenticated;

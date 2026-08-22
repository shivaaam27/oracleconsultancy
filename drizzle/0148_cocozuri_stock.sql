-- CocoZuri, Phase 4: the daily stock book.
--
-- ⚠️ NO CLOSING BALANCE, NO MONTH TOTAL, NO VARIANCE — no column for any of
-- them, and none is to be added. The opening count and each day's movements are
-- the facts; the rest is worked out on read. The workbook stores all three and
-- gets all three wrong: its month totals are hand-typed `=D5+H5+L5+…` chains and
-- the three chains disagree (the shop's IN adds 29 day-columns, OUT 30, RETURN
-- only 26), so the last few days' returns fall out of the month.

-- Somewhere stock is counted: the shop, the kitchen, raw materials.
-- ⚠️ `third_label` is why this is a table rather than an enum. Each of the three
-- sheets heads its third movement column differently — RETURN, DA/SA/ TA,
-- DAMAGE. Nobody has said what DA/SA/TA stands for (plan §4.3), so it is
-- recorded under its own name rather than translated into a guess.
CREATE TABLE IF NOT EXISTS "cz_stock_locations" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"name" text NOT NULL,
	"third_label" text DEFAULT 'Return' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
-- A line on a location's stock sheet.
-- ⚠️ `product_id` IS THE FIX FOR FAULT #4. The workbook's sales sheet looks its
-- items up BY NAME, so anything spelled differently in the two sheets silently
-- scores zero — stock says 1,014 units left the shop in August, sales says 814.
-- Nullable because a stock item is a thing you COUNT and a product is a thing
-- you SELL: raw materials are 171 rows of coffee, dates and almond powder.
CREATE TABLE IF NOT EXISTS "cz_stock_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"location_id" integer NOT NULL,
	"product_id" integer,
	"name" text NOT NULL,
	"uom" text DEFAULT 'PCS' NOT NULL,
	"category" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
-- ⚠️ `on_date` is a `date`, NOT a timestamptz, and it is the one deliberate
-- exception to migration 0014's rule. A stock day is a calendar day — there is
-- no time of day on a stock sheet — and giving it one would put a movement on
-- the wrong side of midnight for a reader in another zone.
CREATE TABLE IF NOT EXISTS "cz_stock_days" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"item_id" integer NOT NULL,
	"on_date" date NOT NULL,
	"qty_in" numeric(14, 3) DEFAULT '0' NOT NULL,
	"qty_out" numeric(14, 3) DEFAULT '0' NOT NULL,
	-- Whatever this location calls its third column.
	"qty_third" numeric(14, 3) DEFAULT '0' NOT NULL,
	"note" text,
	"created_by" text DEFAULT 'web-ui' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
-- Somebody counted the shelf.
-- ⚠️ A COUNT IS THE POSITION AT THE END OF ITS DATE. An opening stock is a count
-- dated the day BEFORE the book starts, and movements on a count's own date are
-- already inside it and must never be added again.
-- ⚠️ A COUNT BOTH REVEALS A VARIANCE AND BECOMES THE NEW TRUTH. There is no
-- variance column: it is `counted − what the book said that day`, worked out on
-- read with this count taken out of the book first.
CREATE TABLE IF NOT EXISTS "cz_stock_counts" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"item_id" integer NOT NULL,
	"counted_on" date NOT NULL,
	"qty" numeric(14, 3) NOT NULL,
	"note" text,
	"created_by" text DEFAULT 'web-ui' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "cz_stock_locations" ADD CONSTRAINT "cz_stock_locations_company_id_companies_id_fk"
		FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "cz_stock_items" ADD CONSTRAINT "cz_stock_items_company_id_companies_id_fk"
		FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "cz_stock_items" ADD CONSTRAINT "cz_stock_items_location_id_cz_stock_locations_id_fk"
		FOREIGN KEY ("location_id") REFERENCES "public"."cz_stock_locations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
-- ⚠️ RESTRICT: deleting a product must never quietly empty a stock sheet.
DO $$ BEGIN
	ALTER TABLE "cz_stock_items" ADD CONSTRAINT "cz_stock_items_product_id_cz_products_id_fk"
		FOREIGN KEY ("product_id") REFERENCES "public"."cz_products"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "cz_stock_days" ADD CONSTRAINT "cz_stock_days_company_id_companies_id_fk"
		FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "cz_stock_days" ADD CONSTRAINT "cz_stock_days_item_id_cz_stock_items_id_fk"
		FOREIGN KEY ("item_id") REFERENCES "public"."cz_stock_items"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "cz_stock_counts" ADD CONSTRAINT "cz_stock_counts_company_id_companies_id_fk"
		FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "cz_stock_counts" ADD CONSTRAINT "cz_stock_counts_item_id_cz_stock_items_id_fk"
		FOREIGN KEY ("item_id") REFERENCES "public"."cz_stock_items"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "cz_stock_locations_name_idx" ON "cz_stock_locations" ("company_id","name");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cz_stock_items_list_idx" ON "cz_stock_items" ("location_id","archived","sort_order");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "cz_stock_items_name_idx" ON "cz_stock_items" ("location_id","name");
--> statement-breakpoint
-- ⚠️ ONE ROW PER ITEM PER DAY. Two rows for one day would be two answers to
-- "what moved on Tuesday", and the book would stop adding up.
CREATE UNIQUE INDEX IF NOT EXISTS "cz_stock_days_item_day_idx" ON "cz_stock_days" ("item_id","on_date");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cz_stock_days_day_idx" ON "cz_stock_days" ("company_id","on_date");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "cz_stock_counts_item_day_idx" ON "cz_stock_counts" ("item_id","counted_on");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cz_stock_counts_day_idx" ON "cz_stock_counts" ("company_id","counted_on");
--> statement-breakpoint
-- ⚠️ A new table does not inherit the lock from migration 0139.
ALTER TABLE "cz_stock_locations" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "cz_stock_items" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "cz_stock_days" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "cz_stock_counts" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON TABLE "cz_stock_locations", "cz_stock_items", "cz_stock_days", "cz_stock_counts" FROM anon, authenticated;

-- CocoZuri, manufacturing Stage 5b: the counter.
--
-- ⚠️ THE OWNER ANSWERED THE QUESTION THAT HELD THIS BACK (22 Aug 2026):
--
--   "traditionally it's either cash taken and kept in drawer and informed via
--    WhatsApp and there is some data sheets, some cash collected via online
--    modes. it's very traditional and this system will turn it into digital.
--    FOR NOW WE WON'T INTEGRATE A PAYMENT SYSTEM HERE, JUST REPORTS GET
--    DIGITAL. Kitchen also sells same as shop, mostly bulk order custom orders
--    and even single items... our main counters are kitchen but rarely we have
--    walk-in customers and shop counter."
--
-- ⚠️ SO THIS IS A RECORD OF A SALE, NOT A TILL. Nothing takes payment, nothing
-- talks to a card machine or to mobile money. How it was paid is written down as
-- a plain fact — because that is what the WhatsApp message says today — and the
-- point of the table is that the takings and what left the shelf become a report
-- instead of a chat thread and a paper sheet.
--
-- ⚠️ AND THE KITCHEN IS THE MAIN COUNTER, not the shop. Both sell; the kitchen
-- takes the bulk and custom orders and the shop takes the rare walk-in. That is
-- why the location is on the document and defaults to the kitchen.
--
-- ⚠️ RECORDED AFTER THE FACT IS NORMAL, not an exception. The person who sold it
-- and the person who writes it down are usually different people and it usually
-- happens later — so the date is typed, both names are kept, and nothing here
-- demands to be filled in the moment money changes hands. A form that did would
-- go the way the paper sheet went.

CREATE TABLE IF NOT EXISTS "cz_counter_sales" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	-- CS-2608-01 — allocated, never typed.
	"reference" text NOT NULL,
	-- Which counter it was sold from. ⚠️ It is also the shelf the stock comes
	-- off, so it can never be a guess.
	"location_id" integer NOT NULL,
	"on_date" date NOT NULL,
	-- ⚠️ A walk-in has no account, and must not need one. Named only when it is
	-- somebody the business already knows — a bulk or custom order usually is.
	"customer_id" integer,
	-- What they called themselves, when there is no account. A custom order for
	-- a wedding has a name and no customer record.
	"customer_name" text,
	-- cash | online | other
	-- ⚠️ RECORDED, NEVER INTEGRATED. "For now we won't integrate a payment
	-- system here" — this says how the money came in so the day's takings can be
	-- split, and claims nothing more.
	"paid_by" text DEFAULT 'cash' NOT NULL,
	-- An M-Pesa or transfer reference, when there is one.
	"payment_ref" text,
	-- ⚠️ FROZEN, like an invoice's. What was charged on the day is what was
	-- charged, whatever the rate becomes later.
	"vat_rate" numeric(6, 3) DEFAULT '0' NOT NULL,
	-- Who served it, and who wrote it down. Usually not the same person, because
	-- today it arrives by WhatsApp.
	"sold_by" text,
	"recorded_by" text,
	-- recorded | cancelled
	"status" text DEFAULT 'recorded' NOT NULL,
	"notes" text,
	"created_by" text DEFAULT 'web-ui' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "cz_counter_sale_lines" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"sale_id" integer NOT NULL,
	"line_no" integer DEFAULT 1 NOT NULL,
	-- The row on THAT counter's own stock sheet. ⚠️ An item belongs to one
	-- location, so this is what takes the chocolate off the right shelf.
	"item_id" integer NOT NULL,
	-- ⚠️ Stage 9 — which lot went out the door. Suggested first-expired-first-out
	-- and kept, because a bar sold over the counter is still a bar somebody may
	-- ring up about.
	"batch_id" integer,
	-- Frozen the day it was sold, like an invoice line's.
	"description" text NOT NULL,
	"qty" numeric(14, 3) NOT NULL,
	"unit_price" numeric(14, 4) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "cz_counter_sales" ADD CONSTRAINT "cz_counter_sales_company_id_companies_id_fk"
		FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "cz_counter_sales" ADD CONSTRAINT "cz_counter_sales_location_id_cz_stock_locations_id_fk"
		FOREIGN KEY ("location_id") REFERENCES "public"."cz_stock_locations"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "cz_counter_sales" ADD CONSTRAINT "cz_counter_sales_customer_id_cz_customers_id_fk"
		FOREIGN KEY ("customer_id") REFERENCES "public"."cz_customers"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "cz_counter_sale_lines" ADD CONSTRAINT "cz_counter_sale_lines_company_id_companies_id_fk"
		FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "cz_counter_sale_lines" ADD CONSTRAINT "cz_counter_sale_lines_sale_id_cz_counter_sales_id_fk"
		FOREIGN KEY ("sale_id") REFERENCES "public"."cz_counter_sales"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "cz_counter_sale_lines" ADD CONSTRAINT "cz_counter_sale_lines_item_id_cz_stock_items_id_fk"
		FOREIGN KEY ("item_id") REFERENCES "public"."cz_stock_items"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
-- SET NULL: removing a lot must never take the record of a sale with it.
DO $$ BEGIN
	ALTER TABLE "cz_counter_sale_lines" ADD CONSTRAINT "cz_counter_sale_lines_batch_id_cz_batches_id_fk"
		FOREIGN KEY ("batch_id") REFERENCES "public"."cz_batches"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "cz_counter_sales_reference_idx" ON "cz_counter_sales" ("company_id","reference");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cz_counter_sales_list_idx" ON "cz_counter_sales" ("company_id","on_date","location_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cz_counter_sale_lines_sale_idx" ON "cz_counter_sale_lines" ("sale_id","line_no");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cz_counter_sale_lines_item_idx" ON "cz_counter_sale_lines" ("item_id");
--> statement-breakpoint
-- ⚠️ A new table does not inherit the lock from migration 0139.
ALTER TABLE "cz_counter_sales" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "cz_counter_sale_lines" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON TABLE "cz_counter_sales", "cz_counter_sale_lines" FROM anon, authenticated;

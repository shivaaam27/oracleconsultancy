-- CocoZuri, manufacturing Stage 1: the stock ledger.
--
-- ⚠️ `cz_stock_days` RECORDS HOW MUCH MOVED. IT CANNOT TRACE A BATCH. It never
-- says why, from where, on whose document, or out of which batch — so it can
-- answer "twelve went out" but not "were they sold, sent to the shop, or
-- dropped on the floor", and never "which customer got batch 42".
--
-- So stock gets the shape money already has: ONE ledger, MANY doors.
--   gl_entries      ← postVoucher()    ← invoices, receipts, journals
--   cz_stock_moves  ← postStockMove()  ← day sheets, purchases, batches…
--
-- ⚠️ NOTHING IS DROPPED AND NOTHING IS MIGRATED DESTRUCTIVELY. `cz_stock_days`
-- stays as the DOCUMENT — the sheet as somebody typed it — and `cz_stock_moves`
-- is what that sheet did to stock. That is how the reference system splits a
-- Stock Entry from a Stock Ledger Entry.

-- A production batch. ⚠️ A batch number is the only thing that can answer "one
-- bag of almond powder was bad — which bars used it, and who bought them",
-- forwards and backwards. Created here so the ledger can reference it from the
-- start; Stage 4 gives it a screen.
CREATE TABLE IF NOT EXISTS "cz_batches" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"item_id" integer,
	"batch_no" text NOT NULL,
	"made_on" date,
	-- The earlier of "made on + shelf life" and the earliest-expiring ingredient
	-- that went in. Stage 9 works it out; the column exists from the start so a
	-- batch never has to be rewritten to gain one.
	"expires_on" date,
	"status" text DEFAULT 'planned' NOT NULL,
	-- What the PLAN said. The actual is derived from the `produce` moves —
	-- there is no produced-quantity column and there must not be one.
	"planned_qty" numeric(14, 3),
	"notes" text,
	"created_by" text DEFAULT 'web-ui' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
-- Every movement of stock, ever.
-- ⚠️ `qty` IS SIGNED — positive into the location, negative out of it. A
-- transfer is TWO rows sharing one voucher, exactly as a journal is two lines.
-- ⚠️ NO BALANCE COLUMN, EVER. What is on the shelf is the latest count plus the
-- moves since, worked out on read.
CREATE TABLE IF NOT EXISTS "cz_stock_moves" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"item_id" integer NOT NULL,
	"location_id" integer NOT NULL,
	"batch_id" integer,
	-- ⚠️ `date`, not timestamptz — a stock day is a calendar day. The same
	-- deliberate exception to migration 0014 that cz_stock_days takes.
	"on_date" date NOT NULL,
	"qty" numeric(14, 3) NOT NULL,
	-- ⚠️ day_in / day_out / day_third mean ONLY "written in that column of the
	-- day sheet". On the shop's sheet IN is stock arriving from the kitchen; on
	-- raw materials it is a delivery from a supplier. Nobody has said which, so
	-- the reason records what is KNOWN and claims nothing more.
	"reason" text NOT NULL,
	"unit_cost" numeric(14, 4),
	"voucher_type" text,
	"voucher_id" integer,
	"note" text,
	"created_by" text DEFAULT 'web-ui' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "cz_batches" ADD CONSTRAINT "cz_batches_company_id_companies_id_fk"
		FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "cz_batches" ADD CONSTRAINT "cz_batches_item_id_cz_stock_items_id_fk"
		FOREIGN KEY ("item_id") REFERENCES "public"."cz_stock_items"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "cz_stock_moves" ADD CONSTRAINT "cz_stock_moves_company_id_companies_id_fk"
		FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
-- RESTRICT: an item with movement history cannot be quietly removed.
DO $$ BEGIN
	ALTER TABLE "cz_stock_moves" ADD CONSTRAINT "cz_stock_moves_item_id_cz_stock_items_id_fk"
		FOREIGN KEY ("item_id") REFERENCES "public"."cz_stock_items"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "cz_stock_moves" ADD CONSTRAINT "cz_stock_moves_location_id_cz_stock_locations_id_fk"
		FOREIGN KEY ("location_id") REFERENCES "public"."cz_stock_locations"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
-- SET NULL: removing a batch must never take its movements with it.
DO $$ BEGIN
	ALTER TABLE "cz_stock_moves" ADD CONSTRAINT "cz_stock_moves_batch_id_cz_batches_id_fk"
		FOREIGN KEY ("batch_id") REFERENCES "public"."cz_batches"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "cz_batches_no_idx" ON "cz_batches" ("company_id","batch_no");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cz_batches_list_idx" ON "cz_batches" ("company_id","status","made_on");
--> statement-breakpoint
-- The read every balance depends on: this item, this place, in date order.
CREATE INDEX IF NOT EXISTS "cz_stock_moves_ledger_idx" ON "cz_stock_moves" ("item_id","location_id","on_date");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cz_stock_moves_day_idx" ON "cz_stock_moves" ("company_id","on_date");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cz_stock_moves_voucher_idx" ON "cz_stock_moves" ("voucher_type","voucher_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cz_stock_moves_batch_idx" ON "cz_stock_moves" ("batch_id");
--> statement-breakpoint
-- ⚠️ A new table does not inherit the lock from migration 0139.
ALTER TABLE "cz_batches" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "cz_stock_moves" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON TABLE "cz_batches", "cz_stock_moves" FROM anon, authenticated;

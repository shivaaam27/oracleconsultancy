-- CocoZuri, manufacturing Stage 5: kitchen → shop.
--
-- ⚠️ THE OWNER ANSWERED THE QUESTION THAT BLOCKED THIS (22 Aug 2026): the
-- shop's AMBER RABDI and the kitchen's ARE THE SAME CHOCOLATE. "The system was
-- still a bit messy, that's why we are building a proper ERP for it so we can
-- trace everything."
--
-- ⚠️ SO A TRANSFER MOVES BETWEEN TWO **ITEM ROWS**, NOT ONE ITEM BETWEEN TWO
-- PLACES. `cz_stock_items` belongs to exactly one location, so the same
-- chocolate is a different row on each sheet — and the two are joined by
-- `product_id`, never by name. That is fault #4 again: the workbook matches its
-- sheets by name and loses 200 units a month to it. Measured on the live data:
-- 64 products already exist in more than one place, all linked by id.
--
-- ⚠️ A TRANSFER HAS **TWO MOMENTS**, and that is the whole point of the
-- document. The kitchen sends 20; the shop counts 18. Recording only one figure
-- is what makes the shop's opening stock a mystery today. Sending takes the
-- stock off the kitchen's shelf; receiving puts what ACTUALLY ARRIVED on the
-- shop's. The difference is a real loss, it happened in transit, and it has to
-- be explained.

CREATE TABLE IF NOT EXISTS "cz_transfers" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"reference" text NOT NULL,
	"on_date" date NOT NULL,
	"from_location_id" integer NOT NULL,
	"to_location_id" integer NOT NULL,
	-- sent | received | cancelled
	-- ⚠️ There is no "draft". Stock leaves the kitchen the moment somebody says
	-- it did, because by then it HAS left — a transfer sitting in a drawer while
	-- the chocolate is already in a crate is the mystery this replaces.
	"status" text DEFAULT 'sent' NOT NULL,
	"sent_by" text,
	"received_by" text,
	"received_on" date,
	"received_at" timestamp with time zone,
	"notes" text,
	"created_by" text DEFAULT 'web-ui' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "cz_transfer_lines" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"transfer_id" integer NOT NULL,
	"line_no" integer DEFAULT 1 NOT NULL,
	-- ⚠️ TWO ITEM ROWS: the row on the sending sheet and the row on the
	-- receiving one. Resolved through `product_id`, never by name.
	"from_item_id" integer NOT NULL,
	"to_item_id" integer NOT NULL,
	-- ⚠️ THE BATCH TRAVELS WITH THE CHOCOLATE. Without this, a bar reaching the
	-- shop loses the thread back to the morning it was made — which is the one
	-- thing the whole manufacturing programme exists to keep.
	"batch_id" integer,
	"sent_qty" numeric(14, 3) NOT NULL,
	-- Null until somebody at the other end counts it.
	"received_qty" numeric(14, 3),
	-- ⚠️ Required when less arrived than was sent. A shortfall nobody explains
	-- is the workbook's VARIANCE column all over again.
	"short_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "cz_transfers" ADD CONSTRAINT "cz_transfers_company_id_companies_id_fk"
		FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "cz_transfers" ADD CONSTRAINT "cz_transfers_from_location_id_cz_stock_locations_id_fk"
		FOREIGN KEY ("from_location_id") REFERENCES "public"."cz_stock_locations"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "cz_transfers" ADD CONSTRAINT "cz_transfers_to_location_id_cz_stock_locations_id_fk"
		FOREIGN KEY ("to_location_id") REFERENCES "public"."cz_stock_locations"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "cz_transfer_lines" ADD CONSTRAINT "cz_transfer_lines_company_id_companies_id_fk"
		FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "cz_transfer_lines" ADD CONSTRAINT "cz_transfer_lines_transfer_id_cz_transfers_id_fk"
		FOREIGN KEY ("transfer_id") REFERENCES "public"."cz_transfers"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "cz_transfer_lines" ADD CONSTRAINT "cz_transfer_lines_from_item_id_cz_stock_items_id_fk"
		FOREIGN KEY ("from_item_id") REFERENCES "public"."cz_stock_items"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "cz_transfer_lines" ADD CONSTRAINT "cz_transfer_lines_to_item_id_cz_stock_items_id_fk"
		FOREIGN KEY ("to_item_id") REFERENCES "public"."cz_stock_items"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
-- SET NULL: removing a batch must never take a transfer's history with it.
DO $$ BEGIN
	ALTER TABLE "cz_transfer_lines" ADD CONSTRAINT "cz_transfer_lines_batch_id_cz_batches_id_fk"
		FOREIGN KEY ("batch_id") REFERENCES "public"."cz_batches"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "cz_transfers_reference_idx" ON "cz_transfers" ("company_id","reference");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cz_transfers_list_idx" ON "cz_transfers" ("company_id","status","on_date");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cz_transfer_lines_transfer_idx" ON "cz_transfer_lines" ("transfer_id","line_no");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cz_transfer_lines_item_idx" ON "cz_transfer_lines" ("from_item_id","to_item_id");
--> statement-breakpoint
-- ⚠️ A new table does not inherit the lock from migration 0139.
ALTER TABLE "cz_transfers" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "cz_transfer_lines" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON TABLE "cz_transfers", "cz_transfer_lines" FROM anon, authenticated;

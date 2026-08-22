-- CocoZuri, manufacturing Stage 6: returns, repairs and damage.
--
-- From the notes, page 4: "Return / Damaged → Stock In", then "repaired ———
-- voucher goods returned — or damaged", with "(repairing)" circled; and page 2:
-- "Fully damaged — throw", "① Sales return (minus value)", "② Cost value — from
-- debtor account", "Abnormal loss — split: production | raw materials".
--
-- ⚠️ ONE DOCUMENT, TWO DOORS. Goods coming back from a customer and goods found
-- damaged on our own shelf end in the same place — somebody deciding what is
-- still fit to sell and what goes in the bin — so they are one record with a
-- `kind`. The only difference is whether the stock has to come IN first: a
-- customer's return does, because it left when it was sold; our own breakage
-- never went anywhere.
--
-- ⚠️ "REPAIRING" IS THE GAP BETWEEN TWO MOMENTS, exactly as "in transit" is on a
-- transfer. What came back is `qty`; what has been decided is `good_qty` +
-- `scrap_qty`; the remainder is still on the bench being looked at. That is why
-- these are nullable and cumulative rather than one verdict column — five bars
-- can be repacked today and five thrown next week, and the document has to be
-- able to say so.
--
-- ⚠️ NO VALUE COLUMN, ANYWHERE. What a scrapped bar cost is worked out on read
-- from `cz_stock_moves.unit_cost` — the landed figure Stage 2 wrote and the
-- batch cost Stage 4 wrote — the same rule as every other table in this module.

CREATE TABLE IF NOT EXISTS "cz_returns" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	-- RTN-2608-01 — allocated, never typed, like a batch or a transfer.
	"reference" text NOT NULL,
	-- customer | internal
	-- ⚠️ `customer` = goods came back from outside and must come IN.
	--    `internal` = breakage found on our own shelf; it is already here.
	"kind" text DEFAULT 'customer' NOT NULL,
	"on_date" date NOT NULL,
	-- Which shelf they came back to, or were found on.
	"location_id" integer NOT NULL,
	-- Null on an internal damage record.
	"customer_id" integer,
	-- Which invoice they came back against, when anybody knows. ⚠️ This is what
	-- lets a credit note be priced at what was ACTUALLY charged rather than at
	-- today list price — the same freezing rule the invoice itself obeys.
	"invoice_id" integer,
	-- The credit note that answered it, once one is raised. ⚠️ THE MONEY HALF IS
	-- NOT REBUILT HERE: a credit note already exists, already posts and already
	-- ages against the invoice. This column is the join, not a second document.
	"credit_note_id" integer,
	-- open | settled | cancelled
	"status" text DEFAULT 'open' NOT NULL,
	-- ⚠️ Where the loss belongs — note #12, "abnormal loss: production | raw
	-- materials". Those two are the owner own words and are listed first; the
	-- rest are proposed, because a bar crushed in a crate is neither of them.
	-- Required once anything is scrapped, and the note with it: naming the kind
	-- is not enough, it has to say why.
	"loss_kind" text,
	"loss_note" text,
	"received_by" text,
	"settled_on" date,
	"notes" text,
	"created_by" text DEFAULT 'web-ui' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "cz_return_lines" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"return_id" integer NOT NULL,
	"line_no" integer DEFAULT 1 NOT NULL,
	"item_id" integer NOT NULL,
	-- ⚠️ THE BATCH COMES BACK WITH THE CHOCOLATE. A crate returned from one
	-- supermarket is the first place a bad batch shows itself, and without this
	-- the thread back to the morning it was made is cut.
	"batch_id" integer,
	-- What came back, or what was found damaged.
	"qty" numeric(14, 3) NOT NULL,
	-- ⚠️ NULL, NOT ZERO, until somebody has looked at it. "Nobody has decided"
	-- and "none of it was any good" are different claims, and only one of them
	-- means there is still work to do.
	"good_qty" numeric(14, 3),
	"scrap_qty" numeric(14, 3),
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "cz_returns" ADD CONSTRAINT "cz_returns_company_id_companies_id_fk"
		FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "cz_returns" ADD CONSTRAINT "cz_returns_location_id_cz_stock_locations_id_fk"
		FOREIGN KEY ("location_id") REFERENCES "public"."cz_stock_locations"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "cz_returns" ADD CONSTRAINT "cz_returns_customer_id_cz_customers_id_fk"
		FOREIGN KEY ("customer_id") REFERENCES "public"."cz_customers"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "cz_returns" ADD CONSTRAINT "cz_returns_invoice_id_cz_invoices_id_fk"
		FOREIGN KEY ("invoice_id") REFERENCES "public"."cz_invoices"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
-- SET NULL: the credit note is an ANSWER to this document, not its reason for
-- existing. Losing it must never take the record of what came back with it.
DO $$ BEGIN
	ALTER TABLE "cz_returns" ADD CONSTRAINT "cz_returns_credit_note_id_cz_invoices_id_fk"
		FOREIGN KEY ("credit_note_id") REFERENCES "public"."cz_invoices"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "cz_return_lines" ADD CONSTRAINT "cz_return_lines_company_id_companies_id_fk"
		FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "cz_return_lines" ADD CONSTRAINT "cz_return_lines_return_id_cz_returns_id_fk"
		FOREIGN KEY ("return_id") REFERENCES "public"."cz_returns"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "cz_return_lines" ADD CONSTRAINT "cz_return_lines_item_id_cz_stock_items_id_fk"
		FOREIGN KEY ("item_id") REFERENCES "public"."cz_stock_items"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
-- SET NULL: removing a batch must never take a return history with it.
DO $$ BEGIN
	ALTER TABLE "cz_return_lines" ADD CONSTRAINT "cz_return_lines_batch_id_cz_batches_id_fk"
		FOREIGN KEY ("batch_id") REFERENCES "public"."cz_batches"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "cz_returns_reference_idx" ON "cz_returns" ("company_id","reference");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cz_returns_list_idx" ON "cz_returns" ("company_id","status","on_date");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cz_returns_customer_idx" ON "cz_returns" ("customer_id","on_date");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cz_return_lines_return_idx" ON "cz_return_lines" ("return_id","line_no");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cz_return_lines_item_idx" ON "cz_return_lines" ("item_id");
--> statement-breakpoint
-- ⚠️ A new table does not inherit the lock from migration 0139.
ALTER TABLE "cz_returns" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "cz_return_lines" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON TABLE "cz_returns", "cz_return_lines" FROM anon, authenticated;

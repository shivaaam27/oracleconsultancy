-- CocoZuri, manufacturing Stage 2: what was bought, and the budget it was
-- bought against.
--
-- ⚠️ THE OWNER'S TWO INSTRUCTIONS SHAPE THIS WHOLE MIGRATION (plan §5a).
--
--   1. "Someone approves a BUDGET" — not just a purchase. So there are two
--      ideas here, not one: a budget somebody sets and somebody approves, and
--      a purchase checked against it. The approval is a NAMED STEP with a
--      person and a moment, never a boolean — "approved" with nobody's name on
--      it answers no question worth asking.
--
--   2. "Raw materials come from suppliers but also at random or self-bought —
--      keep it flexible." So `vendor_id` IS NULLABLE AND MUST STAY NULLABLE.
--      Somebody buying a kilo of flour from the market with their own money is
--      a real and normal event at this size of business, and a form demanding a
--      supplier, an invoice number and a tax record for it simply will not be
--      filled in — the purchase then never reaches the books at all, which is
--      worse than a purchase with a blank supplier.

-- ─────────────────────────────────────────────────────────────── budgets ──
-- ⚠️ NO `spent` COLUMN, AND THERE MUST NEVER BE ONE. What has been spent is the
-- approved purchases in the period, added up on read — the same rule as every
-- other figure in CocoZuri and in the general ledger.
CREATE TABLE IF NOT EXISTS "cz_budgets" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"title" text NOT NULL,
	-- Null = every place. A budget for the raw-materials store is the common
	-- case, and location is real data rather than a new taxonomy invented here.
	"location_id" integer,
	"starts_on" date NOT NULL,
	"ends_on" date NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	-- draft | submitted | approved | rejected | closed
	"status" text DEFAULT 'draft' NOT NULL,
	"submitted_by" text,
	"submitted_at" timestamp with time zone,
	-- ⚠️ A PERSON AND A MOMENT. The id can go null if somebody leaves; the name
	-- is kept as it stood on the day, because the approval happened whether or
	-- not that person is still on the payroll.
	"decided_by_person_id" integer,
	"decided_by" text,
	"decided_at" timestamp with time zone,
	"decision_note" text,
	"notes" text,
	"created_by" text DEFAULT 'web-ui' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
-- ───────────────────────────────────────────────────────────── purchases ──
-- One document: what was bought, from whom (or from nobody), who paid, and what
-- the freight was. ⚠️ APPROVAL IS WHAT MAKES IT COUNT — a draft moves no stock
-- and reaches no books.
CREATE TABLE IF NOT EXISTS "cz_purchases" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"reference" text NOT NULL,
	"purchased_on" date NOT NULL,
	-- Where the goods landed. The stock ledger needs a place for every movement.
	"location_id" integer NOT NULL,
	-- ⚠️ NULLABLE ON PURPOSE, AND IT MUST STAY THAT WAY. See the header.
	"vendor_id" integer,
	-- The market stall, the shop down the road, the person who was passing.
	"supplier_name" text,
	"supplier_ref" text,
	"budget_id" integer,
	-- credit | cash | bank | own_money. ⚠️ `own_money` is the self-bought case
	-- and it means SOMEBODY IS OWED THE MONEY BACK — it credits creditors with
	-- that person as the party, not the bank.
	"paid_from" text DEFAULT 'credit' NOT NULL,
	"paid_by_person_id" integer,
	"paid_by" text,
	"currency" text DEFAULT 'TZS' NOT NULL,
	"ex_rate" numeric(14, 6),
	"vat_rate" numeric(6, 3) DEFAULT '0' NOT NULL,
	-- ⚠️ THREE-STATE: true / false / NULL = nobody has said. The same trap the
	-- ops invoice carries. A rated purchase with this unset is reported UNKNOWN
	-- and refused at the books, never quietly treated as one or the other.
	"tax_inclusive" boolean,
	-- The transit cost. Spread over the lines BY VALUE on read, so a bag of
	-- almonds carries its own freight. ⚠️ No per-line landed-cost column.
	"freight_amount" numeric(14, 2) DEFAULT '0' NOT NULL,
	"freight_note" text,
	-- draft | approved | cancelled
	"status" text DEFAULT 'draft' NOT NULL,
	"approved_by_person_id" integer,
	"approved_by" text,
	"approved_at" timestamp with time zone,
	"approval_note" text,
	"cancelled_at" timestamp with time zone,
	"cancel_reason" text,
	"notes" text,
	"created_by" text DEFAULT 'web-ui' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
-- ⚠️ NO TOTAL COLUMN on the line and none on the purchase. Every figure —
-- goods, VAT, freight share, landed unit cost, what is payable — is worked out
-- on read by `purchaseTotals()` / `landedLines()`.
CREATE TABLE IF NOT EXISTS "cz_purchase_lines" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"purchase_id" integer NOT NULL,
	"line_no" integer DEFAULT 1 NOT NULL,
	"item_id" integer NOT NULL,
	-- Frozen wording, like an invoice line. A purchase prints what was true the
	-- day it was made, whatever the item is renamed to afterwards.
	"description" text NOT NULL,
	"qty" numeric(14, 3) NOT NULL,
	-- ⚠️ "flour 1kg" — the unit is part of the price. Note #46 in the plan.
	"uom" text DEFAULT 'PCS' NOT NULL,
	"unit_price" numeric(14, 4) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "cz_budgets" ADD CONSTRAINT "cz_budgets_company_id_companies_id_fk"
		FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "cz_budgets" ADD CONSTRAINT "cz_budgets_location_id_cz_stock_locations_id_fk"
		FOREIGN KEY ("location_id") REFERENCES "public"."cz_stock_locations"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
-- SET NULL: a person leaving must never take the record of their decision with
-- them. `decided_by` keeps the name as it stood.
DO $$ BEGIN
	ALTER TABLE "cz_budgets" ADD CONSTRAINT "cz_budgets_decided_by_person_id_people_id_fk"
		FOREIGN KEY ("decided_by_person_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "cz_purchases" ADD CONSTRAINT "cz_purchases_company_id_companies_id_fk"
		FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "cz_purchases" ADD CONSTRAINT "cz_purchases_location_id_cz_stock_locations_id_fk"
		FOREIGN KEY ("location_id") REFERENCES "public"."cz_stock_locations"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "cz_purchases" ADD CONSTRAINT "cz_purchases_vendor_id_vendors_id_fk"
		FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "cz_purchases" ADD CONSTRAINT "cz_purchases_budget_id_cz_budgets_id_fk"
		FOREIGN KEY ("budget_id") REFERENCES "public"."cz_budgets"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "cz_purchases" ADD CONSTRAINT "cz_purchases_paid_by_person_id_people_id_fk"
		FOREIGN KEY ("paid_by_person_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "cz_purchases" ADD CONSTRAINT "cz_purchases_approved_by_person_id_people_id_fk"
		FOREIGN KEY ("approved_by_person_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "cz_purchase_lines" ADD CONSTRAINT "cz_purchase_lines_company_id_companies_id_fk"
		FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "cz_purchase_lines" ADD CONSTRAINT "cz_purchase_lines_purchase_id_cz_purchases_id_fk"
		FOREIGN KEY ("purchase_id") REFERENCES "public"."cz_purchases"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
-- RESTRICT: an item that has been bought cannot be quietly removed.
DO $$ BEGIN
	ALTER TABLE "cz_purchase_lines" ADD CONSTRAINT "cz_purchase_lines_item_id_cz_stock_items_id_fk"
		FOREIGN KEY ("item_id") REFERENCES "public"."cz_stock_items"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "cz_purchases_reference_idx" ON "cz_purchases" ("company_id","reference");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cz_purchases_list_idx" ON "cz_purchases" ("company_id","status","purchased_on");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cz_purchases_budget_idx" ON "cz_purchases" ("budget_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cz_purchase_lines_purchase_idx" ON "cz_purchase_lines" ("purchase_id","line_no");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cz_purchase_lines_item_idx" ON "cz_purchase_lines" ("item_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cz_budgets_list_idx" ON "cz_budgets" ("company_id","status","starts_on");
--> statement-breakpoint
-- ⚠️ A new table does not inherit the lock from migration 0139.
ALTER TABLE "cz_budgets" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "cz_purchases" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "cz_purchase_lines" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON TABLE "cz_budgets", "cz_purchases", "cz_purchase_lines" FROM anon, authenticated;

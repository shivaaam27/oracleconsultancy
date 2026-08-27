-- CocoZuri Stage C — what to MAKE today.
--
-- ⚠️ THE OWNER SETTLED WHAT THE ORDER FORM IS (27 Aug 2026): "order form is for
-- what to make today". It had been built as a buying screen that worked
-- everything out afresh every time it was opened and saved nothing — so there
-- was no record of what was planned on Tuesday, and no way to raise a second one
-- for the special order that comes in at eleven.
--
-- ⚠️ A PLAN IS A PLAN. It moves no stock, consumes nothing and creates nothing
-- until somebody starts a batch from a line. That is the same property that
-- makes opening a batch free, and for the same reason: a document that costs
-- something to raise is a document people keep on paper instead.
--
-- ⚠️ AND A LINE REMEMBERS WHICH BATCH IT BECAME, which is what lets the plan
-- show progress — planned 200, batch running, 195 actually made — without
-- storing any of those figures. They are all derived from the batch.

CREATE TABLE IF NOT EXISTS "cz_production_plans" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"reference" text NOT NULL,
	-- ⚠️ A `date`, not a timestamp — the one deliberate exception to migration
	-- 0014, as everywhere else in this module. A plan is for a calendar day.
	"on_date" date NOT NULL,
	"location_id" integer NOT NULL,
	-- draft | issued | cancelled. "Done" is DERIVED from the lines' batches.
	"status" text DEFAULT 'draft' NOT NULL,
	"notes" text,
	"created_by" text DEFAULT 'web-ui' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "cz_production_plan_lines" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"plan_id" integer NOT NULL,
	"line_no" integer DEFAULT 1 NOT NULL,
	-- What is to be made.
	"item_id" integer NOT NULL,
	-- Optional: a batch may be opened without one (plan §5a).
	"recipe_id" integer,
	"qty" numeric(14, 3) NOT NULL,
	-- ⚠️ Which batch this line became. NULL = not started yet. ON DELETE SET NULL
	-- so abandoning a batch leaves the line standing, ready to be started again.
	"batch_id" integer,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

DO $$ BEGIN
	ALTER TABLE "cz_production_plans" ADD CONSTRAINT "cz_production_plans_company_id_companies_id_fk"
		FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
	ALTER TABLE "cz_production_plans" ADD CONSTRAINT "cz_production_plans_location_id_cz_stock_locations_id_fk"
		FOREIGN KEY ("location_id") REFERENCES "public"."cz_stock_locations"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
	ALTER TABLE "cz_production_plan_lines" ADD CONSTRAINT "cz_production_plan_lines_company_id_companies_id_fk"
		FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
	ALTER TABLE "cz_production_plan_lines" ADD CONSTRAINT "cz_production_plan_lines_plan_id_fk"
		FOREIGN KEY ("plan_id") REFERENCES "public"."cz_production_plans"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
	ALTER TABLE "cz_production_plan_lines" ADD CONSTRAINT "cz_production_plan_lines_item_id_fk"
		FOREIGN KEY ("item_id") REFERENCES "public"."cz_stock_items"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
	ALTER TABLE "cz_production_plan_lines" ADD CONSTRAINT "cz_production_plan_lines_recipe_id_fk"
		FOREIGN KEY ("recipe_id") REFERENCES "public"."cz_recipes"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ⚠️ SET NULL, not cascade. Abandoning a batch must leave the plan line
-- standing — the day's plan still says the chocolate was meant to be made.
DO $$ BEGIN
	ALTER TABLE "cz_production_plan_lines" ADD CONSTRAINT "cz_production_plan_lines_batch_id_fk"
		FOREIGN KEY ("batch_id") REFERENCES "public"."cz_batches"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- One reference per company, the same rule every other series here follows.
CREATE UNIQUE INDEX IF NOT EXISTS "cz_production_plans_ref_idx"
	ON "cz_production_plans" ("company_id", "reference");
CREATE INDEX IF NOT EXISTS "cz_production_plans_day_idx"
	ON "cz_production_plans" ("company_id", "on_date");
CREATE INDEX IF NOT EXISTS "cz_production_plan_lines_plan_idx"
	ON "cz_production_plan_lines" ("plan_id", "line_no");
CREATE INDEX IF NOT EXISTS "cz_production_plan_lines_batch_idx"
	ON "cz_production_plan_lines" ("batch_id");

-- ── how low a material may go before it is worth buying ─────────────────────
--
-- ⚠️ NULLABLE, AND NULL MEANS NOBODY HAS SAID. The order form works a rate out
-- from what has actually been used, which needs a week of history before it will
-- quote one at all — so a material bought rarely never gets a suggestion. A
-- reorder level needs no history whatsoever and is how every factory really does
-- it. The two answer different questions and both are kept.

ALTER TABLE "cz_stock_items" ADD COLUMN IF NOT EXISTS "reorder_level" numeric(14, 3);

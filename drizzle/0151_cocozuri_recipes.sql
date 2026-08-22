-- CocoZuri, manufacturing Stage 3: recipes — what a bar costs to make, before
-- one is made.
--
-- The reference system calls this a BOM (Bill of Materials) and costs it as
-- `raw_material_cost + operating_cost − scrap_material_cost`, with a
-- `process_loss_percentage`. The owner's own words (note #31) are
-- "Costing = raw material + finish + packaging materials", so the LINE CARRIES
-- HIS THREE HEADINGS rather than one lump — the same reasoning that made the
-- stock sheet's third column a piece of data instead of a guess.
--
-- ⚠️ "FINISH" IS THE OWNER'S WORD AND NOBODY HAS SAID WHAT IT MEANS. It might
-- be finishing MATERIALS (lustre, ribbon, a box sleeve) or finishing WORK. It is
-- recorded under its own name, and anything that is not a stock item at all —
-- gas, labour, an hour of somebody's time — goes in `other_cost` with a note
-- saying what it was. Neither is translated into a guess.
--
-- ⚠️ NOTHING DERIVED IS STORED. There is no cost column on the recipe and none
-- on the line: what a recipe costs is worked out on read from what the materials
-- ACTUALLY cost, which is now a real figure because Stage 2 puts a landed unit
-- cost on every `receipt` movement.

-- ──────────────────────────────────────────────────────────────── recipes ──
CREATE TABLE IF NOT EXISTS "cz_recipes" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"name" text NOT NULL,
	-- What it makes. ⚠️ A STOCK ITEM, not a product: a recipe produces a thing
	-- you COUNT, and `cz_stock_items.product_id` is what says whether that thing
	-- is also something you sell. Stage 4's batches produce into the same table.
	"output_item_id" integer NOT NULL,
	-- ⚠️ HOW MANY UNITS ONE BATCH MAKES, and the line quantities below are PER
	-- BATCH to match. That is how a kitchen actually works — "two kilos of cocoa
	-- makes a hundred and twenty bars" — and per-unit quantities would be
	-- unreadable fractions of a gram.
	"yield_qty" numeric(14, 3) NOT NULL,
	"yield_uom" text DEFAULT 'PCS' NOT NULL,
	-- The loss you EXPECT. It exists so the actual loss can be measured against
	-- something at Stage 4 — the owner's "inter check against plan" (note #37).
	-- Artisanal chocolate should run above 95% yield.
	"expected_loss_percent" numeric(6, 3) DEFAULT '0' NOT NULL,
	-- Anything that is not a stock item: gas, an hour of somebody's time.
	-- ⚠️ It must carry a note, or it is a number nobody can check.
	"other_cost" numeric(14, 2) DEFAULT '0' NOT NULL,
	"other_cost_note" text,
	-- draft | active | archived
	"status" text DEFAULT 'draft' NOT NULL,
	-- ⚠️ Several ACTIVE recipes for one item is normal and correct — a large
	-- batch and a small batch are genuinely different recipes. The default is
	-- the one the order form and Stage 4 reach for first.
	"is_default" boolean DEFAULT false NOT NULL,
	"notes" text,
	"created_by" text DEFAULT 'web-ui' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
-- ⚠️ NO COST COLUMN. What a line is worth is its quantity times what that
-- material actually cost, worked out on read — and an ingredient nobody has
-- ever bought has NO cost, reported as unknown rather than as nil.
CREATE TABLE IF NOT EXISTS "cz_recipe_lines" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"recipe_id" integer NOT NULL,
	"line_no" integer DEFAULT 1 NOT NULL,
	"item_id" integer NOT NULL,
	-- ingredient | packaging | finishing — the owner's own three headings.
	"kind" text DEFAULT 'ingredient' NOT NULL,
	-- ⚠️ PER BATCH, not per unit. See `yield_qty`.
	"qty" numeric(14, 3) NOT NULL,
	"uom" text DEFAULT 'PCS' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "cz_recipes" ADD CONSTRAINT "cz_recipes_company_id_companies_id_fk"
		FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
-- RESTRICT: an item something is made of cannot be quietly removed.
DO $$ BEGIN
	ALTER TABLE "cz_recipes" ADD CONSTRAINT "cz_recipes_output_item_id_cz_stock_items_id_fk"
		FOREIGN KEY ("output_item_id") REFERENCES "public"."cz_stock_items"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "cz_recipe_lines" ADD CONSTRAINT "cz_recipe_lines_company_id_companies_id_fk"
		FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "cz_recipe_lines" ADD CONSTRAINT "cz_recipe_lines_recipe_id_cz_recipes_id_fk"
		FOREIGN KEY ("recipe_id") REFERENCES "public"."cz_recipes"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "cz_recipe_lines" ADD CONSTRAINT "cz_recipe_lines_item_id_cz_stock_items_id_fk"
		FOREIGN KEY ("item_id") REFERENCES "public"."cz_stock_items"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "cz_recipes_name_idx" ON "cz_recipes" ("company_id","name");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cz_recipes_output_idx" ON "cz_recipes" ("output_item_id","status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cz_recipe_lines_recipe_idx" ON "cz_recipe_lines" ("recipe_id","line_no");
--> statement-breakpoint
-- ⚠️ THE REVERSE LOOK-UP IS THE POINT OF "COMMON INGREDIENTS" (note #33): given
-- one bag of almond powder, which recipes use it.
CREATE INDEX IF NOT EXISTS "cz_recipe_lines_item_idx" ON "cz_recipe_lines" ("item_id");
--> statement-breakpoint
-- ⚠️ A new table does not inherit the lock from migration 0139.
ALTER TABLE "cz_recipes" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "cz_recipe_lines" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON TABLE "cz_recipes", "cz_recipe_lines" FROM anon, authenticated;

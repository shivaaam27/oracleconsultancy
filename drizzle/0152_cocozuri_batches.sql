-- CocoZuri, manufacturing Stage 4: production — the batch.
--
-- ⚠️ READ §5a BEFORE CHANGING ANY OF THIS. The owner's words, 22 Aug 2026:
-- "we don't use batch numbers, but we are introducing them". NOBODY AT COCOZURI
-- WRITES A BATCH NUMBER TODAY. That cuts both ways and it is the single most
-- important fact about this stage:
--
--   · It FREES the design. There is no legacy format to parse, no habit to
--     match. `BATCH-2608-01` can simply be right.
--   · It RAISES THE BAR ON FRICTION. Every field somebody must fill before they
--     can start making chocolate is a reason to go back to the notebook. So the
--     number is ALLOCATED BY THE SYSTEM, a batch is OPENABLE IN ONE ACTION, and
--     what came out can be recorded AFTER THE FACT. A batch that has to be
--     planned in advance to exist will not get used on a busy morning.
--   · Adoption is part of the work. Getting this wrong is not a bug report; it
--     is people quietly not using it.
--
-- `cz_batches` already existed from Stage 1 so the stock ledger could reference
-- a batch from the start. This gives it the rest of a life.

-- Which recipe it was made to. ⚠️ NULLABLE ON PURPOSE — somebody making
-- something for the first time, or off-recipe, must still be able to open a
-- batch. Demanding a recipe first is exactly the friction §5a warns about.
ALTER TABLE "cz_batches" ADD COLUMN IF NOT EXISTS "recipe_id" integer;
--> statement-breakpoint
-- Where it is being made. Every stock movement needs a place, and a batch
-- consumes and produces in one.
ALTER TABLE "cz_batches" ADD COLUMN IF NOT EXISTS "location_id" integer;
--> statement-breakpoint
-- How many batches of the recipe this run is. 2 means twice the recipe.
ALTER TABLE "cz_batches" ADD COLUMN IF NOT EXISTS "recipe_multiple" numeric(14, 3) DEFAULT '1' NOT NULL;
--> statement-breakpoint
-- ⚠️ WHAT ACTUALLY CAME OUT — the other half of the owner's "inter check
-- against plan" (note #37). `planned_qty` is what was expected; this is what
-- was found. The VARIANCE between them is never stored: it is the subtraction,
-- worked out on read, like every other figure in this module.
ALTER TABLE "cz_batches" ADD COLUMN IF NOT EXISTS "produced_qty" numeric(14, 3);
--> statement-breakpoint
-- ⚠️ WHERE THE DIFFERENCE WENT — note #12, "abnormal loss: production | raw
-- materials". A shortfall with no explanation is a number nobody can act on,
-- which is the state the workbook's VARIANCE column is in. `none` is only valid
-- when there is no shortfall.
--   none | production | raw_material | both
ALTER TABLE "cz_batches" ADD COLUMN IF NOT EXISTS "loss_kind" text DEFAULT 'none' NOT NULL;
--> statement-breakpoint
ALTER TABLE "cz_batches" ADD COLUMN IF NOT EXISTS "loss_note" text;
--> statement-breakpoint
ALTER TABLE "cz_batches" ADD COLUMN IF NOT EXISTS "opened_by" text;
--> statement-breakpoint
ALTER TABLE "cz_batches" ADD COLUMN IF NOT EXISTS "closed_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "cz_batches" ADD COLUMN IF NOT EXISTS "closed_by" text;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "cz_batches" ADD CONSTRAINT "cz_batches_recipe_id_cz_recipes_id_fk"
		FOREIGN KEY ("recipe_id") REFERENCES "public"."cz_recipes"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "cz_batches" ADD CONSTRAINT "cz_batches_location_id_cz_stock_locations_id_fk"
		FOREIGN KEY ("location_id") REFERENCES "public"."cz_stock_locations"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
-- ⚠️ A recipe that something has been MADE from cannot be deleted out from
-- under it — the batch is the record of a real morning's work, and its recipe
-- is how you know what went in. `deleteRecipe` refuses on the strength of this.
CREATE INDEX IF NOT EXISTS "cz_batches_recipe_idx" ON "cz_batches" ("recipe_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cz_batches_location_idx" ON "cz_batches" ("location_id","status");

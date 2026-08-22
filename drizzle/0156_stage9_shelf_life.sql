-- CocoZuri, manufacturing Stage 9: expiry, shelf life and traceability.
--
-- ⚠️ THE OWNER CONFIRMED IT (22 Aug 2026): *"yes everything has expiry and shelf
-- life"*. The plan had called this stage "proposed rather than assumed"; it is
-- now a requirement, and this is what it needs.
--
-- Four small columns, and each one earns its place:
--
--   · `cz_stock_items.shelf_life_days` — how long a thing lasts. On the STOCK
--     ITEM, not the product, because raw materials go off too and 171 of them
--     are never sold. A batch made today expires today plus this.
--
--   · `cz_purchase_lines.expires_on` — what the supplier printed on the bag.
--     ⚠️ This is what makes "the earliest ingredient, or the production date,
--     whichever is sooner" possible at all: without it, nobody knows when the
--     almonds go off, and a bar cannot inherit a date that was never recorded.
--
--   · `cz_batches.source` + `purchase_line_id` — a batch is now either something
--     we MADE or a LOT we bought. Same table on purpose: both are a quantity of
--     one thing, with a date and an expiry, that movements can point at. A
--     separate lots table would mean every trace query had to look in two places
--     and every join had to guess which.
--
-- ⚠️ NO `expires_on` COLUMN IS ADDED ANYWHERE NEW. `cz_batches` already has one,
-- and it is FILLED IN rather than derived on read — because the day a bar
-- expires is a fact about that bar, frozen when it was made, and a shelf life
-- changed next year must not silently move the date on chocolate already in a
-- shop.

ALTER TABLE "cz_stock_items" ADD COLUMN IF NOT EXISTS "shelf_life_days" integer;
--> statement-breakpoint
ALTER TABLE "cz_purchase_lines" ADD COLUMN IF NOT EXISTS "expires_on" date;
--> statement-breakpoint
-- production | purchase
-- ⚠️ Defaulted to 'production' so every batch that already exists keeps meaning
-- exactly what it meant before this ran.
ALTER TABLE "cz_batches" ADD COLUMN IF NOT EXISTS "source" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "cz_batches" ADD COLUMN IF NOT EXISTS "purchase_line_id" integer;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "cz_batches" ADD CONSTRAINT "cz_batches_purchase_line_id_cz_purchase_lines_id_fk"
		FOREIGN KEY ("purchase_line_id") REFERENCES "public"."cz_purchase_lines"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
-- What is going off soonest, per shelf — the question FEFO asks a hundred times.
CREATE INDEX IF NOT EXISTS "cz_batches_expiry_idx" ON "cz_batches" ("company_id","item_id","expires_on");

-- CocoZuri Stage A — what kind of thing an item is, and the lists you pick from.
--
-- TWO CHANGES, and the first is the one that unlocks the rest of the module:
-- a stock item has never known whether it is a raw material, a box, or a
-- finished bar. So a recipe offered all 323 items for every line, packaging had
-- nowhere to live, and purchases could not be split.
--
-- ⚠️ `kind` IS NULLABLE ON PURPOSE. NULL means NOBODY HAS SAID — the same
-- three-state honesty as `tax_inclusive` and `shelf_life_days`. The backfill
-- below only fills in what can be worked out with confidence and leaves the rest
-- NULL, so the screen can count them and somebody can sweep them. Guessing at
-- every row and calling it fact is how the catalogue got 50 prices for one
-- ingredient in the first place.

ALTER TABLE "cz_stock_items" ADD COLUMN IF NOT EXISTS "kind" text;

CREATE INDEX IF NOT EXISTS "cz_stock_items_kind_idx" ON "cz_stock_items" ("company_id", "kind");

-- ── the backfill, in order of confidence ────────────────────────────────────

-- 1. Linked to a product = something we sell. That link is deliberate and is the
--    strongest signal there is.
UPDATE "cz_stock_items" SET "kind" = 'finished'
 WHERE "kind" IS NULL AND "product_id" IS NOT NULL;

-- 2. Named like packaging. ⚠️ A word match, which is exactly the kind of
--    reasoning this module distrusts elsewhere — so it is confined to words that
--    cannot plausibly be a food ingredient, and every one of them is correctable
--    on the screen.
UPDATE "cz_stock_items" SET "kind" = 'packaging'
 WHERE "kind" IS NULL
   AND (
     "name" ILIKE '%box%' OR "name" ILIKE '%carton%' OR "name" ILIKE '%wrapper%'
     OR "name" ILIKE '%sticker%' OR "name" ILIKE '%label%' OR "name" ILIKE '%ribbon%'
     OR "name" ILIKE '%pouch%' OR "name" ILIKE '%sleeve%' OR "name" ILIKE '%tray%'
     OR "name" ILIKE '%packing%' OR "name" ILIKE '%packaging%' OR "name" ILIKE '%tape%'
   );

-- 3. On a shelf whose own name says raw materials. The location is a fact
--    somebody typed, not an inference from wording.
UPDATE "cz_stock_items" SET "kind" = 'raw_material'
 WHERE "kind" IS NULL
   AND "location_id" IN (SELECT "id" FROM "cz_stock_locations" WHERE "name" ILIKE '%raw%');

-- Everything else stays NULL. It is not a failure — it is the list somebody has
-- to look at, and the screen says how many there are.

-- ── the lists you pick from ─────────────────────────────────────────────────
--
-- ⚠️ ONE TABLE, KEYED BY WHAT SORT OF LIST IT IS, rather than four tables. The
-- values themselves stay as TEXT on the product and the item, because that is
-- what every existing row already holds and what an invoice has frozen onto it —
-- this table is the list you PICK from, not a foreign key. Renaming therefore
-- has to re-point the text, which is what makes merge worth having at all.

CREATE TABLE IF NOT EXISTS "cz_lists" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	-- category | brand | uom | pack_unit
	"kind" text NOT NULL,
	"value" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

DO $$ BEGIN
	ALTER TABLE "cz_lists" ADD CONSTRAINT "cz_lists_company_id_companies_id_fk"
		FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ⚠️ One value once per list. Case-insensitive, because `PCS` and `Pcs` being
-- two entries is the whole fault this table exists to end.
CREATE UNIQUE INDEX IF NOT EXISTS "cz_lists_value_idx"
	ON "cz_lists" ("company_id", "kind", lower("value"));
CREATE INDEX IF NOT EXISTS "cz_lists_kind_idx" ON "cz_lists" ("company_id", "kind", "sort_order");

-- ── seed each list from what is already in use ──────────────────────────────
--
-- ⚠️ WITHOUT THIS THE SCREEN OPENS EMPTY over a catalogue with 159 products
-- already carrying categories and units. DISTINCT ON lower() keeps the first
-- spelling of each and the merge tool sorts out the rest by hand — which is a
-- business decision, not a string comparison. Same reasoning as the product
-- duplicates being imported deliberately.

INSERT INTO "cz_lists" ("company_id", "kind", "value")
SELECT DISTINCT ON (p."company_id", lower(btrim(p."category")))
       p."company_id", 'category', btrim(p."category")
  FROM "cz_products" p
 WHERE p."category" IS NOT NULL AND btrim(p."category") <> ''
ON CONFLICT DO NOTHING;

INSERT INTO "cz_lists" ("company_id", "kind", "value")
SELECT DISTINCT ON (p."company_id", lower(btrim(p."brand")))
       p."company_id", 'brand', btrim(p."brand")
  FROM "cz_products" p
 WHERE p."brand" IS NOT NULL AND btrim(p."brand") <> ''
ON CONFLICT DO NOTHING;

INSERT INTO "cz_lists" ("company_id", "kind", "value")
SELECT DISTINCT ON (p."company_id", lower(btrim(p."uom")))
       p."company_id", 'uom', btrim(p."uom")
  FROM "cz_products" p
 WHERE p."uom" IS NOT NULL AND btrim(p."uom") <> ''
ON CONFLICT DO NOTHING;

INSERT INTO "cz_lists" ("company_id", "kind", "value")
SELECT DISTINCT ON (p."company_id", lower(btrim(p."pack_unit")))
       p."company_id", 'pack_unit', btrim(p."pack_unit")
  FROM "cz_products" p
 WHERE p."pack_unit" IS NOT NULL AND btrim(p."pack_unit") <> ''
ON CONFLICT DO NOTHING;

-- The stock items carry their own categories and units, and 171 of them are raw
-- materials that never appear on a product at all.
INSERT INTO "cz_lists" ("company_id", "kind", "value")
SELECT DISTINCT ON (i."company_id", lower(btrim(i."category")))
       i."company_id", 'category', btrim(i."category")
  FROM "cz_stock_items" i
 WHERE i."category" IS NOT NULL AND btrim(i."category") <> ''
ON CONFLICT DO NOTHING;

INSERT INTO "cz_lists" ("company_id", "kind", "value")
SELECT DISTINCT ON (i."company_id", lower(btrim(i."uom")))
       i."company_id", 'uom', btrim(i."uom")
  FROM "cz_stock_items" i
 WHERE i."uom" IS NOT NULL AND btrim(i."uom") <> ''
ON CONFLICT DO NOTHING;

-- 0097: company-scoped director — people.director_company_id (nullable FK companies).
-- NOTE: drizzle-kit generated this against a stale meta snapshot (0089) and tried to
-- re-create every object from migrations 0090–0096, which already exist in the live DB.
-- That bulk was REMOVED by hand — this migration carries ONLY the new column. The
-- regenerated 0097 *snapshot* is kept as-is, which re-syncs drizzle/meta to the live
-- schema so future `db:generate` diffs are clean again. Statements are idempotent so
-- this is safe whether or not the column was already applied out-of-band.
ALTER TABLE "people" ADD COLUMN IF NOT EXISTS "director_company_id" integer;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "people" ADD CONSTRAINT "people_director_company_id_companies_id_fk" FOREIGN KEY ("director_company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;

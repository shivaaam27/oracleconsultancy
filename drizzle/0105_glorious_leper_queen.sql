-- 0105: director_companies — lets a director be scoped to MORE THAN ONE company.
-- A director with >=1 row here governs exactly those companies; a director with
-- no rows is portfolio-wide. Mirrors person_companies. Additive + idempotent.
-- (The unrelated companies.file_prefix diff drizzle-kit emitted was dropped — it
--  is already live from migration 0103; re-adding it would collide.)
CREATE TABLE IF NOT EXISTS "director_companies" (
	"person_id" integer NOT NULL,
	"company_id" integer NOT NULL,
	CONSTRAINT "director_companies_person_id_company_id_pk" PRIMARY KEY("person_id","company_id")
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "director_companies" ADD CONSTRAINT "director_companies_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "director_companies" ADD CONSTRAINT "director_companies_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "director_companies_company_idx" ON "director_companies" USING btree ("company_id");
--> statement-breakpoint
-- Backfill: every existing single-company director → one row, so nothing regresses.
INSERT INTO "director_companies" ("person_id","company_id")
SELECT "id","director_company_id" FROM "people"
WHERE "portal_role" = 'director' AND "director_company_id" IS NOT NULL
ON CONFLICT DO NOTHING;

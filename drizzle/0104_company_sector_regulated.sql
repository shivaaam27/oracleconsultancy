-- 0104_company_sector_regulated.sql
-- Flags a company as operating in a regulated SECTOR (construction/industrial),
-- so it needs the extra compliance docs — contractor registration (CRB), OSHA,
-- Local-Content plan, fire certificate. Only such companies score against those.
-- Additive + idempotent. Confirmed: PES Ltd.
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "sector_regulated" boolean NOT NULL DEFAULT false;
UPDATE "companies" SET "sector_regulated" = true WHERE "name" = 'PES Ltd';

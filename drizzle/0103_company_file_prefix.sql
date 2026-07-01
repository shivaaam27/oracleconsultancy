-- 0103_company_file_prefix.sql
-- Per-company brand FILE PREFIX for document naming ("DarSpices", "PES", …). The
-- DB `name` is the legal name ("DSC Ltd") but files use the brand short-name, so
-- this is editable per company. Seeded with a derived default (name minus
-- Ltd/Limited minus non-alphanumerics); the owner can correct any in the UI.
-- Additive + idempotent.

ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "file_prefix" text;

-- Derived default where not yet set.
UPDATE "companies"
SET "file_prefix" = regexp_replace(regexp_replace("name", '\s+(Ltd|Limited)\.?$', '', 'i'), '[^A-Za-z0-9]', '', 'g')
WHERE "file_prefix" IS NULL OR "file_prefix" = '';

-- Confirmed brand override (Dar Spices files use "DarSpices", legal name "DSC Ltd").
UPDATE "companies" SET "file_prefix" = 'DarSpices' WHERE "name" = 'DSC Ltd';

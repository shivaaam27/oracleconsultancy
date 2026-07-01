-- Idempotent: applied directly to the live DB on 2026-07-01. IF NOT EXISTS lets
-- deploy re-run safely. Optional per-person portal display title (e.g. "Group
-- Admin Manager") overriding the plain role label. See src/lib/portal-labels.ts.
ALTER TABLE "people" ADD COLUMN IF NOT EXISTS "portal_designation" text;

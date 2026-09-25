-- Assets as a management system (26 Sept 2026). Additive only.
-- A warranty date (reminded like a document expiry), the last stock-take check,
-- and a service log: every repair, service or inspection, with who did it and
-- what it cost.
ALTER TABLE "assets" ADD COLUMN IF NOT EXISTS "warranty_until" timestamptz;
--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN IF NOT EXISTS "checked_at" timestamptz;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "asset_services" (
  "id" serial PRIMARY KEY,
  "asset_id" integer NOT NULL REFERENCES "assets"("id") ON DELETE CASCADE,
  "kind" text NOT NULL DEFAULT 'service',
  "happened_on" timestamptz NOT NULL,
  "vendor_id" integer REFERENCES "vendors"("id") ON DELETE SET NULL,
  "cost" numeric(14,2),
  "notes" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "created_by" text NOT NULL DEFAULT 'web-ui'
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "asset_services_asset_idx" ON "asset_services" ("asset_id", "happened_on");
--> statement-breakpoint
-- Locked like every other table (0139/0140).
ALTER TABLE "asset_services" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON "asset_services" FROM anon, authenticated;
--> statement-breakpoint
REVOKE ALL ON SEQUENCE "asset_services_id_seq" FROM anon, authenticated;

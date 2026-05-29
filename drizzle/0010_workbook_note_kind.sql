ALTER TABLE "meetings" ADD COLUMN IF NOT EXISTS "kind" text DEFAULT 'meeting' NOT NULL;

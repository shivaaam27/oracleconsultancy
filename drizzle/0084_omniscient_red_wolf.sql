ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "requires_attachment" boolean DEFAULT false NOT NULL;

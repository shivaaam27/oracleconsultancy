-- AI conversational memory. Lets Ask COS (and any future assistant surface)
-- remember past Q&A, learned preferences, and stable facts per recipient
-- ('admin' = the owner; a staff name for portal surfaces), then recall them on
-- later questions. Recall is cheap and deterministic (pure SQL + in-memory
-- keyword/recency ranking — no AI call needed), mirroring src/lib/search.ts.
--
-- Drift-safe like 0094: written by hand (not drizzle-kit generated) and additive
-- + idempotent (IF NOT EXISTS) so it can run against a live DB that may have
-- drifted from the meta snapshot. The matching Drizzle table (`aiMemory`) IS
-- added to schema.ts because this table is read/written via supabase-js with a
-- plain column shape.
CREATE TABLE IF NOT EXISTS "ai_memory" (
  "id" serial PRIMARY KEY NOT NULL,
  "recipient" text NOT NULL DEFAULT 'admin',
  "kind" text NOT NULL,
  "question" text,
  "answer" text,
  "tags" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ai_memory_recipient_created_idx" ON "ai_memory" ("recipient","created_at" DESC);

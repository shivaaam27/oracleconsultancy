-- AI usage ledger. One row per successful Groq call (best-effort, fire-and-forget
-- from src/lib/ai-json.ts): which model, what for ("source"), how many tokens, and
-- an estimated cost. Today the Groq free tier is free, so est_cost defaults to 0 —
-- but the ledger + the monthly-spend / spend-cap machinery (src/lib/ai-spend.ts)
-- are live the moment a paid per-model rate is configured. Used to power an optional
-- monthly spend ceiling that gracefully turns AI off when exceeded (a Tier-3
-- "spend" guardrail), never silently overspending.
--
-- Drift-safe like 0094/0095: written by hand (not drizzle-kit generated) and
-- additive + idempotent (IF NOT EXISTS) so it can run against a live DB that may
-- have drifted from the meta snapshot. The matching Drizzle table (`aiUsage`) IS
-- added to schema.ts because this table is read/written via supabase-js with a
-- plain column shape.
CREATE TABLE IF NOT EXISTS "ai_usage" (
  "id" serial PRIMARY KEY NOT NULL,
  "at" timestamp with time zone NOT NULL DEFAULT now(),
  "model" text,
  "source" text,
  "prompt_tokens" integer,
  "completion_tokens" integer,
  "est_cost" numeric(12,4) DEFAULT 0,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ai_usage_at_idx" ON "ai_usage" ("at");

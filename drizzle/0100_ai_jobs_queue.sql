-- Idempotent: the ai_jobs table + claim function were applied directly to the
-- live DB on 2026-07-01 (cloud-agent-as-engine, Phase 0). Guards let deploy re-run.
CREATE TABLE IF NOT EXISTS "ai_jobs" (
	"id" serial PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"lane" text DEFAULT 'batch' NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"result" jsonb,
	"error" text,
	"requested_by" text,
	"thread_id" integer,
	"tier" integer DEFAULT 1 NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 3 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"picked_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"undo_token" text
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ai_jobs_queue_idx" ON "ai_jobs" USING btree ("status","lane","priority","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ai_jobs_thread_idx" ON "ai_jobs" USING btree ("thread_id");--> statement-breakpoint
-- Atomic claim (FOR UPDATE SKIP LOCKED) — two runners never grab the same job.
CREATE OR REPLACE FUNCTION claim_next_ai_job(p_lane text DEFAULT NULL)
RETURNS SETOF ai_jobs
LANGUAGE plpgsql AS $fn$
BEGIN
  RETURN QUERY
  UPDATE ai_jobs a
    SET status='running', picked_at=now(), attempts=attempts+1
  WHERE a.id = (
    SELECT id FROM ai_jobs
    WHERE status='queued' AND (p_lane IS NULL OR lane = p_lane)
    ORDER BY priority DESC, created_at ASC
    FOR UPDATE SKIP LOCKED
    LIMIT 1
  )
  RETURNING a.*;
END $fn$;

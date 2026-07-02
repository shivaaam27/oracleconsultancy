-- 0106: claim_next_ai_job gains a KINDS filter so the deterministic runner and the
-- AI worker never claim each other's jobs. This 2-arg version was applied to the
-- live DB by hand (cloud-agent Phases 1-3) but the 0100 migration only defined the
-- 1-arg overload — so a FRESH deploy would create only claim_next_ai_job(text) and
-- every 2-arg call (lane + kinds) would fail, silently breaking the queue. This
-- migration reproduces the live function and drops the stale 1-arg overload so the
-- call resolves unambiguously. Idempotent, no data touched (function replace only).
DROP FUNCTION IF EXISTS claim_next_ai_job(text);
--> statement-breakpoint
CREATE OR REPLACE FUNCTION claim_next_ai_job(p_lane text DEFAULT NULL, p_kinds text[] DEFAULT NULL)
RETURNS SETOF ai_jobs
LANGUAGE plpgsql AS $fn$
BEGIN
  RETURN QUERY
  UPDATE ai_jobs a
    SET status='running', picked_at=now(), attempts=attempts+1
  WHERE a.id = (
    SELECT id FROM ai_jobs
    WHERE status='queued'
      AND (p_lane IS NULL OR lane = p_lane)
      AND (p_kinds IS NULL OR kind = ANY(p_kinds))
    ORDER BY priority DESC, created_at ASC
    FOR UPDATE SKIP LOCKED
    LIMIT 1
  )
  RETURNING a.*;
END $fn$;

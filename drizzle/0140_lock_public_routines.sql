-- 0140 — the half of 0139 that did not take: the functions.
--
-- WHAT 0139 MISSED. It ran `REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM
-- anon, authenticated`, which looked right and did nothing, because PostgreSQL
-- grants EXECUTE on every new function to the pseudo-role **PUBLIC**, and `anon`
-- inherits from PUBLIC. Revoking from `anon` leaves the PUBLIC grant standing.
-- Checked afterwards: `has_function_privilege('anon', …, 'EXECUTE')` was still
-- true for all 156 functions, and their ACL read `{=X/postgres,…}` — the bare
-- `=X` being PUBLIC's grant.
--
-- HOW BAD IT WAS. Not very, today: every function in `public` is SECURITY
-- INVOKER, so calling one as `anon` runs it as `anon`, which 0139 left with no
-- table privileges at all — it fails inside. But PostgREST publishes every one
-- of them as an RPC endpoint, so this is a landmine rather than a wound: the
-- first SECURITY DEFINER function anyone adds (the normal way to write a
-- Supabase RPC) would be callable by the entire internet on the day it ships.
--
-- WHY THIS IS SAFE. Our own functions carry EXPLICIT grants beside the PUBLIC
-- one — `{=X/postgres, postgres=X/postgres, service_role=X/postgres}` — so
-- taking PUBLIC away leaves the owner and the service role untouched. The
-- explicit GRANT below makes that a guarantee rather than an observation.
--
-- ⚠️ The extension functions (pg_trgm, pgvector) are owned by `supabase_admin`,
-- not by us, so these statements CANNOT touch them and Postgres says so with a
-- "no privileges could be revoked" notice. That is the correct outcome, not a
-- failure: index and operator support functions must stay callable, and they
-- leak nothing — they are pure maths over values you already had to supply.

REVOKE EXECUTE ON ALL ROUTINES IN SCHEMA public FROM PUBLIC;
--> statement-breakpoint
REVOKE EXECUTE ON ALL ROUTINES IN SCHEMA public FROM anon, authenticated;
--> statement-breakpoint

-- Belt: the app must keep working no matter what the revokes above did.
GRANT EXECUTE ON ALL ROUTINES IN SCHEMA public TO service_role;
--> statement-breakpoint

-- And the next function created is closed from birth. Without this, the very
-- next migration that adds an RPC reopens exactly the hole this closes.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE EXECUTE ON ROUTINES FROM PUBLIC;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT EXECUTE ON ROUTINES TO service_role;

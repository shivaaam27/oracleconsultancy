-- 0139 — Close the public schema to the browser key.
--
-- WHY. NEXT_PUBLIC_SUPABASE_ANON_KEY ships inside every page of the site, which
-- is by design — but every one of the 128 tables in `public` had Row Level
-- Security switched OFF and full grants to `anon`. Verified live on 20 Aug 2026:
-- that key could read people, tasks, documents, settings (including the owner
-- password hash), portal password hashes, mcp_keys and webauthn_credentials, and
-- PATCH/DELETE returned 204 — i.e. writes were permitted too.
--
-- WHY THIS IS SAFE. COS never uses the anon key for data. It reads and writes
-- through `sb` (SUPABASE_SERVICE_ROLE_KEY) and through postgres.js as `postgres`.
-- Both roles carry rolbypassrls = true, so RLS with no policies locks out
-- everyone EXCEPT the app. Checked before writing this: no views, no SECURITY
-- DEFINER functions, and the `supabase_realtime` publication is empty (the only
-- postgres_changes listener in the code was therefore already inert; it has been
-- removed from cockpit-live.tsx in the same change). Chat and the cockpit pulse
-- use Realtime *broadcast*, which needs no table access at all.
--
-- Deliberately NOT done: FORCE ROW LEVEL SECURITY (would apply RLS to the owner
-- and break migrations), and REVOKE USAGE ON SCHEMA public (PUBLIC also holds
-- USAGE, so it buys nothing here while risking odd PostgREST behaviour). RLS is
-- the authoritative lock; the REVOKEs below are belt and braces.

-- 1. Row Level Security on every table, with no policies = deny all.
DO $$
DECLARE t record;
BEGIN
  FOR t IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.relname);
  END LOOP;
END $$;
--> statement-breakpoint

-- 2. Take the grants away as well, so a permission-denied comes back before RLS
--    is even consulted.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
--> statement-breakpoint
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
--> statement-breakpoint
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon, authenticated;
--> statement-breakpoint

-- 3. Lock future tables from birth. Supabase ships default privileges that grant
--    everything in `public` to anon/authenticated, which is how all 128 tables
--    came to be open; without this, migration 0140 would reopen the hole.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon, authenticated;
--> statement-breakpoint

-- The same default privileges also exist under supabase_admin. `postgres` may not
-- be allowed to alter another role's defaults on every plan, so this one is
-- best-effort — RLS from step 1 covers anything it misses.
DO $$
BEGIN
  EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated';
  EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated';
  EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon, authenticated';
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'Skipped supabase_admin default privileges (not permitted) — RLS still covers new tables.';
END $$;

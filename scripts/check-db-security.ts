/**
 * `npm run db:check-security`
 *
 * Re-runs the checks behind migrations 0139 and 0140. It answers one question: can the
 * public browser key (NEXT_PUBLIC_SUPABASE_ANON_KEY, which ships inside every
 * page) touch the database?
 *
 * On 20 Aug 2026 the answer was yes — it could read every table, including the
 * owner password hash and every staff password hash, and PATCH/DELETE were
 * permitted too. Migration 0139 shut that. This script exists so nobody has to
 * take that on trust again.
 *
 * ⚠️ WHY IT IS STILL NEEDED AFTER THE MIGRATIONS. Three ways the hole reopens:
 *   1. A table created in the Supabase DASHBOARD (rather than by a migration) is
 *      created by `supabase_admin`, whose default privileges still grant
 *      everything to `anon` — we are not permitted to revoke those.
 *   2. A migration that runs an explicit GRANT.
 *   3. A new FUNCTION. Postgres grants EXECUTE to the pseudo-role PUBLIC by
 *      default and `anon` inherits it, so a function can be wide open while its
 *      grants look clean. This is exactly what 0139 missed; 0140 fixed it and
 *      set the default privileges so it does not come back. A SECURITY DEFINER
 *      function is the dangerous case — it would run with the owner's rights.
 * Any of them turns this script red. Run it after any schema work.
 *
 * Exits 1 on a finding so it can sit in CI.
 */
import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
config({ path: ".env", quiet: true });

import postgres from "postgres";

/** Tables the anon key is deliberately allowed to reach. Empty, and it should
 *  stay empty: COS reads and writes only through the service-role key. */
const ALLOWED_ANON_TABLES: string[] = [];

async function main() {
  const url = process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL;
  if (!url) {
    console.error("No database URL set (DIRECT_DATABASE_URL or DATABASE_URL).");
    process.exit(1);
  }
  const sql = postgres(url, { prepare: false, max: 1, connect_timeout: 30 });
  const problems: string[] = [];

  try {
    // 1. Every table in `public` must have Row Level Security on.
    const noRls = await sql<{ relname: string }[]>`
      select c.relname
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
      order by c.relname
    `;
    if (noRls.length) {
      problems.push(
        `${noRls.length} table(s) without Row Level Security: ${noRls.map((r) => r.relname).join(", ")}`
      );
    }

    // 2. No table may be granted to anon or authenticated.
    const granted = await sql<{ table_name: string; grantee: string; privilege_type: string }[]>`
      select distinct table_name, grantee, privilege_type
      from information_schema.role_table_grants
      where table_schema = 'public' and grantee in ('anon', 'authenticated')
      order by table_name
    `;
    const unexpected = granted.filter((g) => !ALLOWED_ANON_TABLES.includes(g.table_name));
    if (unexpected.length) {
      const names = [...new Set(unexpected.map((g) => g.table_name))];
      problems.push(
        `${names.length} table(s) still granted to anon/authenticated: ${names.join(", ")}`
      );
    }

    // 3. Our own functions must not be callable by the browser key. Checking
    //    the GRANT is not enough — Postgres gives EXECUTE to the pseudo-role
    //    PUBLIC by default and `anon` inherits it, which is exactly what 0139
    //    missed and 0140 fixed. has_function_privilege() sees through that.
    //    Scoped to functions WE own: the pg_trgm/pgvector ones belong to
    //    supabase_admin, cannot be revoked from here, and are pure maths over
    //    values the caller already had.
    const anonFns = await sql<{ proname: string }[]>`
      select p.proname
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and pg_get_userbyid(p.proowner) = 'postgres'
        and has_function_privilege('anon', p.oid, 'EXECUTE')
      order by p.proname
    `;
    if (anonFns.length) {
      problems.push(
        `${anonFns.length} function(s) callable by the public key: ${anonFns.map((f) => f.proname).join(", ")}`
      );
    }

    // 4. Nothing may bypass RLS from the side. A view or a SECURITY DEFINER
    //    function owned by a privileged role reads with that role's rights.
    const views = await sql<{ viewname: string }[]>`
      select viewname from pg_views where schemaname = 'public' order by viewname
    `;
    if (views.length) {
      problems.push(
        `${views.length} view(s) in public — views ignore the underlying tables' RLS unless declared security_invoker: ${views
          .map((v) => v.viewname)
          .join(", ")}`
      );
    }
    const secdef = await sql<{ proname: string }[]>`
      select p.proname
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.prosecdef
      order by p.proname
    `;
    if (secdef.length) {
      problems.push(
        `${secdef.length} SECURITY DEFINER function(s) in public — check each is not callable by anon: ${secdef
          .map((f) => f.proname)
          .join(", ")}`
      );
    }

    // 5. Storage buckets must stay private; a public bucket serves every file to
    //    anyone holding the path, with no cookie involved.
    const buckets = await sql<{ id: string; public: boolean }[]>`
      select id, public from storage.buckets order by id
    `;
    const publicBuckets = buckets.filter((b) => b.public);
    if (publicBuckets.length) {
      problems.push(`Public storage bucket(s): ${publicBuckets.map((b) => b.id).join(", ")}`);
    }

    const tables = await sql<{ n: number }[]>`
      select count(*)::int as n from pg_tables where schemaname = 'public'
    `;

    console.log(`Checked ${tables[0]?.n ?? 0} tables, ${buckets.length} storage bucket(s).`);
    if (problems.length === 0) {
      console.log("✅ The public browser key cannot reach the database.");
      await sql.end({ timeout: 5 });
      process.exit(0);
    }
    console.error("\n❌ Problems found:\n");
    for (const p of problems) console.error("  • " + p);
    console.error("\nFix: see drizzle/0139_lock_public_schema.sql and 0140_lock_public_routines.sql.\n");
    await sql.end({ timeout: 5 });
    process.exit(1);
  } catch (err) {
    await sql.end({ timeout: 5 }).catch(() => {});
    console.error("Check could not run:", (err as Error).message);
    process.exit(1);
  }
}

main();

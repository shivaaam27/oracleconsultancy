import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/db";

/* ------------------------------------------------------------------ *
 * "Am I safe?" — in plain language, checked live, in whichever environment is
 * actually running.
 *
 * WHY THIS EXISTS. Two of the most important protections in COS are Vercel
 * environment variables, and until now the only way to know whether they were
 * set in PRODUCTION was to log into Vercel and look. A console.warn on a
 * serverless instance nobody reads is not a warning. So the app reports on
 * itself, on the Settings → Security & Access screen.
 *
 * Everything here READS. Nothing changes a setting.
 * ------------------------------------------------------------------ */

export type SecurityCheck = {
  id: string;
  label: string;
  state: "ok" | "warn" | "unknown";
  /** One line, no jargon. */
  detail: string;
  /** What to do about it, when it isn't ok. */
  fix?: string;
};

/** Is the database closed to the public browser key? This is the check behind
 *  migration 0139 — the same one `npm run db:check-security` runs, asked live so
 *  it reflects production rather than whatever was true on someone's laptop. */
async function databaseLock(): Promise<SecurityCheck> {
  try {
    const rows = await db.execute<{ open_tables: number; granted: number; public_buckets: number }>(sql`
      select
        (select count(*)::int from pg_class c
           join pg_namespace n on n.oid = c.relnamespace
          where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity) as open_tables,
        (select count(distinct table_name)::int from information_schema.role_table_grants
          where table_schema = 'public' and grantee in ('anon','authenticated')) as granted,
        (select count(*)::int from storage.buckets where public) as public_buckets
    `);
    const r = (rows as unknown as Array<{ open_tables: number; granted: number; public_buckets: number }>)[0];
    if (!r) throw new Error("no rows");
    const problems: string[] = [];
    if (r.open_tables > 0) problems.push(`${r.open_tables} table(s) unprotected`);
    if (r.granted > 0) problems.push(`${r.granted} table(s) open to the public key`);
    if (r.public_buckets > 0) problems.push(`${r.public_buckets} public file store(s)`);
    return problems.length
      ? {
          id: "db-lock",
          label: "Database",
          state: "warn",
          detail: problems.join(", ") + ".",
          fix: "Run npm run db:check-security for the list, then apply drizzle/0139_lock_public_schema.sql.",
        }
      : {
          id: "db-lock",
          label: "Database",
          state: "ok",
          detail: "Closed. The key inside the web page cannot read or change anything.",
        };
  } catch {
    return {
      id: "db-lock",
      label: "Database",
      state: "unknown",
      detail: "Could not check just now.",
    };
  }
}

export async function getSecurityStatus(): Promise<SecurityCheck[]> {
  const checks: SecurityCheck[] = [await databaseLock()];

  // The key that signs every sign-in cookie. Without it, cookies are signed with
  // something derived from DATABASE_URL — a secret that travels far more widely,
  // and anyone holding it could mint an owner session.
  checks.push(
    process.env.PORTAL_SESSION_SECRET
      ? {
          id: "cookie-key",
          label: "Sign-in cookies",
          state: "ok",
          detail: "Signed with their own dedicated key.",
        }
      : {
          id: "cookie-key",
          label: "Sign-in cookies",
          state: "warn",
          detail: "No dedicated signing key — falling back to one derived from the database address.",
          fix: "Add PORTAL_SESSION_SECRET (a long random string) in Vercel, then redeploy.",
        }
  );

  // Sentry is wired throughout the app but inert without a DSN, which means a
  // crash — or a break-in attempt — leaves no trace anyone will see.
  const sentry = process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN;
  checks.push(
    sentry
      ? { id: "sentry", label: "Error alerts", state: "ok", detail: "Crashes are being reported." }
      : {
          id: "sentry",
          label: "Error alerts",
          state: "warn",
          detail: "Crashes go unrecorded.",
          fix: "Add SENTRY_DSN and NEXT_PUBLIC_SENTRY_DSN in Vercel, then redeploy.",
        }
  );

  // The CSP ships report-only first so a missed origin cannot white-screen the
  // app. Report-only is the intended state for the first week — not a fault.
  checks.push(
    process.env.CSP_ENFORCE === "1"
      ? {
          id: "csp",
          label: "Content rules",
          state: "ok",
          detail: "Enforced. The browser will refuse anything the site did not ask for.",
        }
      : {
          id: "csp",
          label: "Content rules",
          state: "warn",
          detail: "Watching only — breaches are recorded but not blocked.",
          fix: "Once system_events shows no real csp.violation rows, set CSP_ENFORCE=1 in Vercel and redeploy.",
        }
  );

  return checks;
}

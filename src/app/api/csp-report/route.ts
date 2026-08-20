import { NextRequest, NextResponse } from "next/server";
import { sb } from "@/db/supabase";

/* ------------------------------------------------------------------ *
 * Where the browser posts Content-Security-Policy violations.
 *
 * The policy in next.config.ts starts in REPORT-ONLY: nothing is blocked, but
 * every would-be block is reported here. Read them in the activity feed or
 * straight from `system_events` (kind = "csp.violation"). When a week goes by
 * with nothing real, set CSP_ENFORCE=1 in Vercel and redeploy.
 *
 * ⚠️ THIS ROUTE IS PUBLIC AND MUST STAY PUBLIC. A CSP report is sent by the
 * browser WITHOUT cookies, so behind the admin gate every report would be
 * redirected to /login and silently lost — hence `api/csp-report` in the
 * exclusion list in src/proxy.ts.
 *
 * Being public, it is also floodable, so it defends itself rather than trusting
 * the caller:
 *   • one row per distinct (directive, blocked origin) per hour, not per event;
 *   • a hard ceiling of rows per hour per instance;
 *   • the body is read with a size cap and never echoed back.
 * It always answers 204 — an error here must never become a console message on
 * a page that is otherwise working.
 * ------------------------------------------------------------------ */

export const runtime = "nodejs";

const MAX_BODY_BYTES = 16 * 1024;
const WINDOW_MS = 60 * 60 * 1000;
const MAX_ROWS_PER_WINDOW = 40;

/** In-memory, per instance — same trade-off as login-throttle.ts. Good enough:
 *  the worst case is a few duplicate rows from different lambdas, not a flood. */
const seen = new Map<string, number>();
let windowStart = 0;
let rowsThisWindow = 0;

function shouldRecord(key: string): boolean {
  const now = Date.now();
  if (now - windowStart > WINDOW_MS) {
    windowStart = now;
    rowsThisWindow = 0;
    seen.clear();
  }
  if (rowsThisWindow >= MAX_ROWS_PER_WINDOW) return false;
  if (seen.has(key)) return false;
  seen.set(key, now);
  rowsThisWindow += 1;
  return true;
}

/** Both report shapes: the old `application/csp-report` ({"csp-report": {...}})
 *  and the Reporting-API `application/reports+json` ([{ body: {...} }]). */
type Violation = {
  documentUri?: string;
  directive?: string;
  blockedUri?: string;
  originalPolicy?: string;
};

function parse(raw: unknown): Violation[] {
  const out: Violation[] = [];
  const push = (r: Record<string, unknown> | undefined) => {
    if (!r) return;
    out.push({
      documentUri: (r["document-uri"] ?? r.documentURL ?? r.documentURI) as string | undefined,
      directive: (r["effective-directive"] ?? r["violated-directive"] ?? r.effectiveDirective) as
        | string
        | undefined,
      blockedUri: (r["blocked-uri"] ?? r.blockedURL ?? r.blockedURI) as string | undefined,
      originalPolicy: undefined, // deliberately dropped: it is long and we already know it
    });
  };
  if (Array.isArray(raw)) {
    for (const item of raw.slice(0, 20)) {
      const r = item as Record<string, unknown>;
      push((r.body as Record<string, unknown>) ?? r);
    }
  } else if (raw && typeof raw === "object") {
    const r = raw as Record<string, unknown>;
    push((r["csp-report"] as Record<string, unknown>) ?? r);
  }
  return out;
}

/** Just the origin of a blocked URL — the path is noise and can carry ids. */
function origin(uri: string | undefined): string {
  if (!uri) return "unknown";
  if (!uri.startsWith("http")) return uri; // "inline", "eval", "data", …
  try {
    return new URL(uri).origin;
  } catch {
    return "unknown";
  }
}

/** The page, with anything secret taken out. A report must never record a
 *  credential, and two kinds of URL here carry one:
 *    • the query string (dropped entirely), and
 *    • the PATH of the public link routes — /e/<token> and /r/<token> put the
 *      HMAC token in the path itself, so those are collapsed to their prefix. */
const TOKEN_IN_PATH = /^\/(e|r)\//;

function safePath(uri: string | undefined): string {
  if (!uri) return "unknown";
  try {
    const p = new URL(uri).pathname;
    return TOKEN_IN_PATH.test(p) ? p.slice(0, 3) + "…" : p;
  } catch {
    return "unknown";
  }
}

export async function POST(req: NextRequest) {
  try {
    const text = await req.text();
    if (!text || text.length > MAX_BODY_BYTES) return new NextResponse(null, { status: 204 });

    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      return new NextResponse(null, { status: 204 });
    }

    for (const v of parse(body)) {
      const directive = (v.directive ?? "unknown").split(" ")[0];
      const blocked = origin(v.blockedUri);
      if (!shouldRecord(`${directive}|${blocked}`)) continue;
      await sb.from("system_events").insert({
        kind: "csp.violation",
        status: "error",
        details: JSON.stringify({ directive, blocked, page: safePath(v.documentUri) }),
        created_at: new Date().toISOString(),
      });
    }
  } catch {
    // Never surface anything: a failure to LOG must not become a page error.
  }
  return new NextResponse(null, { status: 204 });
}

/** A stray GET (someone opening the URL) gets nothing useful. */
export async function GET() {
  return new NextResponse(null, { status: 204 });
}

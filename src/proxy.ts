import { NextRequest, NextResponse } from "next/server";

/* ------------------------------------------------------------------ *
 * Admin gate. Every request except the staff portal, the /login page,
 * and static assets must carry a valid "cos_admin" cookie (set by
 * src/lib/admin-auth.ts — same secret derivation, same token format
 * "admin.<expiryMs>.<hmac>"). Runs at the edge, so the signature is
 * checked with WebCrypto; no database access here.
 * ------------------------------------------------------------------ */

function secret(): string {
  return (
    process.env.PORTAL_SESSION_SECRET ||
    "cos-portal:" + (process.env.DATABASE_URL || "dev-secret")
  );
}

function b64url(bytes: ArrayBuffer): string {
  let s = "";
  for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// Session length must match src/lib/admin-auth.ts (SESSION_DAYS = 60).
const SESSION_DAYS = 60;
// Re-stamp the cookie once it's past the halfway mark, so an actively-used
// session slides forward and never hits the hard expiry.
const REFRESH_AFTER_MS = (SESSION_DAYS / 2) * 24 * 60 * 60 * 1000;

async function signAdmin(payload: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret()), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, enc.encode(payload));
  return b64url(mac);
}

/* Current session generation, fetched from the settings table via the
 * Supabase REST API (edge runtime — no DB driver here) and cached for a
 * minute. Changing the owner password bumps the generation, so cookies on
 * other devices stop working within ~60 seconds. Fail-open to the cached/
 * default value: an outage must not lock the owner out. */
let cachedGen: { value: string; at: number } | null = null;
const GEN_TTL_MS = 60 * 1000;

async function currentSessionGen(force = false): Promise<string | null> {
  if (!force && cachedGen && Date.now() - cachedGen.at < GEN_TTL_MS) return cachedGen.value;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  // Can't reach the generation store (edge env vars missing) — return null so the
  // caller fails OPEN (trusts the valid signature) rather than locking the owner out.
  if (!url || !key) return cachedGen?.value ?? null;
  try {
    const res = await fetch(
      `${url}/rest/v1/settings?key=eq.v2.adminSessionGen&select=value`,
      { headers: { apikey: key, authorization: `Bearer ${key}` } }
    );
    if (res.ok) {
      const rows = (await res.json()) as Array<{ value: string }>;
      const value = rows[0]?.value ?? "1";
      cachedGen = { value, at: Date.now() };
      return value;
    }
  } catch {
    // Network hiccup — fall through to the cached value (or null = fail open).
  }
  return cachedGen?.value ?? null;
}

async function isValidAdminToken(token: string | undefined): Promise<boolean> {
  if (!token) return false;
  const [tag, gen, exp, sig] = token.split(".");
  if (tag !== "admin" || !gen || !exp || !sig) return false;
  if (!(Number(exp) > Date.now())) return false;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const mac = await crypto.subtle.sign("HMAC", key, enc.encode(`${tag}.${gen}.${exp}`));
  if (b64url(mac) !== sig) return false;
  const cur = await currentSessionGen();
  if (cur === null) return true; // generation store unreachable — trust the valid signature (fail open)
  if (gen === cur) return true;
  // Mismatch can mean a stale cache right after a password change (the new cookie
  // carries a NEWER generation than the cached one). Re-check fresh once; genuinely
  // old cookies still fail, but an unreachable store still fails open.
  const fresh = await currentSessionGen(true);
  return fresh === null ? true : gen === fresh;
}

/* Staff-portal sliding refresh. The portal is NOT behind the admin gate — its
 * pages verify the "cos_portal" cookie themselves (src/lib/portal-auth.ts). But
 * unlike the admin cookie (re-stamped below), the portal cookie was only set once
 * at login and never refreshed, so an installed PWA's session could go stale and
 * get evicted between launches — staff were silently logged out on resume. Here
 * we re-issue a VALID cos_portal cookie with a fresh 60-day window on every portal
 * navigation (crypto-only at the edge — no DB). The password-hash fingerprint is
 * preserved, so a password change still invalidates the cookie in getPortalPerson;
 * we NEVER redirect (the portal pages own their own auth). */
async function refreshPortalSession(req: NextRequest): Promise<NextResponse> {
  const res = NextResponse.next();
  const token = req.cookies.get("cos_portal")?.value;
  if (!token) return res;
  const segs = token.split(".");
  // Bound token: <id>.<exp>.<fp>.<sig>; legacy token: <id>.<exp>.<sig>.
  let id: string, exp: string, fp: string | null, sig: string;
  if (segs.length === 4) [id, exp, fp, sig] = segs;
  else if (segs.length === 3) { [id, exp, sig] = segs; fp = null; }
  else return res;
  if (!id || !exp || !sig || !(Number(exp) > Date.now())) return res;

  const maxAgePortal = SESSION_DAYS * 24 * 60 * 60;
  const cookieOpts = {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: maxAgePortal,
    // Explicit Expires so an installed PWA persists it across an app-kill (a
    // Max-Age-only cookie can be treated as a session cookie and dropped).
    expires: new Date(Date.now() + maxAgePortal * 1000),
  };

  const payload = fp === null ? `${id}.${exp}` : `${id}.${exp}.${fp}`;
  // Same HMAC + secret() as src/lib/portal-auth.ts. When this edge runtime shares
  // that secret we can VERIFY the cookie and slide its INTERNAL expiry forward, so
  // an actively-used session never hits the 60-day hard wall.
  if ((await signAdmin(payload)) === sig) {
    const newExp = Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000;
    const newPayload = fp === null ? `${id}.${newExp}` : `${id}.${newExp}.${fp}`;
    res.cookies.set("cos_portal", `${newPayload}.${await signAdmin(newPayload)}`, cookieOpts);
    return res;
  }

  // The edge secret differs from the one that SIGNED this cookie (e.g.
  // PORTAL_SESSION_SECRET is exposed to Node but not to the edge runtime, so the
  // login-time Node signature can't be reproduced here). We must NOT re-sign — but
  // we MUST still re-issue the cookie with a fresh max-age. Otherwise the portal
  // cookie is the ONLY one never refreshed (the admin cookie IS re-stamped above
  // because its authority check lives at the edge and is self-consistent), so an
  // installed iOS PWA evicts the portal cookie between launches and the
  // staff/director gets bounced to the login screen. Re-setting the SAME value
  // never corrupts anything — getPortalPerson (Node, real secret) still validates
  // it — it only extends the browser's eviction window.
  res.cookies.set("cos_portal", token, cookieOpts);
  return res;
}

export async function proxy(req: NextRequest) {
  // Portal routes carry their own auth — never gate them; just slide the session
  // forward so an installed PWA stays signed in across launches.
  if (req.nextUrl.pathname.startsWith("/portal")) return refreshPortalSession(req);

  const token = req.cookies.get("cos_admin")?.value;
  const ok = await isValidAdminToken(token);
  if (ok) {
    const res = NextResponse.next();
    // Sliding expiry: if this valid session is over halfway to expiry, re-issue
    // it with a fresh window so a regular user is never logged out mid-use.
    // Best-effort — any hiccup just leaves the existing cookie untouched.
    try {
      const [tag, gen, exp] = (token as string).split(".");
      const remaining = Number(exp) - Date.now();
      if (tag === "admin" && gen && remaining > 0 && remaining < REFRESH_AFTER_MS) {
        const newExp = Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000;
        const payload = `admin.${gen}.${newExp}`;
        const fresh = `${payload}.${await signAdmin(payload)}`;
        const maxAgeAdmin = SESSION_DAYS * 24 * 60 * 60;
        res.cookies.set("cos_admin", fresh, {
          httpOnly: true,
          sameSite: "lax",
          secure: process.env.NODE_ENV === "production",
          path: "/",
          maxAge: maxAgeAdmin,
          expires: new Date(Date.now() + maxAgeAdmin * 1000),
        });
      }
    } catch {
      /* leave the cookie as-is */
    }
    return res;
  }
  // No valid ADMIN session. A signed-in STAFF member (has a cos_portal cookie)
  // landing on an admin route is almost always the installed app reopening at its
  // start_url "/" — there's ONE install for both surfaces and the root manifest
  // opens "/", which staff can't access. Send them to THEIR portal instead of the
  // admin login (the portal validates the cookie itself; a bogus cookie just falls
  // through to /portal/login). This — not cookie eviction — was the "logout".
  const url = req.nextUrl.clone();
  url.search = "";
  url.pathname = req.cookies.get("cos_portal")?.value ? "/portal" : "/login";
  return NextResponse.redirect(url);
}

export const config = {
  // Everything EXCEPT: the staff portal, the admin login page, Next.js
  // internals, and static files (anything with a dot: sw.js, manifest.json,
  // icons, fonts). The portal has its own lock in src/lib/portal-auth.ts.
  // api/portal is excluded too: those routes serve portal users and verify
  // the portal (or admin) cookie themselves. api/wa-card is public (Twilio fetches
  // the link-preview image unauthenticated) but carries its own HMAC signature gate.
  // r/ is the public per-person reminder link — WhatsApp's crawler reads its
  // Open-Graph card and real visitors land on it; it carries the SAME HMAC gate as
  // api/wa-card (verifyWaCardToken), so it must NOT be behind the admin cookie.
  // NOTE: /portal is intentionally NOT excluded — the proxy runs on portal routes
  // ONLY to slide the cos_portal session forward (refreshPortalSession); it never
  // gates them. api/portal stays excluded (those routes verify their own cookie).
  // api/mcp is excluded because an AI assistant carries a Bearer key, never a
  // browser cookie: inside the gate every MCP request is redirected to /login and
  // no assistant can connect at all. It authenticates itself in lib/mcp/auth.ts.
  // mcp/connect (the OAuth consent screen, stage 3) is excluded for the same
  // reason from the other side: whoever arrives there is BY DEFINITION not signed
  // in to this browser yet — that is the entire point of the page. It does its own
  // password check before it grants anything.
  // api/desktop is excluded because the Windows app asks "am I out of date?"
  // BEFORE anyone signs in — it has no cookie, so inside the gate every check
  // would be answered with a redirect to /login and the app would never learn it
  // was stale. It returns a version number and nothing else.
  // api/csp-report is excluded because a browser posts a Content-Security-Policy
  // violation WITHOUT cookies: inside the gate every report would be redirected
  // to /login and lost. It is public by necessity and rate-limits itself.
  matcher: ["/((?!login|e/|r/|mcp/connect|api/cron|api/calendar|api/portal|api/mcp|api/notifications|api/push|api/wa-card|api/og-banner|api/csp-report|api/desktop|_next|.*\\..*).*)"],
};

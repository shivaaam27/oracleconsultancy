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

/* Current session generation, fetched from the settings table via the
 * Supabase REST API (edge runtime — no DB driver here) and cached for a
 * minute. Changing the owner password bumps the generation, so cookies on
 * other devices stop working within ~60 seconds. Fail-open to the cached/
 * default value: an outage must not lock the owner out. */
let cachedGen: { value: string; at: number } | null = null;
const GEN_TTL_MS = 60 * 1000;

async function currentSessionGen(force = false): Promise<string> {
  if (!force && cachedGen && Date.now() - cachedGen.at < GEN_TTL_MS) return cachedGen.value;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  let value = cachedGen?.value ?? "1";
  if (url && key) {
    try {
      const res = await fetch(
        `${url}/rest/v1/settings?key=eq.v2.adminSessionGen&select=value`,
        { headers: { apikey: key, authorization: `Bearer ${key}` } }
      );
      if (res.ok) {
        const rows = (await res.json()) as Array<{ value: string }>;
        value = rows[0]?.value ?? "1";
      }
    } catch {
      // Network hiccup: keep the previous value.
    }
  }
  cachedGen = { value, at: Date.now() };
  return value;
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
  if (gen === (await currentSessionGen())) return true;
  // Mismatch can mean a stale cache right after a password change (the new
  // cookie carries a NEWER generation than the cached one). Re-check fresh
  // once; genuinely old cookies still fail.
  return gen === (await currentSessionGen(true));
}

export async function middleware(req: NextRequest) {
  const ok = await isValidAdminToken(req.cookies.get("cos_admin")?.value);
  if (ok) return NextResponse.next();
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  // Everything EXCEPT: the staff portal, the admin login page, Next.js
  // internals, and static files (anything with a dot: sw.js, manifest.json,
  // icons, fonts). The portal has its own lock in src/lib/portal-auth.ts.
  // api/portal is excluded too: those routes serve portal users and verify
  // the portal (or admin) cookie themselves.
  matcher: ["/((?!portal|login|e/|api/calendar|api/portal|api/notifications|api/push|_next|.*\\..*).*)"],
};

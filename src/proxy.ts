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

export async function proxy(req: NextRequest) {
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
        res.cookies.set("cos_admin", fresh, {
          httpOnly: true,
          sameSite: "lax",
          secure: process.env.NODE_ENV === "production",
          path: "/",
          maxAge: SESSION_DAYS * 24 * 60 * 60,
        });
      }
    } catch {
      /* leave the cookie as-is */
    }
    return res;
  }
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
  // the portal (or admin) cookie themselves. api/wa-card is public (Twilio fetches
  // the link-preview image unauthenticated) but carries its own HMAC signature gate.
  // r/ is the public per-person reminder link — WhatsApp's crawler reads its
  // Open-Graph card and real visitors land on it; it carries the SAME HMAC gate as
  // api/wa-card (verifyWaCardToken), so it must NOT be behind the admin cookie.
  // api/dropbox/webhook is public (Dropbox's servers call it with no cookie) — it
  // verifies its own X-Dropbox-Signature instead. The auth/callback Dropbox routes
  // stay gated (the owner's browser hits them with the admin cookie).
  matcher: ["/((?!portal|login|e/|r/|api/cron|api/calendar|api/portal|api/notifications|api/push|api/wa-card|api/og-banner|api/dropbox/webhook|_next|.*\\..*).*)"],
};

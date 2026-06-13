import "server-only";
import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { sb } from "@/db/supabase";
import { hashPassword, verifyPassword } from "./portal-auth";

/* ------------------------------------------------------------------ *
 * Owner (admin) sign-in.
 *
 * One password for the whole admin side, set on first visit to /login
 * and stored hashed in the settings table under "v2.adminPasswordHash".
 * A successful login sets the signed HttpOnly cookie "cos_admin" =
 * "admin.<expiryMs>.<hmac>". The edge middleware (src/middleware.ts)
 * verifies the signature on every admin request — it must use the SAME
 * secret derivation as secret() below.
 * ------------------------------------------------------------------ */

const COOKIE_NAME = "cos_admin";
const SESSION_DAYS = 60;
const SETTINGS_KEY = "v2.adminPasswordHash";
// Session generation: embedded in every token and bumped when the password
// changes, so older cookies on other devices stop working (~1 minute, see
// the cache in src/middleware.ts).
const GEN_KEY = "v2.adminSessionGen";

function secret(): string {
  // Keep identical to src/middleware.ts and portal-auth.ts.
  return (
    process.env.PORTAL_SESSION_SECRET ||
    "cos-portal:" + (process.env.DATABASE_URL || "dev-secret")
  );
}

export async function getAdminHash(): Promise<string | null> {
  const { data, error } = await sb
    .from("settings")
    .select("value")
    .eq("key", SETTINGS_KEY)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data?.value as string | null) ?? null;
}

export async function getAdminSessionGen(): Promise<string> {
  const { data } = await sb.from("settings").select("value").eq("key", GEN_KEY).maybeSingle();
  return (data?.value as string | null) ?? "1";
}

/** Bump the generation — every admin cookie issued before this stops working. */
export async function bumpAdminSessionGen(): Promise<void> {
  const current = Number(await getAdminSessionGen()) || 1;
  const { error } = await sb
    .from("settings")
    .upsert({ key: GEN_KEY, value: String(current + 1) }, { onConflict: "key" });
  if (error) throw new Error(error.message);
}

const OWNER_NAME_KEY = "v2.ownerName";
const OWNER_EMAIL_KEY = "v2.ownerEmail";

/** The configured owner identity (shown/edited in Settings). Either may be null. */
export async function getOwnerIdentity(): Promise<{ name: string | null; email: string | null }> {
  const { data } = await sb.from("settings").select("key,value").in("key", [OWNER_NAME_KEY, OWNER_EMAIL_KEY]);
  const map = new Map((data ?? []).map((r) => [r.key as string, (r.value as string | null) ?? ""]));
  const norm = (v: string | undefined) => (v && v.trim() ? v.trim() : null);
  return { name: norm(map.get(OWNER_NAME_KEY)), email: norm(map.get(OWNER_EMAIL_KEY)) };
}

export async function setOwnerIdentity(name: string | null, email: string | null): Promise<void> {
  const rows = [
    { key: OWNER_NAME_KEY, value: name ?? "" },
    { key: OWNER_EMAIL_KEY, value: email ?? "" },
  ];
  const { error } = await sb.from("settings").upsert(rows, { onConflict: "key" });
  if (error) throw new Error(error.message);
}

/** Does a submitted identifier match the configured owner name/email?
 *  When no owner identity is set yet, accept anything (so no one is locked out). */
export async function ownerIdentifierMatches(identifier: string): Promise<boolean> {
  const { name, email } = await getOwnerIdentity();
  if (!name && !email) return true; // not configured
  const id = identifier.trim().toLowerCase();
  if (!id) return false;
  return (!!email && id === email.toLowerCase()) || (!!name && id === name.toLowerCase());
}

export async function setAdminPassword(password: string): Promise<void> {
  const { error } = await sb
    .from("settings")
    .upsert({ key: SETTINGS_KEY, value: hashPassword(password) }, { onConflict: "key" });
  if (error) throw new Error(error.message);
}

export async function verifyAdminPassword(password: string): Promise<boolean> {
  const hash = await getAdminHash();
  return hash !== null && verifyPassword(password, hash);
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

export async function setAdminCookie() {
  const exp = Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000;
  const gen = await getAdminSessionGen();
  const payload = `admin.${gen}.${exp}`;
  const jar = await cookies();
  jar.set(COOKIE_NAME, `${payload}.${sign(payload)}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
}

export async function clearAdminCookie() {
  const jar = await cookies();
  jar.set(COOKIE_NAME, "", { httpOnly: true, path: "/", maxAge: 0 });
}

/** Node-side check (used by /login to skip the form when already in). */
export async function isAdminSession(): Promise<boolean> {
  const jar = await cookies();
  const token = jar.get(COOKIE_NAME)?.value;
  if (!token) return false;
  const [tag, gen, exp, sig] = token.split(".");
  if (tag !== "admin" || !gen || !exp || !sig) return false;
  const good = sign(`${tag}.${gen}.${exp}`);
  const a = Buffer.from(sig);
  const b = Buffer.from(good);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return false;
  if (!(Number(exp) > Date.now())) return false;
  return gen === (await getAdminSessionGen());
}

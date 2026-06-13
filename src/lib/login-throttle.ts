import "server-only";
import { headers } from "next/headers";

/* ------------------------------------------------------------------ *
 * Lightweight brute-force guard for the sign-in forms (audit 0.4).
 *
 * In-memory, per server instance — so it resets on a cold start and is NOT a
 * hard cross-instance lockout. But it meaningfully slows automated password
 * guessing against a warm instance, on top of the deliberately-slow scrypt
 * hashing, with zero infrastructure. For a hard guarantee shared across all
 * serverless instances, back this with a shared store (e.g. Upstash/Redis or a
 * small DB table) later.
 * ------------------------------------------------------------------ */

type Bucket = { fails: number; firstAt: number; lockedUntil: number };
const buckets = new Map<string, Bucket>();

const WINDOW_MS = 15 * 60 * 1000; // failures roll off after 15 min of calm
const MAX_FAILS = 6; // lock after this many failures within the window
const LOCK_MS = 5 * 60 * 1000; // how long a lock lasts

/** Best-effort caller IP (Vercel sets x-forwarded-for). Falls back to a constant
 *  so the guard still works per-instance when no IP header is present. */
export async function callerIp(): Promise<string> {
  const h = await headers();
  const fwd = h.get("x-forwarded-for");
  return fwd?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
}

export function loginLockState(key: string): { locked: boolean; retryAfterSec: number } {
  const b = buckets.get(key);
  if (b && b.lockedUntil > Date.now()) {
    return { locked: true, retryAfterSec: Math.ceil((b.lockedUntil - Date.now()) / 1000) };
  }
  return { locked: false, retryAfterSec: 0 };
}

export function recordLoginFailure(key: string): void {
  const now = Date.now();
  let b = buckets.get(key);
  if (!b || now - b.firstAt > WINDOW_MS) b = { fails: 0, firstAt: now, lockedUntil: 0 };
  b.fails += 1;
  if (b.fails >= MAX_FAILS) b.lockedUntil = now + LOCK_MS;
  buckets.set(key, b);
  // Bound memory if someone hammers many distinct identifiers.
  if (buckets.size > 5000) {
    for (const [k, v] of buckets) {
      if (v.lockedUntil < now && now - v.firstAt > WINDOW_MS) buckets.delete(k);
    }
  }
}

export function recordLoginSuccess(key: string): void {
  buckets.delete(key);
}

/** Friendly, plain-language "wait a moment" message for a locked key. */
export function lockMessage(retryAfterSec: number): string {
  const mins = Math.max(1, Math.ceil(retryAfterSec / 60));
  return `Too many sign-in attempts. Please wait about ${mins} minute${mins > 1 ? "s" : ""} and try again.`;
}

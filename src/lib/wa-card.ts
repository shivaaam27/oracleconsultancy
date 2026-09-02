// Signed, unauthenticated link-preview / WhatsApp summary image for one person.
//
// The image (rendered by /api/wa-card) shows only AGGREGATE counts (open · overdue)
// + a first name — never task detail. Even so the URL is public (Twilio fetches it
// over HTTPS for MediaUrl), so we sign the personId with an HMAC to stop casual
// enumeration of "who has how many overdue tasks".
//
// Server-only (uses node:crypto + env secret).
import { createHmac, timingSafeEqual } from "crypto";
import { appBaseUrl } from "./app-url";

function secret(): string {
  // Same derivation as admin-auth/portal-auth/proxy.
  return (
    process.env.PORTAL_SESSION_SECRET ||
    "cos-portal:" + (process.env.DATABASE_URL || "dev-secret")
  );
}

function token(personId: number): string {
  return createHmac("sha256", secret()).update(`wa-card:${personId}`).digest("base64url");
}

/** Truncated token for the URL — keeps links short while staying signed.
 *  ~10 chars of base64url ≈ 60 bits, ample to stop casual enumeration. */
function shortToken(personId: number): string {
  return token(personId).slice(0, 10);
}

/** Timing-safe equality for two strings of the same length. */
function safeEqual(expected: string, sig: string): boolean {
  const a = Buffer.from(expected);
  const b = Buffer.from(sig || "");
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Accept EITHER the full HMAC token (back-compat with already-sent links) OR the
 *  10-char short token. Each is compared against the matching-length expected value. */
export function verifyWaCardToken(personId: number, sig: string): boolean {
  const full = token(personId);
  if ((sig || "").length === full.length) return safeEqual(full, sig);
  return safeEqual(shortToken(personId), sig);
}

/** A clean, length-clamped "from" label for the preview image / landing card.
 *  It's display-only (carried unsigned on the URL), so we sanitise it. */
export function sanitizeFrom(s: string | null | undefined): string | undefined {
  if (!s) return undefined;
  const t = s.replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim();
  if (!t) return undefined;
  return t.length > 48 ? `${t.slice(0, 47).trimEnd()}…` : t;
}

/** Build the "from who" label from a sender's name + role/office.
 *  Director/Manager show the person's name; admin/owner = the Administrator. */
export function waFromLabel(opts: { name?: string | null; role?: string | null }): string {
  const role = (opts.role ?? "").toLowerCase();
  const name = (opts.name ?? "").trim();
  if (role === "director") return name ? `${name} · Director` : "the Director's Office";
  if (role === "manager") return name ? `${name} · Manager` : "the Manager's Office";
  return name ? `${name} · Administrator` : "the Administrator";
}

/** Absolute, signed image URL for a person — safe to hand to Twilio's MediaUrl.
 *  Optional `from` adds the "from who" caption (display-only). */
export function waCardImageUrl(personId: number, from?: string): string {
  const sig = token(personId);
  const f = from ? `&from=${encodeURIComponent(from)}` : "";
  return `${appBaseUrl()}/api/wa-card?p=${personId}&t=${encodeURIComponent(sig)}${f}`;
}

/**
 * Signed, human-friendly reminder link for one person. Crawlers (WhatsApp's link
 * preview) read its Open-Graph tags — the Aurora summary image + that person's live
 * open/overdue counts + top-3 overdue — while real visitors are redirected on to the
 * staff portal. Put this LAST in a WhatsApp message so WhatsApp builds its preview
 * card from it. See src/app/r/[p]/[t]/page.tsx.
 *
 * Uses the SHORT token to keep the link tiny; the "from" label now lives in the
 * message text (a sign-off line), not the URL — so no query string. The `from`
 * parameter is retained for callers but intentionally unused here.
 */
export function waReminderLink(personId: number, _from?: string): string {
  return `${appBaseUrl()}/r/${personId}/${shortToken(personId)}`;
}

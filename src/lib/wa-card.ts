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

export function verifyWaCardToken(personId: number, sig: string): boolean {
  const expected = token(personId);
  const a = Buffer.from(expected);
  const b = Buffer.from(sig || "");
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Absolute, signed image URL for a person — safe to hand to Twilio's MediaUrl. */
export function waCardImageUrl(personId: number): string {
  const sig = token(personId);
  return `${appBaseUrl()}/api/wa-card?p=${personId}&t=${encodeURIComponent(sig)}`;
}

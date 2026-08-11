// Who is asking? — identity for the MCP endpoint (/api/mcp).
//
// An assistant presents `Authorization: Bearer <key>`; this resolves that key to
// a caller, or to nothing. The caller shape is deliberately the SAME shape the
// staff portal uses (`PortalPerson`), so every scope helper in portal-auth.ts and
// every capability in portal-permissions.ts works here unchanged. See
// memory/mcp_plan.md — "do NOT build a permission system, reuse the one that
// exists" is the load-bearing decision of this whole feature.
//
// Server-only.

import { createHash, randomBytes, timingSafeEqual } from "crypto";
import { sb } from "@/db/supabase";
import { portalPersonById, type PortalPerson } from "@/lib/portal-auth";

/** The owner (command centre): no person row, sees and does everything. */
export type OwnerCaller = { kind: "owner"; label: string; keyId: number };
/** A staff member: reach is whatever their portal role allows, nothing more. */
export type PersonCaller = { kind: "person"; label: string; keyId: number; person: PortalPerson };
export type McpCaller = OwnerCaller | PersonCaller;

/** Display name for audit stamps — writes are recorded as `mcp:<name>`. */
export function callerName(caller: McpCaller): string {
  return caller.kind === "owner" ? "Owner" : caller.person.name;
}

/** The `createdBy` stamp for anything this caller changes. Matches the existing
 *  convention alongside "web-ui", "ai-command" and "portal:<Name>". */
export function callerStamp(caller: McpCaller): string {
  return `mcp:${callerName(caller)}`;
}

/* ------------------------------ minting ------------------------------ */

/** A new key: 32 bytes of random, url-safe. Shown to the owner exactly once. */
export function generateKey(): string {
  return `cos_mcp_${randomBytes(32).toString("base64url")}`;
}

/**
 * SHA-256, unsalted — and that is correct here, unlike for a password.
 *
 * A key is 32 bytes of randomness, so there is no dictionary to run against it;
 * the reason to salt a password (identical passwords hashing alike, cheap
 * guessing) doesn't apply. Unsalted also means a presented key can be found by
 * ONE indexed lookup. Salted scrypt would force reading every key row and
 * hashing against each on every single request.
 */
export function hashKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

/* ------------------------------ resolving ------------------------------ */

/**
 * Resolve a presented key to its caller, or null.
 *
 * Returns null for: no key, unknown key, revoked key, or a key whose person has
 * since been archived or had their portal access withdrawn. Never throws — a
 * lookup failure is an unauthenticated request, not a server error.
 */
export async function resolveCaller(rawKey: string | undefined | null): Promise<McpCaller | null> {
  const key = (rawKey ?? "").trim();
  if (!key) return null;

  try {
    const presented = hashKey(key);
    const { data } = await sb
      .from("mcp_keys")
      .select("id,label,person_id,revoked_at,key_hash")
      .eq("key_hash", presented)
      .maybeSingle();
    if (!data || data.revoked_at) return null;

    // The lookup already matched on hash, so this only guards against a
    // pathological non-unique match; constant-time keeps the comparison honest.
    const stored = Buffer.from((data.key_hash as string) ?? "", "hex");
    const actual = Buffer.from(presented, "hex");
    if (stored.length !== actual.length || !timingSafeEqual(stored, actual)) return null;

    const keyId = data.id as number;
    const label = (data.label as string) ?? "key";
    void touch(keyId);

    const personId = data.person_id as number | null;
    if (personId == null) return { kind: "owner", label, keyId };

    // A staff key is only as good as that person's CURRENT portal standing —
    // archive someone, or revoke their portal access, and their key dies with it.
    const person = await portalPersonById(personId);
    if (!person) return null;
    return { kind: "person", label, keyId, person };
  } catch {
    return null;
  }
}

/** Stamp last-used so a forgotten key is visible in Settings. Fire-and-forget. */
async function touch(keyId: number): Promise<void> {
  try {
    await sb.from("mcp_keys").update({ last_used_at: new Date().toISOString() }).eq("id", keyId);
  } catch { /* never fail a request over a bookkeeping write */ }
}

/** Pull the bearer token out of an incoming request. */
export function bearerFrom(req: Request): string | undefined {
  const header = req.headers.get("authorization") ?? "";
  const m = /^Bearer\s+(.+)$/i.exec(header.trim());
  return m ? m[1].trim() : undefined;
}

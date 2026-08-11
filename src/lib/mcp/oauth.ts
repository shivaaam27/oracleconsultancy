// MCP stage 3 — the authorization server behind Claude's "Connect" button.
//
// WHY THIS EXISTS. Stages 1–2 authenticate with a secret key in a header. That is
// genuinely secure and works well in Claude Code, but claude.ai and the phone app
// expect a real sign-in and will not reliably carry a hand-configured header. So
// this file issues tokens the standard way, and `mcp_keys` stays for the laptop
// and for the unattended jobs in stage 4.
//
// WHAT IT IMPLEMENTS (MCP authorization spec, revision 2026-07-28):
//   • OAuth 2.1 authorization-code flow, PKCE REQUIRED (S256 only — `plain` is
//     refused outright rather than accepted and warned about).
//   • RFC 8414 authorization-server metadata; RFC 9728 protected-resource metadata
//     (the latter comes from mcp-handler).
//   • RFC 8707 resource indicators — a token is bound to the audience it was
//     requested for, and the endpoint refuses a token minted for anything else.
//   • RFC 9207 — the `iss` parameter on authorization responses.
//   • RFC 7591 dynamic client registration. NOTE: the current spec DEPRECATES DCR
//     in favour of Client ID Metadata Documents, but keeps it "for backwards
//     compatibility"; today's clients still use it, so both are accepted.
//
// NOTHING IS STORED IN THE CLEAR. Codes and tokens are hashed exactly like an
// `mcp_keys` row — a database dump yields nobody a working credential.
//
// Server-only.

import { createHash, randomBytes, timingSafeEqual } from "crypto";
import { sb } from "@/db/supabase";

/* --------------------------------------------------------------- *
 * Lifetimes
 * --------------------------------------------------------------- */

/** A code is exchanged within seconds; a minute is generous. */
const CODE_TTL_MS = 60 * 1000;
/** Short-lived by design: a stolen access token expires on its own. */
export const ACCESS_TTL_MS = 60 * 60 * 1000; // 1 hour
/** The refresh token is the long-lived one, and the one Settings revokes. */
const REFRESH_TTL_MS = 90 * 24 * 60 * 60 * 1000; // 90 days

/** The scopes this server understands. Deliberately coarse: the REAL permission
 *  decision is the caller's portal capabilities, not an OAuth scope string. */
export const SUPPORTED_SCOPES = ["cos.read", "cos.write"] as const;
export const DEFAULT_SCOPE = "cos.read cos.write";

/* --------------------------------------------------------------- *
 * Hashing — same reasoning as lib/mcp/auth.ts
 * --------------------------------------------------------------- */

/** SHA-256, unsalted. These are 32+ bytes of randomness, so there is no
 *  dictionary to run and one indexed lookup finds the row. */
export function hashSecret(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function randomToken(prefix: string): string {
  return `${prefix}_${randomBytes(32).toString("base64url")}`;
}

/** Constant-time compare of two hex digests. */
function sameHash(a: string, b: string): boolean {
  const x = Buffer.from(a, "hex");
  const y = Buffer.from(b, "hex");
  return x.length === y.length && timingSafeEqual(x, y);
}

/* --------------------------------------------------------------- *
 * PKCE
 * --------------------------------------------------------------- */

/**
 * Verify a PKCE code_verifier against the stored challenge.
 *
 * S256 ONLY. The spec allows `plain` in principle; accepting it would mean a
 * challenge that protects nothing, so an unknown or downgraded method fails.
 */
export function verifyPkce(verifier: string, challenge: string, method: string): boolean {
  if (method !== "S256") return false;
  if (!verifier || verifier.length < 43 || verifier.length > 128) return false;
  const computed = createHash("sha256").update(verifier).digest("base64url");
  // Both sides are base64url of a 32-byte digest, so lengths match when genuine.
  const a = Buffer.from(computed);
  const b = Buffer.from(challenge);
  return a.length === b.length && timingSafeEqual(a, b);
}

/* --------------------------------------------------------------- *
 * Issuer / canonical resource
 * --------------------------------------------------------------- */

/** This deployment's public origin, e.g. https://oracleconsultancy.vercel.app.
 *  Derived from the request so it is right in production, in preview and on
 *  localhost without configuration. */
export function originOf(req: Request): string {
  const forwardedHost = req.headers.get("x-forwarded-host");
  const forwardedProto = req.headers.get("x-forwarded-proto");
  if (forwardedHost) return `${forwardedProto || "https"}://${forwardedHost}`;
  return new URL(req.url).origin;
}

/** The canonical URI of this MCP server — the audience a token is bound to
 *  (RFC 8707). No trailing slash, no fragment, per the spec's guidance. */
export function canonicalResource(req: Request): string {
  return `${originOf(req)}/api/mcp`;
}

/**
 * Is the `resource` a client asked for actually us?
 *
 * The spec requires the server to reject tokens minted for a different audience.
 * We compare against our own canonical URI, tolerating a trailing slash and a
 * bare-origin form, because clients differ in how specific they are.
 */
export function resourceMatches(requested: string | null | undefined, req: Request): boolean {
  if (!requested) return true; // absent is allowed; we bind it to ourselves
  const want = canonicalResource(req).toLowerCase();
  const origin = originOf(req).toLowerCase();
  const got = requested.trim().toLowerCase().replace(/\/+$/, "");
  return got === want || got === origin;
}

/* --------------------------------------------------------------- *
 * Clients
 * --------------------------------------------------------------- */

export type OauthClient = {
  clientId: string;
  clientName: string;
  redirectUris: string[];
  clientSecretHash: string | null;
};

/**
 * Register a client (RFC 7591).
 *
 * Open registration is what the spec expects and what makes "Add a connector"
 * work without the owner configuring anything. It is NOT a security hole: a
 * registered client can do nothing at all until a human signs in on the consent
 * screen and approves it. Registration buys you the right to ask.
 */
export async function registerClient(input: {
  clientName: string;
  redirectUris: string[];
  grantTypes?: string[];
  scope?: string | null;
  /** Confidential clients get a secret; public ones (the MCP norm) do not. */
  wantsSecret?: boolean;
}): Promise<{ client: OauthClient; clientSecret: string | null }> {
  const clientId = randomToken("cos_client");
  const clientSecret = input.wantsSecret ? randomToken("cos_secret") : null;

  const { error } = await sb.from("mcp_oauth_clients").insert({
    client_id: clientId,
    client_secret_hash: clientSecret ? hashSecret(clientSecret) : null,
    client_name: input.clientName.slice(0, 200),
    redirect_uris: JSON.stringify(input.redirectUris),
    grant_types: JSON.stringify(input.grantTypes ?? ["authorization_code", "refresh_token"]),
    scope: input.scope ?? DEFAULT_SCOPE,
    source: "dcr",
    created_at: new Date().toISOString(),
  });
  if (error) throw new Error(error.message);

  return {
    client: {
      clientId,
      clientName: input.clientName,
      redirectUris: input.redirectUris,
      clientSecretHash: clientSecret ? hashSecret(clientSecret) : null,
    },
    clientSecret,
  };
}

export async function getClient(clientId: string): Promise<OauthClient | null> {
  if (!clientId) return null;
  const { data } = await sb
    .from("mcp_oauth_clients")
    .select("client_id,client_name,redirect_uris,client_secret_hash")
    .eq("client_id", clientId)
    .maybeSingle();
  if (!data) return null;
  let redirectUris: string[] = [];
  try {
    const parsed = JSON.parse((data.redirect_uris as string) ?? "[]");
    if (Array.isArray(parsed)) redirectUris = parsed.filter((u) => typeof u === "string");
  } catch { /* a malformed row simply has no valid redirect */ }
  return {
    clientId: data.client_id as string,
    clientName: (data.client_name as string) ?? "An assistant",
    redirectUris,
    clientSecretHash: (data.client_secret_hash as string | null) ?? null,
  };
}

/**
 * Exact-match the redirect URI.
 *
 * No prefix matching, no wildcards, no "starts with". Loose redirect matching is
 * the classic way authorization codes get delivered to an attacker, and the spec
 * requires exact comparison.
 */
export function redirectAllowed(client: OauthClient, redirectUri: string): boolean {
  return client.redirectUris.includes(redirectUri);
}

/* --------------------------------------------------------------- *
 * Authorization codes
 * --------------------------------------------------------------- */

/** Mint a one-time code for an approval that has just happened. */
export async function issueCode(input: {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  codeChallengeMethod: string;
  scope: string;
  resource: string | null;
  /** null = the owner */
  personId: number | null;
}): Promise<string> {
  const code = randomToken("cos_code");
  const now = new Date();
  const { error } = await sb.from("mcp_oauth_codes").insert({
    code_hash: hashSecret(code),
    client_id: input.clientId,
    redirect_uri: input.redirectUri,
    code_challenge: input.codeChallenge,
    code_challenge_method: input.codeChallengeMethod,
    scope: input.scope,
    resource: input.resource,
    person_id: input.personId,
    expires_at: new Date(now.getTime() + CODE_TTL_MS).toISOString(),
    created_at: now.toISOString(),
  });
  if (error) throw new Error(error.message);
  return code;
}

export type StoredCode = {
  id: number;
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  codeChallengeMethod: string;
  scope: string;
  resource: string | null;
  personId: number | null;
};

/**
 * Take a code once, and only once.
 *
 * Consumption is a conditional update (`.is("consumed_at", null)`) so two
 * simultaneous exchanges cannot both succeed — replaying a stolen code loses the
 * race and gets nothing.
 */
export async function consumeCode(code: string): Promise<StoredCode | null> {
  const hash = hashSecret(code);
  const { data } = await sb
    .from("mcp_oauth_codes")
    .select("id,client_id,redirect_uri,code_challenge,code_challenge_method,scope,resource,person_id,expires_at,consumed_at,code_hash")
    .eq("code_hash", hash)
    .maybeSingle();
  if (!data) return null;
  if (data.consumed_at) return null;
  if (new Date(data.expires_at as string).getTime() < Date.now()) return null;
  if (!sameHash(data.code_hash as string, hash)) return null;

  const { data: claimed } = await sb
    .from("mcp_oauth_codes")
    .update({ consumed_at: new Date().toISOString() })
    .eq("id", data.id as number)
    .is("consumed_at", null)
    .select("id");
  if (!claimed || claimed.length === 0) return null; // someone else got there first

  return {
    id: data.id as number,
    clientId: data.client_id as string,
    redirectUri: data.redirect_uri as string,
    codeChallenge: data.code_challenge as string,
    codeChallengeMethod: (data.code_challenge_method as string) ?? "S256",
    scope: (data.scope as string) ?? DEFAULT_SCOPE,
    resource: (data.resource as string | null) ?? null,
    personId: (data.person_id as number | null) ?? null,
  };
}

/* --------------------------------------------------------------- *
 * Tokens
 * --------------------------------------------------------------- */

export type IssuedTokens = {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  scope: string;
};

export async function issueTokens(input: {
  clientId: string;
  label: string;
  personId: number | null;
  scope: string;
  resource: string | null;
  /** Rotating a refresh token? Revoke the old row in the same breath. */
  replacesTokenId?: number;
}): Promise<IssuedTokens> {
  const accessToken = randomToken("cos_at");
  const refreshToken = randomToken("cos_rt");
  const now = new Date();

  const { error } = await sb.from("mcp_oauth_tokens").insert({
    access_hash: hashSecret(accessToken),
    refresh_hash: hashSecret(refreshToken),
    client_id: input.clientId,
    label: input.label.slice(0, 120),
    person_id: input.personId,
    scope: input.scope,
    resource: input.resource,
    expires_at: new Date(now.getTime() + ACCESS_TTL_MS).toISOString(),
    refresh_expires_at: new Date(now.getTime() + REFRESH_TTL_MS).toISOString(),
    created_at: now.toISOString(),
  });
  if (error) throw new Error(error.message);

  if (input.replacesTokenId != null) {
    await sb
      .from("mcp_oauth_tokens")
      .update({ revoked_at: now.toISOString() })
      .eq("id", input.replacesTokenId);
  }

  return {
    accessToken,
    refreshToken,
    expiresIn: Math.floor(ACCESS_TTL_MS / 1000),
    scope: input.scope,
  };
}

export type ResolvedToken = {
  tokenId: number;
  clientId: string;
  personId: number | null;
  scope: string;
  resource: string | null;
};

/**
 * Resolve a presented access token, or null.
 *
 * Null for: unknown, expired, or revoked. Revocation is instant precisely
 * because this is checked on every single request rather than cached.
 */
export async function resolveAccessToken(token: string): Promise<ResolvedToken | null> {
  const t = (token ?? "").trim();
  if (!t) return null;
  try {
    const hash = hashSecret(t);
    const { data } = await sb
      .from("mcp_oauth_tokens")
      .select("id,client_id,person_id,scope,resource,expires_at,revoked_at,access_hash")
      .eq("access_hash", hash)
      .maybeSingle();
    if (!data || data.revoked_at) return null;
    if (new Date(data.expires_at as string).getTime() < Date.now()) return null;
    if (!sameHash(data.access_hash as string, hash)) return null;

    void touchToken(data.id as number);
    return {
      tokenId: data.id as number,
      clientId: data.client_id as string,
      personId: (data.person_id as number | null) ?? null,
      scope: (data.scope as string) ?? DEFAULT_SCOPE,
      resource: (data.resource as string | null) ?? null,
    };
  } catch {
    return null;
  }
}

/** Exchange a refresh token for a new pair. The old row is revoked as part of the
 *  swap (rotation), so a leaked refresh token is good for one use at most. */
export async function rotateRefreshToken(
  refreshToken: string,
  clientId: string,
): Promise<{ tokens: IssuedTokens; personId: number | null } | { error: string }> {
  const hash = hashSecret(refreshToken ?? "");
  const { data } = await sb
    .from("mcp_oauth_tokens")
    .select("id,client_id,label,person_id,scope,resource,refresh_expires_at,revoked_at,refresh_hash")
    .eq("refresh_hash", hash)
    .maybeSingle();
  if (!data || data.revoked_at) return { error: "invalid_grant" };
  if (!sameHash((data.refresh_hash as string) ?? "", hash)) return { error: "invalid_grant" };
  if (data.client_id !== clientId) return { error: "invalid_grant" };
  const refreshExpiry = data.refresh_expires_at as string | null;
  if (refreshExpiry && new Date(refreshExpiry).getTime() < Date.now()) return { error: "invalid_grant" };

  const personId = (data.person_id as number | null) ?? null;
  const tokens = await issueTokens({
    clientId,
    label: (data.label as string) ?? "Claude",
    personId,
    scope: (data.scope as string) ?? DEFAULT_SCOPE,
    resource: (data.resource as string | null) ?? null,
    replacesTokenId: data.id as number,
  });
  return { tokens, personId };
}

/** Revoke by access OR refresh token (RFC 7009 takes either). */
export async function revokeByToken(token: string): Promise<void> {
  const hash = hashSecret(token ?? "");
  const now = new Date().toISOString();
  await sb.from("mcp_oauth_tokens").update({ revoked_at: now }).eq("access_hash", hash).is("revoked_at", null);
  await sb.from("mcp_oauth_tokens").update({ revoked_at: now }).eq("refresh_hash", hash).is("revoked_at", null);
}

/** Stamp last-used so a forgotten connection is visible in Settings. */
async function touchToken(id: number): Promise<void> {
  try {
    await sb.from("mcp_oauth_tokens").update({ last_used_at: new Date().toISOString() }).eq("id", id);
  } catch { /* never fail a request over bookkeeping */ }
}

/* --------------------------------------------------------------- *
 * Metadata documents
 * --------------------------------------------------------------- */

/** RFC 8414 authorization-server metadata, served at
 *  /.well-known/oauth-authorization-server. */
export function authorizationServerMetadata(req: Request): Record<string, unknown> {
  const issuer = originOf(req);
  return {
    issuer,
    authorization_endpoint: `${issuer}/mcp/connect`,
    token_endpoint: `${issuer}/api/mcp/oauth/token`,
    registration_endpoint: `${issuer}/api/mcp/oauth/register`,
    revocation_endpoint: `${issuer}/api/mcp/oauth/revoke`,
    scopes_supported: [...SUPPORTED_SCOPES],
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    // S256 only — see verifyPkce.
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none", "client_secret_post"],
    // RFC 9207: we DO return `iss` on authorization responses, so we must say so.
    authorization_response_iss_parameter_supported: true,
    resource_indicators_supported: true,
  };
}

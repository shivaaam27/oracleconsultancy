// The token endpoint — POST /api/mcp/oauth/token.
//
// Two grants: `authorization_code` (first connection) and `refresh_token` (every
// hour after that). Both return a fresh pair; refresh tokens ROTATE, so a leaked
// one is good for a single use before it is revoked.
//
// The checks here are the ones that matter, and none of them is optional:
//   • the code must not have been used (single-use, race-safe)
//   • PKCE must verify (S256), proving the exchanger is who started the flow
//   • the redirect_uri must equal the one the code was issued for
//   • the client_id must equal the one the code was issued to
//   • the `resource` must be this server (RFC 8707 audience binding)

import { NextResponse } from "next/server";
import {
  consumeCode, getClient, hashSecret, issueTokens, rotateRefreshToken,
  verifyPkce, resourceMatches, canonicalResource,
} from "@/lib/mcp/oauth";
import { recordEvent } from "@/lib/system-events";

export const dynamic = "force-dynamic";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function fail(error: string, description?: string, status = 400): Response {
  return NextResponse.json(
    { error, ...(description ? { error_description: description } : {}) },
    { status, headers: { ...CORS, "Cache-Control": "no-store" } },
  );
}

/** The token endpoint takes form-encoded parameters, not JSON. */
async function params(req: Request): Promise<URLSearchParams> {
  const text = await req.text();
  return new URLSearchParams(text);
}

export async function POST(req: Request): Promise<Response> {
  const p = await params(req);
  const grantType = p.get("grant_type") ?? "";
  const clientId = p.get("client_id") ?? "";

  const client = await getClient(clientId);
  if (!client) return fail("invalid_client", "Unknown client.", 401);

  // A confidential client must prove itself; a public one has nothing to prove.
  if (client.clientSecretHash) {
    const presented = p.get("client_secret") ?? "";
    if (!presented || hashSecret(presented) !== client.clientSecretHash) {
      return fail("invalid_client", "Bad client credentials.", 401);
    }
  }

  /* ---------------- authorization_code ---------------- */
  if (grantType === "authorization_code") {
    const code = p.get("code") ?? "";
    const redirectUri = p.get("redirect_uri") ?? "";
    const verifier = p.get("code_verifier") ?? "";
    if (!code) return fail("invalid_request", "Missing code.");
    if (!verifier) return fail("invalid_request", "Missing code_verifier — PKCE is required.");

    const stored = await consumeCode(code);
    if (!stored) return fail("invalid_grant", "That code is unknown, expired or already used.");
    if (stored.clientId !== clientId) return fail("invalid_grant", "That code was issued to another client.");
    if (stored.redirectUri !== redirectUri) return fail("invalid_grant", "redirect_uri does not match the one the code was issued for.");
    if (!verifyPkce(verifier, stored.codeChallenge, stored.codeChallengeMethod)) {
      return fail("invalid_grant", "PKCE verification failed.");
    }
    // The token is bound to the audience it was requested for, and we refuse to
    // mint one for anybody else's server.
    const requested = p.get("resource") ?? stored.resource;
    if (!resourceMatches(requested, req)) return fail("invalid_target", "That resource isn't this server.");

    const tokens = await issueTokens({
      clientId,
      label: client.clientName,
      personId: stored.personId,
      scope: stored.scope,
      resource: canonicalResource(req),
    });
    await recordEvent("mcp.oauth.token", "ok", { client: client.clientName, grant: "authorization_code" });

    return NextResponse.json(
      {
        access_token: tokens.accessToken,
        token_type: "Bearer",
        expires_in: tokens.expiresIn,
        refresh_token: tokens.refreshToken,
        scope: tokens.scope,
      },
      { headers: { ...CORS, "Cache-Control": "no-store" } },
    );
  }

  /* ---------------- refresh_token ---------------- */
  if (grantType === "refresh_token") {
    const refresh = p.get("refresh_token") ?? "";
    if (!refresh) return fail("invalid_request", "Missing refresh_token.");
    const rotated = await rotateRefreshToken(refresh, clientId);
    if ("error" in rotated) return fail(rotated.error, "That refresh token is no longer valid — connect again.");

    return NextResponse.json(
      {
        access_token: rotated.tokens.accessToken,
        token_type: "Bearer",
        expires_in: rotated.tokens.expiresIn,
        refresh_token: rotated.tokens.refreshToken,
        scope: rotated.tokens.scope,
      },
      { headers: { ...CORS, "Cache-Control": "no-store" } },
    );
  }

  return fail("unsupported_grant_type", `This server does authorization_code and refresh_token.`);
}

export async function OPTIONS(): Promise<Response> {
  return new Response(null, { status: 204, headers: CORS });
}

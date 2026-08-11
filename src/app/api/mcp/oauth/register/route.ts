// Dynamic client registration (RFC 7591) — POST /api/mcp/oauth/register.
//
// This is how Claude introduces itself without the owner hand-configuring a
// client id. Registration is OPEN, which looks alarming and isn't: a registered
// client can do precisely nothing until a human signs in on /mcp/connect and
// presses Approve. Registering buys the right to ASK.
//
// ⚠️ The 2026-07-28 spec DEPRECATES this in favour of Client ID Metadata
// Documents, while keeping it "for backwards compatibility with authorization
// servers that do not support" CIMD. Real clients still use it today, so it is
// implemented; when CIMD is the norm, add that path and keep this one.

import { NextResponse } from "next/server";
import { registerClient } from "@/lib/mcp/oauth";
import { recordEvent } from "@/lib/system-events";

export const dynamic = "force-dynamic";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

/** Only https callbacks, plus the loopback addresses a desktop client uses.
 *  Anything else — a custom scheme, a bare http host — is refused: a redirect
 *  URI is where an authorization code gets delivered, so it is not the place to
 *  be accommodating. */
function acceptableRedirect(uri: string): boolean {
  try {
    const u = new URL(uri);
    if (u.protocol === "https:") return true;
    if (u.protocol === "http:" && (u.hostname === "localhost" || u.hostname === "127.0.0.1" || u.hostname === "[::1]")) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

export async function POST(req: Request): Promise<Response> {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "invalid_client_metadata", error_description: "Body must be JSON." }, { status: 400, headers: CORS });
  }

  const rawUris = Array.isArray(body.redirect_uris) ? body.redirect_uris : [];
  const redirectUris = rawUris.map((u) => String(u)).filter(acceptableRedirect);
  if (redirectUris.length === 0) {
    return NextResponse.json(
      { error: "invalid_redirect_uri", error_description: "Give at least one https (or loopback) redirect_uri." },
      { status: 400, headers: CORS },
    );
  }
  if (redirectUris.length > 10) {
    return NextResponse.json({ error: "invalid_redirect_uri", error_description: "Too many redirect URIs." }, { status: 400, headers: CORS });
  }

  const clientName = String(body.client_name ?? "").trim() || "An AI assistant";
  const grantTypes = Array.isArray(body.grant_types)
    ? body.grant_types.map((g) => String(g)).filter((g) => g === "authorization_code" || g === "refresh_token")
    : ["authorization_code", "refresh_token"];
  // MCP clients are public clients: they run on a device and cannot keep a
  // secret. Only mint one if the client explicitly asks to authenticate with it.
  const wantsSecret = String(body.token_endpoint_auth_method ?? "none") !== "none";

  try {
    const { client, clientSecret } = await registerClient({
      clientName,
      redirectUris,
      grantTypes: grantTypes.length ? grantTypes : ["authorization_code", "refresh_token"],
      scope: typeof body.scope === "string" ? body.scope : null,
      wantsSecret,
    });

    await recordEvent("mcp.oauth.register", "ok", { client: clientName });

    return NextResponse.json(
      {
        client_id: client.clientId,
        ...(clientSecret ? { client_secret: clientSecret } : {}),
        client_name: client.clientName,
        redirect_uris: client.redirectUris,
        grant_types: grantTypes,
        token_endpoint_auth_method: wantsSecret ? "client_secret_post" : "none",
        // 0 = does not expire, per RFC 7591.
        client_id_issued_at: Math.floor(Date.now() / 1000),
        ...(clientSecret ? { client_secret_expires_at: 0 } : {}),
      },
      { status: 201, headers: CORS },
    );
  } catch (e) {
    await recordEvent("mcp.oauth.register", "error", { message: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "invalid_client_metadata" }, { status: 400, headers: CORS });
  }
}

export async function OPTIONS(): Promise<Response> {
  return new Response(null, { status: 204, headers: CORS });
}

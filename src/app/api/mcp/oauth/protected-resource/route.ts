// RFC 9728 protected-resource metadata — the document the 401 challenge points
// at, and the first thing a client reads when it discovers this server.
//
// Served at /.well-known/oauth-protected-resource (and at that path with the
// resource's own path appended, which RFC 9728 also allows) via rewrites in
// next.config.ts. See the sibling authorization-server route for why these are
// two files rather than one endpoint with a query parameter.
//
// The shape comes from mcp-handler's generator rather than being hand-written, so
// it tracks the spec through the package instead of through this file's memory.

import { NextResponse } from "next/server";
import { generateProtectedResourceMetadata } from "mcp-handler";
import { canonicalResource, originOf, SUPPORTED_SCOPES } from "@/lib/mcp/oauth";

export const dynamic = "force-dynamic";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, MCP-Protocol-Version",
};

export async function GET(req: Request): Promise<Response> {
  // We are our own authorization server, so the issuer advertised here is simply
  // this deployment's origin.
  const metadata = generateProtectedResourceMetadata({
    authServerUrls: [originOf(req)],
    resourceUrl: canonicalResource(req),
    additionalMetadata: {
      scopes_supported: [...SUPPORTED_SCOPES],
      resource_name: "Oracle Consultancy COS",
    },
  });
  return NextResponse.json(metadata, { headers: CORS });
}

export async function OPTIONS(): Promise<Response> {
  return new Response(null, { status: 204, headers: CORS });
}

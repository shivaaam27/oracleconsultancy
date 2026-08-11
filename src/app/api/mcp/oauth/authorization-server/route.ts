// RFC 8414 authorization-server metadata.
//
// Served at /.well-known/oauth-authorization-server via a rewrite in
// next.config.ts (the document must sit at the domain root, and a route folder
// starting with a dot isn't something to depend on the App Router serving).
//
// ⚠️ This is a route of its own rather than one endpoint switching on a query
// parameter. That WAS the first shape, and it silently served this document at
// BOTH well-known paths: a rewrite does not carry the destination's query string
// through to the handler, so the discriminator was always absent and the code
// fell through to its default. Two paths, two files, nothing to get wrong.
//
// PUBLIC and unauthenticated by design — a client must read this before it holds
// any credential. It contains URLs and capabilities, no secrets.

import { NextResponse } from "next/server";
import { authorizationServerMetadata } from "@/lib/mcp/oauth";

export const dynamic = "force-dynamic";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, MCP-Protocol-Version",
};

export async function GET(req: Request): Promise<Response> {
  return NextResponse.json(authorizationServerMetadata(req), { headers: CORS });
}

export async function OPTIONS(): Promise<Response> {
  return new Response(null, { status: 204, headers: CORS });
}

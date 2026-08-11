// Token revocation (RFC 7009) — POST /api/mcp/oauth/revoke.
//
// The client's own way of saying "I'm done with this". The owner's way is the
// Settings card, which revokes the same rows.
//
// Per the RFC this ALWAYS answers 200, even for a token that was never valid:
// telling a caller "that token doesn't exist" would turn this endpoint into a
// way of testing whether a stolen string is real.

import { NextResponse } from "next/server";
import { revokeByToken } from "@/lib/mcp/oauth";

export const dynamic = "force-dynamic";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function POST(req: Request): Promise<Response> {
  try {
    const p = new URLSearchParams(await req.text());
    const token = p.get("token") ?? "";
    if (token) await revokeByToken(token);
  } catch { /* still a 200 — see above */ }
  return new Response(null, { status: 200, headers: { ...CORS, "Cache-Control": "no-store" } });
}

export async function OPTIONS(): Promise<Response> {
  return new Response(null, { status: 204, headers: CORS });
}

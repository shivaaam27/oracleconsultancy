import { NextRequest, NextResponse } from "next/server";
import { exchangeCode, DROPBOX_REDIRECT_PATH } from "@/lib/dropbox";

export const dynamic = "force-dynamic";

// Dropbox redirects here with ?code after the owner approves. Exchange it for a
// durable refresh token, then return to Settings.
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const err = req.nextUrl.searchParams.get("error");
  if (err || !code) {
    return NextResponse.redirect(new URL("/settings?dropbox=denied", req.url));
  }
  const redirectUri = new URL(DROPBOX_REDIRECT_PATH, req.url).toString();
  const res = await exchangeCode(code, redirectUri);
  return NextResponse.redirect(new URL(`/settings?dropbox=${res.ok ? "connected" : "error"}#dropbox`, req.url));
}

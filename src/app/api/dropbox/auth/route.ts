import { NextRequest, NextResponse } from "next/server";
import { authorizeUrl, dropboxConfigured, DROPBOX_REDIRECT_PATH } from "@/lib/dropbox";

export const dynamic = "force-dynamic";

// Start the Dropbox consent flow. Owner clicks "Connect" in Settings → here →
// Dropbox → /api/dropbox/callback. (This route is behind the admin edge gate.)
export async function GET(req: NextRequest) {
  if (!dropboxConfigured()) {
    return NextResponse.redirect(new URL("/settings?dropbox=notconfigured", req.url));
  }
  const redirectUri = new URL(DROPBOX_REDIRECT_PATH, req.url).toString();
  return NextResponse.redirect(authorizeUrl(redirectUri));
}

import { NextResponse } from "next/server";
import { google } from "googleapis";
import { oauthClient, saveGoogleConnection, isGoogleConfigured } from "@/lib/google";

// Google redirects here after consent. We exchange the code for tokens, read the
// connected account's email, store the refresh token, and bounce back to Settings.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const origin = url.origin;
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");

  if (!isGoogleConfigured())
    return NextResponse.redirect(`${origin}/settings?google=unconfigured`);
  if (error) return NextResponse.redirect(`${origin}/settings?google=denied`);
  if (!code) return NextResponse.redirect(`${origin}/settings?google=denied`);

  try {
    const client = oauthClient(origin);
    const { tokens } = await client.getToken(code);
    if (!tokens.refresh_token) {
      // No refresh token (already-granted without prompt=consent). Surface it.
      return NextResponse.redirect(`${origin}/settings?google=norefresh`);
    }
    client.setCredentials(tokens);

    let email: string | null = null;
    try {
      const oauth2 = google.oauth2({ version: "v2", auth: client });
      const me = await oauth2.userinfo.get();
      email = me.data.email ?? null;
    } catch {
      // Email is cosmetic; ignore if the userinfo scope/call fails.
    }

    await saveGoogleConnection(tokens.refresh_token, email);
    return NextResponse.redirect(`${origin}/settings?google=connected`);
  } catch {
    return NextResponse.redirect(`${origin}/settings?google=error`);
  }
}

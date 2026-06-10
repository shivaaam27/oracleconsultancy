import { NextResponse } from "next/server";
import { isGoogleConfigured, buildAuthUrl } from "@/lib/google";

// Kicks off the Google consent flow. Redirects the operator to Google to grant
// Calendar access; Google returns to /api/google/callback with a code.
export async function GET(req: Request) {
  if (!isGoogleConfigured()) {
    return NextResponse.json(
      { error: "Google is not configured (missing GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET)." },
      { status: 503 }
    );
  }
  const origin = new URL(req.url).origin;
  return NextResponse.redirect(buildAuthUrl(origin));
}

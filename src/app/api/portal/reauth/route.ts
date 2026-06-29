import { NextRequest, NextResponse } from "next/server";
import { setSessionCookie, verifyRememberToken } from "@/lib/portal-auth";
import { recordEvent } from "@/lib/system-events";

export const dynamic = "force-dynamic";

/** Silent re-auth: the login page POSTs a localStorage remember token here on
 *  launch; if valid we re-mint the portal session cookie so an installed PWA that
 *  lost its cookie (app swiped from recents) signs back in without a password. */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const token = typeof body?.token === "string" ? body.token : undefined;
  const personId = await verifyRememberToken(token);
  // DIAGNOSTIC (temporary): did the login page have a durable token, and was it
  // valid? Tells us if localStorage survived the app-kill and whether re-auth ran.
  await recordEvent("portal.reauth", personId ? "ok" : "error", {
    hadToken: !!token,
    valid: !!personId,
  });
  if (!personId) return NextResponse.json({ ok: false }, { status: 401 });
  await setSessionCookie(personId);
  return NextResponse.json({ ok: true });
}

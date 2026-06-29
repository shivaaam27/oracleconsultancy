import { NextRequest, NextResponse } from "next/server";
import { setSessionCookie, verifyRememberToken } from "@/lib/portal-auth";

export const dynamic = "force-dynamic";

/** Silent re-auth: the login page POSTs a localStorage remember token here on
 *  launch; if valid we re-mint the portal session cookie so an installed PWA that
 *  lost its cookie (app swiped from recents) signs back in without a password. */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const token = typeof body?.token === "string" ? body.token : undefined;
  const personId = await verifyRememberToken(token);
  if (!personId) return NextResponse.json({ ok: false }, { status: 401 });
  await setSessionCookie(personId);
  return NextResponse.json({ ok: true });
}

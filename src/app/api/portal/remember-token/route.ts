import { NextResponse } from "next/server";
import { sb } from "@/db/supabase";
import { getPortalPerson, makeRememberToken } from "@/lib/portal-auth";

export const dynamic = "force-dynamic";

/** Hand the signed-in portal user a durable remember token to cache in
 *  localStorage. Used to silently re-mint the session cookie after an installed
 *  PWA drops it on app-kill. Authed by the current (valid) portal cookie. */
export async function GET() {
  const me = await getPortalPerson();
  if (!me) return NextResponse.json({ ok: false }, { status: 401 });
  const { data } = await sb.from("people").select("portal_password_hash").eq("id", me.id).maybeSingle();
  const hash = (data?.portal_password_hash as string | null) ?? "";
  if (!hash) return NextResponse.json({ ok: false }, { status: 401 });
  return NextResponse.json({ ok: true, token: makeRememberToken(me.id, hash) });
}

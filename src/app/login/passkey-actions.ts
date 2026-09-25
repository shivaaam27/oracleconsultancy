"use server";

import type { AuthenticationResponseJSON } from "@simplewebauthn/server";
import { beginAuthentication, finishAuthentication } from "@/lib/auth/webauthn";
import { setAdminCookie } from "@/lib/auth/admin-auth";
import { setSessionCookie } from "@/lib/portal/portal-auth";
import { sb } from "@/db/supabase";

/** Step 1: discoverable sign-in options for the browser. */
export async function startPasskeyLogin() {
  return await beginAuthentication();
}

/** Step 2: verify the assertion and sign the right person in. */
export async function completePasskeyLogin(response: AuthenticationResponseJSON): Promise<{ ok: boolean; error?: string; redirect?: string }> {
  const res = await finishAuthentication(response);
  if (!res.ok) return { ok: false, error: res.error };
  if (res.personId == null) { await setAdminCookie(); return { ok: true, redirect: "/" }; }
  await setSessionCookie(res.personId);
  // A director lands on the shared Home, never the old portal frame.
  const { data } = await sb.from("people").select("portal_role").eq("id", res.personId).maybeSingle();
  return { ok: true, redirect: data?.portal_role === "director" || data?.portal_role === "manager" ? "/" : "/portal" };
}

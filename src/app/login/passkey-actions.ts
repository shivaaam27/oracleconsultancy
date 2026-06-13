"use server";

import type { AuthenticationResponseJSON } from "@simplewebauthn/server";
import { beginAuthentication, finishAuthentication } from "@/lib/webauthn";
import { setAdminCookie } from "@/lib/admin-auth";
import { setSessionCookie } from "@/lib/portal-auth";

/** Step 1: discoverable sign-in options for the browser. */
export async function startPasskeyLogin() {
  return await beginAuthentication();
}

/** Step 2: verify the assertion and sign the right person in. */
export async function completePasskeyLogin(response: AuthenticationResponseJSON): Promise<{ ok: boolean; error?: string; redirect?: string }> {
  const res = await finishAuthentication(response);
  if (!res.ok) return { ok: false, error: res.error };
  if (res.personId == null) { await setAdminCookie(); return { ok: true, redirect: "/" }; }
  await setSessionCookie(res.personId); return { ok: true, redirect: "/portal" };
}

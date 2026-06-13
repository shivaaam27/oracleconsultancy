"use server";

import { revalidatePath } from "next/cache";
import type { RegistrationResponseJSON } from "@simplewebauthn/server";
import { getPortalPerson } from "@/lib/portal-auth";
import { beginRegistration, finishRegistration, deleteCredential } from "@/lib/webauthn";

export async function staffBeginPasskey() {
  const me = await getPortalPerson();
  if (!me) throw new Error("Not signed in.");
  return await beginRegistration({ kind: "person", id: me.id, name: me.name });
}

export async function staffFinishPasskey(response: RegistrationResponseJSON, label: string | null): Promise<{ ok: boolean; error?: string }> {
  const me = await getPortalPerson();
  if (!me) return { ok: false, error: "Not signed in." };
  const res = await finishRegistration({ kind: "person", id: me.id, name: me.name }, response, label);
  if (res.ok) revalidatePath("/portal/profile");
  return res;
}

export async function staffRemovePasskey(id: number): Promise<{ ok: boolean; error?: string }> {
  const me = await getPortalPerson();
  if (!me) return { ok: false, error: "Not signed in." };
  await deleteCredential(id, { kind: "person", id: me.id, name: me.name });
  revalidatePath("/portal/profile");
  return { ok: true };
}

"use server";

import { revalidatePath } from "next/cache";
import type { RegistrationResponseJSON } from "@simplewebauthn/server";
import { isAdminSession } from "@/lib/admin-auth";
import { beginRegistration, finishRegistration, deleteCredential } from "@/lib/webauthn";

export async function adminBeginPasskey() {
  if (!(await isAdminSession())) throw new Error("Not signed in.");
  return await beginRegistration({ kind: "admin" });
}

export async function adminFinishPasskey(response: RegistrationResponseJSON, label: string | null): Promise<{ ok: boolean; error?: string }> {
  if (!(await isAdminSession())) return { ok: false, error: "Not signed in." };
  const res = await finishRegistration({ kind: "admin" }, response, label);
  if (res.ok) revalidatePath("/settings");
  return res;
}

export async function adminRemovePasskey(id: number): Promise<{ ok: boolean; error?: string }> {
  if (!(await isAdminSession())) return { ok: false, error: "Not signed in." };
  await deleteCredential(id, { kind: "admin" });
  revalidatePath("/settings");
  return { ok: true };
}

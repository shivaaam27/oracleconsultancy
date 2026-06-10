"use server";

import { redirect } from "next/navigation";
import {
  bumpAdminSessionGen,
  clearAdminCookie,
  getAdminHash,
  setAdminCookie,
  setAdminPassword,
  verifyAdminPassword,
} from "@/lib/admin-auth";

export type LoginState = { error: string } | null;

/** First run: create the owner password (only while none exists). */
export async function adminSetup(_prev: LoginState, fd: FormData): Promise<LoginState> {
  const password = String(fd.get("password") ?? "");
  const confirm = String(fd.get("confirm") ?? "");
  if (password.length < 8) return { error: "Use at least 8 characters." };
  if (password !== confirm) return { error: "The two passwords don't match." };
  if (await getAdminHash()) return { error: "A password is already set — sign in instead." };
  await setAdminPassword(password);
  await setAdminCookie();
  redirect("/");
}

export async function adminLogin(_prev: LoginState, fd: FormData): Promise<LoginState> {
  const password = String(fd.get("password") ?? "");
  if (!(await verifyAdminPassword(password))) {
    return { error: "Wrong password." };
  }
  await setAdminCookie();
  redirect("/");
}

export async function adminLogout() {
  await clearAdminCookie();
  redirect("/login");
}

/** Change the owner password (Settings). Requires the current password. */
export async function adminChangePassword(fd: FormData): Promise<void> {
  const current = String(fd.get("current") ?? "");
  const next = String(fd.get("next") ?? "");
  if (next.length < 8) redirect("/settings?owner=short");
  if (!(await verifyAdminPassword(current))) redirect("/settings?owner=wrong");
  await setAdminPassword(next);
  // Sign out every other device (~1 min) but keep this one signed in by
  // issuing a fresh cookie under the new generation.
  await bumpAdminSessionGen();
  await setAdminCookie();
  redirect("/settings?owner=saved");
}

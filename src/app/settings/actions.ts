"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { sb } from "@/db/supabase";
import { hashPassword } from "@/lib/portal-auth";
import { saveAppSettings, type AppSettings, type SwipeAction } from "@/lib/settings";

const SWIPE_VALUES: SwipeAction[] = ["none", "complete", "escalate", "snooze", "archive", "delete", "open", "update"];
function swipe(fd: FormData, key: string): SwipeAction | undefined {
  const v = fd.get(key) as string | null;
  return v && SWIPE_VALUES.includes(v as SwipeAction) ? (v as SwipeAction) : undefined;
}

function num(fd: FormData, key: string): number | undefined {
  const v = fd.get(key);
  if (v == null || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

export async function saveSettings(fd: FormData): Promise<void> {
  const patch: Partial<AppSettings> = {
    dueSoonDays: num(fd, "dueSoonDays"),
    stalledDays: num(fd, "stalledDays"),
    agingDays: num(fd, "agingDays"),
    weatherCity: (fd.get("weatherCity") as string | null)?.trim() || undefined,
    weatherLat: num(fd, "weatherLat"),
    weatherLon: num(fd, "weatherLon"),
    aiEnabled: fd.get("aiEnabled") === "on",
    voiceLanguage: (fd.get("voiceLanguage") as string | null)?.trim() || undefined,
    voiceDictionary: (fd.get("voiceDictionary") as string | null)?.trim() || undefined,
    swipeRightAction: swipe(fd, "swipeRightAction"),
    swipeLeftAction: swipe(fd, "swipeLeftAction"),
    operatorName: ((fd.get("operatorName") as string | null) ?? "").trim(),
  };

  await saveAppSettings(patch);
  revalidatePath("/");
  revalidatePath("/settings");
  redirect("/settings?saved=1");
}

/** Enable (or reset the password for) staff-portal access on a person. */
export async function setPortalAccess(fd: FormData): Promise<void> {
  const personId = Number(fd.get("personId"));
  const password = String(fd.get("password") ?? "");
  if (!Number.isFinite(personId) || personId <= 0) redirect("/settings?portal=error");
  if (password.length < 6) redirect("/settings?portal=short");

  const { error } = await sb
    .from("people")
    .update({
      portal_password_hash: hashPassword(password),
      portal_enabled_at: new Date().toISOString(),
    })
    .eq("id", personId);
  if (error) throw new Error(error.message);
  revalidatePath("/settings");
  redirect("/settings?portal=saved");
}

/** Revoke portal access — the person's session stops working immediately. */
export async function revokePortalAccess(fd: FormData): Promise<void> {
  const personId = Number(fd.get("personId"));
  if (!Number.isFinite(personId) || personId <= 0) redirect("/settings?portal=error");
  const { error } = await sb
    .from("people")
    .update({ portal_password_hash: null, portal_enabled_at: null })
    .eq("id", personId);
  if (error) throw new Error(error.message);
  revalidatePath("/settings");
  redirect("/settings?portal=revoked");
}

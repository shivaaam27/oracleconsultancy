"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { sb } from "@/db/supabase";
import { hashPassword } from "@/lib/portal-auth";
import { saveAppSettings, type AppSettings, type SwipeAction } from "@/lib/settings";
import { disconnectGoogle } from "@/lib/google";
import { DOCUMENTS_BUCKET } from "@/lib/documents";

function safeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/_+/g, "_").slice(0, 100) || "signature";
}

/** Disconnect the Google Calendar account (clears the stored refresh token). */
export async function disconnectGoogleAction(): Promise<void> {
  await disconnectGoogle();
  revalidatePath("/settings");
  redirect("/settings?google=disconnected");
}

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
    emailFrom: (fd.get("emailFrom") as string | null)?.trim() || undefined,
    emailFromName: (fd.get("emailFromName") as string | null)?.trim() || undefined,
    emailSignature: ((fd.get("emailSignature") as string | null) ?? "").trim(),
  };

  // Signature image: upload a new file, or clear it when "remove" is ticked.
  const sigImg = fd.get("emailSignatureImage");
  if (sigImg instanceof File && sigImg.size > 0) {
    const path = `email-signature/${Date.now()}-${safeName(sigImg.name)}`;
    const buffer = Buffer.from(await sigImg.arrayBuffer());
    const { error } = await sb.storage
      .from(DOCUMENTS_BUCKET)
      .upload(path, buffer, { contentType: sigImg.type || "image/png", upsert: true });
    if (!error) patch.emailSignatureImagePath = path;
  } else if (fd.get("remove_emailSignatureImage") === "1") {
    patch.emailSignatureImagePath = "";
  }

  await saveAppSettings(patch);
  revalidatePath("/");
  revalidatePath("/settings");
  redirect("/settings?saved=1");
}

/** Enable (or reset the password for) staff-portal access on a person. */
export async function setPortalAccess(fd: FormData): Promise<void> {
  const personId = Number(fd.get("personId"));
  const password = String(fd.get("password") ?? "");
  const role = fd.get("portalRole") === "manager" ? "manager" : "staff";
  if (!Number.isFinite(personId) || personId <= 0) redirect("/settings?portal=error");
  if (password.length < 6) redirect("/settings?portal=short");

  const { error } = await sb
    .from("people")
    .update({
      portal_password_hash: hashPassword(password),
      portal_enabled_at: new Date().toISOString(),
      portal_role: role,
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

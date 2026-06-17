"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { sb } from "@/db/supabase";
import { hashPassword } from "@/lib/portal-auth";
import { recordEvent } from "@/lib/system-events";
import { saveAppSettings, type AppSettings, type SwipeAction } from "@/lib/settings";
import { disconnectGoogle } from "@/lib/google";
import { DOCUMENTS_BUCKET } from "@/lib/documents";
import { sendEmail } from "@/lib/email/send";
import { sendWhatsApp } from "@/lib/whatsapp";

const TEST_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TEST_PHONE_RE = /^\+?[0-9]{7,15}$/;

/**
 * Send a one-off test email through the configured provider, so the owner can
 * confirm real sending works end-to-end (credentials, signature, deliverability)
 * without creating an Outbox draft. Degrades clearly when not configured.
 */
export async function sendTestEmail(
  to: string
): Promise<{ ok: boolean; error?: string; reason?: "not-configured" | "no-recipients" }> {
  const addr = to.trim();
  if (!TEST_EMAIL_RE.test(addr)) return { ok: false, reason: "no-recipients", error: "Enter a valid email address." };

  const result = await sendEmail({
    to: addr,
    subject: "Test email from your Oracle Consultancy command centre",
    text:
      "This is a test message from your Chief-of-Staff command centre.\n\n" +
      "If you're reading this, real email sending is working — drafts you approve in the Outbox will be delivered from here.",
    html:
      '<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;font-size:14px;line-height:1.6;color:#111">' +
      "<p>This is a test message from your Chief-of-Staff command centre.</p>" +
      "<p>If you're reading this, <strong>real email sending is working</strong> — drafts you approve in the Outbox will be delivered from here.</p>" +
      "</div>",
  });

  if (result.ok) return { ok: true };
  if (result.reason === "not-configured")
    return { ok: false, reason: "not-configured", error: "Email sending isn't switched on yet (no mailbox credentials configured)." };
  if (result.reason === "no-recipients")
    return { ok: false, reason: "no-recipients", error: "Enter a valid email address." };
  return { ok: false, error: result.error ?? "Could not send the test email." };
}

/**
 * Send a one-off test WhatsApp message through Twilio, so the owner can confirm
 * the connection works end-to-end without creating an Outbox draft. In the Twilio
 * sandbox the recipient must first have texted the join code; live sends need an
 * approved sender + (outside 24h) an approved template — here we send free text,
 * which works in the sandbox and inside an open 24h window.
 */
export async function sendTestWhatsApp(
  to: string,
  withCard = false,
): Promise<{ ok: boolean; error?: string; reason?: "not-configured" | "no-recipients" }> {
  const addr = to.replace(/\s+/g, "");
  if (!TEST_PHONE_RE.test(addr))
    return { ok: false, reason: "no-recipients", error: "Enter a valid number in international form, e.g. +255686450999." };

  // When testing the rich format, send a formatted card caption + the generated
  // summary image as the header (personId 0 = a sample card with zero counts).
  const { waCardImageUrl } = await import("@/lib/wa-card");
  const text = withCard
    ? [
        "🔔 *Your tasks · Oracle Consultancy*",
        "Hi there, a quick reminder of where things stand:",
        "",
        "*Dar Spices*",
        "🔴 Submit Q2 VAT return — _due 12 Jun · High_",
        "🟠 Renew fire certificate — _due 28 Jun · Medium_",
        "",
        "📊 2 open · 1 overdue",
        "This is a test of the rich WhatsApp format.",
      ].join("\n")
    : "Test from your Oracle Consultancy command centre via WhatsApp. " +
      "If you can read this, WhatsApp sending is working — drafts you approve in the Outbox can go out from here.";

  const result = await sendWhatsApp({
    to: addr,
    text,
    mediaUrl: withCard ? waCardImageUrl(0) : undefined,
  });

  if (result.ok) return { ok: true };
  if (result.reason === "not-configured")
    return { ok: false, reason: "not-configured", error: "WhatsApp isn't switched on yet (no Twilio credentials configured)." };
  if (result.reason === "no-recipient")
    return { ok: false, reason: "no-recipients", error: "Enter a valid number in international form." };
  return { ok: false, error: result.error ?? "Could not send the test WhatsApp message." };
}

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
    aiHighQuality: fd.get("aiHighQuality") === "on",
    semanticSearch: fd.get("semanticSearch") === "on",
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
  const roleRaw = fd.get("portalRole");
  const role = roleRaw === "manager" ? "manager" : roleRaw === "hr" ? "hr" : roleRaw === "director" ? "director" : "staff";
  if (!Number.isFinite(personId) || personId <= 0) redirect("/settings?portal=error");
  if (password.length < 8) redirect("/settings?portal=short");

  // Was this a brand-new grant or a password reset? (for the audit note)
  const { data: before } = await sb.from("people").select("portal_password_hash").eq("id", personId).maybeSingle();
  const wasEnabled = Boolean(before?.portal_password_hash);

  const { error } = await sb
    .from("people")
    .update({
      portal_password_hash: hashPassword(password),
      portal_enabled_at: new Date().toISOString(),
      portal_role: role,
    })
    .eq("id", personId);
  if (error) throw new Error(error.message);
  await recordEvent(wasEnabled ? "portal.access.reset" : "portal.access.granted", "ok", { personId, role });
  revalidatePath("/settings");
  redirect("/settings?portal=saved");
}

/** Change a portal user's access level WITHOUT resetting their password. Only
 *  applies to people who already have access. */
export async function setPortalRole(fd: FormData): Promise<void> {
  const personId = Number(fd.get("personId"));
  const roleRaw = fd.get("portalRole");
  const role = roleRaw === "manager" ? "manager" : roleRaw === "hr" ? "hr" : roleRaw === "director" ? "director" : "staff";
  if (!Number.isFinite(personId) || personId <= 0) redirect("/settings?portal=error");

  // Guard: never silently grant access via a role change — the person must
  // already have a password set.
  const { data: row } = await sb.from("people").select("portal_password_hash,portal_role").eq("id", personId).maybeSingle();
  if (!row?.portal_password_hash) redirect("/settings?portal=error");
  const prevRole = (row.portal_role as string | null) ?? "staff";

  const { error } = await sb.from("people").update({ portal_role: role }).eq("id", personId);
  if (error) throw new Error(error.message);
  await recordEvent("portal.role.changed", "ok", { personId, from: prevRole, to: role });
  revalidatePath("/settings");
  // The change is read fresh on the person's next request (getPortalPerson hits
  // the DB every time), so it takes effect on their next navigation.
  redirect("/settings?portal=role");
}

/** Email automation: master pause + per-category mode. The "on" mode for each
 *  category comes from the single source of truth (NATURAL_MODE in the registry
 *  meta), so adding a category never needs a change here. */
export async function setEmailAutomation(fd: FormData): Promise<void> {
  const { saveAutomationConfig, NATURAL_MODE } = await import("@/lib/automation");
  const field = String(fd.get("field") ?? "");
  const on = fd.get("value") === "1";
  if (field === "testMode") {
    await sb.from("settings").upsert({ key: "email.testMode", value: on ? "1" : "0" }, { onConflict: "key" });
  } else if (field === "paused") {
    await saveAutomationConfig({ paused: on });
  } else if (field in NATURAL_MODE) {
    const mode = on ? NATURAL_MODE[field as keyof typeof NATURAL_MODE] : "off";
    await saveAutomationConfig({ categories: { [field]: { mode } } as never });
  }
  revalidatePath("/settings");
  redirect("/settings?saved=1");
}

/** Email automation: the numeric "how it behaves" tuning — send window, daily cap,
 *  cooldown, and which weekday the Director Brief goes out. */
export async function setAutomationTuning(fd: FormData): Promise<void> {
  const { saveAutomationConfig } = await import("@/lib/automation");
  const num = (k: string, lo: number, hi: number, dflt: number): number => {
    const v = Number(fd.get(k));
    return Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : dflt;
  };
  const windowStartHour = num("windowStartHour", 0, 23, 8);
  let windowEndHour = num("windowEndHour", 1, 24, 18);
  if (windowEndHour <= windowStartHour) windowEndHour = Math.min(24, windowStartHour + 1);
  await saveAutomationConfig({
    cooldownDays: num("cooldownDays", 0, 30, 2),
    dailyCap: num("dailyCap", 1, 500, 50),
    windowStartHour,
    windowEndHour,
    briefDay: num("briefDay", 0, 6, 1),
  });
  revalidatePath("/settings");
  redirect("/settings?saved=1");
}

/** Run all enabled email-automation categories right now (manual test fire from
 *  the site). Ignores the daily once-only guard + send window. With Test mode on,
 *  everything redirects to the owner's inbox. */
export async function runEmailAutomationNow(): Promise<void> {
  const { runDueAutomations } = await import("@/lib/automation");
  await runDueAutomations(new Date(), { force: true });
  revalidatePath("/settings");
  redirect("/settings?saved=1");
}

/** Send the Director Brief to the owner right now (one-off, ignores the schedule). */
export async function sendDirectorBriefNow(): Promise<void> {
  const { sendDirectorBriefToOwnerNow } = await import("@/lib/director-brief-send");
  await sendDirectorBriefToOwnerNow();
  revalidatePath("/settings");
  redirect("/settings?saved=1");
}

/** Governance kill switch: pause/resume all director outreach (messages). */
export async function setDirectorOutreach(fd: FormData): Promise<void> {
  const paused = fd.get("paused") === "1";
  await sb.from("settings").upsert({ key: "director.outreachPaused", value: paused ? "1" : "0" }, { onConflict: "key" });
  revalidatePath("/settings");
  redirect("/settings?portal=saved");
}

/** Revoke portal access — the person's session stops working immediately
 *  (getPortalPerson re-checks the DB on every request and a null password hash
 *  fails the check). This only removes their ability to sign in: every record
 *  they created (tasks, updates, chat messages, documents, attendance, leave)
 *  is kept. Also resets the role to "staff" so a later re-grant never silently
 *  restores manager/director powers. */
export async function revokePortalAccess(fd: FormData): Promise<void> {
  const personId = Number(fd.get("personId"));
  if (!Number.isFinite(personId) || personId <= 0) redirect("/settings?portal=error");
  const { error } = await sb
    .from("people")
    .update({ portal_password_hash: null, portal_enabled_at: null, portal_role: "staff" })
    .eq("id", personId);
  if (error) throw new Error(error.message);
  await recordEvent("portal.access.revoked", "ok", { personId });
  revalidatePath("/settings");
  redirect("/settings?portal=revoked");
}

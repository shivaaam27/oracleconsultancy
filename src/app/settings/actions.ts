"use server";

import { revalidatePath } from "next/cache";
import { renderPlainEmail } from "@/lib/email/layout";
import { redirect } from "next/navigation";
import { isAdminSession } from "@/lib/auth/admin-auth";

import { sb } from "@/db/supabase";
import { recordEvent } from "@/lib/system-events";
import {
  grantPortalAccess,
  changePortalRole,
  companiesOnRecord,
  revokePortalAccess as revokePortalAccessCore,
  parsePortalRole,
} from "@/lib/portal/portal-access";
import { directorScopeOf } from "@/lib/portal/portal-permissions";
import { saveAppSettings, type AppSettings } from "@/lib/settings";
import { disconnectGoogle } from "@/lib/calendar/google";
import { DOCUMENTS_BUCKET } from "@/lib/documents/documents";
import { sendEmail } from "@/lib/email/send";
import { sendWhatsApp } from "@/lib/messaging/whatsapp";

/** Every action here changes the whole system, so each one checks for the
 *  owner itself. The /settings page sits behind the admin gate, but a server
 *  action is reachable from any page that imports it — and the gate does not
 *  see that POST (audit 24 Sept 2026). */
async function ownerOnly(): Promise<void> {
  if (!(await isAdminSession())) redirect("/login");
}

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
  await ownerOnly();
  const addr = to.trim();
  if (!TEST_EMAIL_RE.test(addr)) return { ok: false, reason: "no-recipients", error: "Enter a valid email address." };

  const result = await sendEmail({
    to: addr,
    subject: "Test email from your Oracle Consultancy administrator",
    text:
      "This is a test message from your Chief-of-Staff administrator.\n\n" +
      "If you're reading this, real email sending is working — drafts you approve in the Outbox will be delivered from here.",
    // The same template as every other email, so this shows what they look like.
    html: renderPlainEmail(
      "This is a test message from your Chief-of-Staff administrator.\n\n" +
      "If you're reading this, real email sending is working — drafts you approve in the Outbox will be delivered from here.",
      { title: "Email is working", signature: true },
    ),
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
  await ownerOnly();
  const addr = to.replace(/\s+/g, "");
  if (!TEST_PHONE_RE.test(addr))
    return { ok: false, reason: "no-recipients", error: "Enter a valid number in international form, e.g. +255686450999." };

  // When testing the rich format, send a formatted card caption + the generated
  // summary image as the header (personId 0 = a sample card with zero counts).
  const { waCardImageUrl } = await import("@/lib/messaging/wa-card");
  const text = withCard
    ? [
        "🔔 *Your tasks · Oracle Consultancy*",
        "Hi there, a quick reminder of where things stand:",
        "",
        "*DSC Ltd*",
        "🔴 Submit Q2 VAT return — _due 12 Jun · High_",
        "🟠 Renew fire certificate — _due 28 Jun · Medium_",
        "",
        "📊 2 open · 1 overdue",
        "This is a test of the rich WhatsApp format.",
      ].join("\n")
    : "Test from your Oracle Consultancy administrator via WhatsApp. " +
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
  await ownerOnly();
  await disconnectGoogle();
  revalidatePath("/settings");
  redirect("/settings?section=email&google=disconnected");
}

function num(fd: FormData, key: string): number | undefined {
  const v = fd.get(key);
  if (v == null || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

/** Save the portal role-permissions matrix (Settings → Portals → Roles &
 *  permissions). Stored as one JSON row; merged over defaults at read time. */
export async function savePortalPermissionsAction(fd: FormData): Promise<void> {
  await ownerOnly();
  const { savePortalPermissions } = await import("@/lib/portal/portal-permissions-store");
  const raw = String(fd.get("config") ?? "").trim();
  let config: import("@/lib/portal/portal-permissions").PortalPermissionsConfig = {};
  try {
    const parsed = raw ? JSON.parse(raw) : {};
    if (parsed && typeof parsed === "object") config = parsed;
  } catch {
    redirect("/settings?section=portals"); // parse failure — bail without wiping
  }
  const { diffFromDefaults } = await import("@/lib/portal/portal-permissions");
  await savePortalPermissions(diffFromDefaults(config));
  revalidatePath("/portal");
  revalidatePath("/portal/board");
  revalidatePath("/settings");
  redirect("/settings?saved=1&section=portals");
}

export async function saveSettings(fd: FormData): Promise<void> {
  await ownerOnly();
  const patch: Partial<AppSettings> = {
    dueSoonDays: num(fd, "dueSoonDays"),
    stalledDays: num(fd, "stalledDays"),
    agingDays: num(fd, "agingDays"),
    // ⚠️ A field must be read HERE as well as listed in the form's `__keys` —
    // `__keys` only narrows what gets written, it does not add anything.
    aiEnabled: fd.get("aiEnabled") === "on",
    semanticSearch: fd.get("semanticSearch") === "on",
    aiMonthlySpendCap: (() => { const n = num(fd, "aiMonthlySpendCap"); return n == null ? undefined : Math.max(0, n); })(),
    voiceLanguage: (fd.get("voiceLanguage") as string | null)?.trim() || undefined,
    // "" is a real value — an emptied dictionary must save as empty, not be
    // skipped (it kept coming back).
    voiceDictionary: ((fd.get("voiceDictionary") as string | null) ?? "").trim(),
    operatorName: ((fd.get("operatorName") as string | null) ?? "").trim(),
    emailFrom: (fd.get("emailFrom") as string | null)?.trim() || undefined,
    emailFromName: (fd.get("emailFromName") as string | null)?.trim() || undefined,
    emailSignature: ((fd.get("emailSignature") as string | null) ?? "").trim(),
    notifyDigest: fd.get("notifyDigest") === "on",
    quietHoursStart: ((fd.get("quietHoursStart") as string | null) ?? "").trim(),
    quietHoursEnd: ((fd.get("quietHoursEnd") as string | null) ?? "").trim(),
    meetingTaskMode: (() => {
      const v = String(fd.get("meetingTaskMode") ?? "");
      return v === "always" || v === "off" || v === "company" ? v : undefined;
    })(),
    // Blank goes back to the default rather than being ignored (it could never be cleared).
    meetingTaskCategory: fd.has("meetingTaskCategory") ? ((fd.get("meetingTaskCategory") as string | null)?.trim() || "Meetings") : undefined,
    autoAdvanceMeetingTasks: fd.get("autoAdvanceMeetingTasks") === "on",
    meetingTaskGraceMinutes: num(fd, "meetingTaskGraceMinutes"),
    eventAttendeePings: fd.get("eventAttendeePings") === "on",
    recurringMeetingTaskMode: fd.get("recurringMeetingTaskMode") === "series" ? "series" : (fd.has("recurringMeetingTaskMode") ? "occurrence" : undefined),
    meetingFollowupPrompt: fd.get("meetingFollowupPrompt") === "on",
    // "Nobody" (blank) must actually CLEAR the managed calendar, so an empty
    // submit saves 0 rather than being read as "leave it alone".
    managedCalendarPersonId: fd.has("managedCalendarPersonId")
      ? Number(String(fd.get("managedCalendarPersonId") ?? "").trim()) || 0
      : undefined,
    eventReminderEmail: fd.get("eventReminderEmail") === "on",
  };

  // Groq API key: only WRITE when the owner types a new value (the field renders
  // empty with a masked preview, so a blank submit must NOT wipe the saved key),
  // or when "remove" is ticked to clear it. The raw key is never echoed back.
  const groqKeyInput = ((fd.get("groqApiKey") as string | null) ?? "").trim();
  if (fd.get("remove_groqApiKey") === "1") {
    patch.groqApiKey = ""; // clear → fall back to the env var
  } else if (groqKeyInput) {
    patch.groqApiKey = groqKeyInput; // set / rotate
  }

  // AI provider choice (Groq / Gemini) — a plain select, always present in the AI form.
  if (fd.has("aiProvider")) {
    patch.aiProvider = fd.get("aiProvider") === "gemini" ? "gemini" : "groq";
  }
  // Gemini key: same write-only-when-typed rule as the Groq key.
  const geminiKeyInput = ((fd.get("geminiApiKey") as string | null) ?? "").trim();
  if (fd.get("remove_geminiApiKey") === "1") {
    patch.geminiApiKey = "";
  } else if (geminiKeyInput) {
    patch.geminiApiKey = geminiKeyInput;
  }

  // Signature image: upload a new file, or clear it when "remove" is ticked.
  let sigFailed = false;
  const sigImg = fd.get("emailSignatureImage");
  if (sigImg instanceof File && sigImg.size > 0) {
    const path = `email-signature/${Date.now()}-${safeName(sigImg.name)}`;
    const buffer = Buffer.from(await sigImg.arrayBuffer());
    const { error } = await sb.storage
      .from(DOCUMENTS_BUCKET)
      .upload(path, buffer, { contentType: sigImg.type || "image/png", upsert: true });
    if (!error) patch.emailSignatureImagePath = path;
    else sigFailed = true;
  } else if (fd.get("remove_emailSignatureImage") === "1") {
    patch.emailSignatureImagePath = "";
  }

  // The Settings page is split into per-section forms, so each form only submits
  // its own fields. A hidden `__keys` marker lists the setting keys that section
  // owns; we keep ONLY those in the patch. This stops an absent checkbox (which
  // reads as "off") or an absent text field (which reads as "") in one section
  // from silently wiping a setting that belongs to a different section. When
  // `__keys` is absent we fall back to the whole patch (single-form behaviour).
  const keysMarker = fd.get("__keys");
  if (typeof keysMarker === "string" && keysMarker.length) {
    const owned = new Set(keysMarker.split(",").map((k) => k.trim()).filter(Boolean));
    for (const k of Object.keys(patch) as (keyof AppSettings)[]) {
      if (!owned.has(k)) delete patch[k];
    }
  }

  await saveAppSettings(patch);
  revalidatePath("/");
  revalidatePath("/settings");
  // Reopen the same section after the round-trip so the owner stays in context.
  const section = (fd.get("__section") as string | null)?.trim();
  redirect(`/settings?saved=1${section ? `&section=${encodeURIComponent(section)}` : ""}${sigFailed ? "&note=sig-failed" : ""}`);
}

/** Enable (or reset the password for) staff-portal access on a person.
 *  Thin wrapper over `grantPortalAccess` — the one door shared with the People
 *  drawer, so both surfaces offer the same roles and write the same scope. */
export async function setPortalAccess(fd: FormData): Promise<void> {
  await ownerOnly();
  const personId = Number(fd.get("personId"));
  const password = String(fd.get("password") ?? "");
  const role = parsePortalRole(fd.get("portalRole"));
  if (!Number.isFinite(personId) || personId <= 0) redirect("/settings?section=portals&portal=pick");
  if (password.length < 8) redirect("/settings?section=portals&portal=short");

  const res = await grantPortalAccess(personId, role, password, await resolveDirectorScope(fd, personId));
  if (!res.ok) redirect("/settings?section=portals&portal=error");
  revalidatePath("/settings");
  revalidatePath("/people");
  // A password reset never LOWERS a level (roleAfterReset) — say so rather
  // than report the level that was asked for.
  redirect(`/settings?section=portals&portal=${res.role && res.role !== role ? "kept-level" : "saved"}`);
}

/** A Director's reach from a Settings form: `directorReach` = all (every
 *  company) | own (the companies on their record, worked out HERE) | keep (the
 *  stored scope, untouched). The same choice as the person's profile — there is
 *  no second company list any more. Falls back to the old repeated
 *  `directorCompanyIds` inputs so an open, pre-change tab still saves. */
async function resolveDirectorScope(fd: FormData, personId: number): Promise<number[]> {
  const reach = String(fd.get("directorReach") ?? "");
  if (reach === "all") return [];
  if (reach === "own") {
    // Empty would be read as "every company" — the opposite of what was asked.
    const own = await companiesOnRecord(personId);
    if (own.length === 0) redirect("/settings?section=portals&portal=no-companies");
    return own;
  }
  if (reach === "keep") {
    // Both places a scope is stored (the join table, and the old single column).
    const { data } = await sb.from("people").select("director_company_id,director_companies(company_id)").eq("id", personId).maybeSingle();
    return data ? directorScopeOf(data as Parameters<typeof directorScopeOf>[0]) : [];
  }
  return parseDirectorScope(fd);
}

/** Parse the chosen director scope companies from the form (repeated
 *  `directorCompanyIds` inputs). Empty = portfolio-wide. */
function parseDirectorScope(fd: FormData): number[] {
  return Array.from(new Set(
    fd.getAll("directorCompanyIds").map((v) => Number(v)).filter((n) => Number.isFinite(n) && n > 0),
  ));
}

/** Change a portal user's access level WITHOUT resetting their password. Only
 *  applies to people who already have access. */
export async function setPortalRole(fd: FormData): Promise<void> {
  await ownerOnly();
  const personId = Number(fd.get("personId"));
  const role = parsePortalRole(fd.get("portalRole"));
  if (!Number.isFinite(personId) || personId <= 0) redirect("/settings?section=portals&portal=error");

  const res = await changePortalRole(personId, role, await resolveDirectorScope(fd, personId));
  if (!res.ok) redirect("/settings?section=portals&portal=error");
  revalidatePath("/settings");
  revalidatePath("/people");
  // The change is read fresh on the person's next request (getPortalPerson hits
  // the DB every time), so it takes effect on their next navigation.
  redirect("/settings?section=portals&portal=role");
}

/** Email automation: master pause + per-category mode. The "on" mode for each
 *  category comes from the single source of truth (NATURAL_MODE in the registry
 *  meta), so adding a category never needs a change here. */
export async function setEmailAutomation(fd: FormData): Promise<void> {
  await ownerOnly();
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
  redirect("/settings?saved=1&section=email");
}

/** Email automation: the numeric "how it behaves" tuning — send window, daily cap,
 *  cooldown, and which weekday the Director Brief goes out. */
export async function setAutomationTuning(fd: FormData): Promise<void> {
  await ownerOnly();
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
  redirect("/settings?saved=1&section=email");
}

/** Run all enabled email-automation categories right now (manual test fire from
 *  the site). Ignores the daily once-only guard + send window. With Test mode on,
 *  everything redirects to the owner's inbox. */
export async function runEmailAutomationNow(): Promise<void> {
  await ownerOnly();
  const { runDueAutomations } = await import("@/lib/automation");
  await runDueAutomations(new Date(), { force: true });
  revalidatePath("/settings");
  redirect("/settings?section=email&note=ran");
}

/** Send the Director Brief to the owner right now (one-off, ignores the schedule). */
export async function sendDirectorBriefNow(): Promise<void> {
  await ownerOnly();
  const { sendDirectorBriefToOwnerNow } = await import("@/lib/reports/director-brief-send");
  const { sent } = await sendDirectorBriefToOwnerNow();
  revalidatePath("/settings");
  // Without a working mailbox it lands in the Outbox as a draft — say which.
  redirect(`/settings?section=email&note=${sent ? "brief-sent" : "brief-drafted"}`);
}

/** Governance kill switch: pause/resume all director outreach (messages). */
export async function setDirectorOutreach(fd: FormData): Promise<void> {
  await ownerOnly();
  const paused = fd.get("paused") === "1";
  await sb.from("settings").upsert({ key: "director.outreachPaused", value: paused ? "1" : "0" }, { onConflict: "key" });
  revalidatePath("/settings");
  redirect("/settings?section=portals&portal=saved");
}

/**
 * Master pause/resume for the Tax & Legal area (the /hrms/command-centre page +
 * its recurring-obligation automation). When paused the page is hidden from all
 * nav and shows a placeholder, no tax/legal tasks are spawned, and the statutory
 * section is dropped from the Director Brief + Home signals.
 *
 * On RESUME we reset the automation "forward-only" baseline to today, so the
 * cadence starts from a CLEAN SLATE and never back-fills the obligations that
 * fell due while it was paused (matching the owner's "renders from that day").
 */
export async function setCommandCentrePause(fd: FormData): Promise<void> {
  await ownerOnly();
  const paused = fd.get("paused") === "1";
  await saveAppSettings({ commandCentrePaused: paused });
  if (!paused) {
    // Resuming: move the baseline forward to today's midnight so dueObligation-
    // Instances older than now are treated as backlog and skipped.
    const midnight = new Date();
    midnight.setHours(0, 0, 0, 0);
    await sb
      .from("settings")
      .upsert({ key: "automation.time.baseline", value: midnight.toISOString() }, { onConflict: "key" });
  }
  await recordEvent("settings.tax-legal", "ok", { action: paused ? "paused" : "resumed" });
  revalidatePath("/settings");
  revalidatePath("/hrms/command-centre");
  revalidatePath("/");
  redirect("/settings?saved=1&section=automation");
}

/** Revoke portal access — the person's session stops working immediately
 *  (getPortalPerson re-checks the DB on every request and a null password hash
 *  fails the check). This only removes their ability to sign in: every record
 *  they created (tasks, updates, chat messages, documents, attendance, leave)
 *  is kept. Also resets the role to "staff" so a later re-grant never silently
 *  restores manager/director powers. */
export async function revokePortalAccess(fd: FormData): Promise<void> {
  await ownerOnly();
  const personId = Number(fd.get("personId"));
  if (!Number.isFinite(personId) || personId <= 0) redirect("/settings?section=portals&portal=error");
  const res = await revokePortalAccessCore(personId);
  if (!res.ok) redirect("/settings?section=portals&portal=error");
  revalidatePath("/settings");
  revalidatePath("/people");
  redirect("/settings?section=portals&portal=revoked");
}

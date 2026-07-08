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

/** Save the portal role-permissions matrix (Settings → Portals → Roles &
 *  permissions). Stored as one JSON row; merged over defaults at read time. */
export async function savePortalPermissionsAction(fd: FormData): Promise<void> {
  const { savePortalPermissions } = await import("@/lib/portal-permissions-store");
  const raw = String(fd.get("config") ?? "").trim();
  let config: import("@/lib/portal-permissions").PortalPermissionsConfig = {};
  try {
    const parsed = raw ? JSON.parse(raw) : {};
    if (parsed && typeof parsed === "object") config = parsed;
  } catch {
    redirect("/settings?section=portals"); // parse failure — bail without wiping
  }
  await savePortalPermissions(config);
  revalidatePath("/portal");
  revalidatePath("/portal/board");
  revalidatePath("/settings");
  redirect("/settings?saved=1&section=portals");
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
    notifyDigest: fd.get("notifyDigest") === "on",
    quietHoursStart: ((fd.get("quietHoursStart") as string | null) ?? "").trim(),
    quietHoursEnd: ((fd.get("quietHoursEnd") as string | null) ?? "").trim(),
    meetingTaskMode: (() => {
      const v = String(fd.get("meetingTaskMode") ?? "");
      return v === "always" || v === "off" || v === "company" ? v : undefined;
    })(),
    meetingTaskCategory: (fd.get("meetingTaskCategory") as string | null)?.trim() || undefined,
    autoAdvanceMeetingTasks: fd.get("autoAdvanceMeetingTasks") === "on",
    meetingTaskGraceMinutes: num(fd, "meetingTaskGraceMinutes"),
    eventAttendeePings: fd.get("eventAttendeePings") === "on",
    recurringMeetingTaskMode: fd.get("recurringMeetingTaskMode") === "series" ? "series" : (fd.has("recurringMeetingTaskMode") ? "occurrence" : undefined),
    meetingFollowupPrompt: fd.get("meetingFollowupPrompt") === "on",
    portalNudges: fd.get("portalNudges") === "on",
    portalNudgeNotStartedHours: num(fd, "portalNudgeNotStartedHours"),
    portalNudgeNoUpdateDays: num(fd, "portalNudgeNoUpdateDays"),
    portalNudgeNotStartedMsg: ((fd.get("portalNudgeNotStartedMsg") as string | null) ?? "").trim(),
    portalNudgeNoUpdateMsg: ((fd.get("portalNudgeNoUpdateMsg") as string | null) ?? "").trim(),
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

  // OCR.space scan-reading key: same write-only-when-typed rule as the Groq key.
  const ocrKeyInput = ((fd.get("ocrSpaceApiKey") as string | null) ?? "").trim();
  if (fd.get("remove_ocrSpaceApiKey") === "1") {
    patch.ocrSpaceApiKey = ""; // clear → fall back to the env var
  } else if (ocrKeyInput) {
    patch.ocrSpaceApiKey = ocrKeyInput; // set / rotate
  }

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
  redirect(`/settings?saved=1${section ? `&section=${encodeURIComponent(section)}` : ""}`);
}

/** Enable (or reset the password for) staff-portal access on a person. */
export async function setPortalAccess(fd: FormData): Promise<void> {
  const personId = Number(fd.get("personId"));
  const password = String(fd.get("password") ?? "");
  const roleRaw = fd.get("portalRole");
  const role = roleRaw === "manager" ? "manager" : roleRaw === "hr" ? "hr" : roleRaw === "director" ? "director" : roleRaw === "receptionist" ? "receptionist" : "staff";
  if (!Number.isFinite(personId) || personId <= 0) redirect("/settings?portal=error");
  if (password.length < 8) redirect("/settings?portal=short");

  // Was this a brand-new grant or a password reset? (for the audit note)
  const { data: before } = await sb
    .from("people")
    .select("portal_password_hash,portal_role")
    .eq("id", personId)
    .maybeSingle();
  const wasEnabled = Boolean(before?.portal_password_hash);
  const prevRole = (before?.portal_role as string | null) ?? "staff";

  // COMPIP-01: a password reset must not silently demote an existing user. The
  // People-drawer "Reset password" control submits a default role of "staff",
  // which previously stripped an admin (hr)/manager/director of their elevated
  // access. So on a reset, only ever ELEVATE from the submitted form — never let
  // a defaulted "staff" pull rank back. Deliberate demotion is done via the
  // dedicated role change (setPortalRole) or revoke.
  const RANK: Record<string, number> = { staff: 0, manager: 1, hr: 2, director: 2 };
  const effectiveRole = wasEnabled && (RANK[role] ?? 0) < (RANK[prevRole] ?? 0) ? prevRole : role;

  const { error } = await sb
    .from("people")
    .update({
      portal_password_hash: hashPassword(password),
      portal_enabled_at: new Date().toISOString(),
      portal_role: effectiveRole,
    })
    .eq("id", personId);
  if (error) throw new Error(error.message);
  // Company-scoped director: a "director" with chosen companies → scoped to them;
  // none/portfolio → cleared. Any non-director role clears the scope entirely.
  await writeDirectorScope(personId, effectiveRole === "director" ? parseDirectorScope(fd) : []);
  await recordEvent(wasEnabled ? "portal.access.reset" : "portal.access.granted", "ok", { personId, role: effectiveRole });
  revalidatePath("/settings");
  redirect("/settings?portal=saved");
}

/** Parse the chosen director scope companies from the form (repeated
 *  `directorCompanyIds` inputs). Empty = portfolio-wide. */
function parseDirectorScope(fd: FormData): number[] {
  return Array.from(new Set(
    fd.getAll("directorCompanyIds").map((v) => Number(v)).filter((n) => Number.isFinite(n) && n > 0),
  ));
}

/** Persist a director's company scope: replace the join-table rows AND keep
 *  people.director_company_id in sync with the FIRST id (back-compat). Empty
 *  companyIds → cleared (portfolio director, or a non-director role). */
async function writeDirectorScope(personId: number, companyIds: number[]): Promise<void> {
  await sb.from("director_companies").delete().eq("person_id", personId);
  if (companyIds.length > 0) {
    await sb.from("director_companies").insert(companyIds.map((cid) => ({ person_id: personId, company_id: cid })));
  }
  await sb.from("people").update({ director_company_id: companyIds[0] ?? null }).eq("id", personId);
}

/** Change a portal user's access level WITHOUT resetting their password. Only
 *  applies to people who already have access. */
export async function setPortalRole(fd: FormData): Promise<void> {
  const personId = Number(fd.get("personId"));
  const roleRaw = fd.get("portalRole");
  const role = roleRaw === "manager" ? "manager" : roleRaw === "hr" ? "hr" : roleRaw === "director" ? "director" : roleRaw === "receptionist" ? "receptionist" : "staff";
  if (!Number.isFinite(personId) || personId <= 0) redirect("/settings?portal=error");

  // Guard: never silently grant access via a role change — the person must
  // already have a password set.
  const { data: row } = await sb.from("people").select("portal_password_hash,portal_role").eq("id", personId).maybeSingle();
  if (!row?.portal_password_hash) redirect("/settings?portal=error");
  const prevRole = (row.portal_role as string | null) ?? "staff";

  const { error } = await sb
    .from("people")
    .update({ portal_role: role })
    .eq("id", personId);
  if (error) throw new Error(error.message);
  // Scope a director to their companies (or clear it for portfolio / any other role).
  await writeDirectorScope(personId, role === "director" ? parseDirectorScope(fd) : []);
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
  redirect("/settings?saved=1");
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
    .update({ portal_password_hash: null, portal_enabled_at: null, portal_role: "staff", director_company_id: null })
    .eq("id", personId);
  if (error) throw new Error(error.message);
  await sb.from("director_companies").delete().eq("person_id", personId);
  await recordEvent("portal.access.revoked", "ok", { personId });
  revalidatePath("/settings");
  redirect("/settings?portal=revoked");
}

import { cache } from "react";
import { sb } from "@/db/supabase";
import { DUE_SOON_DAYS, AGING_CRITICAL_DAYS, BLOCKED_STALLED_DAYS } from "./derive";
import { GROQ_FAST, GROQ_SMART } from "./ai-models";

/**
 * Canonical V2 app settings. These are the ONLY settings that drive behaviour.
 * Stored as individual rows in the `settings` table under `v2.*` keys so they
 * never collide with the old Excel-era rows or the `nav.*` preference rows.
 */
/** Actions a row swipe can trigger. Effective immediately when saved. */
export type SwipeAction = "none" | "complete" | "escalate" | "delete" | "snooze" | "archive" | "open" | "update";
export const SWIPE_ACTIONS: { value: SwipeAction; label: string }[] = [
  { value: "none", label: "Nothing" },
  { value: "complete", label: "Complete" },
  { value: "escalate", label: "Escalate" },
  { value: "snooze", label: "Snooze 1 week" },
  { value: "archive", label: "Archive" },
  { value: "delete", label: "Delete" },
  { value: "open", label: "Open / Edit" },
  { value: "update", label: "Add update" },
];

export type AppSettings = {
  dueSoonDays: number;
  stalledDays: number;
  agingDays: number;
  weatherCity: string;
  weatherLat: number;
  weatherLon: number;
  aiEnabled: boolean;
  /** Use the stronger (slower) model for high-stakes reads — document extraction
   *  and meeting minutes. Owner can switch off if the 70B model is rate-limited. */
  aiHighQuality: boolean;
  /** Phase 3b: use in-region pgvector semantic search in Ask COS. Off until the
   *  owner has deployed the `embed` Edge Function + run the backfill. When off,
   *  Ask COS uses the keyword + synonym ranker. */
  semanticSearch: boolean;
  voiceLanguage: string;
  voiceDictionary: string;
  swipeRightAction: SwipeAction;
  swipeLeftAction: SwipeAction;
  operatorName: string;
  /** Sender identity for real outbound email. Changeable any time. */
  emailFrom: string;
  emailFromName: string;
  /**
   * Footer/signature appended to every outgoing email. Plain text (line breaks
   * preserved). Recipients never see the Gmail web signature because the system
   * sends via SMTP, so this is how a professional sign-off reaches them. When
   * blank, a simple sign-off is built from the sender name + address.
   */
  emailSignature: string;
  /**
   * Storage path (in the documents bucket) of a branded signature image to embed
   * at the foot of outgoing email. Embedded inline (CID) so it always renders.
   */
  emailSignatureImagePath: string;
  /**
   * Monthly AI spend ceiling, in the same currency unit as ai-spend.ts MODEL_RATES.
   * 0 = UNLIMITED (the default — AI is never disabled by budget out of the box).
   * When > 0 and the current EAT month's recorded spend reaches it, getGroqKey()
   * returns undefined so every AI path degrades to its manual/rule fallback — a
   * graceful, reversible "out of budget" rather than a silent overspend. The Groq
   * free tier costs nothing today, so this stays inert until a paid rate is set.
   */
  aiMonthlySpendCap: number;
  /**
   * Tier-3 "send" guardrails (see lib/guardrails.ts). Whether automated code may
   * auto-send on each channel WITHOUT a human tap. Defaults preserve today:
   *  - email follows the existing email-automation setup (auto-send stays ON when
   *    email is configured and automations aren't paused) → default true;
   *  - WhatsApp/SMS have no auto-send wiring today → default false (opt-in).
   * canAutoSend() AND-combines these with automation.paused / outreachPaused.
   */
  autoSendEmail: boolean;
  autoSendWhatsapp: boolean;
  autoSendSms: boolean;
  /**
   * Tier-3 "delete" guardrail. When true (the default), automated paths MUST take
   * the reversible route — archive, never hard-delete — so nothing the system does
   * on its own is unrecoverable. Only an explicit human action may hard-delete.
   */
  autoHardDeleteForbidden: boolean;
  /**
   * An IN-APP Groq API key the owner can set/rotate from Settings WITHOUT a
   * redeploy. When non-empty it takes precedence over process.env.GROQ_API_KEY in
   * getGroqKey(), so a dead/rotated key can be fixed instantly from the UI.
   *
   * SECURITY NOTE: this is stored as a plain row in the `settings` table. The whole
   * admin side is behind one owner password (single operator), so an admin-only
   * secret in admin-only storage is an acceptable trade-off for redeploy-free
   * rotation. It is NEVER echoed back to the client — the UI only ever sees a
   * masked preview (getGroqKeyPreview); the raw value stays server-side.
   */
  groqApiKey: string;
  /**
   * Quiet hours — local Dar es Salaam (UTC+3) "HH:MM" window during which
   * non-critical pushes are held (urgent always go through). Empty = OFF (the
   * default, so today's behaviour is unchanged). The window may wrap midnight
   * (e.g. 22:00 → 07:00). See isQuietHoursNow().
   */
  quietHoursStart: string;
  quietHoursEnd: string;
  /**
   * When on, routine notifications batch into a periodic digest instead of buzzing
   * one-by-one (urgent always go through immediately). Default false = today's
   * behaviour (every notification pushes individually).
   */
  notifyDigest: boolean;
};

export const DEFAULT_SETTINGS: AppSettings = {
  dueSoonDays: DUE_SOON_DAYS,
  stalledDays: BLOCKED_STALLED_DAYS,
  agingDays: AGING_CRITICAL_DAYS,
  weatherCity: "Dar es Salaam",
  weatherLat: -6.7924,
  weatherLon: 39.2083,
  aiEnabled: true,
  aiHighQuality: true,
  semanticSearch: false,
  voiceLanguage: "en-GB",
  voiceDictionary: [
    "Oracle Consultancy",
    "Dar Spices",
    "Cocozuri Chocolat",
    "Terra Green",
    "Oracle Consultancy",
    "PES Ltd",
    "MES Ltd",
    "Pamoja Plus",
    "Dar es Salaam",
  ].join("\n"),
  swipeRightAction: "complete",
  swipeLeftAction: "escalate",
  operatorName: "",
  emailFrom: "admin@oracle.co.tz",
  emailFromName: "Oracle Consultancy",
  emailSignature: "",
  emailSignatureImagePath: "",
  aiMonthlySpendCap: 0, // 0 = unlimited; never disable AI by default
  autoSendEmail: true, // mirror today: email auto-send follows the email-automation setup
  autoSendWhatsapp: false,
  autoSendSms: false,
  autoHardDeleteForbidden: true, // automated paths archive, never hard-delete
  groqApiKey: "", // blank = fall back to process.env.GROQ_API_KEY (today's behaviour)
  quietHoursStart: "", // blank = quiet hours OFF (every push goes through)
  quietHoursEnd: "",
  notifyDigest: false, // off = each notification buzzes individually (today's behaviour)
};

/** Map of canonical setting field → storage key. */
const KEY: Record<keyof AppSettings, string> = {
  dueSoonDays: "v2.dueSoonDays",
  stalledDays: "v2.stalledDays",
  agingDays: "v2.agingDays",
  weatherCity: "v2.weatherCity",
  weatherLat: "v2.weatherLat",
  weatherLon: "v2.weatherLon",
  aiEnabled: "v2.aiEnabled",
  aiHighQuality: "v2.aiHighQuality",
  semanticSearch: "v2.semanticSearch",
  voiceLanguage: "v2.voiceLanguage",
  voiceDictionary: "v2.voiceDictionary",
  swipeRightAction: "v2.swipeRightAction",
  swipeLeftAction: "v2.swipeLeftAction",
  operatorName: "v2.operatorName",
  emailFrom: "v2.emailFrom",
  emailFromName: "v2.emailFromName",
  emailSignature: "v2.emailSignature",
  emailSignatureImagePath: "v2.emailSignatureImagePath",
  aiMonthlySpendCap: "ai.monthlySpendCap",
  autoSendEmail: "v2.autoSendEmail",
  autoSendWhatsapp: "v2.autoSendWhatsapp",
  autoSendSms: "v2.autoSendSms",
  autoHardDeleteForbidden: "v2.autoHardDeleteForbidden",
  groqApiKey: "ai.groqApiKey",
  quietHoursStart: "v2.quietHoursStart",
  quietHoursEnd: "v2.quietHoursEnd",
  notifyDigest: "v2.notifyDigest",
};

const STORAGE_KEYS = Object.values(KEY);

function toNum(v: string | null | undefined, fallback: number): number {
  if (v == null) return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function toBool(v: string | null | undefined, fallback: boolean): boolean {
  if (v == null) return fallback;
  return v === "true" || v === "1";
}

/**
 * Load the effective app settings (stored values merged over defaults).
 * Cached per request via React cache().
 */
export const getAppSettings = cache(async (): Promise<AppSettings> => {
  const { data } = await sb.from("settings").select("key,value").in("key", STORAGE_KEYS);
  const map = new Map((data ?? []).map((r) => [r.key as string, r.value as string | null]));
  const d = DEFAULT_SETTINGS;
  return {
    dueSoonDays: toNum(map.get(KEY.dueSoonDays), d.dueSoonDays),
    stalledDays: toNum(map.get(KEY.stalledDays), d.stalledDays),
    agingDays: toNum(map.get(KEY.agingDays), d.agingDays),
    weatherCity: map.get(KEY.weatherCity) ?? d.weatherCity,
    weatherLat: toNum(map.get(KEY.weatherLat), d.weatherLat),
    weatherLon: toNum(map.get(KEY.weatherLon), d.weatherLon),
    aiEnabled: toBool(map.get(KEY.aiEnabled), d.aiEnabled),
    aiHighQuality: toBool(map.get(KEY.aiHighQuality), d.aiHighQuality),
    semanticSearch: toBool(map.get(KEY.semanticSearch), d.semanticSearch),
    voiceLanguage: map.get(KEY.voiceLanguage) ?? d.voiceLanguage,
    voiceDictionary: map.get(KEY.voiceDictionary) ?? d.voiceDictionary,
    swipeRightAction: (map.get(KEY.swipeRightAction) as AppSettings["swipeRightAction"]) ?? d.swipeRightAction,
    swipeLeftAction: (map.get(KEY.swipeLeftAction) as AppSettings["swipeLeftAction"]) ?? d.swipeLeftAction,
    operatorName: map.get(KEY.operatorName) ?? d.operatorName,
    emailFrom: map.get(KEY.emailFrom) ?? d.emailFrom,
    emailFromName: map.get(KEY.emailFromName) ?? d.emailFromName,
    emailSignature: map.get(KEY.emailSignature) ?? d.emailSignature,
    emailSignatureImagePath: map.get(KEY.emailSignatureImagePath) ?? d.emailSignatureImagePath,
    aiMonthlySpendCap: toNum(map.get(KEY.aiMonthlySpendCap), d.aiMonthlySpendCap),
    autoSendEmail: toBool(map.get(KEY.autoSendEmail), d.autoSendEmail),
    autoSendWhatsapp: toBool(map.get(KEY.autoSendWhatsapp), d.autoSendWhatsapp),
    autoSendSms: toBool(map.get(KEY.autoSendSms), d.autoSendSms),
    autoHardDeleteForbidden: toBool(map.get(KEY.autoHardDeleteForbidden), d.autoHardDeleteForbidden),
    groqApiKey: map.get(KEY.groqApiKey) ?? d.groqApiKey,
    quietHoursStart: map.get(KEY.quietHoursStart) ?? d.quietHoursStart,
    quietHoursEnd: map.get(KEY.quietHoursEnd) ?? d.quietHoursEnd,
    notifyDigest: toBool(map.get(KEY.notifyDigest), d.notifyDigest),
  };
});

/** Persist a partial set of settings. Values are stored as strings. */
export async function saveAppSettings(patch: Partial<AppSettings>): Promise<void> {
  const rows = (Object.entries(patch) as [keyof AppSettings, AppSettings[keyof AppSettings]][])
    .filter(([, v]) => v !== undefined)
    .map(([field, v]) => ({ key: KEY[field], value: String(v) }));
  if (rows.length === 0) return;
  const { error } = await sb.from("settings").upsert(rows, { onConflict: "key" });
  if (error) throw new Error(error.message);
}

/**
 * Returns the Groq API key only when AI is enabled in settings AND a key is set.
 * AI routes already degrade gracefully when this is null, so toggling AI off
 * makes the whole app run manually via existing fallbacks.
 *
 * KEY PRECEDENCE: prefer the in-app settings key (settings.groqApiKey) when the
 * owner has set one, else fall back to process.env.GROQ_API_KEY. This lets the
 * owner fix a dead/rotated key instantly from Settings with no redeploy. The env
 * var stays the zero-config default, so out-of-the-box behaviour is unchanged.
 *
 * Also returns undefined when the monthly spend cap is set and reached, so the
 * app degrades gracefully to manual when over budget. This is GATED on a cap
 * actually being set (default 0 = unlimited), and isOverSpendCap() fails OPEN on
 * any error — so default behaviour is completely unchanged.
 */
export async function getGroqKey(): Promise<string | undefined> {
  const { aiEnabled, groqApiKey } = await getAppSettings();
  // In-app key (admin-only settings row) wins so it can be rotated without a
  // redeploy; otherwise use the build-time env var.
  const key = groqApiKey.trim() || process.env.GROQ_API_KEY;
  if (!key) return undefined;
  if (!aiEnabled) return undefined;
  // Local import avoids a settings ⇄ ai-spend cycle at module load; isOverSpendCap
  // is cached (~60s) and only does any work when a cap is set.
  const { isOverSpendCap } = await import("./ai-spend");
  if (await isOverSpendCap()) return undefined;
  return key;
}

/**
 * A SAFE, client-displayable summary of where the Groq key comes from. Never
 * returns the raw secret — only the last 4 characters of whichever key is in
 * effect, so the owner can confirm which one is live and that a rotation took.
 *
 *  - source "settings": the in-app key is set (takes precedence).
 *  - source "env": no in-app key; falling back to the GROQ_API_KEY env var.
 *  - source "none": no key anywhere → AI runs on manual fallbacks.
 */
export async function getGroqKeyPreview(): Promise<{ source: "settings" | "env" | "none"; last4: string }> {
  const { groqApiKey } = await getAppSettings();
  const inApp = groqApiKey.trim();
  if (inApp) return { source: "settings", last4: inApp.slice(-4) };
  const env = process.env.GROQ_API_KEY?.trim();
  if (env) return { source: "env", last4: env.slice(-4) };
  return { source: "none", last4: "" };
}

/** Parse an "HH:MM" string to minutes-since-midnight, or null when invalid/empty. */
function hhmmToMinutes(v: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(v.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return h * 60 + min;
}

/**
 * True when the current Dar es Salaam (UTC+3, no DST) local time falls inside the
 * configured quiet-hours window, during which NON-CRITICAL pushes should be held.
 * Urgent notifications must always bypass this — the caller decides urgency.
 *
 * Returns false when quiet hours are not configured (either bound blank/invalid),
 * so default behaviour is unchanged. The window may wrap past midnight
 * (e.g. start 22:00, end 07:00). A start == end window is treated as OFF.
 *
 * Best-effort: any error → false (fail OPEN so a hiccup never silences alerts).
 */
export async function isQuietHoursNow(now = new Date()): Promise<boolean> {
  try {
    const { quietHoursStart, quietHoursEnd } = await getAppSettings();
    const start = hhmmToMinutes(quietHoursStart);
    const end = hhmmToMinutes(quietHoursEnd);
    if (start == null || end == null || start === end) return false;
    // Current time in Dar es Salaam, as minutes since local midnight.
    const hm = now.toLocaleTimeString("en-GB", {
      timeZone: "Africa/Nairobi",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    const cur = hhmmToMinutes(hm);
    if (cur == null) return false;
    return start < end
      ? cur >= start && cur < end // same-day window
      : cur >= start || cur < end; // wraps past midnight
  } catch {
    return false; // fail open — never silence notifications on an error
  }
}

/**
 * The text model used for higher-stakes reads (document extraction, meeting
 * minutes). Defaults to the stronger model; the owner can drop to the faster
 * one in Settings if the 70B model is being rate-limited.
 */
export async function getQualityTextModel(): Promise<string> {
  const { aiHighQuality } = await getAppSettings();
  return aiHighQuality ? GROQ_SMART : GROQ_FAST;
}

export type EmailConfig = {
  /** Sender identity (from settings; changeable any time). */
  from: string;
  fromAddress: string;
  fromName: string;
  /** Footer text appended to outgoing mail (may be empty). */
  signature: string;
  /** Storage path of a branded signature image to embed inline (may be empty). */
  signatureImagePath: string;
  /** Test mode: when true, sendEmail redirects EVERY message to the owner's own
   *  inbox (no email reaches staff/clients) — for safe trialling. */
  testMode: boolean;
} & (
  | { provider: "resend"; apiKey: string }
  | { provider: "smtp"; host: string; port: number; user: string; pass: string }
);

/**
 * Resolves the live email-send config plus the sender identity. Returns null
 * when no provider is configured so callers degrade gracefully to manual links —
 * exactly like getGroqKey for AI.
 *
 * Two providers, picked from env (SMTP preferred — it's the no-DNS Gmail route):
 * - **SMTP / Gmail**: GMAIL_USER + GMAIL_APP_PASSWORD (sends through the real
 *   admin@oracle.co.tz mailbox; optional SMTP_HOST/SMTP_PORT override the Gmail
 *   defaults for any other SMTP server).
 * - **Resend**: RESEND_API_KEY (needs a DNS-verified domain).
 */
export async function getEmailConfig(): Promise<EmailConfig | null> {
  const { emailFrom, emailFromName, emailSignature, emailSignatureImagePath } = await getAppSettings();
  const fromAddress = emailFrom || DEFAULT_SETTINGS.emailFrom;
  const fromName = emailFromName || DEFAULT_SETTINGS.emailFromName;
  const signatureImagePath = emailSignatureImagePath.trim();
  // Fall back to a simple sign-off built from the sender identity so recipients
  // always see a footer — but only when neither custom text nor a branded image
  // is set (the image usually already contains the name/contact details).
  const sigText = emailSignature.trim();
  const signature = sigText || (signatureImagePath ? "" : [fromName, fromAddress].filter(Boolean).join("\n"));
  const { data: tmRow } = await sb.from("settings").select("value").eq("key", "email.testMode").maybeSingle();
  const identity = {
    fromAddress,
    fromName,
    signature,
    signatureImagePath,
    from: fromName ? `${fromName} <${fromAddress}>` : fromAddress,
    testMode: (tmRow?.value as string | null) === "1",
  };

  const smtpUser = process.env.GMAIL_USER;
  const smtpPass = process.env.GMAIL_APP_PASSWORD;
  if (smtpUser && smtpPass) {
    return {
      ...identity,
      provider: "smtp",
      host: process.env.SMTP_HOST || "smtp.gmail.com",
      port: Number(process.env.SMTP_PORT) || 587,
      user: smtpUser,
      pass: smtpPass.replace(/\s+/g, ""), // app passwords are shown with spaces
    };
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (apiKey) return { ...identity, provider: "resend", apiKey };

  return null;
}

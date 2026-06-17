// Real WhatsApp sending via Twilio (Twilio sits on top of WhatsApp/Meta for us).
// Server-only. Mirrors lib/email.ts: configured from env, degrades to
// { ok:false, reason:"not-configured" } when absent so callers fall back to wa.me links.
//
// Env (set in .env.local locally + Vercel for production):
//   TWILIO_ACCOUNT_SID        – starts AC... (from Twilio Console → Account Info)
//   TWILIO_AUTH_TOKEN         – the secret token (treat like a password)
//   TWILIO_WHATSAPP_FROM      – sending WhatsApp number in E.164, e.g. +14155238886
//                               (the shared Twilio SANDBOX number while testing;
//                                your own approved number once live)
//   TWILIO_DEFAULT_CONTENT_SID – optional, default approved template (Content SID, HX...)
//   TWILIO_DEFAULT_LANG        – optional, kept for API compatibility (Twilio templates
//                                carry their own language, so this is informational)
//
// IMPORTANT — WhatsApp policy (Meta's rule, enforced through Twilio): a business may only
// send FREE-FORM text within a 24-hour window after the user last messaged you. PROACTIVE
// messages (reminders, nudges) outside that window MUST use a PRE-APPROVED TEMPLATE.
// In Twilio a template is referenced by its Content SID (HX...), and template variables
// are passed as a numbered map. In the SANDBOX, free-form Body works for 24h after the
// recipient sends the join code — which is why sandbox testing needs no template.

export type WhatsAppConfig = {
  accountSid: string;
  authToken: string;
  /** E.164 sending number, no "whatsapp:" prefix (we add it). */
  from: string;
  /** Default approved-template Content SID (HX...), or null. */
  defaultContentSid: string | null;
  defaultLang: string;
};

export function getWhatsAppConfig(): WhatsAppConfig | null {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_WHATSAPP_FROM;
  if (!accountSid || !authToken || !from) return null;
  return {
    accountSid,
    authToken,
    from: from.replace(/^whatsapp:/i, "").trim(),
    defaultContentSid: process.env.TWILIO_DEFAULT_CONTENT_SID || null,
    defaultLang: process.env.TWILIO_DEFAULT_LANG || "en",
  };
}

/** True when the WhatsApp provider is configured (for Settings status + UI gating). */
export function whatsAppConfigured(): boolean {
  return getWhatsAppConfig() !== null;
}

export type SendWhatsAppResult =
  | { ok: true; id: string }
  | { ok: false; reason: "not-configured" | "no-recipient" | "error"; error?: string };

type TemplateParam = string;

export type SendWhatsAppInput = {
  to: string | null;
  /** Free-form text — ONLY delivered inside an open 24h session window (or sandbox). */
  text?: string;
  /**
   * Proactive/automated path: an approved template + ordered body variables.
   * `name` is the Twilio Content SID (HX...). `lang` is accepted for API
   * compatibility but Twilio templates carry their own language.
   */
  template?: { name: string; lang?: string; variables?: TemplateParam[] };
  /**
   * Optional public HTTPS image/PDF URL sent as the message header (the `text`
   * becomes its caption). Only valid on the free-form `text` path (open 24h
   * session / sandbox); approved templates carry their own header media.
   */
  mediaUrl?: string | null;
};

/** Normalise a number to E.164 "+<digits>" then prefix "whatsapp:". */
function toWhatsAppAddress(n: string | null | undefined): string | null {
  const d = (n ?? "").replace(/[^0-9]/g, "");
  if (!d) return null;
  return `whatsapp:+${d}`;
}

/**
 * Send a WhatsApp message via Twilio. Returns not-configured (so callers fall back
 * to a wa.me deep-link) when env isn't set. Use `template` for any proactive/automated
 * message outside the 24h window; `text` works inside an open session and in the sandbox.
 */
export async function sendWhatsApp(input: SendWhatsAppInput): Promise<SendWhatsAppResult> {
  const cfg = getWhatsAppConfig();
  if (!cfg) return { ok: false, reason: "not-configured" };
  const to = toWhatsAppAddress(input.to);
  if (!to) return { ok: false, reason: "no-recipient" };

  // Twilio Messages API: application/x-www-form-urlencoded.
  const form = new URLSearchParams();
  form.set("From", `whatsapp:+${cfg.from.replace(/[^0-9]/g, "")}`);
  form.set("To", to);

  if (input.template) {
    // Approved template path → Twilio Content API.
    form.set("ContentSid", input.template.name);
    if (input.template.variables && input.template.variables.length) {
      const map: Record<string, string> = {};
      input.template.variables.forEach((v, i) => {
        map[String(i + 1)] = v;
      });
      form.set("ContentVariables", JSON.stringify(map));
    }
  } else if (input.text) {
    form.set("Body", input.text);
    // Image/PDF header with the text as caption (free-form path only).
    if (input.mediaUrl) form.set("MediaUrl", input.mediaUrl);
  } else {
    return { ok: false, reason: "error", error: "Nothing to send." };
  }

  try {
    const auth = Buffer.from(`${cfg.accountSid}:${cfg.authToken}`).toString("base64");
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${cfg.accountSid}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: form.toString(),
      },
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = (data as { message?: string })?.message ?? `HTTP ${res.status}`;
      return { ok: false, reason: "error", error: String(msg).slice(0, 300) };
    }
    const id = (data as { sid?: string })?.sid ?? "sent";
    return { ok: true, id };
  } catch (e) {
    return { ok: false, reason: "error", error: e instanceof Error ? e.message : "Send failed" };
  }
}

// Real WhatsApp sending via the Meta WhatsApp Cloud API. Server-only.
// Mirrors lib/email.ts: configured from env, degrades to { ok:false,
// reason:"not-configured" } when absent so callers fall back to wa.me links.
//
// Env (set in Vercel once the WhatsApp Business account is live):
//   WHATSAPP_ACCESS_TOKEN     – permanent System-User token (Bearer)
//   WHATSAPP_PHONE_NUMBER_ID  – the sending number's ID (NOT the phone number)
//   WHATSAPP_API_VERSION      – optional, defaults to v21.0
//   WHATSAPP_DEFAULT_TEMPLATE – optional, default template name for reminders
//   WHATSAPP_DEFAULT_LANG     – optional, default template language (e.g. en, en_GB)
//
// IMPORTANT — WhatsApp policy: a business may only send FREE-FORM text within a
// 24-hour window after the user last messaged you. PROACTIVE messages (reminders,
// nudges) MUST use a PRE-APPROVED TEMPLATE. So automation uses `template`; free
// text is only for replies inside an open session.

export type WhatsAppConfig = {
  accessToken: string;
  phoneNumberId: string;
  apiVersion: string;
  defaultTemplate: string | null;
  defaultLang: string;
};

export function getWhatsAppConfig(): WhatsAppConfig | null {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!accessToken || !phoneNumberId) return null;
  return {
    accessToken,
    phoneNumberId,
    apiVersion: process.env.WHATSAPP_API_VERSION || "v21.0",
    defaultTemplate: process.env.WHATSAPP_DEFAULT_TEMPLATE || null,
    defaultLang: process.env.WHATSAPP_DEFAULT_LANG || "en",
  };
}

/** True when the WhatsApp provider is configured (for Settings status + UI gating). */
export function whatsAppConfigured(): boolean {
  return getWhatsAppConfig() !== null;
}

export type SendWhatsAppResult =
  | { ok: true; id: string }
  | { ok: false; reason: "not-configured" | "no-recipient" | "error"; error?: string };

/** Digits-only international number (no +, spaces, or dashes). */
function digits(n: string | null | undefined): string {
  return (n ?? "").replace(/[^0-9]/g, "");
}

type TemplateParam = string;

export type SendWhatsAppInput = {
  to: string | null;
  /** Free-form text — ONLY delivered inside an open 24h session window. */
  text?: string;
  /** Proactive/automated path: a pre-approved template + ordered body variables. */
  template?: { name: string; lang?: string; variables?: TemplateParam[] };
};

/**
 * Send a WhatsApp message via the Cloud API. Returns not-configured (so callers
 * fall back to a wa.me deep-link) when env isn't set. Use `template` for any
 * proactive/automated message; `text` only works inside an open session.
 */
export async function sendWhatsApp(input: SendWhatsAppInput): Promise<SendWhatsAppResult> {
  const cfg = getWhatsAppConfig();
  if (!cfg) return { ok: false, reason: "not-configured" };
  const to = digits(input.to);
  if (!to) return { ok: false, reason: "no-recipient" };

  let payload: Record<string, unknown>;
  if (input.template) {
    payload = {
      messaging_product: "whatsapp",
      to,
      type: "template",
      template: {
        name: input.template.name,
        language: { code: input.template.lang || cfg.defaultLang },
        ...(input.template.variables && input.template.variables.length
          ? { components: [{ type: "body", parameters: input.template.variables.map((t) => ({ type: "text", text: t })) }] }
          : {}),
      },
    };
  } else if (input.text) {
    payload = { messaging_product: "whatsapp", to, type: "text", text: { preview_url: false, body: input.text } };
  } else {
    return { ok: false, reason: "error", error: "Nothing to send." };
  }

  try {
    const res = await fetch(`https://graph.facebook.com/${cfg.apiVersion}/${cfg.phoneNumberId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${cfg.accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = (data as { error?: { message?: string } })?.error?.message ?? `HTTP ${res.status}`;
      return { ok: false, reason: "error", error: msg.slice(0, 300) };
    }
    const id = (data as { messages?: Array<{ id?: string }> })?.messages?.[0]?.id ?? "sent";
    return { ok: true, id };
  } catch (e) {
    return { ok: false, reason: "error", error: e instanceof Error ? e.message : "Send failed" };
  }
}

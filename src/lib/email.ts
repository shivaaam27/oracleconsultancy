// Real email sending. Server-only. Two providers, auto-selected in getEmailConfig:
//  - SMTP / Gmail (preferred): sends through the real admin@oracle.co.tz mailbox
//    using an App Password — NO DNS setup needed. Env: GMAIL_USER + GMAIL_APP_PASSWORD.
//  - Resend: REST API; needs a DNS-verified domain. Env: RESEND_API_KEY.
// Degrades gracefully: when neither is configured, send returns
// { ok:false, reason:"not-configured" } and callers fall back to manual links.
// Sender identity (name + address) comes from Settings and is changeable any time.

import nodemailer from "nodemailer";
import { getEmailConfig, type EmailConfig } from "@/lib/settings";

export type EmailAttachment = {
  filename: string;
  /** UTF-8 text content (e.g. an .ics file). Encoded to base64 for Resend. */
  content: string;
  contentType?: string;
};

export type SendEmailInput = {
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  replyTo?: string;
  attachments?: EmailAttachment[];
  /**
   * A calendar invitation to embed *inline* (not as a plain attachment) so Gmail/
   * Apple render it with RSVP buttons and auto-add it to the recipient's calendar
   * — the "airline ticket" behaviour. The .ics should list the recipients as
   * ATTENDEEs and an ORGANIZER for the RSVP UI to appear.
   */
  calendar?: { content: string; method?: string; filename?: string };
};

export type SendEmailResult =
  | { ok: true; id: string }
  | { ok: false; reason: "not-configured" | "no-recipients" | "error"; error?: string };

const VALID_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const cfg = await getEmailConfig();
  if (!cfg) return { ok: false, reason: "not-configured" };

  const to = (Array.isArray(input.to) ? input.to : [input.to])
    .map((s) => s.trim())
    .filter((s) => VALID_EMAIL.test(s));
  if (to.length === 0) return { ok: false, reason: "no-recipients" };

  return cfg.provider === "smtp"
    ? sendViaSmtp(cfg, to, input)
    : sendViaResend(cfg, to, input);
}

async function sendViaSmtp(
  cfg: Extract<EmailConfig, { provider: "smtp" }>,
  to: string[],
  input: SendEmailInput
): Promise<SendEmailResult> {
  try {
    const transport = nodemailer.createTransport({
      host: cfg.host,
      port: cfg.port,
      secure: cfg.port === 465, // 587 uses STARTTLS
      auth: { user: cfg.user, pass: cfg.pass },
    });
    const info = await transport.sendMail({
      from: cfg.from,
      to,
      subject: input.subject,
      text: input.text,
      html: input.html,
      replyTo: input.replyTo,
      attachments: input.attachments?.map((a) => ({
        filename: a.filename,
        content: a.content,
        contentType: a.contentType,
      })),
      // Inline invitation (text/calendar; method=REQUEST) → RSVP UI + auto-add.
      ...(input.calendar
        ? {
            icalEvent: {
              method: input.calendar.method || "REQUEST",
              filename: input.calendar.filename || "invite.ics",
              content: input.calendar.content,
            },
          }
        : {}),
    });
    return { ok: true, id: info.messageId };
  } catch (e) {
    return { ok: false, reason: "error", error: e instanceof Error ? e.message : "SMTP send failed" };
  }
}

async function sendViaResend(
  cfg: Extract<EmailConfig, { provider: "resend" }>,
  to: string[],
  input: SendEmailInput
): Promise<SendEmailResult> {
  const body: Record<string, unknown> = {
    from: cfg.from,
    to,
    subject: input.subject,
  };
  if (input.html) body.html = input.html;
  if (input.text) body.text = input.text;
  if (input.replyTo) body.reply_to = input.replyTo;
  const atts = [
    ...(input.attachments ?? []),
    ...(input.calendar
      ? [{
          filename: input.calendar.filename || "invite.ics",
          content: input.calendar.content,
          contentType: `text/calendar; method=${input.calendar.method || "REQUEST"}`,
        }]
      : []),
  ];
  if (atts.length) {
    body.attachments = atts.map((a) => ({
      filename: a.filename,
      content: Buffer.from(a.content, "utf-8").toString("base64"),
      ...(a.contentType ? { content_type: a.contentType } : {}),
    }));
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cfg.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      return { ok: false, reason: "error", error: `Resend ${res.status}: ${errText.slice(0, 300)}` };
    }
    const data = (await res.json()) as { id?: string };
    return { ok: true, id: data.id ?? "" };
  } catch (e) {
    return { ok: false, reason: "error", error: e instanceof Error ? e.message : "Send failed" };
  }
}

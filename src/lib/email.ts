// Real email sending. Server-only. Two providers, auto-selected in getEmailConfig:
//  - SMTP / Gmail (preferred): sends through the real admin@oracle.co.tz mailbox
//    using an App Password — NO DNS setup needed. Env: GMAIL_USER + GMAIL_APP_PASSWORD.
//  - Resend: REST API; needs a DNS-verified domain. Env: RESEND_API_KEY.
// Degrades gracefully: when neither is configured, send returns
// { ok:false, reason:"not-configured" } and callers fall back to manual links.
// Sender identity (name + address) comes from Settings and is changeable any time.

import nodemailer from "nodemailer";
import { getEmailConfig, type EmailConfig } from "@/lib/settings";
import { sb } from "@/db/supabase";
import { DOCUMENTS_BUCKET } from "@/lib/documents";

export type EmailAttachment = {
  filename: string;
  /** Content. UTF-8 text by default (e.g. an .ics file); base64 when encoding="base64". */
  content: string;
  contentType?: string;
  /** How `content` is encoded. Defaults to "utf8". Use "base64" for binary (images). */
  encoding?: "utf8" | "base64";
  /** Content-ID for inline embedding (referenced from html as src="cid:<cid>"). */
  cid?: string;
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

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Marker that flags an html body we've already signed, so we never double-sign.
const SIG_MARKER = "<!--cos-signature-->";
const SIG_CID = "cos-signature-image";

/** Download a stored signature image and return it as an inline attachment. */
async function loadSignatureImage(path: string): Promise<EmailAttachment | null> {
  try {
    const { data, error } = await sb.storage.from(DOCUMENTS_BUCKET).download(path);
    if (error || !data) return null;
    const buffer = Buffer.from(await data.arrayBuffer());
    const contentType = data.type || "image/png";
    const ext = (contentType.split("/")[1] || "png").split("+")[0];
    return {
      filename: `signature.${ext}`,
      content: buffer.toString("base64"),
      encoding: "base64",
      contentType,
      cid: SIG_CID,
    };
  } catch {
    return null;
  }
}

/**
 * Append the configured signature (text and/or branded image) to an email's
 * text + html parts. The system sends via SMTP, which does NOT add the Gmail
 * web signature, so this is the only way a sign-off reaches the recipient.
 * The image is embedded inline (CID) so it always renders, even months later.
 */
async function withSignature(input: SendEmailInput, cfg: EmailConfig): Promise<SendEmailInput> {
  const sig = cfg.signature.trim();
  const imagePath = cfg.signatureImagePath.trim();
  if (!sig && !imagePath) return input;
  if (input.html?.includes(SIG_MARKER)) return input; // already signed

  const image = imagePath ? await loadSignatureImage(imagePath) : null;

  // Plain-text part: text signature only (images can't render in text/plain).
  const text =
    sig && input.text && !input.text.includes(sig)
      ? `${input.text.replace(/\s+$/, "")}\n\n—\n${sig}`
      : input.text;

  // HTML part: divider, then the branded image (if any), then the text sign-off.
  let html = input.html;
  if (html) {
    const parts: string[] = [SIG_MARKER];
    if (image)
      parts.push(`<img src="cid:${SIG_CID}" alt="Signature" style="max-width:360px;height:auto;border:0;display:block" />`);
    if (sig)
      parts.push(
        `<div style="margin-top:${image ? 8 : 0}px;font-family:-apple-system,Segoe UI,Roboto,sans-serif;font-size:13px;color:#6b7280;line-height:1.5">${escapeHtml(sig).replace(/\n/g, "<br>")}</div>`
      );
    html = `${html}<div style="margin-top:24px;padding-top:16px;border-top:1px solid #e5e7eb">${parts.join("")}</div>`;
  }

  const attachments = image ? [...(input.attachments ?? []), image] : input.attachments;

  return { ...input, text, html, attachments };
}

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const cfg = await getEmailConfig();
  if (!cfg) return { ok: false, reason: "not-configured" };

  const to = (Array.isArray(input.to) ? input.to : [input.to])
    .map((s) => s.trim())
    .filter((s) => VALID_EMAIL.test(s));
  if (to.length === 0) return { ok: false, reason: "no-recipients" };

  // Test mode: redirect EVERY message to the owner's own inbox so nothing reaches
  // staff/clients while trialling. The intended recipients are noted in the body.
  let prepared = input;
  let deliverTo = to;
  if (cfg.testMode) {
    deliverTo = [cfg.fromAddress];
    const note = `[TEST MODE] This would have been sent to: ${to.join(", ")}`;
    prepared = {
      ...input,
      subject: `[TEST] ${input.subject}`,
      text: input.text ? `${note}\n\n${input.text}` : note,
      html: input.html ? `<p style="color:#b45309;font-size:12px;margin:0 0 12px">${note}</p>${input.html}` : undefined,
    };
  }

  const finalInput = await withSignature(prepared, cfg);

  return cfg.provider === "smtp"
    ? sendViaSmtp(cfg, deliverTo, finalInput)
    : sendViaResend(cfg, deliverTo, finalInput);
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
        content: a.encoding === "base64" ? Buffer.from(a.content, "base64") : a.content,
        contentType: a.contentType,
        ...(a.cid ? { cid: a.cid } : {}),
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
      // Resend always wants base64; convert text parts, pass binary through.
      content: a.encoding === "base64" ? a.content : Buffer.from(a.content, "utf-8").toString("base64"),
      ...(a.contentType ? { content_type: a.contentType } : {}),
      ...(a.cid ? { content_id: a.cid } : {}),
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

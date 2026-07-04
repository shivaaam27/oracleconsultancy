// The shared HTML email template. Every automation hands renderEmail() a
// STRUCTURED document (title + blocks) and gets back email-safe HTML — old-school
// tables + inline styles so Gmail, Outlook and Apple Mail all render it the same.
// Change the look here and all the emails update together.
//
// Pure + client-safe (app-url only reads process.env), so it's trivially testable.

import { appBaseUrl } from "@/lib/app-url";

export type EmailTone = "default" | "danger" | "warn" | "accent" | "success" | "muted";

// Who the email is "from" — drives the footer sign-off ({Office} / Oracle
// Consultancy Limited). Set per email by its source, NOT a person's job title.
// "command" = the Command Centre / owner — signs plainly as Oracle Consultancy
// (no "…Office"), used for admin-console-initiated sends.
export type EmailOffice = "director" | "manager" | "admin" | "compliance" | "hr" | "command";

export const OFFICE_LABELS: Record<EmailOffice, string> = {
  director: "Director's Office",
  manager: "Manager's Office",
  admin: "Admin Office",
  compliance: "Admin Compliance Office",
  hr: "Admin HR Office",
  command: "Oracle Consultancy",
};

const COMPANY_LEGAL_NAME = "Oracle Consultancy Limited";
// Short form used in the masthead next to the sending office.
const COMPANY_SHORT_NAME = "Oracle Consultancy Ltd";

/**
 * The inbox "from" display name for who sent it. Director/Manager portal sends
 * carry their office; the Command Centre signs as plain Oracle Consultancy;
 * everything else (automations + compliance/HR) sends as the Admin Office.
 */
export function senderName(office?: EmailOffice): string {
  switch (office) {
    case "director": return "OC Director's Office";
    case "manager": return "OC Manager's Office";
    case "command": return "Oracle Consultancy";
    default: return "OC Admin Office";
  }
}

export type EmailStat = { value: string | number; label: string; danger?: boolean };
export type EmailRow = { left: string; right?: string };
export type EmailItem = { pill?: { label: string; tone: EmailTone }; title: string; meta?: string };

export type EmailBlock =
  | { kind: "stats"; tiles: EmailStat[] }
  | { kind: "section"; label: string; rows: EmailRow[] }
  | { kind: "items"; label: string; items: EmailItem[] }
  | { kind: "list"; label?: string; bullets: string[] }
  | { kind: "text"; text: string }
  // Raw, trusted HTML body (built by us, e.g. the event invite's two-column
  // layout) so bespoke emails can still live inside the shared shell.
  | { kind: "html"; html: string };

export type EmailDoc = {
  /** Hidden preview text shown in the inbox list. */
  preheader?: string;
  dateLabel?: string;
  title: string;
  subtitle?: string;
  blocks: EmailBlock[];
  cta?: { label: string; url: string };
  /** The quiet "why you got this" line in the footer. */
  footerNote?: string;
  /** Which office the email signs off as. Defaults to "admin". */
  office?: EmailOffice;
  /** Optional sender name shown above the office line (e.g. a manager sending). */
  signoffName?: string;
  /** Optional title under the name, e.g. "Director - Oracle Consultancy Ltd".
   *  When set it REPLACES the office + legal-name footer lines. */
  signoffTitle?: string;
  /** Optional personal line shown as a highlighted note above the content. */
  note?: string;
  /** Wider body for bespoke two-column layouts (event invites). Default 600px. */
  wide?: boolean;
};

export type EmailBrand = {
  /** Top-left wordmark. */
  wordmark?: string;
  /** Absolute URL to the masthead logo. Defaults to the app's /icon-192.png. */
  logoUrl?: string;
};

// MUST stay identical to SIG_MARKER in src/lib/email/send.ts — its presence tells
// the central signature step this html already owns its footer (no double-sign).
const SIG_MARKER = "<!--cos-signature-->";

const C = {
  ink: "#0f2742", body: "#334155", muted: "#5b7794", faint: "#9db0c8",
  hair: "#eef2f7", border: "#e6ebf2", tile: "#f7f9fc",
  // White canvas throughout (no grey) — matches the event-invite look.
  canvas: "#ffffff",
  // Aurora cool-blue accent (hsl 214 88% 52%) replaces the old teal.
  teal: "#1f7aeb", wash: "#ffffff", white: "#ffffff",
};

// Status-as-dot colours (Aurora: status is a small dot/text, not a block).
const DOT: Record<EmailTone, string> = {
  danger: "#c0392b",
  warn: "#d9a441",
  accent: "#1f7aeb",
  success: "#1d9e75",
  muted: "#9db0c8",
  default: "#9db0c8",
};

const FONT = "-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif";

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function sectionLabel(label: string): string {
  return `<div style="font-size:11px;letter-spacing:0.8px;text-transform:uppercase;color:${C.teal};font-weight:600;padding:14px 0 6px;font-family:${FONT}">${esc(label)}</div>`;
}

// Aurora soft glass panel — wraps a group in a white, hairline, rounded card.
function card(inner: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 12px"><tr><td style="background:${C.white};border:1px solid ${C.border};border-radius:16px;padding:6px 18px 8px;font-family:${FONT}">${inner}</td></tr></table>`;
}

function renderBlock(b: EmailBlock): string {
  if (b.kind === "stats") {
    const pct = Math.floor(100 / Math.max(1, b.tiles.length));
    const cells = b.tiles.map((t, i) => {
      const fg = t.danger ? "#b91c1c" : C.ink;
      const lab = t.danger ? "#b91c1c" : C.muted;
      const brd = t.danger ? "#f2d8d8" : C.border;
      // Even gaps without leaving an outer inset: pad between tiles only.
      const pad = i === 0 ? "0 5px 0 0" : i === b.tiles.length - 1 ? "0 0 0 5px" : "0 5px";
      return `<td width="${pct}%" valign="top" style="padding:${pad}"><div style="background:${C.white};border:1px solid ${brd};border-radius:16px;padding:16px 8px;text-align:center;font-family:${FONT}"><div style="font-size:26px;font-weight:600;color:${fg}">${esc(String(t.value))}</div><div style="font-size:11px;color:${lab};padding-top:3px">${esc(t.label)}</div></div></td>`;
    }).join("");
    return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 4px"><tr>${cells}</tr></table>`;
  }
  if (b.kind === "section") {
    const rows = b.rows.map((r, i) => {
      const border = i < b.rows.length - 1 ? `border-bottom:1px solid ${C.hair};` : "";
      return `<tr><td style="padding:9px 0;${border}font-size:14px;color:${C.ink};font-family:${FONT}">${esc(r.left)}</td><td align="right" style="padding:9px 0;${border}font-size:13px;color:${C.muted};font-family:${FONT}">${r.right ? esc(r.right) : ""}</td></tr>`;
    }).join("");
    return card(`${sectionLabel(b.label)}<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table>`);
  }
  if (b.kind === "items") {
    // Aurora: a small status dot (tone-coloured), title, then a quiet meta line
    // that spells out the state — no boxy pills.
    const rows = b.items.map((it, i) => {
      const border = i < b.items.length - 1 ? `border-bottom:1px solid ${C.hair};` : "";
      const dotColor = it.pill ? DOT[it.pill.tone] : C.faint;
      const dot = `<td valign="top" width="18" style="width:18px;padding:13px 0 0 0"><div style="width:7px;height:7px;border-radius:50%;background:${dotColor};font-size:0;line-height:0">&nbsp;</div></td>`;
      const pillLabel = it.pill ? `<span style="color:${dotColor};font-weight:600">${esc(it.pill.label)}</span>` : "";
      const metaText = it.meta ? esc(it.meta) : "";
      const sep = pillLabel && metaText ? " &middot; " : "";
      const metaInner = pillLabel + sep + metaText;
      const meta = metaInner ? `<div style="font-size:12px;color:${C.faint};padding-top:2px;font-family:${FONT}">${metaInner}</div>` : "";
      return `<tr>${dot}<td valign="top" style="padding:11px 0;${border}"><div style="font-size:14px;color:${C.ink};line-height:1.4;font-family:${FONT}">${esc(it.title)}</div>${meta}</td></tr>`;
    }).join("");
    return card(`${sectionLabel(b.label)}<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table>`);
  }
  if (b.kind === "list") {
    const head = b.label ? sectionLabel(b.label) : "";
    const items = b.bullets.map((t) =>
      `<tr><td valign="top" style="padding:5px 8px 5px 0;color:${C.teal};font-family:${FONT}">&bull;</td><td style="padding:5px 0;font-size:14px;color:${C.body};line-height:1.5;font-family:${FONT}">${esc(t)}</td></tr>`
    ).join("");
    return `${head}<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:2px">${items}</table>`;
  }
  if (b.kind === "html") return b.html; // trusted, built by us
  // text
  return `<div style="font-size:14px;color:${C.body};line-height:1.6;padding:6px 0;font-family:${FONT};white-space:pre-wrap">${esc(b.text).replace(/\n/g, "<br>")}</div>`;
}

export function renderEmail(doc: EmailDoc, brand: EmailBrand = {}): string {
  const officeLabel = OFFICE_LABELS[doc.office ?? "admin"];
  // Masthead org name (brand override falls back to the short company name) +
  // its leading-letter monogram tile.
  const orgName = brand.wordmark || COMPANY_SHORT_NAME;
  const logoUrl = brand.logoUrl ?? `${appBaseUrl()}/icon-192.png`;
  const blocks = doc.blocks.map(renderBlock).join("");

  const cta = doc.cta
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:18px 0 4px"><tr><td align="center"><table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="background:${C.teal};border-radius:13px"><a href="${doc.cta.url}" style="display:inline-block;color:${C.white};font-size:14px;font-weight:600;text-decoration:none;padding:13px 30px;font-family:${FONT}">${esc(doc.cta.label)} &rarr;</a></td></tr></table></td></tr></table>`
    : "";
  const isCommand = doc.office === "command";
  const bold = (s: string) => `<div style="font-size:13px;font-weight:600;color:${C.ink};font-family:${FONT}">${esc(s)}</div>`;
  const muted = (s: string) => `<div style="font-size:12px;color:${C.muted};padding-top:2px;font-family:${FONT}">${esc(s)}</div>`;
  // Footer sign-off:
  //  • person + title  → "Mr Pulin Manek" / "Director - Oracle Consultancy Ltd";
  //  • person, no title → name / office / legal name;
  //  • Command Centre   → Oracle Consultancy / legal name;
  //  • system (no name) → office / legal name.
  const signHtml = doc.signoffName && doc.signoffTitle
    ? bold(doc.signoffName) + muted(doc.signoffTitle)
    : doc.signoffName
      ? bold(doc.signoffName) + muted(officeLabel) + muted(COMPANY_LEGAL_NAME)
      : isCommand
        ? bold(COMPANY_SHORT_NAME) + muted(COMPANY_LEGAL_NAME)
        : bold(officeLabel) + muted(COMPANY_LEGAL_NAME);
  const note = doc.footerNote
    ? `<div style="font-size:11px;color:#aebccd;padding-top:12px;line-height:1.5;font-family:${FONT}">${esc(doc.footerNote)}</div>`
    : "";

  // Optional personal note — an Aurora blue-soft callout above the content,
  // attributed to the sender when a name is given.
  const noteCallout = doc.note
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:6px 0 12px"><tr><td style="background:${C.wash};border:1px solid ${C.border};border-radius:16px;padding:13px 16px"><div style="font-size:14px;color:${C.ink};line-height:1.55;font-family:${FONT}">${esc(doc.note).replace(/\n/g, "<br>")}</div>${doc.signoffName ? `<div style="font-size:12px;color:${C.teal};padding-top:5px;font-family:${FONT}">&mdash; ${esc(doc.signoffName)}</div>` : ""}</td></tr></table>`
    : "";

  const preheader = doc.preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${C.canvas}">${esc(doc.preheader)}</div>`
    : "";

  const dateLabel = doc.dateLabel
    ? `<td align="right" style="font-size:12px;color:${C.faint};font-family:${FONT}">${esc(doc.dateLabel)}</td>`
    : "";

  const subtitle = doc.subtitle
    ? `<div style="font-size:14px;color:${C.muted};padding-top:3px;font-family:${FONT}">${esc(doc.subtitle)}</div>`
    : "";

  const width = doc.wide ? 760 : 600;
  // Masthead identity: Command Centre shows just the org; an office shows "{Office} | {Org}".
  const identity = isCommand
    ? `<span style="font-weight:600;color:${C.ink}">${esc(orgName)}</span>`
    : `<span style="font-weight:600;color:${C.ink}">${esc(officeLabel)}</span><span style="color:${C.faint};padding:0 6px">|</span><span style="color:${C.muted}">${esc(orgName)}</span>`;

  // Responsive email: ONE HTML that adapts to the screen. The card is FLUID
  // (width:100% capped at max-width) instead of a fixed pixel width — a fixed
  // width forces phones (iOS Mail / Gmail) to shrink the whole message to fit,
  // which made the text tiny. The media query then trims the generous desktop
  // padding + title size on narrow screens so it reads comfortably on a phone.
  // (Fluid width alone fixes the shrink even where a client strips <style>.)
  const responsiveStyle = `<style>
    @media only screen and (max-width:600px){
      .cos-outer{padding:10px 0 !important}
      .cos-card{border-radius:0 !important;border-left:0 !important;border-right:0 !important}
      .cos-pad{padding-left:18px !important;padding-right:18px !important}
      .cos-title{font-size:20px !important}
    }
  </style>`;

  return `${SIG_MARKER}${responsiveStyle}${preheader}<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.canvas};font-family:${FONT}"><tr><td class="cos-outer" align="center" style="padding:24px 12px">
<!--[if mso]><table role="presentation" width="${width}" cellpadding="0" cellspacing="0"><tr><td><![endif]-->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="cos-card" style="width:100%;max-width:${width}px;background:${C.white};border:1px solid ${C.border};border-radius:20px;overflow:hidden">
<tr><td style="height:4px;background:${C.teal};font-size:0;line-height:0">&nbsp;</td></tr>
<tr><td class="cos-pad" style="background:${C.white};padding:24px 30px 20px;border-bottom:1px solid ${C.hair}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td valign="middle">
<table role="presentation" cellpadding="0" cellspacing="0"><tr><td valign="middle" style="padding-right:11px"><img src="${logoUrl}" width="30" height="30" alt="${esc(orgName)}" style="display:block;width:30px;height:30px;border-radius:9px;border:1px solid ${C.border}"></td><td valign="middle" style="font-size:12.5px;font-family:${FONT}">${identity}</td></tr></table>
</td>${dateLabel}</tr></table>
</td></tr>
<tr><td class="cos-pad" style="padding:22px 30px 0"><div class="cos-title" style="font-size:23px;font-weight:600;color:${C.ink};letter-spacing:-0.2px;font-family:${FONT}">${esc(doc.title)}</div>${subtitle}</td></tr>
<tr><td class="cos-pad" style="padding:6px 30px 0">${noteCallout}${blocks}${cta}</td></tr>
<tr><td class="cos-pad" style="padding:8px 30px 28px;text-align:center"><div style="border-top:1px solid ${C.hair};padding-top:18px">${signHtml}${note}</div></td></tr>
</table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr></table>`;
}

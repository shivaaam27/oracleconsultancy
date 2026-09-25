// The ONE HTML email template. Every email the system sends — reminders, the
// director brief, digests, automations, calendar invitations/updates/
// cancellations/reminders, Outbox drafts, the test email — hands renderEmail()
// a STRUCTURED document (title + blocks) and gets back email-safe HTML. Change
// the look here and every email changes with it (owner, 25 Sept 2026: "we need
// to unify all of them").
//
// The look is Studio's: a grey page, a white card, a dark header band carrying
// the Oracle mark and the title, ink text, one quiet palette.
//
// How it survives the mail apps (checked against each one's known rules):
//  • A real document — doctype, <head>, viewport, `x-apple-disable-message-
//    reformatting`. Gmail (web + app) keeps a <style> in the HEAD, never one in
//    the body; the old template put its media query in the body, so Gmail never
//    ran it.
//  • Tables + inline styles for everything that matters; the <style> only
//    polishes (phone padding, dark mode). With it stripped the email is still
//    correct, because the card is fluid (width:100%, max-width 600).
//  • Dark mode: `color-scheme` + `prefers-color-scheme` rules for Apple Mail /
//    iOS Mail / Outlook.com; Gmail's apps invert on their own, and every colour
//    pair here survives inversion (the header band is dark on purpose — it
//    stays readable whichever way an app flips it).
//  • Outlook desktop: an [if mso] fixed-width wrapper; corners go square, which
//    is all it loses. No 8-digit hex, no rgba, no flex/grid, no CSS variables,
//    no web fonts, no SVG, no background images.
//
// Pure + client-safe (app-url only reads process.env), so it is testable.

import { emailAssetBaseUrl } from "@/lib/app-url";

export type EmailTone = "default" | "danger" | "warn" | "accent" | "success" | "muted";

// Who the email is "from" — drives the footer sign-off ({Office} / Oracle
// Consultancy Limited). Set per email by its source, NOT a person's job title.
// "command" = the Administrator / owner — signs plainly as Oracle Consultancy.
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
const COMPANY_SHORT_NAME = "Oracle Consultancy Ltd";

/** The inbox "from" display name for who sent it. */
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
/** A label ABOVE its value (a value always gets the full width). `html` is trusted. */
export type EmailFact = { label: string; text?: string; html?: string };
export type EmailLink = { label: string; url: string; note?: string };

export type EmailBlock =
  | { kind: "stats"; tiles: EmailStat[] }
  | { kind: "section"; label: string; rows: EmailRow[] }
  | { kind: "items"; label: string; items: EmailItem[] }
  | { kind: "list"; label?: string; bullets: string[] }
  | { kind: "text"; text: string }
  /** The opening line, a touch larger and softer than body text. */
  | { kind: "lead"; text: string }
  /** The headline answer — e.g. an event's WHEN: a big line and a coloured one under it. */
  | { kind: "hero"; label: string; big: string; small?: string }
  | { kind: "facts"; rows: EmailFact[] }
  /** A tinted panel with a left rule — "What changed", an agenda. Line breaks kept. */
  | { kind: "callout"; label: string; lines: string[]; tone?: "accent" | "danger" | "muted" }
  | { kind: "links"; label: string; links: EmailLink[] }
  /** Small print at the end of the body. */
  | { kind: "fine"; text: string }
  /** Raw, trusted HTML (built by us). Prefer a block — it keeps the look in step. */
  | { kind: "html"; html: string };

export type EmailDoc = {
  /** Hidden preview text shown in the inbox list. */
  preheader?: string;
  dateLabel?: string;
  /** The big line in the header band. Empty = a letter: the band carries only the mark. */
  title: string;
  subtitle?: string;
  /** "Hi Asha," above everything else in the body. */
  greeting?: string;
  blocks: EmailBlock[];
  cta?: { label: string; url: string };
  /** The quiet "why you got this" line in the footer. */
  footerNote?: string;
  /** Which office the email signs off as. Defaults to "admin". */
  office?: EmailOffice;
  signoffName?: string;
  /** When set it REPLACES the office + legal-name footer lines. */
  signoffTitle?: string;
  /** A personal line shown as a note above the content. */
  note?: string;
  /** Leave a slot for the configured email signature (Outbox drafts, the test
   *  email): send.ts puts the signature INSIDE the card instead of after it. */
  signature?: boolean;
  /** Kept for callers; every email is the one 600px card now. */
  wide?: boolean;
};

export type EmailBrand = {
  wordmark?: string;
  /** Absolute URL to the masthead logo. Defaults to the app's /icon-192.png. */
  logoUrl?: string;
};

// MUST stay identical to SIG_MARKER / SIG_SLOT in src/lib/email/send.ts.
const SIG_MARKER = "<!--cos-signature-->";
export const SIG_SLOT = "<!--cos-signature-slot-->";

/** Studio's palette, as flat email-safe hex. Exported for the odd bespoke bit. */
export const EMAIL_C = {
  page: "#F3F3F1", card: "#FFFFFF", line: "#E4E4E0", hair: "#ECECE8", tile: "#F7F7F5",
  ink: "#111214", body: "#34373C", muted: "#676A70",
  band: "#141517", bandText: "#FFFFFF", bandSub: "#D0D2D6", bandMuted: "#B4B7BC",
  link: "#1F6FD1", late: "#C2267A", soon: "#B26B00", ok: "#0E8A58",
  wash: { accent: "#EEF4FD", danger: "#FCEFF6", muted: "#F4F4F2" },
  rule: { accent: "#1F6FD1", danger: "#C2267A", muted: "#C9CAC6" },
};
const C = EMAIL_C;

const DOT: Record<EmailTone, string> = {
  danger: C.late, warn: C.soon, accent: C.link, success: C.ok, muted: "#A3A6AB", default: "#A3A6AB",
};

export const EMAIL_FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const FONT = EMAIL_FONT;

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
/** Escaped, with line breaks kept as <br> (never pre-wrap — Outlook ignores it). */
function escLines(s: string): string {
  return esc(s).replace(/\r?\n/g, "<br>");
}

const T = (inner: string, style = "") =>
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;${style}">${inner}</table>`;

function label(text: string, pad = "18px 0 8px"): string {
  return `<div class="em-muted" style="font-size:11px;letter-spacing:0.8px;text-transform:uppercase;color:${C.muted};font-weight:600;padding:${pad};font-family:${FONT}">${esc(text)}</div>`;
}

function renderBlock(b: EmailBlock): string {
  switch (b.kind) {
    case "stats": {
      const pct = Math.floor(100 / Math.max(1, b.tiles.length));
      const cells = b.tiles.map((t, i) => {
        const fg = t.danger ? C.late : C.ink;
        const pad = i === 0 ? "0 4px 0 0" : i === b.tiles.length - 1 ? "0 0 0 4px" : "0 4px";
        return `<td width="${pct}%" valign="top" style="padding:${pad}">${T(`<tr><td class="em-tile" align="center" style="background:${C.tile};border:1px solid ${C.hair};border-radius:14px;padding:14px 6px;font-family:${FONT}"><div class="${t.danger ? "" : "em-ink"}" style="font-size:26px;line-height:1.1;font-weight:600;color:${fg}">${esc(String(t.value))}</div><div class="em-muted" style="font-size:11px;color:${t.danger ? C.late : C.muted};padding-top:4px">${esc(t.label)}</div></td></tr>`)}</td>`;
      }).join("");
      return T(`<tr>${cells}</tr>`, "margin:4px 0 6px");
    }
    case "section": {
      const rows = b.rows.map((r, i) => {
        const border = i < b.rows.length - 1 ? `border-bottom:1px solid ${C.hair};` : "";
        return `<tr><td class="em-ink em-line" style="padding:10px 0;${border}font-size:14px;color:${C.ink};font-family:${FONT}">${esc(r.left)}</td><td class="em-muted em-line" align="right" style="padding:10px 0 10px 12px;${border}font-size:13px;color:${C.muted};font-family:${FONT};white-space:nowrap">${r.right ? esc(r.right) : ""}</td></tr>`;
      }).join("");
      return label(b.label) + T(rows);
    }
    case "items": {
      const rows = b.items.map((it, i) => {
        const border = i < b.items.length - 1 ? `border-bottom:1px solid ${C.hair};` : "";
        const dotColor = it.pill ? DOT[it.pill.tone] : DOT.default;
        const dot = `<td valign="top" width="16" style="width:16px;padding:16px 0 0 0"><div style="width:7px;height:7px;border-radius:4px;background:${dotColor};font-size:0;line-height:0">&nbsp;</div></td>`;
        const pillLabel = it.pill ? `<span style="color:${dotColor};font-weight:600">${esc(it.pill.label)}</span>` : "";
        const metaText = it.meta ? esc(it.meta) : "";
        const metaInner = pillLabel + (pillLabel && metaText ? " &middot; " : "") + metaText;
        const meta = metaInner ? `<div class="em-muted" style="font-size:12px;color:${C.muted};padding-top:2px;font-family:${FONT}">${metaInner}</div>` : "";
        return `<tr>${dot}<td class="em-line" valign="top" style="padding:12px 0;${border}"><div class="em-ink" style="font-size:14px;color:${C.ink};line-height:1.4;font-family:${FONT}">${esc(it.title)}</div>${meta}</td></tr>`;
      }).join("");
      return label(b.label) + T(rows);
    }
    case "list": {
      const items = b.bullets.map((t) =>
        `<tr><td valign="top" class="em-muted" style="padding:5px 8px 5px 0;color:${C.muted};font-family:${FONT}">&bull;</td><td class="em-body" style="padding:5px 0;font-size:14px;color:${C.body};line-height:1.5;font-family:${FONT}">${esc(t)}</td></tr>`
      ).join("");
      return (b.label ? label(b.label) : "") + T(items, "margin-top:2px");
    }
    case "lead":
      return `<div class="em-body" style="font-size:15px;line-height:1.55;color:${C.body};padding:4px 0 10px;font-family:${FONT}">${escLines(b.text)}</div>`;
    case "hero":
      return `${label(b.label, "10px 0 6px")}<div class="em-ink" style="font-size:20px;font-weight:600;line-height:1.3;color:${C.ink};font-family:${FONT}">${esc(b.big)}</div>${b.small ? `<div class="em-link" style="font-size:16px;line-height:1.4;font-weight:600;color:${C.link};padding-top:3px;font-family:${FONT}">${esc(b.small)}</div>` : ""}`;
    case "facts": {
      const rows = b.rows.map((f) =>
        `<tr><td style="padding:0 0 14px">${label(f.label, "0 0 3px")}<div class="em-ink" style="font-size:15px;line-height:1.5;color:${C.ink};font-family:${FONT};word-break:break-word">${f.html ?? escLines(f.text ?? "")}</div></td></tr>`
      ).join("");
      return `<div style="height:16px;line-height:16px;font-size:0">&nbsp;</div>${T(rows)}`;
    }
    case "callout": {
      const tone = b.tone ?? "accent";
      const lines = b.lines.map((l) => `<div class="em-ink" style="font-size:15px;line-height:1.55;color:${C.ink};font-family:${FONT}">${escLines(l)}</div>`).join("");
      return T(`<tr><td class="em-wash" style="background:${C.wash[tone]};border-left:3px solid ${C.rule[tone]};border-radius:0 12px 12px 0;padding:11px 14px"><div style="font-size:11px;letter-spacing:0.8px;text-transform:uppercase;font-weight:600;color:${tone === "muted" ? C.muted : C.rule[tone]};padding-bottom:5px;font-family:${FONT}">${esc(b.label)}</div>${lines}</td></tr>`, "margin:12px 0 4px");
    }
    case "links": {
      const rows = b.links.map((l) =>
        `<div style="padding:0 0 7px;font-family:${FONT}"><a class="em-link" href="${esc(l.url)}" style="color:${C.link};font-size:15px;font-weight:600;text-decoration:none;word-break:break-word">${esc(l.label)}</a>${l.note ? `<div class="em-muted" style="color:${C.muted};font-size:12.5px;padding-top:1px">${esc(l.note)}</div>` : ""}</div>`
      ).join("");
      return label(b.label, "14px 0 6px") + rows;
    }
    case "fine":
      return `<div class="em-muted" style="font-size:12px;line-height:1.5;color:${C.muted};padding:16px 0 0;font-family:${FONT}">${escLines(b.text)}</div>`;
    case "html":
      return b.html; // trusted, built by us
    case "text":
    default:
      return `<div class="em-body" style="font-size:14.5px;color:${C.body};line-height:1.6;padding:6px 0;font-family:${FONT}">${escLines((b as { text: string }).text)}</div>`;
  }
}

/** A filled, full-width button — easy to hit on a phone, square in Outlook. */
export function emailButton(url: string, text: string): string {
  return T(`<tr><td class="em-btn" align="center" style="background:${C.ink};border-radius:12px"><a href="${esc(url)}" style="display:block;color:#FFFFFF;font-size:15px;font-weight:600;text-decoration:none;padding:14px 22px;font-family:${FONT}">${esc(text)}</a></td></tr>`, "margin:20px 0 4px");
}

const HEAD_STYLE = `
  body{margin:0!important;padding:0!important;width:100%!important;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%}
  table{border-collapse:collapse}
  img{border:0;outline:none;text-decoration:none}
  a{text-decoration:none}
  @media only screen and (max-width:620px){
    .em-outer{padding:0!important}
    .em-card{border-radius:0!important;border-left:0!important;border-right:0!important}
    .em-pad{padding-left:18px!important;padding-right:18px!important}
    .em-bandpad{padding:20px 18px 22px!important}
    .em-title{font-size:23px!important}
  }
  @media (prefers-color-scheme:dark){
    .em-page{background:#0E0F10!important}
    .em-card{background:#17181B!important;border-color:#2A2C30!important}
    .em-ink{color:#F2F2F0!important}
    .em-body{color:#D4D6DA!important}
    .em-muted{color:#B4B7BC!important}
    .em-line{border-color:#2A2C30!important}
    .em-tile{background:#1F2023!important;border-color:#2A2C30!important}
    .em-wash{background:#1F2023!important}
    .em-btn{background:#F2F2F0!important}
    .em-btn a{color:#111214!important}
    .em-foot{border-color:#2A2C30!important}
    .em-band{background:#26282C!important}
    .em-link{color:#8AB8FF!important}
  }
  [data-ogsc] .em-page{background:#0E0F10!important}
  [data-ogsc] .em-card{background:#17181B!important}
  [data-ogsc] .em-ink{color:#F2F2F0!important}
  [data-ogsc] .em-body{color:#D4D6DA!important}
  [data-ogsc] .em-muted{color:#B4B7BC!important}
`;

export function renderEmail(doc: EmailDoc, brand: EmailBrand = {}): string {
  const officeLabel = OFFICE_LABELS[doc.office ?? "admin"];
  const isCommand = doc.office === "command";
  const orgName = brand.wordmark || COMPANY_SHORT_NAME;
  // emailAssetBaseUrl, not appBaseUrl: an IMAGE must be fetchable from the
  // reader's inbox (links may point at localhost in dev; images must not).
  const logoUrl = brand.logoUrl ?? `${emailAssetBaseUrl()}/icon-192.png`;

  const blocks = doc.blocks.map(renderBlock).join("");
  const cta = doc.cta ? emailButton(doc.cta.url, doc.cta.label) : "";

  const greeting = doc.greeting
    ? `<div class="em-ink" style="font-size:15px;color:${C.ink};padding:2px 0 8px;font-family:${FONT}">${esc(doc.greeting)}</div>`
    : "";
  const noteCallout = doc.note
    ? T(`<tr><td class="em-wash" style="background:${C.wash.muted};border-left:3px solid ${C.rule.muted};border-radius:0 12px 12px 0;padding:12px 15px"><div class="em-ink" style="font-size:14.5px;color:${C.ink};line-height:1.55;font-family:${FONT}">${escLines(doc.note)}</div>${doc.signoffName ? `<div class="em-muted" style="font-size:12px;color:${C.muted};padding-top:5px;font-family:${FONT}">&mdash; ${esc(doc.signoffName)}</div>` : ""}</td></tr>`, "margin:4px 0 10px")
    : "";

  // Footer sign-off:
  //  • person + title  → "Mr Pulin Manek" / "Director - Oracle Consultancy Ltd";
  //  • person, no title → name / office / legal name;
  //  • Administrator   → Oracle Consultancy / legal name;
  //  • system (no name) → office / legal name.
  const bold = (s: string) => `<div class="em-ink" style="font-size:13px;font-weight:600;color:${C.ink};font-family:${FONT}">${esc(s)}</div>`;
  const quiet = (s: string) => `<div class="em-muted" style="font-size:12px;color:${C.muted};padding-top:2px;font-family:${FONT}">${esc(s)}</div>`;
  const signHtml = doc.signoffName && doc.signoffTitle
    ? bold(doc.signoffName) + quiet(doc.signoffTitle)
    : doc.signoffName
      ? bold(doc.signoffName) + quiet(officeLabel) + quiet(COMPANY_LEGAL_NAME)
      : isCommand
        ? bold(COMPANY_SHORT_NAME) + quiet(COMPANY_LEGAL_NAME)
        : bold(officeLabel) + quiet(COMPANY_LEGAL_NAME);
  const footNote = doc.footerNote
    ? `<div class="em-muted" style="font-size:11.5px;color:${C.muted};padding-top:12px;line-height:1.5;font-family:${FONT}">${esc(doc.footerNote)}</div>`
    : "";
  const sigSlot = doc.signature ? SIG_SLOT : "";

  const preheader = doc.preheader
    ? `<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all">${esc(doc.preheader)}&#8199;&#65279;&#847;&#8199;&#65279;&#847;&#8199;&#65279;&#847;</div>`
    : "";

  // The header band: the mark + who it is from, the date, then the title.
  const identity = isCommand
    ? `<span style="font-weight:600;color:${C.bandText}">${esc(orgName)}</span>`
    : `<span style="font-weight:600;color:${C.bandText}">${esc(officeLabel)}</span><span style="color:${C.bandMuted}">&nbsp;&middot;&nbsp;${esc(orgName)}</span>`;
  const date = doc.dateLabel ? `<td align="right" valign="middle" style="font-size:12px;color:${C.bandMuted};font-family:${FONT};white-space:nowrap">${esc(doc.dateLabel)}</td>` : "";
  const title = doc.title
    ? `<div class="em-title" style="font-size:26px;line-height:1.2;font-weight:600;letter-spacing:-0.4px;color:${C.bandText};padding-top:20px;font-family:${FONT}">${esc(doc.title)}</div>${doc.subtitle ? `<div style="font-size:14px;line-height:1.45;color:${C.bandSub};padding-top:6px;font-family:${FONT}">${esc(doc.subtitle)}</div>` : ""}`
    : "";
  const band = `<tr><td style="padding:8px 8px 0">${T(`<tr><td class="em-bandpad em-band" style="background:${C.band};border-radius:16px;padding:20px 24px ${doc.title ? "24px" : "20px"}">
${T(`<tr><td valign="middle">${T(`<tr><td valign="middle" style="padding-right:10px"><img src="${logoUrl}" width="28" height="28" alt="" style="display:block;width:28px;height:28px;border-radius:8px;background:#FFFFFF"></td><td valign="middle" style="font-size:13px;font-family:${FONT}">${identity}</td></tr>`, "width:auto")}</td>${date}</tr>`)}
${title}
</td></tr>`)}</td></tr>`;

  const card = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="em-card" style="width:100%;max-width:600px;border-collapse:separate;background:${C.card};border:1px solid ${C.line};border-radius:22px">
${band}
<tr><td class="em-pad" style="padding:20px 28px 4px">${greeting}${noteCallout}${blocks}${cta}</td></tr>
<tr><td class="em-pad" style="padding:6px 28px 26px">${sigSlot}<div class="em-foot" style="border-top:1px solid ${C.hair};margin-top:18px;padding-top:16px;text-align:center">${signHtml}${footNote}</div></td></tr>
</table>`;

  return `<!DOCTYPE html>
<html lang="en-GB" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="format-detection" content="telephone=no,date=no,address=no,email=no">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${esc(doc.title || orgName)}</title>
<style>${HEAD_STYLE}</style>
</head>
<body class="em-page" style="margin:0;padding:0;background:${C.page}">
${SIG_MARKER}<!--cos-body-start-->${preheader}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="em-page" style="width:100%;background:${C.page}"><tr><td class="em-outer" align="center" style="padding:24px 12px">
<!--[if mso]><table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
${card}
<!--[if mso]></td></tr></table><![endif]-->
</td></tr></table>
</body>
</html>`;
}

/** A plain message (an Outbox draft, a test email, an ORI alert) in the same
 *  shell: the band carries the mark and, if given, a title; the body is the
 *  text; the configured signature goes inside the card. */
export function renderPlainEmail(text: string, opts: { title?: string; office?: EmailOffice; signature?: boolean; preheader?: string } = {}): string {
  return renderEmail({
    title: opts.title ?? "",
    office: opts.office ?? "command",
    preheader: opts.preheader ?? text.slice(0, 120),
    signature: opts.signature ?? true,
    blocks: [{ kind: "text", text }],
  });
}

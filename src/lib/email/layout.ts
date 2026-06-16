// The shared HTML email template. Every automation hands renderEmail() a
// STRUCTURED document (title + blocks) and gets back email-safe HTML — old-school
// tables + inline styles so Gmail, Outlook and Apple Mail all render it the same.
// Change the look here and all the emails update together.
//
// Pure + client-safe (no server imports), so it's trivially testable.

export type EmailTone = "default" | "danger" | "warn" | "accent" | "success" | "muted";

// Who the email is "from" — drives the footer sign-off ({Office} / Oracle
// Consultancy Limited). Set per email by its source, NOT a person's job title.
export type EmailOffice = "director" | "admin" | "compliance" | "hr";

export const OFFICE_LABELS: Record<EmailOffice, string> = {
  director: "Director's Office",
  admin: "Admin's Office",
  compliance: "Admin Compliance Office",
  hr: "Admin HR Office",
};

const COMPANY_LEGAL_NAME = "Oracle Consultancy Limited";

export type EmailStat = { value: string | number; label: string; danger?: boolean };
export type EmailRow = { left: string; right?: string };
export type EmailItem = { pill?: { label: string; tone: EmailTone }; title: string; meta?: string };

export type EmailBlock =
  | { kind: "stats"; tiles: EmailStat[] }
  | { kind: "section"; label: string; rows: EmailRow[] }
  | { kind: "items"; label: string; items: EmailItem[] }
  | { kind: "list"; label?: string; bullets: string[] }
  | { kind: "text"; text: string };

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
};

export type EmailBrand = {
  /** Top-left wordmark. */
  wordmark?: string;
};

// MUST stay identical to SIG_MARKER in src/lib/email/send.ts — its presence tells
// the central signature step this html already owns its footer (no double-sign).
const SIG_MARKER = "<!--cos-signature-->";

const C = {
  ink: "#0f172a", body: "#334155", muted: "#64748b", faint: "#94a3b8",
  hair: "#eef0f2", border: "#e6e8eb", tile: "#f5f6f8", canvas: "#f4f5f7",
  teal: "#0f6e56", white: "#ffffff",
};

const PILL: Record<EmailTone, { bg: string; fg: string }> = {
  danger: { bg: "#fef2f2", fg: "#b91c1c" },
  warn: { bg: "#fef3e2", fg: "#854f0b" },
  accent: { bg: "#e1f5ee", fg: "#0f6e56" },
  success: { bg: "#e1f5ee", fg: "#0f6e56" },
  muted: { bg: "#f1f5f9", fg: "#475569" },
  default: { bg: "#f1f5f9", fg: "#475569" },
};

const FONT = "-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif";

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function sectionLabel(label: string): string {
  return `<div style="font-size:11px;letter-spacing:1px;text-transform:uppercase;color:${C.teal};padding:18px 0 8px;font-family:${FONT}">${esc(label)}</div>`;
}

function renderBlock(b: EmailBlock): string {
  if (b.kind === "stats") {
    const cells = b.tiles.map((t) => {
      const fg = t.danger ? "#b91c1c" : C.ink;
      const lab = t.danger ? "#b91c1c" : C.muted;
      const bg = t.danger ? "#fef2f2" : C.tile;
      return `<td width="25%" style="padding:4px"><div style="background:${bg};border-radius:10px;padding:12px 6px;text-align:center;font-family:${FONT}"><div style="font-size:22px;font-weight:600;color:${fg}">${esc(String(t.value))}</div><div style="font-size:11px;color:${lab};padding-top:2px">${esc(t.label)}</div></div></td>`;
    }).join("");
    return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:6px 0"><tr>${cells}</tr></table>`;
  }
  if (b.kind === "section") {
    const rows = b.rows.map((r, i) => {
      const border = i < b.rows.length - 1 ? `border-bottom:1px solid ${C.hair};` : "";
      return `<tr><td style="padding:9px 0;${border}font-size:14px;color:${C.ink};font-family:${FONT}">${esc(r.left)}</td><td align="right" style="padding:9px 0;${border}font-size:13px;color:${C.muted};font-family:${FONT}">${r.right ? esc(r.right) : ""}</td></tr>`;
    }).join("");
    return `${sectionLabel(b.label)}<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table>`;
  }
  if (b.kind === "items") {
    const items = b.items.map((it) => {
      const pill = it.pill
        ? `<td valign="top" style="padding:2px 10px 0 0"><span style="font-size:11px;font-weight:600;color:${PILL[it.pill.tone].fg};background:${PILL[it.pill.tone].bg};padding:3px 9px;border-radius:6px;white-space:nowrap;font-family:${FONT}">${esc(it.pill.label)}</span></td>`
        : "";
      const meta = it.meta ? `<div style="font-size:12px;color:${C.faint};padding-top:2px;font-family:${FONT}">${esc(it.meta)}</div>` : "";
      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:12px"><tr>${pill}<td valign="top"><div style="font-size:14px;color:${C.ink};font-family:${FONT}">${esc(it.title)}</div>${meta}</td></tr></table>`;
    }).join("");
    return `${sectionLabel(b.label)}${items}`;
  }
  if (b.kind === "list") {
    const head = b.label ? sectionLabel(b.label) : "";
    const items = b.bullets.map((t) =>
      `<tr><td valign="top" style="padding:5px 8px 5px 0;color:${C.teal};font-family:${FONT}">&bull;</td><td style="padding:5px 0;font-size:14px;color:${C.body};line-height:1.5;font-family:${FONT}">${esc(t)}</td></tr>`
    ).join("");
    return `${head}<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:2px">${items}</table>`;
  }
  // text
  return `<div style="font-size:14px;color:${C.body};line-height:1.6;padding:6px 0;font-family:${FONT};white-space:pre-wrap">${esc(b.text).replace(/\n/g, "<br>")}</div>`;
}

export function renderEmail(doc: EmailDoc, brand: EmailBrand = {}): string {
  const wordmark = (brand.wordmark || "Oracle Consultancy").toUpperCase();
  const blocks = doc.blocks.map(renderBlock).join("");

  const cta = doc.cta
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px 0 4px"><tr><td style="background:${C.teal};border-radius:10px"><a href="${doc.cta.url}" style="display:inline-block;color:${C.white};font-size:14px;font-weight:600;text-decoration:none;padding:11px 22px;font-family:${FONT}">${esc(doc.cta.label)} &rarr;</a></td></tr></table>`
    : "";

  const officeLabel = OFFICE_LABELS[doc.office ?? "admin"];
  const signHtml =
    `<div style="font-size:13px;font-weight:600;color:${C.ink};font-family:${FONT}">${esc(officeLabel)}</div>` +
    `<div style="font-size:12px;color:${C.muted};padding-top:2px;font-family:${FONT}">${esc(COMPANY_LEGAL_NAME)}</div>`;
  const note = doc.footerNote
    ? `<div style="font-size:11px;color:#b6bdc6;padding-top:14px;line-height:1.5;font-family:${FONT}">${esc(doc.footerNote)}</div>`
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

  return `${SIG_MARKER}${preheader}<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.canvas};padding:24px 0;font-family:${FONT}"><tr><td align="center"><table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:600px;background:${C.white};border:1px solid ${C.border};border-radius:16px;overflow:hidden">
<tr><td style="height:3px;background:${C.teal};font-size:0;line-height:0">&nbsp;</td></tr>
<tr><td style="padding:26px 30px 0">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="font-size:11px;letter-spacing:1.5px;color:${C.muted};font-family:${FONT}">${esc(wordmark)}</td>${dateLabel}</tr></table>
<div style="padding-top:18px"><div style="font-size:22px;font-weight:600;color:${C.ink};font-family:${FONT}">${esc(doc.title)}</div>${subtitle}</div>
</td></tr>
<tr><td style="padding:14px 30px 0">${blocks}${cta}</td></tr>
<tr><td style="padding:22px 30px 26px"><div style="border-top:1px solid ${C.hair};padding-top:18px">${signHtml}${note}</div></td></tr>
</table></td></tr></table>`;
}

// Channel deep-links + message building for one-off reminders.
// Times are formatted in the operator's business zone (East Africa Time).

import { BRAND_NAME } from "../brand";

export type Channel = "WHATSAPP" | "EMAIL" | "SMS";
const BIZ_TZ = "Africa/Nairobi"; // EAT (UTC+3, no DST) — same offset as Dar es Salaam.

// Default country code for numbers stored in LOCAL format (e.g. "0686…").
// Tanzania (+255) — the office's home country. Numbers already in international
// form ("+255…", "+91…") are left as-is.
const DEFAULT_CC = "255";

/** Digits-only (for sms:, which dials local format fine). */
function digits(n: string | null | undefined): string {
  return (n ?? "").replace(/\D/g, "");
}

/**
 * International MSISDN for wa.me — WhatsApp REQUIRES a country code and rejects a
 * leading 0 / "+", so a locally-stored "0686450999" must become "255686450999"
 * or the link fails to open ("phone number is invalid"). Leaves already-international
 * numbers (+255…, +91…, 00…) untouched.
 */
function intlDigits(n: string | null | undefined): string {
  const raw = (n ?? "").trim();
  if (!raw) return "";
  if (raw.startsWith("+")) return raw.replace(/\D/g, "");        // already international
  const d = raw.replace(/\D/g, "");
  if (!d) return "";
  if (d.startsWith("00")) return d.slice(2);                     // 00 = international prefix
  if (d.startsWith("0")) return DEFAULT_CC + d.slice(1);         // local → international
  if (d.length <= 9) return DEFAULT_CC + d;                      // bare local subscriber number
  return d;                                                       // assume it already carries a country code
}

/** wa.me link with the message pre-filled (number normalised to international). */
export function waLink(number: string | null, text: string): string | null {
  const d = intlDigits(number);
  return d ? `https://wa.me/${d}?text=${encodeURIComponent(text)}` : null;
}

export function mailtoLink(email: string | null, subject: string, body: string): string | null {
  if (!email) return null;
  return `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export function smsLink(number: string | null, text: string): string | null {
  const d = digits(number);
  return d ? `sms:${d}?body=${encodeURIComponent(text)}` : null;
}

export function channelLabel(c: Channel): string {
  return c === "WHATSAPP" ? "WhatsApp" : c === "EMAIL" ? "Email" : "SMS";
}

type PersonContact = {
  whatsapp: string | null;
  email: string | null;
  phone: string | null;
  preferredChannel: string | null;
};

/** Pick the best channel: preferred if it has contact, else first available. */
export function pickChannel(p: PersonContact): Channel {
  const pref = (p.preferredChannel?.toUpperCase() as Channel) || null;
  const ok = (c: Channel) => (c === "WHATSAPP" ? !!p.whatsapp : c === "EMAIL" ? !!p.email : !!p.phone);
  if (pref && ok(pref)) return pref;
  if (p.whatsapp) return "WHATSAPP";
  if (p.email) return "EMAIL";
  if (p.phone) return "SMS";
  return pref || "WHATSAPP";
}

export function contactForChannel(p: PersonContact, c: Channel): string | null {
  return c === "WHATSAPP" ? p.whatsapp : c === "EMAIL" ? p.email : p.phone;
}

/** Build the channel deep-link for a saved draft. */
export function linkFor(channel: Channel, contact: string | null, subject: string | null, body: string): string | null {
  if (channel === "WHATSAPP") return waLink(contact, body);
  if (channel === "SMS") return smsLink(contact, body);
  return mailtoLink(contact, subject || "Reminder", body);
}

function fmtDue(dueAt: string | null): string | null {
  if (!dueAt) return null;
  const d = new Date(dueAt);
  const timed = d.getUTCHours() !== 0 || d.getUTCMinutes() !== 0; // date-only todos are stored at UTC midnight
  return d.toLocaleString("en-GB", {
    weekday: "short", day: "numeric", month: "short",
    ...(timed ? { hour: "2-digit", minute: "2-digit" } : {}),
    timeZone: BIZ_TZ,
  });
}

/** A short, friendly reminder message for a single to-do. */
export function buildTodoReminderMessage(
  channel: Channel,
  opts: { personName: string; title: string; dueAt: string | null; company: string | null },
): { subject: string; body: string } {
  const due = fmtDue(opts.dueAt);
  const tail = `${opts.title}${due ? ` — due ${due}` : ""}${opts.company ? ` (${opts.company})` : ""}`;
  const subject = `Reminder: ${opts.title}`;
  if (channel === "EMAIL") {
    const body = `Hi ${opts.personName},\n\nA quick reminder: ${tail}.\n\nThanks,\n${BRAND_NAME}`;
    return { subject, body };
  }
  // WhatsApp / SMS — concise.
  return { subject, body: `Hi ${opts.personName}, a quick reminder: ${tail}. Thanks.` };
}

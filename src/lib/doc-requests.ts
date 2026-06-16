// Document request + renewal-notice emails. Both reuse the branded template and
// the real email sender, and log a Sent row to the Outbox.

import { sb } from "@/db/supabase";
import { renderEmail, senderName, type EmailDoc, type EmailOffice } from "@/lib/email/layout";
import { sendEmail } from "@/lib/email/send";
import { appBaseUrl } from "@/lib/app-url";

export type DocSender = { office?: EmailOffice; name?: string | null; sourceTag?: string };

export type DocEmailResult = {
  ok: boolean;
  reason?: "no-email" | "no-items" | "no-recipient" | "not-configured" | "not-found" | "error";
  error?: string;
  count?: number;
};

/**
 * Email a person the list of their still-missing required documents and flip those
 * requirements to "requested". The email offers BOTH the portal upload and a
 * reply-with-files option.
 */
export async function sendDocumentRequestEmail(opts: {
  personId: number;
  sender?: DocSender;
}): Promise<DocEmailResult> {
  const { data: person } = await sb.from("people").select("id,name,email").eq("id", opts.personId).maybeSingle();
  if (!person) return { ok: false, reason: "not-found", error: "Person not found." };
  const email = ((person.email as string | null) ?? "").trim();
  if (!email) return { ok: false, reason: "no-email" };

  const { data: reqs } = await sb
    .from("person_requirements")
    .select("id,label,status")
    .eq("person_id", opts.personId)
    .eq("status", "missing");
  const items = (reqs ?? []).filter((r) => ((r.label as string | null) ?? "").trim());
  if (items.length === 0) return { ok: false, reason: "no-items" };

  const name = person.name as string;
  const first = name.split(" ")[0];
  const doc: EmailDoc = {
    title: "Documents needed",
    subtitle: `Hi ${first} — ${items.length === 1 ? "one item" : "a few items"} to complete your file`,
    blocks: [
      { kind: "text", text: "To keep your records complete and compliant, please send us the documents below when you can." },
      { kind: "items", label: "Outstanding documents", items: items.map((r) => ({ pill: { label: "Needed", tone: "muted" }, title: r.label as string })) },
      { kind: "text", text: "Two easy ways to send them — whichever suits you:\n• Tap the button below to upload in the staff portal, or\n• Simply reply to this email with the files attached." },
    ],
    cta: { label: "Upload in the portal", url: `${appBaseUrl()}/portal` },
    footerNote: "You're receiving this because some required documents are still outstanding on your file.",
    office: opts.sender?.office ?? "admin",
    signoffName: opts.sender?.name ?? undefined,
  };
  const text =
    `Hi ${first},\n\nPlease send us the following documents:\n${items.map((r) => `• ${r.label}`).join("\n")}\n\n` +
    `Upload them in the staff portal (${appBaseUrl()}/portal) or simply reply to this email with the files attached.\n\nThank you.`;

  const res = await sendEmail({ to: email, subject: "Documents needed", text, html: renderEmail(doc), fromName: senderName(opts.sender?.office) });
  if (!res.ok) return res.reason === "not-configured" ? { ok: false, reason: "not-configured" } : { ok: false, reason: "error", error: res.error };

  const now = new Date().toISOString();
  await sb.from("person_requirements").update({ status: "requested", updated_at: now }).eq("person_id", opts.personId).eq("status", "missing");
  await sb.from("outbox").insert({
    channel: "EMAIL", recipient_name: name, recipient_contact: email,
    subject: "Documents needed", body: text, message_type: "DOCUMENT REQUEST", status: "Sent",
    source: opts.sender?.sourceTag ?? "doc-request:admin", person_id: person.id, created_at: now, sent_at: now,
  });
  return { ok: true, count: items.length };
}

/**
 * Email the party responsible for a document a branded renewal notice. Recipient
 * is the document's person (if person-owned), else the company's email address.
 */
export async function sendDocumentRenewalNotice(opts: {
  documentId: number;
  sender?: DocSender;
}): Promise<DocEmailResult> {
  const { data: d } = await sb
    .from("documents")
    .select("id,title,expiry_date,person_id,company_id")
    .eq("id", opts.documentId)
    .maybeSingle();
  if (!d) return { ok: false, reason: "not-found", error: "Document not found." };

  // Resolve recipient: person owner first, else the company's email.
  let toEmail: string | null = null;
  let toName = "";
  let companyName: string | null = null;
  if (d.person_id) {
    const { data: p } = await sb.from("people").select("name,email").eq("id", d.person_id as number).maybeSingle();
    toEmail = ((p?.email as string | null) ?? "").trim() || null;
    toName = (p?.name as string | null) ?? "";
  }
  if (d.company_id) {
    const { data: c } = await sb.from("companies").select("name,email").eq("id", d.company_id as number).maybeSingle();
    companyName = (c?.name as string | null) ?? null;
    if (!toEmail) {
      toEmail = ((c?.email as string | null) ?? "").trim() || null;
      toName = companyName ?? "";
    }
  }
  if (!toEmail) return { ok: false, reason: "no-recipient" };

  const expiry = d.expiry_date ? new Date(d.expiry_date as string) : null;
  const expired = !!expiry && expiry.getTime() < Date.now();
  const expiryLabel = expiry ? expiry.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Africa/Nairobi" }) : "soon";
  const title = d.title as string;

  const doc: EmailDoc = {
    title: expired ? "Renewal overdue" : "Renewal due",
    subtitle: companyName ? `Action needed · ${companyName}` : "Action needed on a document",
    blocks: [
      { kind: "items", label: "Document", items: [{
        pill: { label: expired ? "Expired" : "Expiring", tone: expired ? "danger" : "warn" },
        title,
        meta: [companyName, expired ? `expired ${expiryLabel}` : `expires ${expiryLabel}`].filter(Boolean).join(" · "),
      }] },
      { kind: "text", text: "Please arrange the renewal before it lapses to avoid penalties. Once renewed, send us the updated document — upload it in the portal or reply to this email with the file attached." },
    ],
    cta: { label: "Upload the renewed document", url: `${appBaseUrl()}/portal` },
    footerNote: "You're receiving this because a document you're responsible for needs renewing.",
    office: opts.sender?.office ?? "compliance",
    signoffName: opts.sender?.name ?? undefined,
  };
  const text =
    `${expired ? "Renewal overdue" : "Renewal due"}: ${title}${companyName ? ` (${companyName})` : ""} — ${expired ? "expired" : "expires"} ${expiryLabel}.\n\n` +
    `Please arrange the renewal. Once renewed, upload it in the portal (${appBaseUrl()}/portal) or reply to this email with the file attached.\n\nThank you.`;

  const res = await sendEmail({ to: toEmail, subject: `Renewal ${expired ? "overdue" : "due"}: ${title}`, text, html: renderEmail(doc), fromName: senderName(opts.sender?.office) });
  if (!res.ok) return res.reason === "not-configured" ? { ok: false, reason: "not-configured" } : { ok: false, reason: "error", error: res.error };

  const now = new Date().toISOString();
  await sb.from("outbox").insert({
    channel: "EMAIL", recipient_name: toName || "Recipient", recipient_contact: toEmail,
    subject: `Renewal ${expired ? "overdue" : "due"}: ${title}`, body: text, message_type: "RENEWAL NOTICE", status: "Sent",
    source: opts.sender?.sourceTag ?? "renewal-notice:admin", company: companyName,
    person_id: (d.person_id as number | null) ?? null, created_at: now, sent_at: now,
  });
  return { ok: true, count: 1 };
}

// The single "remind this person about their tasks" engine. Both the admin Outbox
// and (later) the portal team view call this — reuse, don't duplicate. It gathers
// the person's open tasks, builds the branded email (+ optional personal note and
// sender sign-off), sends it for real, and logs a Sent row so it shows in the
// Outbox sent log and feeds the chase-cooldown.

import { sb } from "@/db/supabase";
import { getAllTasks } from "@/lib/queries";
import { isOpen } from "@/lib/derive";
import { buildTaskReminderDoc, buildEmailMessage, buildWhatsAppMessage } from "@/lib/outbox/gen";
import { renderEmail, senderName, type EmailOffice } from "@/lib/email/layout";
import { sendEmail } from "@/lib/email/send";
import { sendWhatsApp } from "@/lib/whatsapp";
import { waCardImageUrl, waReminderLink } from "@/lib/wa-card";

export type ReminderSender = {
  /** Office the email signs off as (admin / manager / director). Defaults to admin. */
  office?: EmailOffice;
  /** Sender's name, shown above the office line (e.g. a manager). */
  name?: string | null;
  /** Sender's title under the name, e.g. "Director - Oracle Consultancy Ltd". */
  title?: string | null;
  /** Sender's own email — set as Reply-To so replies reach them (portal sends). */
  replyTo?: string | null;
  /** Sender's own address to send AS (Resend + verified domain only; ignored on
   *  Gmail SMTP). Usually the same as replyTo. */
  fromAddress?: string | null;
  /** For the sent-log source stamp, e.g. "admin" or "portal-mgr:Jane". */
  sourceTag?: string;
};

export type SendReminderResult = {
  ok: boolean;
  reason?: "no-email" | "no-tasks" | "not-configured" | "not-found" | "error";
  error?: string;
};

/** Send one person their branded task-reminder email. */
export async function sendTaskReminderEmail(opts: {
  personId: number;
  /** When set, the email covers ONLY this task (per-task reminder); else all open tasks. */
  taskId?: number;
  note?: string | null;
  sender?: ReminderSender;
}): Promise<SendReminderResult> {
  const { data: person } = await sb
    .from("people")
    .select("id,name,email")
    .eq("id", opts.personId)
    .maybeSingle();
  if (!person) return { ok: false, reason: "not-found", error: "Person not found." };

  const email = ((person.email as string | null) ?? "").trim();
  if (!email) return { ok: false, reason: "no-email" };

  let rows = (await getAllTasks()).filter(
    (t) => isOpen(t.status) && t.assigneeIds.includes(person.id as number),
  );
  if (opts.taskId != null) rows = rows.filter((t) => t.id === opts.taskId);
  if (rows.length === 0) return { ok: false, reason: "no-tasks" };

  const name = person.name as string;
  const note = opts.note?.trim() || undefined;
  const doc = buildTaskReminderDoc(name, rows, {
    office: opts.sender?.office ?? "admin",
    signoffName: opts.sender?.name ?? undefined,
    signoffTitle: opts.sender?.title ?? undefined,
    note,
  });
  const text = (note ? `${note}\n\n` : "") + buildEmailMessage(name, rows);
  const subject = "Your Outstanding Tasks";

  const res = await sendEmail({
    to: email, subject, text, html: renderEmail(doc),
    fromName: senderName(opts.sender?.office),
    fromAddress: opts.sender?.fromAddress ?? undefined,
    replyTo: opts.sender?.replyTo ?? undefined,
  });
  if (!res.ok) {
    if (res.reason === "not-configured") return { ok: false, reason: "not-configured" };
    return { ok: false, reason: "error", error: res.error };
  }

  const iso = new Date().toISOString();
  await sb.from("outbox").insert({
    channel: "EMAIL",
    recipient_name: name,
    recipient_contact: email,
    subject,
    body: text,
    message_type: "TASK REMINDER",
    status: "Sent",
    source: opts.sender?.sourceTag ?? "reminder:admin",
    person_id: person.id,
    created_at: iso,
    sent_at: iso,
  });

  return { ok: true };
}

/**
 * Send one person their rich WhatsApp task reminder via Twilio — the formatted
 * card (buildWhatsAppMessage) as the caption, with their generated summary image
 * as the header. Returns `not-configured` so the caller can fall back to a wa.me
 * deep-link when Twilio env isn't set. Logs a Sent row like the email path.
 *
 * NOTE: free-form text+media only delivers inside an open 24h session window (or
 * the sandbox). Once a production number is live, swap to an approved template.
 */
export async function sendTaskReminderWhatsApp(opts: {
  personId: number;
  sourceTag?: string;
  /** "from who" caption for the link card + summary image (e.g. "Jane · Manager"). */
  from?: string;
}): Promise<SendReminderResult> {
  const { data: person } = await sb
    .from("people")
    .select("id,name,whatsapp,phone")
    .eq("id", opts.personId)
    .maybeSingle();
  if (!person) return { ok: false, reason: "not-found", error: "Person not found." };

  const to = ((person.whatsapp as string | null) ?? (person.phone as string | null) ?? "").trim();
  if (!to) return { ok: false, reason: "no-email" }; // reuses the "no contact" reason

  const rows = (await getAllTasks()).filter(
    (t) => isOpen(t.status) && t.assigneeIds.includes(person.id as number),
  );
  if (rows.length === 0) return { ok: false, reason: "no-tasks" };

  const name = person.name as string;
  const text = buildWhatsAppMessage(name, rows, waReminderLink(person.id as number), opts.from);
  const res = await sendWhatsApp({ to, text, mediaUrl: waCardImageUrl(person.id as number, opts.from) });
  if (!res.ok) {
    if (res.reason === "not-configured") return { ok: false, reason: "not-configured" };
    return { ok: false, reason: "error", error: res.error };
  }

  const iso = new Date().toISOString();
  await sb.from("outbox").insert({
    channel: "WHATSAPP",
    recipient_name: name,
    recipient_contact: to,
    subject: "Task reminder",
    body: text,
    message_type: "TASK REMINDER",
    status: "Sent",
    source: opts.sourceTag ?? "reminder:admin",
    person_id: person.id,
    created_at: iso,
    sent_at: iso,
  });

  return { ok: true };
}

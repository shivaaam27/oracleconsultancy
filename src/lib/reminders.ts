// The single "remind this person about their tasks" engine. Both the admin Outbox
// and (later) the portal team view call this — reuse, don't duplicate. It gathers
// the person's open tasks, builds the branded email (+ optional personal note and
// sender sign-off), sends it for real, and logs a Sent row so it shows in the
// Outbox sent log and feeds the chase-cooldown.

import { sb } from "@/db/supabase";
import { getAllTasks } from "@/lib/queries";
import { isOpen } from "@/lib/derive";
import { buildTaskReminderDoc, buildEmailMessage } from "@/lib/outbox/gen";
import { renderEmail, type EmailOffice } from "@/lib/email/layout";
import { sendEmail } from "@/lib/email/send";

export type ReminderSender = {
  /** Office the email signs off as (admin / manager / director). Defaults to admin. */
  office?: EmailOffice;
  /** Sender's name, shown above the office line (e.g. a manager). */
  name?: string | null;
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

  const rows = (await getAllTasks()).filter(
    (t) => isOpen(t.status) && t.assigneeIds.includes(person.id as number),
  );
  if (rows.length === 0) return { ok: false, reason: "no-tasks" };

  const name = person.name as string;
  const note = opts.note?.trim() || undefined;
  const doc = buildTaskReminderDoc(name, rows, {
    office: opts.sender?.office ?? "admin",
    signoffName: opts.sender?.name ?? undefined,
    note,
  });
  const text = (note ? `${note}\n\n` : "") + buildEmailMessage(name, rows);

  const res = await sendEmail({ to: email, subject: "Your tasks", text, html: renderEmail(doc) });
  if (!res.ok) {
    if (res.reason === "not-configured") return { ok: false, reason: "not-configured" };
    return { ok: false, reason: "error", error: res.error };
  }

  const iso = new Date().toISOString();
  await sb.from("outbox").insert({
    channel: "EMAIL",
    recipient_name: name,
    recipient_contact: email,
    subject: "Your tasks",
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

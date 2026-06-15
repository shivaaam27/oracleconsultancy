"use server";
import { revalidatePath, updateTag } from "next/cache";
import { markSent } from "@/lib/outbox-gen";
import { mutate } from "@/lib/mutate";
import { sb } from "@/db/supabase";
import { sendEmail } from "@/lib/email";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function htmlBody(text: string): string {
  const esc = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  // A simple, well-spaced container that reads cleanly in every mail client.
  // The signature footer is appended centrally in src/lib/email.ts.
  return (
    `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:15px;` +
    `color:#1f2937;line-height:1.6;max-width:600px;white-space:pre-wrap">` +
    `${esc.replace(/\n/g, "<br>")}</div>`
  );
}

/**
 * Actually send an EMAIL draft through the configured provider (Gmail), then
 * mark it Sent. Returns a not-configured hint so the UI can fall back to the
 * manual mailto link. Reads the latest body/subject from the row (the client
 * saves edits before calling this).
 */
export async function sendDraftEmail(
  id: number
): Promise<{ ok: boolean; error?: string; reason?: "not-configured" | "no-email" | "not-email" }> {
  const { data: row, error } = await sb
    .from("outbox")
    .select("channel,recipient_contact,subject,body")
    .eq("id", id)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!row) return { ok: false, error: "Draft not found." };
  if (row.channel !== "EMAIL") return { ok: false, reason: "not-email", error: "This draft isn't an email." };

  const to = (row.recipient_contact as string | null)?.trim() ?? "";
  if (!EMAIL_RE.test(to))
    return { ok: false, reason: "no-email", error: "No valid email address on this draft." };

  const body = (row.body as string) ?? "";
  const result = await sendEmail({
    to,
    subject: (row.subject as string | null)?.trim() || "Message from Oracle Consultancy",
    text: body,
    html: htmlBody(body),
  });

  if (!result.ok) {
    if (result.reason === "not-configured")
      return { ok: false, reason: "not-configured", error: "Email sending isn't switched on — use Open email instead." };
    return { ok: false, error: result.error ?? "Could not send the email." };
  }

  await sb.from("outbox").update({ status: "Sent", sent_at: new Date().toISOString() }).eq("id", id);
  revalidatePath("/outbox");
  updateTag("outbox");
  return { ok: true };
}

/**
 * Bulk: send every EMAIL draft that has a valid address, in one click. Stops if
 * the provider isn't switched on (there's no per-draft manual fallback in bulk).
 * Returns counts so the UI can report "N sent · M failed".
 */
export async function sendAllEmailDrafts(): Promise<{ sent: number; failed: number; notConfigured: boolean }> {
  const { data, error } = await sb
    .from("outbox")
    .select("id,recipient_contact")
    .eq("status", "Draft")
    .eq("channel", "EMAIL");
  if (error) return { sent: 0, failed: 0, notConfigured: false };

  const ids = (data ?? [])
    .filter((r) => EMAIL_RE.test(((r.recipient_contact as string | null) ?? "").trim()))
    .map((r) => r.id as number);

  let sent = 0;
  let failed = 0;
  let notConfigured = false;
  for (const id of ids) {
    const res = await sendDraftEmail(id);
    if (res.ok) { sent++; continue; }
    if (res.reason === "not-configured") { notConfigured = true; break; }
    failed++;
  }

  revalidatePath("/outbox");
  updateTag("outbox");
  return { sent, failed, notConfigured };
}

export async function recordSent(
  formData: FormData
): Promise<{ ok: boolean; reason?: "duplicate" | "error"; undoToken?: string }> {
  const channel = String(formData.get("channel") || "");
  const name = String(formData.get("name") || "");
  const codes = JSON.parse(String(formData.get("taskCodes") || "[]")) as string[];
  const message = String(formData.get("message") || "");
  const contactStatus = String(formData.get("contactStatus") || "");
  const recipientContact = (formData.get("recipientContact") as string) || null;

  const result = await mutate<{ duplicate: boolean }>({
    kind: "outbox.markSent",
    run: async () => {
      const sent = await markSent(channel, name, codes, message, contactStatus, recipientContact);
      if (!sent.ok) {
        return { result: { duplicate: true } };
      }
      return {
        result: { duplicate: false },
        undo: {
          kind: "outbox.markSent",
          payload: { dedupeKey: sent.dedupeKey, outboxIds: [sent.outboxId] },
        },
      };
    },
  });

  revalidatePath("/outbox");
  updateTag("outbox");
  updateTag("people");

  if (!result.ok) return { ok: false, reason: "error" };
  if (result.result.duplicate) return { ok: false, reason: "duplicate" };
  return { ok: true, undoToken: result.undoToken };
}

function endOfToday(): Date {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d;
}

export async function snoozePerson(
  personId: number
): Promise<{ ok: boolean; undoToken?: string; error?: string }> {
  const result = await mutate<{ personId: number }>({
    kind: "person.snooze",
    run: async () => {
      const { data: row, error: e1 } = await sb
        .from("people")
        .select("snoozed_until")
        .eq("id", personId)
        .maybeSingle();
      if (e1) throw new Error(e1.message);
      if (!row) throw new Error("Person not found");
      const before = (row.snoozed_until as string | null) ?? null;
      const { error: uErr } = await sb
        .from("people")
        .update({ snoozed_until: endOfToday().toISOString() })
        .eq("id", personId);
      if (uErr) throw new Error(uErr.message);
      return {
        result: { personId },
        undo: {
          kind: "person.snooze",
          payload: { personId, before },
        },
      };
    },
  });
  revalidatePath("/outbox");
  updateTag("outbox");
  updateTag("people");
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true, undoToken: result.undoToken };
}

export async function unsnoozePerson(personId: number): Promise<{ ok: boolean; error?: string }> {
  const { error } = await sb.from("people").update({ snoozed_until: null }).eq("id", personId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/outbox");
  updateTag("outbox");
  updateTag("people");
  return { ok: true };
}

/* ------------------------------------------------------------------ *
 * Persisted draft lifecycle (to-do / ad-hoc reminders).
 * ------------------------------------------------------------------ */

/** Mark a saved draft as sent. */
export async function sendDraft(id: number): Promise<{ ok: boolean; error?: string }> {
  const { error } = await sb.from("outbox").update({ status: "Sent", sent_at: new Date().toISOString() }).eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/outbox");
  updateTag("outbox");
  return { ok: true };
}

/** Edit a draft's body (and email subject). */
export async function updateDraft(id: number, body: string, subject?: string | null): Promise<{ ok: boolean; error?: string }> {
  const patch: Record<string, unknown> = { body };
  if (subject !== undefined) patch.subject = subject;
  const { error } = await sb.from("outbox").update(patch).eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/outbox");
  return { ok: true };
}

/** Discard a draft. */
export async function deleteDraft(id: number): Promise<{ ok: boolean; error?: string }> {
  const { error } = await sb.from("outbox").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/outbox");
  updateTag("outbox");
  return { ok: true };
}

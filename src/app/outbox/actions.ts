"use server";
import { revalidatePath, updateTag } from "next/cache";
import { markSent } from "@/lib/outbox-gen";
import { mutate } from "@/lib/mutate";
import { sb } from "@/db/supabase";

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

"use server";
import { revalidatePath } from "next/cache";
import { markSent } from "@/lib/outbox-gen";
import { mutate } from "@/lib/mutate";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";

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
      const rows = await db.select().from(schema.people).where(eq(schema.people.id, personId)).limit(1);
      if (!rows.length) throw new Error("Person not found");
      const before = rows[0].snoozedUntil;
      await db.update(schema.people).set({ snoozedUntil: endOfToday() }).where(eq(schema.people.id, personId));
      return {
        result: { personId },
        undo: {
          kind: "person.snooze",
          payload: { personId, before: before ? before.toISOString() : null },
        },
      };
    },
  });
  revalidatePath("/outbox");
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true, undoToken: result.undoToken };
}

export async function unsnoozePerson(personId: number): Promise<{ ok: boolean; error?: string }> {
  try {
    await db.update(schema.people).set({ snoozedUntil: null }).where(eq(schema.people.id, personId));
    revalidatePath("/outbox");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "error" };
  }
}


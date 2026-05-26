"use server";
import { revalidatePath } from "next/cache";
import { markSent } from "@/lib/outbox-gen";
import { mutate } from "@/lib/mutate";

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

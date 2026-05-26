"use server";
import { revalidatePath } from "next/cache";
import { markSent } from "@/lib/outbox-gen";

export async function recordSent(formData: FormData): Promise<{ ok: boolean; reason?: "duplicate" }> {
  const channel = String(formData.get("channel") || "");
  const name = String(formData.get("name") || "");
  const codes = JSON.parse(String(formData.get("taskCodes") || "[]")) as string[];
  const message = String(formData.get("message") || "");
  const contactStatus = String(formData.get("contactStatus") || "");
  const recipientContact = (formData.get("recipientContact") as string) || null;
  const sent = await markSent(channel, name, codes, message, contactStatus, recipientContact);
  revalidatePath("/outbox");
  return sent ? { ok: true } : { ok: false, reason: "duplicate" };
}

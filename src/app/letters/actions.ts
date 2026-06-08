"use server";

import { revalidatePath } from "next/cache";
import { sb } from "@/db/supabase";
import { createLetter, updateLetterDraft, issueLetter, duplicateLetter, deleteLetter } from "@/lib/letters";

type Result = { ok: true; id?: number } | { ok: false; error: string };

function invalidate(id?: number) {
  revalidatePath("/letters");
  if (id) revalidatePath(`/letters/${id}`);
}

export async function createLetterAction(type: string, companyId: number | null, personId: number | null): Promise<Result> {
  try {
    const id = await createLetter(type, companyId, personId);
    invalidate(id);
    return { ok: true, id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not create the letter." };
  }
}

export async function saveLetterDraftAction(
  id: number,
  fields: { companyId?: number | null; addressee?: string; subject?: string; body?: string; ref?: string; letterDate?: string | null; title?: string }
): Promise<Result> {
  try {
    await updateLetterDraft(id, fields);
    invalidate(id);
    return { ok: true, id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not save." };
  }
}

export async function issueLetterAction(id: number): Promise<Result> {
  try {
    await issueLetter(id);
    invalidate(id);
    return { ok: true, id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not issue the letter." };
  }
}

export async function duplicateLetterAction(id: number): Promise<Result> {
  try {
    const newId = await duplicateLetter(id);
    invalidate(newId);
    return { ok: true, id: newId };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not duplicate." };
  }
}

export async function deleteLetterAction(id: number): Promise<Result> {
  try {
    await deleteLetter(id);
    invalidate();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not delete." };
  }
}

/** Create an Outbox draft for a letter (email), to send manually. */
export async function letterOutboxDraftAction(id: number): Promise<Result> {
  const { data } = await sb.from("letters").select("title,subject,person_id,company_id, people(name,email), companies(name)").eq("id", id).maybeSingle();
  if (!data) return { ok: false, error: "Letter not found." };
  const person = Array.isArray(data.people) ? data.people[0] : data.people;
  const company = Array.isArray(data.companies) ? data.companies[0] : data.companies;
  const now = new Date().toISOString();
  const { error } = await sb.from("outbox").insert({
    channel: "EMAIL",
    recipient_name: (person?.name as string | null) ?? null,
    recipient_contact: (person?.email as string | null) ?? null,
    company: (company?.name as string | null) ?? null,
    subject: (data.subject as string | null) || (data.title as string),
    body: `Please find attached the letter: ${data.title as string}.\n\n(Attach the PDF you downloaded before sending.)`,
    message_type: "LETTER",
    status: "Draft",
    source: "letter",
    person_id: data.person_id,
    created_at: now,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/outbox");
  return { ok: true };
}

"use server";

import { revalidatePath, updateTag } from "next/cache";
import { sb } from "@/db/supabase";
import { getPersonDetail } from "@/lib/people-queries";
import { contactForChannel, linkFor, type Channel } from "@/lib/outbox/links";
import { isPersonPackPurpose, type PersonPackPurpose } from "@/lib/person-pack-shared";
import { savePackPrefs } from "@/lib/person-pack-prefs";

const CHANNELS: Channel[] = ["WHATSAPP", "EMAIL", "SMS"];

export type PersonPackDraftInput = {
  personId: number;
  purpose: PersonPackPurpose;
  sections: string;
  channel: Channel;
  subject: string;
  body: string;
};

export type PersonPackDraftResult =
  | {
      ok: true;
      created: boolean;
      draftId: number | null;
      channel: Channel;
      personName: string;
      link: string | null;
      contactMissing: boolean;
    }
  | { ok: false; error: string };

function todayStartIso() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function validPurpose(value: string): value is PersonPackPurpose {
  return isPersonPackPurpose(value);
}

function validChannel(value: string): value is Channel {
  return CHANNELS.includes(value as Channel);
}

/** Remember a person's Prepare-pack choices (sections + unticked items). */
export async function savePersonPackPrefsAction(input: {
  personId: number;
  purpose: PersonPackPurpose;
  sections: string;
  excluded: string[];
}): Promise<{ ok: boolean }> {
  try {
    if (!Number.isFinite(input.personId) || !validPurpose(input.purpose)) return { ok: false };
    await savePackPrefs(input.personId, input.purpose, {
      sections: input.sections,
      excluded: input.excluded,
    });
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

export async function createPersonPackDraftAction(input: PersonPackDraftInput): Promise<PersonPackDraftResult> {
  try {
    if (!Number.isFinite(input.personId)) return { ok: false, error: "Person not found" };
    if (!validPurpose(input.purpose)) return { ok: false, error: "Pack purpose is not valid" };
    if (!validChannel(input.channel)) return { ok: false, error: "Channel is not valid" };
    const body = input.body.trim();
    if (!body) return { ok: false, error: "Message preview is empty" };

    const detail = await getPersonDetail(input.personId);
    if (!detail) return { ok: false, error: "Person not found" };

    const person = detail.person;
    const contactInfo = {
      whatsapp: person.whatsapp,
      email: person.email,
      phone: person.phone,
      preferredChannel: person.preferredChannel,
    };
    const contact = contactForChannel(contactInfo, input.channel);
    const subject = input.subject.trim() || `Person pack - ${person.name}`;
    const sections = input.sections || "none";
    const source = `person-pack:${person.id}:${input.purpose}:${sections}`;

    const { data: existing, error: existingError } = await sb
      .from("outbox")
      .select("id")
      .eq("status", "Draft")
      .eq("source", source)
      .gte("created_at", todayStartIso())
      .limit(1);
    if (existingError) throw new Error(existingError.message);
    if ((existing ?? []).length > 0) {
      return {
        ok: true,
        created: false,
        draftId: (existing?.[0]?.id as number | undefined) ?? null,
        channel: input.channel,
        personName: person.name,
        link: linkFor(input.channel, contact, subject, body),
        contactMissing: !contact,
      };
    }

    const { data: row, error } = await sb
      .from("outbox")
      .insert({
        channel: input.channel,
        recipient_name: person.name,
        recipient_contact: contact,
        company: person.companyName,
        subject: input.channel === "EMAIL" ? subject : null,
        body,
        message_type: "PERSON PACK",
        status: "Draft",
        source,
        person_id: person.id,
        created_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    revalidatePath("/people");
    revalidatePath(`/people/${person.id}/pack`);
    revalidatePath("/outbox");
    updateTag("outbox");
    updateTag("people");

    return {
      ok: true,
      created: true,
      draftId: row.id as number,
      channel: input.channel,
      personName: person.name,
      link: linkFor(input.channel, contact, subject, body),
      contactMissing: !contact,
    };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not create person-pack draft" };
  }
}

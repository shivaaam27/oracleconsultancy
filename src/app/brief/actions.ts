"use server";

import { revalidatePath, updateTag } from "next/cache";
import { sb } from "@/db/supabase";
import { briefEmail, getBrief, parseBriefPeriod } from "@/lib/director-brief";

export async function createDirectorBriefDraftAction(input: {
  period?: string;
  companyId?: number | null;
}): Promise<{ ok: true; created: boolean } | { ok: false; error: string }> {
  try {
    const period = parseBriefPeriod(input.period);
    const companyId = input.companyId ?? null;
    const brief = await getBrief(new Date(), period, companyId);
    const email = briefEmail(brief);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const source = `director-brief:${period}:${brief.selectedCompanyId ?? "portfolio"}`;
    const { data: existing, error: existingError } = await sb
      .from("outbox")
      .select("id")
      .eq("status", "Draft")
      .eq("source", source)
      .gte("created_at", today.toISOString())
      .limit(1);
    if (existingError) throw new Error(existingError.message);
    if ((existing ?? []).length > 0) return { ok: true, created: false };

    const { error } = await sb.from("outbox").insert({
      channel: "EMAIL",
      recipient_name: "Director",
      recipient_contact: null,
      company: brief.selectedCompanyName ?? "Portfolio",
      subject: email.subject,
      body: email.body,
      message_type: "DIRECTOR BRIEF",
      status: "Draft",
      source,
      created_at: new Date().toISOString(),
    });
    if (error) throw new Error(error.message);

    revalidatePath("/brief");
    revalidatePath("/outbox");
    updateTag("outbox");
    return { ok: true, created: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not create Director Brief draft" };
  }
}

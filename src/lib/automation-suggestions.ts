import { sb } from "@/db/supabase";
import type { TaskRow } from "@/lib/queries";
import { isOpen } from "@/lib/derive";
import {
  buildEmailMessage,
  buildSmsMessage,
  buildWhatsAppMessage,
  type Channel,
} from "@/lib/outbox-gen";
import { contactForChannel, pickChannel } from "@/lib/outbox-links";

export const STALE_TASK_DAYS = 7;
export const OVERDUE_DRAFT_SOURCE = "automation-overdue";

export type AutomationSuggestion = {
  id: string;
  title: string;
  detail: string;
  count: number;
  href: string;
  tone: "danger" | "warn" | "accent";
};

type PersonContact = {
  id: number;
  name: string;
  whatsapp: string | null;
  email: string | null;
  phone: string | null;
  preferredChannel: string | null;
};

function ageDays(d: Date | null): number | null {
  if (!d) return null;
  return Math.floor((Date.now() - d.getTime()) / 86400000);
}

export function getStaleTasks(rows: TaskRow[], days = STALE_TASK_DAYS): TaskRow[] {
  return rows
    .filter((r) => {
      if (!isOpen(r.status)) return false;
      if (r.flag === "overdue" || r.flag === "escalate-now") return false;
      const basis = r.lastUpdatedAt ?? r.createdDate;
      const age = ageDays(basis);
      return age != null && age >= days;
    })
    .sort((a, b) => (ageDays(b.lastUpdatedAt ?? b.createdDate) ?? 0) - (ageDays(a.lastUpdatedAt ?? a.createdDate) ?? 0));
}

export function getOverdueReminderCandidates(rows: TaskRow[]): TaskRow[] {
  return rows
    .filter((r) => isOpen(r.status))
    .filter((r) => r.flag === "overdue" || r.flag === "escalate-now")
    .filter((r) => r.assigneeIds.length > 0)
    .sort((a, b) => (a.daysToDeadline === "done" ? 9999 : Number(a.daysToDeadline ?? 9999)) - (b.daysToDeadline === "done" ? 9999 : Number(b.daysToDeadline ?? 9999)));
}

export function buildAutomationSuggestions(rows: TaskRow[]): AutomationSuggestion[] {
  const overdue = getOverdueReminderCandidates(rows);
  const stale = getStaleTasks(rows);
  return [
    overdue.length > 0 && {
      id: "overdue-reminder-drafts",
      title: `Prepare ${overdue.length} overdue reminder${overdue.length === 1 ? "" : "s"}`,
      detail: "COS can create Outbox drafts for accountable people. You still approve and send them.",
      count: overdue.length,
      href: "/outbox",
      tone: "danger" as const,
    },
    stale.length > 0 && {
      id: "stale-task-updates",
      title: `Refresh ${stale.length} stale task${stale.length === 1 ? "" : "s"}`,
      detail: `These open tasks have had no update for ${STALE_TASK_DAYS}+ days.`,
      count: stale.length,
      href: "/?tab=tasks&view=table",
      tone: "warn" as const,
    },
  ].filter(Boolean) as AutomationSuggestion[];
}

function messageFor(channel: Channel, personName: string, tasks: TaskRow[]): { subject: string | null; body: string } {
  if (channel === "EMAIL") {
    return { subject: "Overdue task reminder", body: buildEmailMessage(personName, tasks) };
  }
  if (channel === "SMS") {
    return { subject: null, body: tasks.map((t) => buildSmsMessage(t)).join("\n") };
  }
  return { subject: null, body: buildWhatsAppMessage(personName, tasks) };
}

function todayStartIso(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

export async function createOverdueReminderDrafts(rows: TaskRow[]): Promise<{ created: number; skipped: number }> {
  const candidates = getOverdueReminderCandidates(rows);
  if (candidates.length === 0) return { created: 0, skipped: 0 };

  const personIds = [...new Set(candidates.flatMap((r) => r.assigneeIds))];
  const { data: peopleRows, error: peopleError } = await sb
    .from("people")
    .select("id,name,whatsapp,email,phone,preferred_channel")
    .in("id", personIds);
  if (peopleError) throw new Error(peopleError.message);

  const people = new Map<number, PersonContact>(
    ((peopleRows ?? []) as any[]).map((p) => [
      p.id as number,
      {
        id: p.id as number,
        name: p.name as string,
        whatsapp: (p.whatsapp as string | null) ?? null,
        email: (p.email as string | null) ?? null,
        phone: (p.phone as string | null) ?? null,
        preferredChannel: (p.preferred_channel as string | null) ?? null,
      },
    ]),
  );

  const byPerson = new Map<number, TaskRow[]>();
  for (const task of candidates) {
    for (const personId of task.assigneeIds) {
      const list = byPerson.get(personId) ?? [];
      list.push(task);
      byPerson.set(personId, list);
    }
  }

  let created = 0;
  let skipped = 0;
  const todayIso = todayStartIso();
  const nowIso = new Date().toISOString();

  for (const [personId, tasks] of byPerson) {
    const person = people.get(personId);
    if (!person) {
      skipped++;
      continue;
    }

    const { data: existing, error: existingError } = await sb
      .from("outbox")
      .select("id")
      .eq("status", "Draft")
      .eq("source", OVERDUE_DRAFT_SOURCE)
      .eq("person_id", personId)
      .gte("created_at", todayIso)
      .limit(1);
    if (existingError) throw new Error(existingError.message);
    if ((existing ?? []).length > 0) {
      skipped++;
      continue;
    }

    const channel = pickChannel(person);
    const contact = contactForChannel(person, channel);
    const { subject, body } = messageFor(channel, person.name, tasks);
    const company = [...new Set(tasks.map((t) => t.companyName).filter(Boolean))].slice(0, 2).join(", ") || null;

    const { error } = await sb.from("outbox").insert({
      channel,
      recipient_name: person.name,
      recipient_contact: contact,
      company,
      subject,
      body,
      message_type: "OVERDUE TASK REMINDER",
      status: "Draft",
      source: OVERDUE_DRAFT_SOURCE,
      person_id: personId,
      created_at: nowIso,
    });
    if (error) throw new Error(error.message);
    created++;
  }

  return { created, skipped };
}

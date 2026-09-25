import { sb } from "@/db/supabase";
import type { TaskRow } from "@/lib/tasks/queries";
import { isOpen } from "@/lib/tasks/derive";
import {
  buildEmailMessage,
  buildSmsMessage,
  buildWhatsAppMessage,
  type Channel,
} from "@/lib/outbox/gen";
import { contactForChannel, pickChannel } from "@/lib/outbox/links";
import { lastChasedByName } from "@/lib/outbox/history";
import { deriveDocStatus, type DocumentRow } from "@/lib/documents/documents";

const OVERDUE_DRAFT_SOURCE = "automation-overdue";

type PersonContact = {
  id: number;
  name: string;
  whatsapp: string | null;
  email: string | null;
  phone: string | null;
  preferredChannel: string | null;
};

export function getOverdueReminderCandidates(rows: TaskRow[]): TaskRow[] {
  return rows
    .filter((r) => isOpen(r.status))
    .filter((r) => r.flag === "overdue" || r.flag === "escalate-now")
    .filter((r) => r.assigneeIds.length > 0)
    .sort((a, b) => (a.daysToDeadline === "done" ? 9999 : Number(a.daysToDeadline ?? 9999)) - (b.daysToDeadline === "done" ? 9999 : Number(b.daysToDeadline ?? 9999)));
}

export type DocumentRenewalCandidate = {
  document: DocumentRow;
  status: "Expired" | "Expiring";
};

export async function getDocumentRenewalCandidates(documents: DocumentRow[]): Promise<DocumentRenewalCandidate[]> {
  const actionable = documents
    .map((document) => ({ document, status: deriveDocStatus(document) }))
    .filter((x): x is DocumentRenewalCandidate => (x.status === "Expired" || x.status === "Expiring") && !!x.document.companyId);
  if (actionable.length === 0) return [];

  const ids = actionable.map((x) => x.document.id);
  const { data: links, error } = await sb
    .from("document_links")
    .select("document_id,tasks(status)")
    .in("document_id", ids);
  if (error) throw new Error(error.message);

  const hasOpenRenewal = new Set<number>();
  for (const row of links ?? []) {
    const task = Array.isArray((row as any).tasks) ? (row as any).tasks[0] : (row as any).tasks;
    const status = task?.status as string | null | undefined;
    if (status && isOpen(status)) hasOpenRenewal.add(row.document_id as number);
  }

  return actionable.filter((x) => !hasOpenRenewal.has(x.document.id));
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

export async function createOverdueReminderDrafts(
  rows: TaskRow[],
  opts: { cooldownDays?: number } = {},
): Promise<{ created: number; skipped: number }> {
  const candidates = getOverdueReminderCandidates(rows);
  if (candidates.length === 0) return { created: 0, skipped: 0 };

  // Cooldown: skip anyone actually chased (any channel) within the last N days,
  // so a daily auto-run doesn't nag the same person every morning. 0 = off.
  const cooldownDays = opts.cooldownDays ?? 0;
  const lastChased = cooldownDays > 0 ? await lastChasedByName() : {};
  const chasedRecently = (name: string): boolean => {
    if (cooldownDays <= 0) return false;
    const lc = lastChased[name.trim().toLowerCase()];
    return !!lc && Date.now() - new Date(lc.sentAt).getTime() < cooldownDays * 86_400_000;
  };

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

    if (chasedRecently(person.name)) {
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

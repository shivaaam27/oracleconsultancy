import { sb } from "@/db/supabase";
import type { TaskRow } from "@/lib/queries";
import { isOpen } from "@/lib/derive";
import {
  buildEmailMessage,
  buildSmsMessage,
  buildWhatsAppMessage,
  type Channel,
} from "@/lib/outbox-gen";
import { contactForChannel, linkFor, pickChannel } from "@/lib/outbox-links";
import { deriveDocStatus, type DocumentRow, linkDocumentTask } from "@/lib/documents";
import { insertTaskWithUniqueCodeSb } from "@/lib/db-helpers";

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

export async function createDocumentRenewalTasks(documents: DocumentRow[]): Promise<{ created: number; skipped: number }> {
  const candidates = await getDocumentRenewalCandidates(documents);
  if (candidates.length === 0) return { created: 0, skipped: 0 };

  const companyIds = [...new Set(candidates.map((x) => x.document.companyId).filter((id): id is number => !!id))];
  const { data: companies, error: companyError } = await sb
    .from("companies")
    .select("id,code,code_prefix")
    .in("id", companyIds);
  if (companyError) throw new Error(companyError.message);

  const companyById = new Map((companies ?? []).map((c) => [c.id as number, c as { id: number; code: string | null; code_prefix: string | null }]));
  const now = new Date();
  let created = 0;
  let skipped = 0;

  for (const { document } of candidates) {
    if (!document.companyId) {
      skipped++;
      continue;
    }
    const company = companyById.get(document.companyId);
    if (!company) {
      skipped++;
      continue;
    }
    const prefix = company.code_prefix || company.code || "";
    const task = await insertTaskWithUniqueCodeSb(document.companyId, prefix, {
      actionItem: `Renew: ${document.title}`,
      status: "Not Started",
      priority: "High",
      category: "Admin",
      deadline: document.expiryDate,
      createdDate: now,
      lastUpdatedAt: now,
      archived: false,
    });
    await sb.from("audit_log").insert({
      task_id: task.id,
      task_code: task.code,
      company_id: document.companyId,
      entry_type: "CREATE",
      field: "Task",
      old_value: null,
      new_value: `Renew: ${document.title}`,
      change_reason: "Created by V3 document renewal automation",
      created_at: now.toISOString(),
      created_by: "web-ui",
    });
    await linkDocumentTask(document.id, task.id);
    created++;
  }

  return { created, skipped };
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

/* ------------------------------------------------------------------ */
/* Morning Run — one reviewable plan (Phase 4). Read-only preview +     */
/* per-item commit. Reuses the same detection/builders as the bulk      */
/* actions; nothing is written until a single item is approved.         */
/* ------------------------------------------------------------------ */

export type ReminderPlanItem = {
  kind: "reminder";
  id: string; // `reminder:<personId>`
  personId: number;
  personName: string;
  channel: Channel;
  company: string | null;
  taskCount: number;
  subject: string | null;
  body: string;
  contact: string | null;
};

export type RenewalPlanItem = {
  kind: "renewal";
  id: string; // `renewal:<documentId>`
  documentId: number;
  title: string;
  companyName: string | null;
  status: "Expired" | "Expiring";
  deadline: string | null;
};

export type MorningPlanItem = ReminderPlanItem | RenewalPlanItem;

async function loadPersonContacts(personIds: number[]): Promise<Map<number, PersonContact>> {
  if (personIds.length === 0) return new Map();
  const { data, error } = await sb
    .from("people")
    .select("id,name,whatsapp,email,phone,preferred_channel")
    .in("id", personIds);
  if (error) throw new Error(error.message);
  return new Map<number, PersonContact>(
    ((data ?? []) as any[]).map((p) => [
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
}

/** Group overdue candidates by accountable person. */
function overdueByPerson(rows: TaskRow[]): Map<number, TaskRow[]> {
  const byPerson = new Map<number, TaskRow[]>();
  for (const task of getOverdueReminderCandidates(rows)) {
    for (const personId of task.assigneeIds) {
      const list = byPerson.get(personId) ?? [];
      list.push(task);
      byPerson.set(personId, list);
    }
  }
  return byPerson;
}

function reminderItemFor(person: PersonContact, tasks: TaskRow[]): ReminderPlanItem {
  const channel = pickChannel(person);
  const contact = contactForChannel(person, channel);
  const { subject, body } = messageFor(channel, person.name, tasks);
  const company = [...new Set(tasks.map((t) => t.companyName).filter(Boolean))].slice(0, 2).join(", ") || null;
  return {
    kind: "reminder",
    id: `reminder:${person.id}`,
    personId: person.id,
    personName: person.name,
    channel,
    company,
    taskCount: tasks.length,
    subject,
    body,
    contact,
  };
}

/** People who already have a draft from today's overdue automation. */
async function alreadyDraftedToday(personIds: number[]): Promise<Set<number>> {
  if (personIds.length === 0) return new Set();
  const { data, error } = await sb
    .from("outbox")
    .select("person_id")
    .eq("status", "Draft")
    .eq("source", OVERDUE_DRAFT_SOURCE)
    .gte("created_at", todayStartIso())
    .in("person_id", personIds);
  if (error) throw new Error(error.message);
  return new Set(((data ?? []) as any[]).map((r) => r.person_id as number));
}

/**
 * The morning plan: prepared reminders + renewal tasks, with full preview text,
 * WITHOUT writing anything. People already drafted today are excluded so we
 * never propose a duplicate.
 */
export async function previewMorningPlan(rows: TaskRow[], documents: DocumentRow[]): Promise<MorningPlanItem[]> {
  const items: MorningPlanItem[] = [];

  // --- Reminders ---
  const byPerson = overdueByPerson(rows);
  const personIds = [...byPerson.keys()];
  if (personIds.length > 0) {
    const [people, drafted] = await Promise.all([
      loadPersonContacts(personIds),
      alreadyDraftedToday(personIds),
    ]);
    for (const [personId, tasks] of byPerson) {
      if (drafted.has(personId)) continue;
      const person = people.get(personId);
      if (!person) continue;
      items.push(reminderItemFor(person, tasks));
    }
  }

  // --- Renewals ---
  const renewals = await getDocumentRenewalCandidates(documents);
  if (renewals.length > 0) {
    const companyIds = [...new Set(renewals.map((x) => x.document.companyId).filter((id): id is number => !!id))];
    const { data: companies, error } = await sb.from("companies").select("id,name").in("id", companyIds);
    if (error) throw new Error(error.message);
    const nameById = new Map<number, string>(((companies ?? []) as any[]).map((c) => [c.id as number, c.name as string]));
    for (const { document, status } of renewals) {
      items.push({
        kind: "renewal",
        id: `renewal:${document.id}`,
        documentId: document.id,
        title: document.title,
        companyName: document.companyId ? nameById.get(document.companyId) ?? null : null,
        status,
        deadline: document.expiryDate ? document.expiryDate.toISOString() : null,
      });
    }
  }

  return items;
}

/**
 * Commit ONE person's overdue reminder draft. De-duplicated against today's
 * drafts. Returns the channel deep-link so the tray can offer "send" inline.
 */
export async function commitReminderDraftFor(
  personId: number,
  rows: TaskRow[],
): Promise<{ created: boolean; reason?: "none" | "already"; link?: string | null; channel?: Channel; personName?: string }> {
  const tasks = overdueByPerson(rows).get(personId);
  if (!tasks || tasks.length === 0) return { created: false, reason: "none" };

  if ((await alreadyDraftedToday([personId])).has(personId)) return { created: false, reason: "already" };

  const person = (await loadPersonContacts([personId])).get(personId);
  if (!person) return { created: false, reason: "none" };

  const item = reminderItemFor(person, tasks);
  const { error } = await sb.from("outbox").insert({
    channel: item.channel,
    recipient_name: item.personName,
    recipient_contact: item.contact,
    company: item.company,
    subject: item.subject,
    body: item.body,
    message_type: "OVERDUE TASK REMINDER",
    status: "Draft",
    source: OVERDUE_DRAFT_SOURCE,
    person_id: personId,
    created_at: new Date().toISOString(),
  });
  if (error) throw new Error(error.message);

  return {
    created: true,
    link: linkFor(item.channel, item.contact, item.subject, item.body),
    channel: item.channel,
    personName: item.personName,
  };
}

/** Commit ONE document's renewal task (reuses the proven bulk creator on a single doc). */
export async function commitRenewalTaskFor(
  documentId: number,
  documents: DocumentRow[],
): Promise<{ created: boolean; reason?: "none" | "already" }> {
  const doc = documents.find((d) => d.id === documentId);
  if (!doc) return { created: false, reason: "none" };
  const { created, skipped } = await createDocumentRenewalTasks([doc]);
  if (created > 0) return { created: true };
  return { created: false, reason: skipped > 0 ? "already" : "none" };
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

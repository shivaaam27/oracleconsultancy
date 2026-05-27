import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { sb } from "@/db/supabase";
import { getAllTasks, type TaskRow } from "./queries";
import { isOpen } from "./derive";

export type Channel = "WHATSAPP" | "EMAIL" | "SMS";

export type ContactStatus = "Complete" | "Missing WhatsApp" | "Missing Email" | "Missing Phone" | "Unknown";

export type OutboxDraft = {
  recipientName: string;
  personId: number | null;
  whatsapp: string | null;
  phone: string | null;
  email: string | null;
  preferredChannel: string | null;
  notes: string | null;
  tasks: TaskRow[];
  // One pre-built message body per channel.
  messages: Record<Channel, string>;
  // Per-channel readiness.
  contactByChannel: Record<Channel, ContactStatus>;
  // Convenience: overall contact label (uses preferred channel if set, else WhatsApp).
  contactStatus: ContactStatus;
};

function fmtDate(d: Date | null): string {
  if (!d) return "No Deadline";
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export function buildWhatsAppMessage(name: string, tasks: TaskRow[]): string {
  const lines = [`Hello ${name},`, "", "Task reminder for today:", ""];
  tasks.forEach((t, i) => {
    lines.push(`${i + 1}. ${t.companyName} — ${t.actionItem}`);
    lines.push(`Task ID: ${t.code}`);
    lines.push(`Accountable: ${t.assignees.join(", ") || "—"}`);
    lines.push(`Status: ${t.status}`);
    lines.push(`Deadline: ${fmtDate(t.deadline)}`);
    lines.push(`Priority: ${t.priority}`);
    if (t.latestUpdate) lines.push(`Latest Update: ${t.latestUpdate}`);
    lines.push("");
  });
  lines.push("Please update the tracker before end of day.");
  return lines.join("\n");
}

export function buildEmailMessage(name: string, tasks: TaskRow[]): string {
  return buildWhatsAppMessage(name, tasks);
}

export function buildSmsMessage(t: TaskRow): string {
  return `${t.code} ${t.companyName}: ${t.actionItem} · Due ${fmtDate(t.deadline)} · ${t.priority}`;
}

function buildAllMessages(name: string, list: TaskRow[]): Record<Channel, string> {
  return {
    WHATSAPP: buildWhatsAppMessage(name, list),
    EMAIL: buildEmailMessage(name, list),
    SMS: list.map((t) => buildSmsMessage(t)).join("\n"),
  };
}

export async function generateDrafts(): Promise<OutboxDraft[]> {
  const tasks = (await getAllTasks()).filter((t) => isOpen(t.status));
  const { data: peopleRaw, error: pErr } = await sb
    .from("people")
    .select("id,name,email,phone,whatsapp,preferred_channel,notes,snoozed_until");
  if (pErr) throw new Error(pErr.message);
  const people = (peopleRaw ?? []).map((p) => ({
    id: p.id as number,
    name: p.name as string,
    email: p.email as string | null,
    phone: p.phone as string | null,
    whatsapp: p.whatsapp as string | null,
    preferredChannel: p.preferred_channel as string | null,
    notes: p.notes as string | null,
    snoozedUntil: p.snoozed_until ? new Date(p.snoozed_until as string) : null,
  }));
  const pByName = new Map(people.map((p) => [p.name, p]));
  const now = new Date();
  const snoozedNames = new Set(
    people.filter((p) => p.snoozedUntil && p.snoozedUntil >= now).map((p) => p.name)
  );

  const byPerson = new Map<string, TaskRow[]>();
  for (const t of tasks) {
    for (const a of t.assignees) {
      const list = byPerson.get(a) || [];
      list.push(t);
      byPerson.set(a, list);
    }
  }

  const drafts: OutboxDraft[] = [];
  for (const [name, list] of byPerson) {
    if (snoozedNames.has(name)) continue;
    const p = pByName.get(name);

    const contactByChannel: Record<Channel, ContactStatus> = {
      WHATSAPP: p ? (p.whatsapp ? "Complete" : "Missing WhatsApp") : "Unknown",
      EMAIL: p ? (p.email ? "Complete" : "Missing Email") : "Unknown",
      SMS: p ? (p.phone ? "Complete" : "Missing Phone") : "Unknown",
    };

    const pref = (p?.preferredChannel?.toUpperCase() as Channel) || "WHATSAPP";
    const overall: ContactStatus =
      contactByChannel[pref] === "Complete"
        ? "Complete"
        : contactByChannel.WHATSAPP === "Complete" || contactByChannel.EMAIL === "Complete" || contactByChannel.SMS === "Complete"
          ? "Complete"
          : contactByChannel[pref];

    drafts.push({
      recipientName: name,
      personId: p?.id ?? null,
      whatsapp: p?.whatsapp ?? null,
      phone: p?.phone ?? null,
      email: p?.email ?? null,
      preferredChannel: p?.preferredChannel ?? null,
      notes: p?.notes ?? null,
      tasks: list,
      messages: buildAllMessages(name, list),
      contactByChannel,
      contactStatus: overall,
    });
  }

  return drafts.sort((a, b) => b.tasks.length - a.tasks.length);
}

function todayDateKey() {
  return new Date().toISOString().slice(0, 10);
}

export function dedupeKey(channel: string, name: string, taskIds: string[]): string {
  return `${todayDateKey()}|${channel}|${name.toLowerCase()}|${taskIds.sort().join(",")}|daily`;
}

export type MarkSentResult =
  | { ok: true; dedupeKey: string; outboxId: number }
  | { ok: false; reason: "duplicate" };

export async function markSent(
  channel: string,
  name: string,
  taskCodes: string[],
  message: string,
  contactStatus: string,
  recipientContact: string | null
): Promise<MarkSentResult> {
  const key = dedupeKey(channel, name, taskCodes);
  const existing = await db.select().from(schema.reminders).where(eq(schema.reminders.dedupeKey, key)).limit(1);
  if (existing.length) return { ok: false, reason: "duplicate" };

  const now = new Date();
  let outboxId = 0;
  try {
    await db.transaction(async (tx) => {
      await tx.insert(schema.reminders).values({
        channel,
        messageType: "DAILY TASK REMINDER",
        escalationLevel: "LEVEL 1",
        sentAt: now,
        dedupeKey: key,
        createdAt: now,
      });
      const inserted = await tx
        .insert(schema.outbox)
        .values({
          channel,
          recipientName: name,
          recipientContact,
          body: message,
          messageType: "DAILY TASK REMINDER",
          status: "Sent",
          contactStatus,
          createdAt: now,
          sentAt: now,
        })
        .returning({ id: schema.outbox.id });
      outboxId = inserted[0]?.id ?? 0;
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/duplicate key|unique/i.test(msg)) return { ok: false, reason: "duplicate" };
    throw err;
  }
  return { ok: true, dedupeKey: key, outboxId };
}

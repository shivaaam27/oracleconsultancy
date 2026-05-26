import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { getAllTasks, type TaskRow } from "./queries";
import { isOpen } from "./derive";

export type OutboxDraft = {
  recipientName: string;
  personId: number | null;
  whatsapp: string | null;
  phone: string | null;
  email: string | null;
  preferredChannel: string | null;
  tasks: TaskRow[];
  message: string;
  contactStatus: "Complete" | "Missing WhatsApp" | "Missing Email" | "Unknown";
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

export async function generateDrafts(channel: "WHATSAPP" | "EMAIL" | "SMS"): Promise<OutboxDraft[]> {
  const tasks = (await getAllTasks()).filter((t) => isOpen(t.status));
  const people = await db.select().from(schema.people);
  const pByName = new Map(people.map((p) => [p.name, p]));

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
    const p = pByName.get(name);
    const message =
      channel === "WHATSAPP"
        ? buildWhatsAppMessage(name, list)
        : channel === "EMAIL"
        ? buildEmailMessage(name, list)
        : list.map((t) => buildSmsMessage(t)).join("\n");

    let contactStatus: OutboxDraft["contactStatus"] = "Complete";
    if (channel === "WHATSAPP" && !p?.whatsapp) contactStatus = "Missing WhatsApp";
    if (channel === "EMAIL" && !p?.email) contactStatus = "Missing Email";
    if (!p) contactStatus = "Unknown";

    drafts.push({
      recipientName: name,
      personId: p?.id ?? null,
      whatsapp: p?.whatsapp ?? null,
      phone: p?.phone ?? null,
      email: p?.email ?? null,
      preferredChannel: p?.preferredChannel ?? null,
      tasks: list,
      message,
      contactStatus,
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

export async function markSent(channel: string, name: string, taskCodes: string[], message: string, contactStatus: string, recipientContact: string | null) {
  const key = dedupeKey(channel, name, taskCodes);
  const existing = await db.select().from(schema.reminders).where(eq(schema.reminders.dedupeKey, key)).limit(1);
  if (existing.length) return false;

  const now = new Date();
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
      await tx.insert(schema.outbox).values({
        channel,
        recipientName: name,
        recipientContact,
        body: message,
        messageType: "DAILY TASK REMINDER",
        status: "Sent",
        contactStatus,
        createdAt: now,
        sentAt: now,
      });
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/duplicate key|unique/i.test(msg)) return false;
    throw err;
  }
  return true;
}

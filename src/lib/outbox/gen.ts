import { sb } from "@/db/supabase";
import { getAllTasks, type TaskRow } from "../queries";
import { isOpen } from "../derive";
import { appBaseUrl } from "../app-url";
import { waReminderLink } from "../wa-card";
import type { EmailDoc, EmailTone, EmailOffice } from "../email/layout";

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

/** Compact deadline, e.g. "1 Jun" (Dar es Salaam time). */
function fmtDate(d: Date | null): string {
  if (!d) return "no deadline";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Africa/Nairobi" });
}

const isOverdue = (t: TaskRow): boolean => t.daysToDeadline != null && Number(t.daysToDeadline) < 0;

/** Collapse whitespace and clamp to one line so notes never bloat the message. */
function oneLine(s: string, max = 120): string {
  const t = s.trim().replace(/\s+/g, " ");
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
}

/** One compact meta line: "due 1 Jun · High". No status; priority kept. */
function taskMeta(t: TaskRow): string {
  return [`due ${fmtDate(t.deadline)}`, t.priority].join(" · ");
}

/**
 * Scannable reminder body, grouped by company. `bold` wraps the task name
 * (WhatsApp gets *asterisks*; email/SMS pass through plain). A single-company
 * recipient skips the company headers. Each task shows its Description (the main
 * message) and Latest update when present — no task code, no status words; an
 * "⚠️ overdue" marker replaces status wording only when a task is actually late.
 */
function buildReminder(name: string, tasks: TaskRow[], bold: (s: string) => string): string {
  // Group by company, first-seen order; tasks within a company by soonest deadline.
  const groups = new Map<string, TaskRow[]>();
  for (const t of tasks) {
    const list = groups.get(t.companyName);
    if (list) list.push(t); else groups.set(t.companyName, [t]);
  }
  for (const list of groups.values()) list.sort((a, b) => (a.deadline?.getTime() ?? Infinity) - (b.deadline?.getTime() ?? Infinity));

  const overdueCount = tasks.filter(isOverdue).length;
  const head = `Hi ${name}, a quick reminder on your ${tasks.length} open item${tasks.length === 1 ? "" : "s"}${overdueCount ? ` (${overdueCount} overdue)` : ""}:`;
  const lines = [head, ""];
  for (const [company, list] of groups) {
    lines.push(bold(company)); // company always heads its block — the breakdown lives in the message
    for (const t of list) {
      const others = t.assignees.filter((a) => a && a !== name);
      const shared = others.length ? ` (with ${others.join(", ")})` : "";
      const flag = isOverdue(t) ? "⚠️ " : "";
      lines.push(`• ${flag}${bold(t.actionItem)} — ${taskMeta(t)}${shared}`);
      if (t.comments && t.comments.trim()) lines.push(`  ${oneLine(t.comments)}`);
      if (t.latestUpdate && t.latestUpdate.trim()) lines.push(`  Latest: ${oneLine(t.latestUpdate)}`);
    }
    lines.push("");
  }
  lines.push("Please update the tracker when you can. Thanks.");
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/** Status dot mirroring the email: red = overdue/critical, amber = medium/high, white = low. */
function statusDot(t: TaskRow): string {
  if (isOverdue(t) || t.priority === "Critical") return "🔴";
  if (t.priority === "High" || t.priority === "Medium") return "🟠";
  return "⚪";
}

/**
 * Rich WhatsApp reminder "card" — mirrors the Aurora email's language so the two
 * channels feel like one product: a header with the office, a stat line, tasks
 * grouped by company with coloured status dots, a quiet sign-off, and the portal
 * link LAST (so WhatsApp renders a link-preview card from it). WhatsApp markdown:
 * *bold*, _italic_. Kept terse — no latest-update lines (those live in the email).
 */
export function buildWhatsAppMessage(name: string, tasks: TaskRow[], link?: string): string {
  const first = name.split(" ")[0] || name;
  const overdueCount = tasks.filter(isOverdue).length;

  // Group by company, first-seen order; soonest deadline first within a company.
  const groups = new Map<string, TaskRow[]>();
  for (const t of tasks) {
    const list = groups.get(t.companyName);
    if (list) list.push(t); else groups.set(t.companyName, [t]);
  }
  for (const list of groups.values()) list.sort((a, b) => (a.deadline?.getTime() ?? Infinity) - (b.deadline?.getTime() ?? Infinity));

  const lines = [
    "🔔 *Your tasks · Oracle Consultancy*",
    `Hi ${first}, a quick reminder of where things stand:`,
    "",
  ];
  for (const [company, list] of groups) {
    lines.push(`*${company}*`);
    for (const t of list) {
      const others = t.assignees.filter((a) => a && a !== name);
      const shared = others.length ? ` _(with ${others.join(", ")})_` : "";
      lines.push(`${statusDot(t)} ${t.actionItem} — _${taskMeta(t)}_${shared}`);
    }
    lines.push("");
  }
  lines.push(`📊 ${tasks.length} open${overdueCount ? ` · ${overdueCount} overdue` : ""}`);
  lines.push("Please update your tasks when you can. Thank you.");
  lines.push(link ?? `${appBaseUrl()}/portal`);
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * CLEAN plain-text reminder for MANUAL wa.me sends (the sender taps send). Unlike
 * buildWhatsAppMessage this uses NO WhatsApp markdown (`*`/`_` show up literally in
 * the compose box and look messy) and is CAPPED so the wa.me URL stays short enough
 * that WhatsApp Web reliably opens the chat. The portal link is last so WhatsApp
 * still builds a link-preview card. (The branded image only rides the Twilio path.)
 */
const MANUAL_TASK_CAP = 10;
export function buildWhatsAppManualMessage(name: string, tasks: TaskRow[], link?: string): string {
  const first = name.split(" ")[0] || name;
  const overdueCount = tasks.filter(isOverdue).length;

  const groups = new Map<string, TaskRow[]>();
  for (const t of tasks) {
    const list = groups.get(t.companyName);
    if (list) list.push(t); else groups.set(t.companyName, [t]);
  }
  for (const list of groups.values()) list.sort((a, b) => (a.deadline?.getTime() ?? Infinity) - (b.deadline?.getTime() ?? Infinity));

  const lines = [`Hi ${first}, a reminder of your open task${tasks.length === 1 ? "" : "s"}:`, ""];
  let shown = 0;
  for (const [company, list] of groups) {
    if (shown >= MANUAL_TASK_CAP) break;
    lines.push(company);
    for (const t of list) {
      if (shown >= MANUAL_TASK_CAP) break;
      const od = isOverdue(t) ? " — overdue" : "";
      const pri = t.priority === "Critical" || t.priority === "High" ? ` (${t.priority})` : "";
      lines.push(`• ${t.actionItem} — due ${fmtDate(t.deadline)}${od}${pri}`);
      shown++;
    }
    lines.push("");
  }
  const hidden = tasks.length - shown;
  if (hidden > 0) lines.push(`…and ${hidden} more.`, "");
  lines.push(`${tasks.length} open${overdueCount ? `, ${overdueCount} overdue` : ""}. Please update when you can. Thank you.`);
  lines.push(link ?? `${appBaseUrl()}/portal`);
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

export function buildEmailMessage(name: string, tasks: TaskRow[]): string {
  return buildReminder(name, tasks, (s) => s); // email shows literal asterisks — keep plain
}

export function buildSmsMessage(t: TaskRow): string {
  // SMS stays ultra-short: no code, no description/update — one scannable line.
  const flag = isOverdue(t) ? "⚠️ " : "";
  return `${flag}${t.companyName}: ${t.actionItem} · ${taskMeta(t)}`;
}

const priorityTone = (p: string): EmailTone =>
  p === "Critical" ? "danger" : p === "High" ? "warn" : p === "Medium" ? "accent" : "muted";

/**
 * Beautiful HTML email document for a person's task reminder — their open items
 * grouped by company, overdue ones flagged, each with a priority pill and due
 * date. Used by the staff task-reminder automation.
 */
export function buildTaskReminderDoc(
  name: string,
  tasks: TaskRow[],
  opts?: { office?: EmailOffice; signoffName?: string; note?: string },
): EmailDoc {
  const first = name.split(" ")[0];
  const overdueCount = tasks.filter(isOverdue).length;

  // Group by company, first-seen order; soonest deadline first within a company.
  const groups = new Map<string, TaskRow[]>();
  for (const t of tasks) {
    const list = groups.get(t.companyName);
    if (list) list.push(t); else groups.set(t.companyName, [t]);
  }
  for (const list of groups.values()) list.sort((a, b) => (a.deadline?.getTime() ?? Infinity) - (b.deadline?.getTime() ?? Infinity));

  const blocks: EmailDoc["blocks"] = [
    { kind: "stats", tiles: [
      { value: tasks.length, label: tasks.length === 1 ? "open item" : "open items" },
      { value: overdueCount, label: "overdue", danger: overdueCount > 0 },
    ]},
  ];
  for (const [company, list] of groups) {
    blocks.push({
      kind: "items",
      label: company,
      items: list.map((t) => {
        const od = isOverdue(t);
        return {
          pill: od ? { label: "Overdue", tone: "danger" as EmailTone } : { label: t.priority, tone: priorityTone(t.priority) },
          title: t.actionItem,
          meta: [`due ${fmtDate(t.deadline)}`, od ? t.priority : null].filter(Boolean).join(" · "),
        };
      }),
    });
  }

  return {
    preheader: `You have ${tasks.length} open task${tasks.length === 1 ? "" : "s"}${overdueCount ? ` — ${overdueCount} overdue` : ""}.`,
    title: "Your tasks",
    subtitle: `Hi ${first} — a quick reminder of where things stand`,
    blocks,
    cta: { label: "Open your tasks", url: `${appBaseUrl()}/portal` },
    footerNote: "Please update your tasks in the staff portal when you can. Thank you.",
    office: opts?.office ?? "admin",
    signoffName: opts?.signoffName,
    note: opts?.note,
  };
}

function buildAllMessages(name: string, list: TaskRow[], personId: number | null): Record<Channel, string> {
  // Per-person signed link → WhatsApp renders the live Aurora preview card.
  // Falls back to the plain /portal link for people not in the directory.
  const link = personId != null ? waReminderLink(personId) : undefined;
  return {
    WHATSAPP: buildWhatsAppManualMessage(name, list, link), // Outbox = copy/wa.me (manual) → clean plain text
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
      messages: buildAllMessages(name, list, p?.id ?? null),
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

  // Pre-check (best-effort; the unique index on reminders.dedupe_key is the real guard).
  const { data: existing } = await sb
    .from("reminders")
    .select("id")
    .eq("dedupe_key", key)
    .maybeSingle();
  if (existing) return { ok: false, reason: "duplicate" };

  const nowIso = new Date().toISOString();

  // Insert reminder first — if it fails on the unique index, treat as duplicate.
  const { error: rErr } = await sb.from("reminders").insert({
    channel,
    message_type: "DAILY TASK REMINDER",
    escalation_level: "LEVEL 1",
    sent_at: nowIso,
    dedupe_key: key,
    created_at: nowIso,
  });
  if (rErr) {
    if (/duplicate key|unique/i.test(rErr.message)) return { ok: false, reason: "duplicate" };
    throw new Error(rErr.message);
  }

  // Then insert outbox row (always succeeds; no unique constraint).
  const { data: outboxRow, error: oErr } = await sb
    .from("outbox")
    .insert({
      channel,
      recipient_name: name,
      recipient_contact: recipientContact,
      body: message,
      message_type: "DAILY TASK REMINDER",
      status: "Sent",
      contact_status: contactStatus,
      created_at: nowIso,
      sent_at: nowIso,
    })
    .select("id")
    .single();
  if (oErr) throw new Error(oErr.message);

  return { ok: true, dedupeKey: key, outboxId: (outboxRow?.id as number) ?? 0 };
}

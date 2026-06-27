import { sb } from "@/db/supabase";
import { getAllTasks, type TaskRow } from "../queries";
import { isOpen } from "../derive";
import { appBaseUrl } from "../app-url";
import { waReminderLink, waFromLabel } from "../wa-card";
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
export function buildWhatsAppMessage(name: string, tasks: TaskRow[], link?: string, from?: string): string {
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
  if (from) lines.push(`— ${from}`); // sender label now in the text (the link no longer carries it)
  lines.push(link ?? `${appBaseUrl()}/portal`); // link LAST so WhatsApp builds its preview card
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * SHORT "envelope" reminder for MANUAL wa.me sends (the sender taps send). The
 * per-task detail lives on the link-preview CARD (the `link` → /r/[p]/[t] →
 * /api/wa-card carries the live counts + top overdue), so the message itself stays
 * a few lines: greeting, a one-line status, a gentle nudge, and the signed link
 * LAST (WhatsApp builds its preview card from it). Deliberately:
 *   • NO WhatsApp markdown — `*`/`_` show up literally in the wa.me compose box
 *     (before the sender taps send) and look messy.
 *   • NO task list — keeping the body tiny means the wa.me URL never grows with the
 *     number of tasks, so WhatsApp Web reliably opens the chat even for heavy people.
 */
export function buildWhatsAppManualMessage(name: string, tasks: TaskRow[], link?: string, from?: string): string {
  const first = name.split(" ")[0] || name;
  const n = tasks.length;
  const overdueCount = tasks.filter(isOverdue).length;
  const count = `${n} open task${n === 1 ? "" : "s"}${overdueCount ? `, ${overdueCount} overdue` : ""}`;
  return [
    `Hi ${first}, a quick reminder — you have ${count}.`,
    "Tap below to see the full list and update them. Thank you.",
    from ? `— ${from}` : null, // sender label now in the text (the link no longer carries it)
    link ?? `${appBaseUrl()}/portal`, // link LAST so WhatsApp builds its preview card
  ].filter(Boolean).join("\n");
}

/**
 * WhatsApp summary for ONE person — every open task they're on, grouped by company.
 * Per task: title, a compact Status · Priority · Due line, who's responsible (first
 * names) and the latest update. (Distinct from the short buildWhatsAppManualMessage
 * nudge.) Sent via wa.me (manual tap-send), so the update is one-line-clamped to keep
 * the link usable; the reminder link goes LAST so WhatsApp renders the preview card.
 */
export function buildTaskSummaryWhatsApp(name: string, tasks: TaskRow[], link?: string, from?: string): string {
  const first = name.split(" ")[0] || name;
  const overdueCount = tasks.filter(isOverdue).length;

  const groups = new Map<string, TaskRow[]>();
  for (const t of tasks) {
    const list = groups.get(t.companyName);
    if (list) list.push(t); else groups.set(t.companyName, [t]);
  }
  for (const list of groups.values()) list.sort((a, b) => (a.deadline?.getTime() ?? Infinity) - (b.deadline?.getTime() ?? Infinity));

  const lines: string[] = [
    `Hi ${first}, here's a summary of your ${tasks.length} open task${tasks.length === 1 ? "" : "s"}${overdueCount ? ` (${overdueCount} overdue)` : ""}:`,
    "",
  ];
  for (const [company, list] of groups) {
    lines.push(`*${company}*`);
    for (const t of list) {
      lines.push(`*${t.actionItem}*`);
      const meta = [`Status: ${t.status}`, `Priority: ${t.priority}`];
      if (t.deadline) meta.push(`Due: ${fmtDate(t.deadline)}`);
      lines.push(meta.join(" · "));
      const who = t.assignees.filter(Boolean).map((a) => a.split(" ")[0]);
      if (who.length) lines.push(`Responsible: ${who.join(", ")}`);
      if (t.latestUpdate && t.latestUpdate.trim()) lines.push(`Latest: ${oneLine(t.latestUpdate, 100)}`);
      lines.push("");
    }
  }
  lines.push("Please update the tracker when you can. Thank you.");
  if (from) lines.push(`— ${from}`); // sender label now in the text (the link no longer carries it)
  if (link) lines.push(link); // link LAST so WhatsApp builds its preview card
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

function buildAllMessages(name: string, list: TaskRow[], personId: number | null, from?: string): Record<Channel, string> {
  // Per-person signed link → WhatsApp renders the live Aurora preview card.
  // `from` is the "from who" sign-off line in the message text (the Command Centre
  // for admin Outbox sends) — the link itself no longer carries it.
  // Falls back to the plain /portal link for people not in the directory.
  const link = personId != null ? waReminderLink(personId) : undefined;
  return {
    WHATSAPP: buildWhatsAppManualMessage(name, list, link, from), // Outbox = copy/wa.me (manual) → clean plain text
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
  // Admin Outbox reminders are "from" the Command Centre (or the owner's name if set
  // in Settings → Owner sign-in). Read it directly to keep gen.ts free of the
  // server-only admin-auth chain.
  const { data: ownerRow } = await sb.from("settings").select("value").eq("key", "v2.ownerName").maybeSingle();
  const ownerName = ((ownerRow?.value as string | null) ?? "").trim() || null;
  const adminFrom = waFromLabel({ name: ownerName });
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
      messages: buildAllMessages(name, list, p?.id ?? null, adminFrom),
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

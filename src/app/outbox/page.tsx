import { redirect } from "next/navigation";
import { generateDrafts, buildPortalTaskReminder } from "@/lib/outbox/gen";
import { appBaseUrl } from "@/lib/app-url";
import { listOutboxDrafts } from "@/lib/outbox/drafts";
import { todaysSentChannelsByName, historyByDay, formatDayLabel, snoozedToday, todaysSentRecords, lastChasedByName } from "@/lib/outbox/history";
import { getAutomationSnapshot } from "@/lib/outbox/snapshot";
import { getViewer } from "@/lib/auth/viewer";
import { viewerPeopleIds } from "@/lib/auth/viewer-scope";
import { sb } from "@/db/supabase";
import { StudioOutbox, type SentRow } from "@/components/studio/outbox/studio-outbox";

export const dynamic = "force-dynamic";

/**
 * The Outbox — one screen for the owner and a director (Studio, Sept 2026;
 * mockup `Outbox`). Reminders are generated live per person from open tasks;
 * drafts are the saved ones (to-dos, packs, automations); sent is today's log.
 *
 * A director sees the same screen for THEIR companies: only people who belong
 * to one of them, and only those people's tasks inside them (a shared staffer's
 * other-company work never leaks into the message). Saved drafts, snoozing and
 * the automation controls stay the owner's — the automation card is shown to
 * read. Every action re-checks all of this on the server (`outbox/actions.ts`).
 */
export default async function OutboxPage() {
  const v = await getViewer();
  if (!v) redirect("/login");
  if (v.kind === "director" && !v.person.caps.navOutbox) redirect("/");
  const owner = v.kind === "owner";

  const [generated, savedDrafts, sentByName, history, snoozed, automation, todaySent, lastChased, allowedIds] = await Promise.all([
    generateDrafts(),
    owner ? listOutboxDrafts() : Promise.resolve([]),
    todaysSentChannelsByName(),
    historyByDay(7),
    owner ? snoozedToday() : Promise.resolve([]),
    getAutomationSnapshot(),
    todaysSentRecords(),
    lastChasedByName(),
    viewerPeopleIds(v),
  ]);

  // A scoped director: their people, their companies' tasks.
  let drafts = generated;
  let allowedNames: Set<string> | null = null;
  if (v.kind === "director" && v.scope != null) {
    const scope = new Set(v.scope);
    drafts = drafts
      .filter((d) => d.personId != null && allowedIds?.has(d.personId))
      .map((d) => ({ ...d, tasks: d.tasks.filter((t) => scope.has(t.companyId)) }))
      .filter((d) => d.tasks.length > 0);
    const { data: ppl } = allowedIds?.size
      ? await sb.from("people").select("name").in("id", [...allowedIds])
      : { data: [] as { name: string }[] };
    allowedNames = new Set((ppl ?? []).map((p) => (p.name as string).trim().toLowerCase()));
  }
  const mine = (name: string | null | undefined) => !allowedNames || allowedNames.has((name ?? "").trim().toLowerCase());

  // A director's message is theirs: signed with their name and pointing the
  // person at their portal — the same text the portal's own reminder builds.
  if (v.kind === "director") {
    const link = `${appBaseUrl()}/portal`;
    const from = `${v.name} - ${v.role === "manager" ? "Manager" : "Director"}`;
    drafts = drafts.map((d) => ({ ...d, messages: { ...d.messages, WHATSAPP: buildPortalTaskReminder(d.recipientName, d.tasks, link, from) } }));
  }

  const pending = drafts.filter((d) => !(sentByName[d.recipientName.toLowerCase()] || []).length);
  const doneToday = drafts.length - pending.length;

  const toRow = (h: { id: number; channel: string; recipientName: string | null; recipientContact: string | null; sentAt: string | null }): SentRow => ({
    id: h.id, channel: h.channel, recipientName: h.recipientName, recipientContact: h.recipientContact, sentAt: h.sentAt,
  });
  const sent = todaySent.filter((h) => mine(h.recipientName)).map(toRow);
  const log = Object.keys(history).sort().reverse().map((k) => ({
    label: formatDayLabel(k),
    entries: (history[k] || []).filter((h) => mine(h.recipientName)).map(toRow),
  })).filter((d) => d.entries.length);

  const chased = Object.fromEntries(Object.entries(lastChased).filter(([k]) => mine(k)));

  return (
    <StudioOutbox
      viewer={owner ? "owner" : "director"}
      reminders={pending}
      drafts={savedDrafts}
      sent={sent}
      log={log}
      lastChased={chased}
      snoozed={snoozed.map((p) => ({ id: p.id, name: p.name }))}
      doneToday={doneToday}
      automation={{
        paused: automation.paused,
        allOff: automation.allOff,
        windowStartHour: automation.windowStartHour,
        windowEndHour: automation.windowEndHour,
        dailyCap: automation.dailyCap,
        categories: automation.allCategories.map((c) => ({ label: c.label, mode: c.mode })),
      }}
      scopeLabel={owner || v.scope == null ? "Across every company" : v.scope.length === 1 ? "Your company" : `Your ${v.scope.length} companies`}
    />
  );
}

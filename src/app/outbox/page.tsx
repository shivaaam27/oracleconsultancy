import { generateDrafts } from "@/lib/outbox-gen";
import { todaysSentChannelsByName, historyByDay, formatDayLabel, snoozedToday } from "@/lib/outbox-history";
import { PageHeader, Card, EmptyState } from "@/components/ui";
import { UnsnoozeButton } from "./outbox-card";
import { PendingList, type PendingItem } from "./pending-list";
import { SentLogDrawer } from "./sent-log-drawer";
import { Send, Inbox, Check, Clock, BellOff } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function OutboxPage() {
  const [drafts, sentByName, history, snoozed] = await Promise.all([
    generateDrafts(),
    todaysSentChannelsByName(),
    historyByDay(14),
    snoozedToday(),
  ]);

  // Per-draft sent state across all channels.
  const annotated: (PendingItem & { alreadySent: boolean })[] = drafts.map((d) => {
    const channels = Array.from(sentByName.get(d.recipientName.toLowerCase()) || []);
    return { draft: d, sentChannels: channels, alreadySent: channels.length > 0 };
  });

  const pending = annotated.filter((a) => !a.alreadySent);
  const doneTodayItems = annotated.filter((a) => a.alreadySent);
  const totalToday = annotated.length;
  const sentCount = doneTodayItems.length;
  const progressPct = totalToday === 0 ? 0 : Math.round((sentCount / totalToday) * 100);

  // Build drawer data from `outbox` history (all channels)
  const today = new Date();
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const yesterdayKey = (() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  })();

  // Today's done entries come from doneTodayItems (live drafts) — but we also want the historical record style. We'll show drafts as the source of truth for "Done today" in the drawer.
  const todayDoneEntries = doneTodayItems.map((a, idx) => ({
    id: -1 * (idx + 1), // synthetic id
    channel: (a.sentChannels[0] || "WHATSAPP") as string,
    recipientName: a.draft.recipientName,
    recipientContact:
      (a.sentChannels[0] === "EMAIL" ? a.draft.email : a.sentChannels[0] === "SMS" ? a.draft.phone : a.draft.whatsapp) || null,
    sentAt: new Date().toISOString(),
  }));

  const yesterdayEntries = (history.get(yesterdayKey) || []).map((h) => ({
    id: h.id,
    channel: h.channel,
    recipientName: h.recipientName,
    recipientContact: h.recipientContact,
    sentAt: h.sentAt ? h.sentAt.toISOString() : null,
  }));

  const olderDayKeys = Array.from(history.keys()).filter((k) => k !== yesterdayKey && k !== todayKey).sort().reverse();
  const olderBuckets = olderDayKeys.map((k) => ({
    dayKey: k,
    label: formatDayLabel(k),
    entries: (history.get(k) || []).map((h) => ({
      id: h.id,
      channel: h.channel,
      recipientName: h.recipientName,
      recipientContact: h.recipientContact,
      sentAt: h.sentAt ? h.sentAt.toISOString() : null,
    })),
  }));

  return (
    <div className="space-y-6 max-w-[960px] mx-auto">
      <PageHeader
        title="Outbox"
        sub={
          <span>
            {totalToday} {totalToday === 1 ? "recipient" : "recipients"} for today
            {sentCount > 0 && ` · ${sentCount} sent`}
          </span>
        }
        action={
          <div className="flex items-center gap-2">
            <SentLogDrawer
              todayDone={todayDoneEntries}
              yesterday={yesterdayEntries}
              older={olderBuckets}
              todayDoneCount={sentCount}
            />
            <div className="hidden md:flex items-center gap-1.5 text-xs text-fg-muted">
              <Send size={12} /> Drafts regenerate live
            </div>
          </div>
        }
      />

      {/* Progress strip */}
      {totalToday > 0 && (
        <Card className="p-4">
          <div className="flex items-center justify-between mb-2 text-sm">
            <div className="flex items-center gap-2">
              <Clock size={13} className="text-fg-muted" />
              <span className="font-medium">{sentCount} of {totalToday} sent today</span>
            </div>
            <div className="text-xs text-fg-muted">{progressPct}%</div>
          </div>
          <div className="bg-bg-muted rounded-full h-1.5 overflow-hidden">
            <div
              className="bg-accent h-full rounded-full transition-all"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </Card>
      )}

      {/* Pending */}
      {totalToday === 0 ? (
        <Card>
          <EmptyState
            icon={<Inbox size={32} />}
            title="No drafts to generate."
            hint="There are no open tasks assigned to anyone right now."
          />
        </Card>
      ) : pending.length === 0 ? (
        <Card className="p-6">
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-success/10 text-success mb-3">
              <Check size={20} />
            </div>
            <div className="font-medium">All clear for today.</div>
            <div className="text-xs text-fg-muted mt-1">
              {sentCount} {sentCount === 1 ? "reminder" : "reminders"} sent. Open the sent log to review.
            </div>
          </div>
        </Card>
      ) : (
        <PendingList items={pending} />
      )}

      {/* Snoozed */}
      {snoozed.length > 0 && (
        <details>
          <summary className="cursor-pointer list-none">
            <div className="text-xs font-semibold text-fg-muted uppercase tracking-wider flex items-center gap-1.5 hover:text-fg transition-colors">
              <BellOff size={12} className="inline-block" />
              Snoozed today · {snoozed.length}
            </div>
          </summary>
          <Card className="mt-3 p-0 overflow-hidden">
            <ul className="divide-y divide-border text-sm">
              {snoozed.map((s) => (
                <li key={s.id} className="px-4 py-2.5 flex items-center justify-between gap-3">
                  <span className="truncate font-medium">{s.name}</span>
                  <UnsnoozeButton personId={s.id} name={s.name} />
                </li>
              ))}
            </ul>
          </Card>
        </details>
      )}
    </div>
  );
}

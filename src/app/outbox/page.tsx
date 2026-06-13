import { generateDrafts } from "@/lib/outbox-gen";
import { listOutboxDrafts } from "@/lib/outbox-drafts";
import { DraftsList } from "./drafts-list";
import { todaysSentChannelsByName, historyByDay, formatDayLabel, snoozedToday, todaysSentRecords } from "@/lib/outbox-history";
import { getScopedCompanyId, getScopeOptions } from "@/lib/scope";
import { PageHeader, EmptyState } from "@/components/ui";
import { Globe2 } from "lucide-react";
import { UnsnoozeButton } from "./outbox-card";
import { PendingList, type PendingItem } from "./pending-list";
import { SentLogDrawer } from "./sent-log-drawer";
import { AutomationPanel } from "./automation-panel";
import { getAutomationSnapshot } from "@/lib/outbox-automation";
import { Send, Inbox, Check, BellOff, ChevronDown } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function OutboxPage() {
  const [drafts, savedDrafts, sentByName, history, snoozed, scopedId, scopeOptions, automation, todaySent] = await Promise.all([
    generateDrafts(),
    listOutboxDrafts(),
    todaysSentChannelsByName(),
    historyByDay(7),
    snoozedToday(),
    getScopedCompanyId(),
    getScopeOptions(),
    getAutomationSnapshot(),
    todaysSentRecords(),
  ]);
  const scopeName = scopedId != null
    ? scopeOptions.find((o) => o.id === scopedId)?.name ?? null
    : null;

  // Per-draft sent state across all channels.
  const annotated: (PendingItem & { alreadySent: boolean })[] = drafts.map((d) => {
    const channels = (sentByName[d.recipientName.toLowerCase()] || []) as ("WHATSAPP" | "EMAIL" | "SMS")[];
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

  // "Done today" uses the real sent records (actual `sent_at` timestamps) rather
  // than synthesising times from live drafts.
  const todayDoneEntries = todaySent.map((h) => ({
    id: h.id,
    channel: h.channel,
    recipientName: h.recipientName,
    recipientContact: h.recipientContact,
    sentAt: h.sentAt,
  }));

  const yesterdayEntries = (history[yesterdayKey] || []).map((h) => ({
    id: h.id,
    channel: h.channel,
    recipientName: h.recipientName,
    recipientContact: h.recipientContact,
    sentAt: h.sentAt,
  }));

  const olderDayKeys = Object.keys(history).filter((k) => k !== yesterdayKey && k !== todayKey).sort().reverse();
  const olderBuckets = olderDayKeys.map((k) => ({
    dayKey: k,
    label: formatDayLabel(k),
    entries: (history[k] || []).map((h) => ({
      id: h.id,
      channel: h.channel,
      recipientName: h.recipientName,
      recipientContact: h.recipientContact,
      sentAt: h.sentAt,
    })),
  }));

  return (
    <div className="space-y-4 max-w-[820px] mx-auto">
      <PageHeader
        title="Outbox"
        sub={
          <span>
            {totalToday} {totalToday === 1 ? "recipient" : "recipients"} to chase today
          </span>
        }
        action={
          <div className="flex items-center gap-2">
            <SentLogDrawer
              todayDone={todayDoneEntries}
              yesterday={yesterdayEntries}
              older={olderBuckets}
              todayDoneCount={todayDoneEntries.length}
            />
            <div className="hidden md:flex items-center gap-1.5 text-xs text-fg-muted">
              <Send size={12} /> Drafts regenerate live
            </div>
          </div>
        }
      />

      {scopeName && (
        <div
          className="flex items-center gap-2 px-1 text-[11px] text-fg-muted"
          title={`You're scoped to ${scopeName}, but the Outbox is intentionally global: reminders are grouped per person across all their tasks, so nobody gets pinged twice on the same day or quietly missed. Each card shows the company breakdown so you can still triage by company.`}
        >
          <Globe2 size={12} className="text-warn shrink-0" />
          <span>
            Outbox is global — <strong className="text-fg">{scopeName}</strong> scope is ignored.
            Use the company filter below to triage.
          </span>
        </div>
      )}

      {/* Automation hub — what the engine is set to do + what it sent overnight */}
      <AutomationPanel snapshot={automation} />

      {/* One-off drafts (to-do reminders, ad-hoc) */}
      <DraftsList drafts={savedDrafts} />

      {/* Today's reminders — live task nudges you copy & send by hand */}
      <div className="flex items-center gap-2 px-1 pt-1">
        <span className="text-xs font-semibold uppercase tracking-wider text-fg-muted">Today's reminders</span>
        <span className="text-[11px] text-fg-subtle">— per-person task nudges you copy &amp; send yourself</span>
      </div>

      {/* Progress strip — slim inline bar */}
      {totalToday > 0 && (
        <div className="flex items-center gap-3 px-1">
          <span className="text-xs text-fg-muted whitespace-nowrap tabular">{sentCount}/{totalToday} done</span>
          <div className="flex-1 bg-bg-muted rounded-full h-1.5 overflow-hidden">
            <div className="bg-accent h-full rounded-full transition-all" style={{ width: `${progressPct}%` }} />
          </div>
          <span className="text-xs text-fg-subtle tabular w-9 text-right">{progressPct}%</span>
        </div>
      )}

      {/* Pending */}
      {totalToday === 0 ? (
        <div className="glass elevated rounded-2xl">
          <EmptyState
            icon={<Inbox size={32} />}
            title="No drafts to generate."
            hint="There are no open tasks assigned to anyone right now."
          />
        </div>
      ) : pending.length === 0 ? (
        <div className="glass elevated rounded-2xl p-6">
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-success-soft/70 ring-1 ring-success/30 text-success mb-3">
              <Check size={20} />
            </div>
            <div className="font-medium">All clear for today.</div>
            <div className="text-xs text-fg-muted mt-1">
              {sentCount} {sentCount === 1 ? "reminder" : "reminders"} sent. Open the sent log to review.
            </div>
          </div>
        </div>
      ) : (
        <PendingList items={pending} scopeName={scopeName} />
      )}

      {/* Snoozed */}
      {snoozed.length > 0 && (
        <details className="group glass elevated rounded-2xl overflow-hidden">
          <summary className="cursor-pointer list-none flex items-center gap-1.5 px-4 py-3 text-xs font-semibold text-fg-muted uppercase tracking-wider hover:text-fg transition-colors">
            <BellOff size={12} />
            Snoozed today
            <span className="inline-flex items-center justify-center min-w-[20px] h-[20px] px-1.5 rounded-full bg-warn-soft/70 text-warn text-[11px] font-semibold tabular normal-case">
              {snoozed.length}
            </span>
            <ChevronDown size={14} className="ml-auto text-fg-subtle transition-transform group-open:rotate-180" />
          </summary>
          <ul className="divide-y divide-border/60 text-sm border-t border-border/60">
            {snoozed.map((s) => (
              <li key={s.id} className="px-4 py-2.5 flex items-center justify-between gap-3">
                <span className="truncate font-medium">{s.name}</span>
                <UnsnoozeButton personId={s.id} name={s.name} />
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

import { generateDrafts } from "@/lib/outbox-gen";
import { todaysSentChannelsByName, historyByDay, formatDayLabel, snoozedToday } from "@/lib/outbox-history";
import { getScopedCompanyId, getScopeOptions } from "@/lib/scope";
import { PageHeader, EmptyState, Badge } from "@/components/ui";
import { Globe2 } from "lucide-react";
import { UnsnoozeButton } from "./outbox-card";
import { PendingList, type PendingItem } from "./pending-list";
import { SentLogDrawer } from "./sent-log-drawer";
import { Send, Inbox, Check, Clock, BellOff, ChevronDown } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function OutboxPage() {
  const [drafts, sentByName, history, snoozed, scopedId, scopeOptions] = await Promise.all([
    generateDrafts(),
    todaysSentChannelsByName(),
    historyByDay(7),
    snoozedToday(),
    getScopedCompanyId(),
    getScopeOptions(),
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

  // Today's done entries come from doneTodayItems (live drafts) — but we also want the historical record style. We'll show drafts as the source of truth for "Done today" in the drawer.
  const todayDoneEntries = doneTodayItems.map((a, idx) => ({
    id: -1 * (idx + 1), // synthetic id
    channel: (a.sentChannels[0] || "WHATSAPP") as string,
    recipientName: a.draft.recipientName,
    recipientContact:
      (a.sentChannels[0] === "EMAIL" ? a.draft.email : a.sentChannels[0] === "SMS" ? a.draft.phone : a.draft.whatsapp) || null,
    sentAt: new Date().toISOString(),
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

      {scopeName && (
        <div className="glass elevated rounded-2xl flex items-start gap-3 px-4 py-3 text-xs">
          <Globe2 size={14} className="text-warn mt-0.5 shrink-0" />
          <div className="flex-1 space-y-1">
            <div className="flex items-center gap-2">
              <Badge tone="warn">Scope ignored</Badge>
              <span className="font-medium text-fg">
                Outbox is intentionally global.
              </span>
            </div>
            <p className="text-fg-muted leading-relaxed">
              You're scoped to <strong className="text-fg">{scopeName}</strong>, but reminders
              are grouped per person across <em>all</em> their tasks — that way nobody gets
              pinged twice on the same day or quietly missed. Each card below shows the
              company breakdown so you can still triage by company at a glance.
            </p>
          </div>
        </div>
      )}

      {/* Progress strip */}
      {totalToday > 0 && (
        <div className="glass elevated rounded-2xl p-4">
          <div className="flex items-center justify-between mb-2 text-sm">
            <div className="flex items-center gap-2">
              <Clock size={13} className="text-fg-muted" />
              <span className="font-medium">{sentCount} of {totalToday} sent today</span>
            </div>
            <div className="text-xs text-fg-muted tabular">{progressPct}%</div>
          </div>
          <div className="bg-bg-muted rounded-full h-2 overflow-hidden">
            <div
              className="bg-accent h-full rounded-full transition-all"
              style={{ width: `${progressPct}%` }}
            />
          </div>
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

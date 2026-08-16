import { generateDrafts } from "@/lib/outbox/gen";
import { PageHeader } from "@/components/ui";
import { listOutboxDrafts } from "@/lib/outbox/drafts";
import { todaysSentChannelsByName, historyByDay, formatDayLabel, snoozedToday, todaysSentRecords, lastChasedByName } from "@/lib/outbox/history";
import { getScopedCompanyId, getScopeOptions } from "@/lib/scope";
import { Panel, TONE, type Tone } from "@/components/surface-kit";
import { Reveal } from "@/components/reveal";
import { HrmsCrumbs } from "@/components/hrms/hrms-crumbs";
import { Globe2 } from "lucide-react";
import { UnsnoozeButton } from "./outbox-card";
import { OutboxWorkspace } from "./outbox-workspace";
import { type PendingItem } from "./pending-list";
import { SentLogDrawer } from "./sent-log-drawer";
import { AutomationPanel } from "./automation-panel";
import { getAutomationSnapshot } from "@/lib/outbox/snapshot";
import { BellOff, ChevronDown } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function OutboxPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  const { from } = await searchParams;
  const [drafts, savedDrafts, sentByName, history, snoozed, scopedId, scopeOptions, automation, todaySent, lastChased] = await Promise.all([
    generateDrafts(),
    listOutboxDrafts(),
    todaysSentChannelsByName(),
    historyByDay(7),
    snoozedToday(),
    getScopedCompanyId(),
    getScopeOptions(),
    getAutomationSnapshot(),
    todaysSentRecords(),
    lastChasedByName(),
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

  const heroMetrics: { label: string; value: number | string; tone: Tone }[] = [
    { label: totalToday === 1 ? "to chase" : "to chase", value: pending.length, tone: pending.length ? "accent" : "muted" },
    { label: "done today", value: sentCount, tone: sentCount ? "success" : "muted" },
    {
      label: automation.paused ? "automation paused" : automation.allOff ? "automation off" : "automation on",
      value: automation.paused ? "—" : automation.allOff ? "—" : automation.liveCategories.length,
      tone: automation.paused ? "warn" : automation.allOff ? "muted" : "success",
    },
  ];

  return (
    <div className="space-y-5">
      <HrmsCrumbs from={from} />
      <Reveal>
        <PageHeader
          title="Outbox"
          sub="Reminders, drafts and what's gone out — across every company"
          action={
            <SentLogDrawer
              todayDone={todayDoneEntries}
              yesterday={yesterdayEntries}
              older={olderBuckets}
              todayDoneCount={todayDoneEntries.length}
            />
          }
        >
          <div className="flex flex-wrap items-end gap-x-7 gap-y-3">
            {heroMetrics.map((m) => (
              <div key={m.label} className="flex items-baseline gap-1.5">
                <span className={`text-2xl font-semibold tabular ${TONE[m.tone].text}`}>{m.value}</span>
                <span className="text-[11px] text-fg-muted">{m.label}</span>
              </div>
            ))}
            {totalToday > 0 && (
              <div className="flex items-center gap-2 ml-auto min-w-[140px] flex-1 sm:flex-none">
                <div className="flex-1 bg-bg-muted/70 rounded-full h-1.5 overflow-hidden">
                  <div className="bg-accent h-full rounded-full transition-all" style={{ width: `${progressPct}%` }} />
                </div>
                <span className="text-[11px] text-fg-subtle tabular">{progressPct}%</span>
              </div>
            )}
          </div>
        </PageHeader>
      </Reveal>

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
      <Reveal delay={0.04}>
        <AutomationPanel snapshot={automation} />
      </Reveal>

      {/* Split-view workspace — drafts + reminders + sent in one list/detail surface */}
      <Reveal delay={0.08}>
        <OutboxWorkspace
          reminders={pending.map((a) => a.draft)}
          drafts={savedDrafts}
          sent={todayDoneEntries}
          scopeName={scopeName}
          lastChased={lastChased}
        />
      </Reveal>

      {/* Snoozed */}
      {snoozed.length > 0 && (
        <Panel className="overflow-hidden">
          <details className="group">
            <summary className="cursor-pointer list-none flex items-center gap-1.5 px-4 py-3 text-xs font-medium uppercase tracking-[0.08em] text-fg-muted hover:text-fg transition-colors">
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
        </Panel>
      )}
    </div>
  );
}

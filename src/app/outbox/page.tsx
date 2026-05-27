import { generateDrafts, dedupeKey } from "@/lib/outbox-gen";
import { todaysSentKeys, historyByDay, formatDayLabel, snoozedToday } from "@/lib/outbox-history";
import { PageHeader, Card, EmptyState } from "@/components/ui";
import { OutboxCard, UnsnoozeButton } from "./outbox-card";
import { PendingList } from "./pending-list";
import Link from "next/link";
import { Send, MessageCircle, Mail, Phone, Inbox, ChevronDown, Check, Clock, BellOff } from "lucide-react";

export const dynamic = "force-dynamic";

type Channel = "WHATSAPP" | "EMAIL" | "SMS";

export default async function OutboxPage({ searchParams }: { searchParams: Promise<{ channel?: string }> }) {
  const sp = await searchParams;
  const channel: Channel = (sp.channel?.toUpperCase() as Channel) || "WHATSAPP";

  const [drafts, sentKeys, history, snoozed] = await Promise.all([
    generateDrafts(channel),
    todaysSentKeys(channel),
    historyByDay(channel, 14),
    snoozedToday(),
  ]);

  // Mark drafts as already-sent so the UI can move them into the "Done today" bucket.
  const annotated = drafts.map((d) => {
    const key = dedupeKey(channel, d.recipientName, d.tasks.map((t) => t.code));
    return { draft: d, alreadySent: sentKeys.has(key) };
  });

  const pending = annotated.filter((a) => !a.alreadySent);
  const doneToday = annotated.filter((a) => a.alreadySent);
  const totalToday = annotated.length;
  const sentCount = doneToday.length;
  const progressPct = totalToday === 0 ? 0 : Math.round((sentCount / totalToday) * 100);

  const tabs: { key: Channel; label: string; icon: typeof MessageCircle }[] = [
    { key: "WHATSAPP", label: "WhatsApp", icon: MessageCircle },
    { key: "EMAIL", label: "Email", icon: Mail },
    { key: "SMS", label: "SMS", icon: Phone },
  ];

  // Split history into "Yesterday" vs "Older"
  const historyDays = Array.from(history.keys()).sort().reverse(); // newest first
  const yesterdayKey = (() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  })();
  const yesterday = history.get(yesterdayKey) || [];
  const olderDays = historyDays.filter((k) => k !== yesterdayKey);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Outbox"
        sub={
          <span>
            {totalToday} {totalToday === 1 ? "recipient" : "recipients"} for today
            {sentCount > 0 && ` · ${sentCount} sent`}
          </span>
        }
        action={
          <div className="flex items-center gap-1.5 text-xs text-fg-muted">
            <Send size={12} /> Drafts regenerate live from open tasks
          </div>
        }
      />

      {/* Channel tabs */}
      <div className="inline-flex bg-bg-subtle border border-border rounded-md p-1 gap-1">
        {tabs.map((t) => {
          const Icon = t.icon;
          const active = channel === t.key;
          return (
            <Link
              key={t.key}
              href={`/outbox?channel=${t.key.toLowerCase()}`}
              className={`px-3 py-1.5 text-sm rounded-md inline-flex items-center gap-1.5 transition-colors ${
                active ? "bg-bg-elev text-fg shadow-sm" : "text-fg-muted hover:text-fg"
              }`}
            >
              <Icon size={13} /> {t.label}
            </Link>
          );
        })}
      </div>

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

      {/* TODAY — pending */}
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
            <div className="text-xs text-fg-muted mt-1">{sentCount} {sentCount === 1 ? "reminder" : "reminders"} sent.</div>
          </div>
        </Card>
      ) : (
        <section className="space-y-3">
          <SectionLabel>Today · pending</SectionLabel>
          <PendingList items={pending} channel={channel} />
        </section>
      )}

      {/* TODAY — done */}
      {doneToday.length > 0 && (
        <details open={pending.length === 0}>
          <summary className="cursor-pointer list-none">
            <SectionLabel>
              <ChevronDown size={12} className="inline-block transition-transform group-open:rotate-180" />
              Done today · {doneToday.length}
            </SectionLabel>
          </summary>
          <div className="mt-3 grid grid-cols-1 lg:grid-cols-2 gap-4">
            {doneToday.map((a) => (
              <OutboxCard
                key={a.draft.recipientName}
                draft={a.draft}
                channel={channel}
                alreadySent
              />
            ))}
          </div>
        </details>
      )}

      {/* SNOOZED TODAY */}
      {snoozed.length > 0 && (
        <details>
          <summary className="cursor-pointer list-none">
            <SectionLabel>
              <BellOff size={12} className="inline-block" />
              Snoozed today · {snoozed.length}
            </SectionLabel>
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

      {/* YESTERDAY */}
      {yesterday.length > 0 && (
        <details>
          <summary className="cursor-pointer list-none">
            <SectionLabel>
              <ChevronDown size={12} className="inline-block" />
              Yesterday · {yesterday.length} sent
            </SectionLabel>
          </summary>
          <div className="mt-3">
            <HistoryList entries={yesterday} />
          </div>
        </details>
      )}

      {/* OLDER */}
      {olderDays.length > 0 && (
        <details>
          <summary className="cursor-pointer list-none">
            <SectionLabel>
              <ChevronDown size={12} className="inline-block" />
              Older · last {olderDays.length} day{olderDays.length === 1 ? "" : "s"} with sends
            </SectionLabel>
          </summary>
          <div className="mt-3 space-y-4">
            {olderDays.map((k) => {
              const entries = history.get(k) || [];
              return (
                <div key={k}>
                  <div className="text-xs font-semibold text-fg-muted uppercase tracking-wider mb-2">
                    {formatDayLabel(k)} · {entries.length}
                  </div>
                  <HistoryList entries={entries} />
                </div>
              );
            })}
          </div>
        </details>
      )}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-xs font-semibold text-fg-muted uppercase tracking-wider flex items-center gap-1.5 hover:text-fg transition-colors">
      {children}
    </div>
  );
}

function HistoryList({
  entries,
}: {
  entries: { id: number; recipientName: string | null; recipientContact: string | null; sentAt: Date | null }[];
}) {
  return (
    <Card className="p-0 overflow-hidden">
      <ul className="divide-y divide-border text-sm">
        {entries.map((e) => (
          <li key={e.id} className="px-4 py-2.5 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <Check size={12} className="text-success shrink-0" />
              <span className="truncate font-medium">{e.recipientName || "Unknown"}</span>
              {e.recipientContact && (
                <span className="text-xs text-fg-subtle truncate">· {e.recipientContact}</span>
              )}
            </div>
            <span className="text-xs text-fg-muted whitespace-nowrap tabular">
              {e.sentAt ? e.sentAt.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : "—"}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

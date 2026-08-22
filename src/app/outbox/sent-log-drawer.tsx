"use client";
import { useEffect, useState } from "react";
import { Inbox, X, Check, History, MessageCircle, Mail, Phone } from "lucide-react";
import { cn } from "@/lib/cn";

type Entry = {
  id: number;
  channel: string;
  recipientName: string | null;
  recipientContact: string | null;
  sentAt: string | null; // ISO from server
};

type DayBucket = { dayKey: string; label: string; entries: Entry[] };

const channelIcon: Record<string, typeof MessageCircle> = {
  WHATSAPP: MessageCircle,
  EMAIL: Mail,
  SMS: Phone,
};

export function SentLogDrawer({
  todayDone,
  yesterday,
  older,
  triggerLabel = "Sent log",
  todayDoneCount,
}: {
  todayDone: Entry[];
  yesterday: Entry[];
  older: DayBucket[];
  triggerLabel?: string;
  todayDoneCount: number;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border border-border bg-bg-elev text-fg-muted hover:text-fg hover:border-accent transition-colors"
      >
        <History size={12} /> {triggerLabel}
        {todayDoneCount > 0 && (
          <span className="text-xs tabular bg-bg-muted px-1.5 py-0.5 rounded-full">{todayDoneCount}</span>
        )}
      </button>

      {open && (
        <div className="fixed inset-0 z-[70] flex justify-end">
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close"
            className="flex-1 bg-black/40 backdrop-blur-sm"
          />
          <aside className="w-full sm:w-[440px] bg-bg-elev border-l border-border h-full overflow-y-auto shadow-lg">
            <div className="sticky top-0 bg-bg-elev border-b border-border px-4 py-3 flex items-center justify-between">
              <div className="font-medium text-sm inline-flex items-center gap-2">
                <History size={14} /> Sent log
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-fg-subtle hover:text-fg p-1 rounded-md hover:bg-bg-muted"
                aria-label="Close drawer"
              >
                <X size={14} />
              </button>
            </div>

            <div className="p-4 space-y-5">
              <Section title={`Done today · ${todayDone.length}`} entries={todayDone} emptyHint="Nothing sent today yet." />
              <Section title={`Yesterday · ${yesterday.length}`} entries={yesterday} emptyHint="Nothing sent yesterday." />
              {older.length === 0 ? (
                <Section title="Older" entries={[]} emptyHint="No older history." />
              ) : (
                <div className="space-y-4">
                  <div className="text-xs font-semibold text-fg-muted uppercase tracking-wider">Older</div>
                  {older.map((bucket) => (
                    <Section key={bucket.dayKey} title={`${bucket.label} · ${bucket.entries.length}`} entries={bucket.entries} emptyHint="—" subtle />
                  ))}
                </div>
              )}
            </div>
          </aside>
        </div>
      )}
    </>
  );
}

function Section({
  title,
  entries,
  emptyHint,
  subtle,
}: {
  title: string;
  entries: Entry[];
  emptyHint: string;
  subtle?: boolean;
}) {
  return (
    <div>
      {!subtle && (
        <div className="text-xs font-semibold text-fg-muted uppercase tracking-wider mb-2">{title}</div>
      )}
      {subtle && (
        <div className="text-xs font-medium text-fg-subtle mb-1.5">{title}</div>
      )}
      {entries.length === 0 ? (
        <div className="text-xs text-fg-subtle italic">{emptyHint}</div>
      ) : (
        <ul className="divide-y divide-border text-sm border border-border rounded-md overflow-hidden">
          {entries.map((e) => {
            const Icon = channelIcon[e.channel?.toUpperCase()] || Inbox;
            const time = e.sentAt
              ? new Date(e.sentAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
              : "—";
            return (
              <li key={e.id} className={cn("px-3 py-2 flex items-center justify-between gap-3 bg-bg-subtle/50")}>
                <div className="flex items-center gap-2 min-w-0">
                  <Check size={11} className="text-success shrink-0" />
                  <span className="truncate font-medium">{e.recipientName || "Unknown"}</span>
                  <Icon size={11} className="text-fg-subtle shrink-0" />
                  {e.recipientContact && (
                    <span className="text-xs text-fg-subtle truncate">{e.recipientContact}</span>
                  )}
                </div>
                <span className="text-xs text-fg-muted whitespace-nowrap tabular">{time}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

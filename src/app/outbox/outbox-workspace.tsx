"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { OutboxDraft, Channel } from "@/lib/outbox-gen";
import type { OutboxDraftRow } from "@/lib/outbox-drafts";
import type { LastChased } from "@/lib/outbox-history";
import { OutboxCard } from "./outbox-card";
import { DraftCard } from "./drafts-list";
import { sendAllEmailDrafts } from "./actions";
import { labelForSource } from "@/lib/outbox-automation-shared";
import { useToast } from "@/components/toast";
import { cn } from "@/lib/cn";
import {
  MessageCircle, Mail, Phone, Search, X, Bot,
  Inbox, ChevronLeft, Check, Clock, Send, Loader2,
} from "lucide-react";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/* ------------------------------------------------------------------ *
 * Outbox workspace — an email-client split view. Left: one compact,
 * filterable row per item (drafts + reminders + sent). Right: the
 * selected item's full message + actions. Solves the "scroll past a wall
 * of drafts to reach reminders" problem — every item is a single row.
 * ------------------------------------------------------------------ */

type Seg = "all" | "reminders" | "drafts" | "sent";

export type SentEntry = {
  id: number;
  channel: string;
  recipientName: string | null;
  recipientContact: string | null;
  sentAt: string | null;
};

const channelIcon: Record<string, typeof MessageCircle> = {
  WHATSAPP: MessageCircle, EMAIL: Mail, SMS: Phone,
};
function channelLabel(c: string): string {
  return c === "WHATSAPP" ? "WhatsApp" : c === "EMAIL" ? "Email" : "SMS";
}

type Urg = "red" | "amber" | "none";
const urgDot: Record<Urg, string> = {
  red: "bg-danger", amber: "bg-warn", none: "bg-border-strong",
};

type Item =
  | {
      kind: "reminder"; key: string; name: string; channel: string; urg: Urg; rank: number;
      sub: string; auto: false; companies: string[]; draft: OutboxDraft; chased: LastChased | null;
    }
  | {
      kind: "draft"; key: string; name: string; channel: string; urg: Urg; rank: number;
      sub: string; auto: boolean; companies: string[]; row: OutboxDraftRow;
    }
  | {
      kind: "sent"; key: string; name: string; channel: string; urg: Urg; rank: number;
      sub: string; auto: false; companies: string[]; entry: SentEntry;
    };

function reminderChannel(d: OutboxDraft): string {
  const pref = (d.preferredChannel?.toUpperCase() as Channel) || null;
  if (pref && d.contactByChannel[pref] === "Complete") return pref;
  if (d.contactByChannel.WHATSAPP === "Complete") return "WHATSAPP";
  if (d.contactByChannel.EMAIL === "Complete") return "EMAIL";
  if (d.contactByChannel.SMS === "Complete") return "SMS";
  return pref || "WHATSAPP";
}

function reminderUrg(d: OutboxDraft): { urg: Urg; overdue: number; rank: number } {
  const overdue = d.tasks.filter((t) => t.flag === "overdue" || t.flag === "escalate-now").length;
  const critical = d.tasks.filter((t) => t.priority === "Critical").length;
  const dueSoon = d.tasks.filter((t) => t.flag === "due-soon").length;
  if (overdue > 0 || critical > 0) return { urg: "red", overdue, rank: 0 };
  if (dueSoon > 0) return { urg: "amber", overdue, rank: 1 };
  return { urg: "none", overdue, rank: 2 };
}

function timeOf(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

/** "just now" / "3h ago" / "yesterday" / "4d ago" / "2w ago" / "7 Jun". */
function chasedAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 3_600_000) return "just now";
  const days = Math.floor(ms / 86_400_000);
  if (days < 1) return `${Math.floor(ms / 3_600_000)}h ago`;
  if (days === 1) return "yesterday";
  if (days < 7) return `${days}d ago`;
  const wks = Math.floor(days / 7);
  if (wks < 5) return `${wks}w ago`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export function OutboxWorkspace({
  reminders,
  drafts,
  sent,
  scopeName = null,
  lastChased = {},
}: {
  reminders: OutboxDraft[];
  drafts: OutboxDraftRow[];
  sent: SentEntry[];
  scopeName?: string | null;
  lastChased?: Record<string, LastChased>;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [seg, setSeg] = useState<Seg>("all");
  const [q, setQ] = useState("");
  const [company, setCompany] = useState("all");
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [bulkPending, startBulk] = useTransition();

  const emailDraftCount = useMemo(
    () => drafts.filter((d) => d.channel === "EMAIL" && EMAIL_RE.test(d.recipientContact ?? "")).length,
    [drafts],
  );

  function onBulkSend() {
    startBulk(async () => {
      const res = await sendAllEmailDrafts();
      if (res.notConfigured && res.sent === 0) {
        toast("Email sending isn't switched on — open each draft and use ‘Open email’.", { tone: "warn", duration: 6000 });
        return;
      }
      const bits = [`${res.sent} email${res.sent === 1 ? "" : "s"} sent`];
      if (res.failed) bits.push(`${res.failed} failed`);
      toast(bits.join(" · "), { tone: res.failed ? "warn" : "success", duration: 5000 });
      router.refresh();
    });
  }

  // Build the unified item list (stable; removal handled via `removed`).
  const allItems = useMemo<Item[]>(() => {
    const rItems: Item[] = reminders.map((d) => {
      const { urg, overdue, rank } = reminderUrg(d);
      const top = d.tasks[0];
      const sub =
        d.tasks.length === 1 && top
          ? top.actionItem
          : `${d.tasks.length} tasks${overdue ? ` · ${overdue} overdue` : ""}`;
      const companies = [...new Set(d.tasks.map((t) => t.companyName))];
      return {
        kind: "reminder", key: `r:${d.recipientName}`, name: d.recipientName,
        channel: reminderChannel(d), urg, rank, sub, auto: false, companies, draft: d,
        chased: lastChased[d.recipientName.trim().toLowerCase()] ?? null,
      };
    });
    const dItems: Item[] = drafts.map((row) => {
      const auto = !!row.source?.startsWith("automation");
      const sub = labelForSource(row.source) ?? (row.subject || channelLabel(row.channel));
      return {
        kind: "draft", key: `d:${row.id}`, name: row.recipientName || row.recipientContact || "Draft",
        channel: row.channel, urg: "none" as Urg, rank: auto && /overdue/.test(row.source ?? "") ? 0.5 : 1.5,
        sub, auto, companies: row.company ? [row.company] : [], row,
      };
    });
    const sItems: Item[] = sent.map((e) => ({
      kind: "sent", key: `s:${e.id}`, name: e.recipientName || "Unknown",
      channel: e.channel, urg: "none" as Urg, rank: 9,
      sub: `Sent ${timeOf(e.sentAt)}`, auto: false, companies: [], entry: e,
    }));
    return [...rItems, ...dItems, ...sItems];
  }, [reminders, drafts, sent, lastChased]);

  const companyOptions = useMemo(() => {
    const m = new Map<string, number>();
    for (const it of allItems) {
      if (it.kind === "sent") continue;
      for (const c of it.companies) m.set(c, (m.get(c) || 0) + 1);
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [allItems]);

  const counts = useMemo(() => {
    const live = allItems.filter((i) => i.kind !== "sent" && !removed.has(i.key));
    return {
      all: live.length,
      reminders: live.filter((i) => i.kind === "reminder").length,
      drafts: live.filter((i) => i.kind === "draft").length,
      sent: allItems.filter((i) => i.kind === "sent").length,
    };
  }, [allItems, removed]);

  const visible = useMemo(() => {
    const query = q.trim().toLowerCase();
    return allItems
      .filter((i) => {
        if (removed.has(i.key)) return false;
        if (seg === "sent") return i.kind === "sent";
        if (i.kind === "sent") return false;
        if (seg === "reminders" && i.kind !== "reminder") return false;
        if (seg === "drafts" && i.kind !== "draft") return false;
        if (company !== "all" && !i.companies.includes(company)) return false;
        if (query && !i.name.toLowerCase().includes(query)) return false;
        return true;
      })
      .sort((a, b) => (a.rank - b.rank) || a.name.localeCompare(b.name));
  }, [allItems, removed, seg, company, q]);

  // Resolve selection: keep current if still visible, else first item.
  const selected = visible.find((i) => i.key === selectedKey) ?? visible[0] ?? null;

  function pick(key: string) {
    setSelectedKey(key);
    setMobileOpen(true);
  }

  function resolveItem(key: string) {
    // Advance selection to the next visible item before removing.
    const idx = visible.findIndex((i) => i.key === key);
    const next = visible[idx + 1] ?? visible[idx - 1] ?? null;
    setSelectedKey(next ? next.key : null);
    setRemoved((s) => new Set(s).add(key));
    setMobileOpen(false);
  }

  const segs: { id: Seg; label: string; count: number }[] = [
    { id: "all", label: "All", count: counts.all },
    { id: "reminders", label: "Reminders", count: counts.reminders },
    { id: "drafts", label: "Drafts", count: counts.drafts },
    { id: "sent", label: "Sent", count: counts.sent },
  ];

  return (
    <div className="space-y-3">
      {/* Toolbar — segmented filter + company + search */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex items-center gap-0.5 p-0.5 rounded-full bg-bg-subtle/70 ring-1 ring-border">
          {segs.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => { setSeg(s.id); setSelectedKey(null); }}
              className={cn(
                "inline-flex items-center gap-1.5 px-3 py-1 text-xs rounded-full transition-colors",
                seg === s.id ? "bg-bg-elev text-fg shadow-sm ring-1 ring-border" : "text-fg-muted hover:text-fg"
              )}
            >
              {s.label}
              <span className={cn("tabular text-[11px]", seg === s.id ? "text-accent" : "text-fg-subtle")}>{s.count}</span>
            </button>
          ))}
        </div>

        {companyOptions.length > 0 && (
          <select
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            className={cn(
              "text-xs rounded-full border px-2.5 py-1.5 cursor-pointer transition-colors",
              company !== "all" ? "border-accent/40 bg-accent/10 text-fg" : "border-border bg-bg-elev text-fg-muted hover:text-fg"
            )}
            title="Filter by company"
          >
            <option value="all">All companies</option>
            {companyOptions.map(([name, n]) => (
              <option key={name} value={name}>{name === scopeName ? `★ ${name}` : name} ({n})</option>
            ))}
          </select>
        )}

        {emailDraftCount > 0 && (
          <button
            type="button"
            onClick={onBulkSend}
            disabled={bulkPending}
            title="Send every email draft now from admin@oracle.co.tz"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-full bg-accent text-accent-fg hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {bulkPending ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
            Send all email <span className="tabular opacity-80">({emailDraftCount})</span>
          </button>
        )}

        <div className="relative ml-auto flex-1 sm:flex-none min-w-[8rem]">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-subtle" />
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search…"
            className="w-full sm:w-44 pl-8 pr-7 py-1.5 text-xs rounded-full border border-border bg-bg-subtle/60 backdrop-blur-md focus:outline-none focus:ring-2 focus:ring-accent/50"
          />
          {q && (
            <button type="button" onClick={() => setQ("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-fg-subtle hover:text-fg" aria-label="Clear search">
              <X size={11} />
            </button>
          )}
        </div>
      </div>

      {/* Split: list (left) + detail (right). Mobile: list only, detail as overlay. */}
      <div className="grid grid-cols-1 md:grid-cols-[minmax(0,300px)_minmax(0,1fr)] gap-3 items-start">
        {/* List */}
        <div className="bg-bg-elev ring-1 ring-border rounded-2xl elevated overflow-hidden">
          {visible.length === 0 ? (
            <div className="p-8 text-center text-sm text-fg-muted">
              <Inbox size={28} className="mx-auto mb-2 text-fg-subtle" />
              {seg === "sent" ? "Nothing sent today yet." : "Nothing here right now."}
            </div>
          ) : (
            <ul className="divide-y divide-border/60 max-h-[70vh] overflow-y-auto">
              {visible.map((it) => (
                <li key={it.key}>
                  <button
                    type="button"
                    onClick={() => pick(it.key)}
                    className={cn(
                      "w-full text-left flex items-start gap-2.5 px-3 py-2.5 transition-colors",
                      selected?.key === it.key ? "bg-accent-soft/40" : "hover:bg-bg-muted/40"
                    )}
                  >
                    <span className={cn("w-1.5 h-1.5 rounded-full mt-1.5 shrink-0", urgDot[it.urg])} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span className="font-medium text-[13px] truncate">{it.name}</span>
                        {it.kind === "draft" && it.auto && <Bot size={12} className="text-accent shrink-0" />}
                      </span>
                      <span className="block text-[11px] text-fg-subtle truncate mt-0.5">
                        {it.sub}
                        {it.kind === "reminder" && it.chased && (
                          <span className="text-fg-subtle/70"> · chased {chasedAgo(it.chased.sentAt)}</span>
                        )}
                      </span>
                    </span>
                    <TypeChip kind={it.kind} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Detail — desktop */}
        <div className="hidden md:block">
          <DetailPane item={selected} scopeName={scopeName} onResolved={resolveItem} />
        </div>
      </div>

      {/* Detail — mobile overlay */}
      {mobileOpen && selected && (
        <div className="md:hidden fixed inset-0 z-[70] bg-bg flex flex-col">
          <div className="flex items-center gap-2 px-3 py-3 border-b border-border">
            <button type="button" onClick={() => setMobileOpen(false)} className="inline-flex items-center gap-1 text-sm text-fg-muted hover:text-fg">
              <ChevronLeft size={16} /> Back
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-3">
            <DetailPane item={selected} scopeName={scopeName} onResolved={resolveItem} />
          </div>
        </div>
      )}
    </div>
  );
}

function TypeChip({ kind }: { kind: Item["kind"] }) {
  const map = {
    reminder: { label: "Reminder", cls: "bg-warn-soft/60 text-warn" },
    draft: { label: "Draft", cls: "bg-info-soft/70 text-info" },
    sent: { label: "Sent", cls: "bg-success-soft/70 text-success" },
  } as const;
  const m = map[kind];
  return <span className={cn("shrink-0 text-[10px] px-2 py-0.5 rounded-full", m.cls)}>{m.label}</span>;
}

function DetailPane({
  item,
  scopeName,
  onResolved,
}: {
  item: Item | null;
  scopeName: string | null;
  onResolved: (key: string) => void;
}) {
  if (!item) {
    return (
      <div className="bg-bg-elev ring-1 ring-border rounded-2xl elevated p-10 text-center text-sm text-fg-muted">
        <Inbox size={30} className="mx-auto mb-2 text-fg-subtle" />
        Select an item to see its message.
      </div>
    );
  }

  return (
    <div className="bg-bg-elev ring-1 ring-border rounded-2xl elevated p-4 md:sticky md:top-4">
      {item.kind === "reminder" && (
        <>
          {item.chased && (
            <div className="mb-2.5 flex items-center gap-1.5 text-[11px] text-fg-muted">
              <Clock size={11} className="shrink-0" />
              Last chased {chasedAgo(item.chased.sentAt)} · {channelLabel(item.chased.channel)}
            </div>
          )}
          <OutboxCard key={item.key} draft={item.draft} detail scopeName={scopeName} onResolved={() => onResolved(item.key)} />
        </>
      )}
      {item.kind === "draft" && (
        <DraftCard key={item.key} draft={item.row} detail onGone={() => onResolved(item.key)} />
      )}
      {item.kind === "sent" && <SentDetail key={item.key} entry={item.entry} />}
    </div>
  );
}

function SentDetail({ entry }: { entry: SentEntry }) {
  const Icon = channelIcon[entry.channel?.toUpperCase()] || Mail;
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <span className="w-9 h-9 rounded-full bg-success-soft/70 text-success grid place-items-center shrink-0">
          <Check size={16} />
        </span>
        <div className="min-w-0">
          <div className="font-medium text-sm truncate">{entry.recipientName || "Unknown"}</div>
          <div className="text-[11px] text-fg-muted flex items-center gap-1.5">
            <Icon size={12} /> {channelLabel(entry.channel?.toUpperCase())}
            {entry.recipientContact && <span className="truncate">· {entry.recipientContact}</span>}
          </div>
        </div>
        <span className="ml-auto text-[11px] text-fg-subtle tabular inline-flex items-center gap-1">
          <Clock size={11} /> {timeOf(entry.sentAt)}
        </span>
      </div>
      <p className="text-xs text-fg-muted">This was sent earlier today. The sent log keeps the full history.</p>
    </div>
  );
}

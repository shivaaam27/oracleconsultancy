"use client";

import { useMemo, useState } from "react";
import { MessageCircle, Mail, Phone, Send, Building2, Check } from "lucide-react";
import { Panel, SectionLabel } from "@/components/surface-kit";
import { Badge } from "@/components/ui";
import { cn } from "@/lib/cn";

/** One outbox row, already scoped + shaped on the server. */
export type OutboxRow = {
  id: number;
  channel: string; // "WHATSAPP" | "EMAIL" | "SMS" | other (upper-cased)
  recipientName: string;
  company: string | null;
  subject: string | null;
  body: string;
  messageType: string | null;
  status: string | null;
  sentAt: string | null;
  createdAt: string;
};

const channelIcon: Record<string, typeof MessageCircle> = {
  WHATSAPP: MessageCircle,
  EMAIL: Mail,
  SMS: Phone,
};

function channelLabel(c: string): string {
  return c === "WHATSAPP" ? "WhatsApp" : c === "EMAIL" ? "Email" : c === "SMS" ? "SMS" : "Message";
}

/** A short, human timestamp in the operator's zone (Dar es Salaam, UTC+3).
 *  "Just now" / "12 min ago" / "3 h ago" within the day, else "13 Jun" / with year. */
function shortWhen(iso: string): string {
  const then = new Date(iso);
  const now = Date.now();
  const diffMin = Math.round((now - then.getTime()) / 60000);
  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffH = Math.round(diffMin / 60);
  if (diffH < 24) return `${diffH} h ago`;
  const sameYear = then.getFullYear() === new Date().getFullYear();
  return then.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: sameYear ? undefined : "numeric",
    timeZone: "Africa/Nairobi",
  });
}

/** Collapse the body to a single readable line for the snippet. */
function snippet(body: string): string {
  return body.replace(/\s+/g, " ").trim();
}

type FilterKey = "all" | "draft" | "sent";

export function PortalOutboxList({ rows }: { rows: OutboxRow[] }) {
  const [filter, setFilter] = useState<FilterKey>("all");

  const counts = useMemo(() => {
    const sent = rows.filter((r) => r.sentAt).length;
    return { all: rows.length, sent, draft: rows.length - sent };
  }, [rows]);

  const shown = useMemo(() => {
    if (filter === "sent") return rows.filter((r) => r.sentAt);
    if (filter === "draft") return rows.filter((r) => !r.sentAt);
    return rows;
  }, [rows, filter]);

  if (rows.length === 0) {
    return (
      <Panel className="p-8 text-center">
        <Send size={20} className="mx-auto mb-2 text-fg-subtle" />
        <p className="text-sm text-fg-muted">Nothing has gone out yet.</p>
      </Panel>
    );
  }

  const filters: Array<{ key: FilterKey; label: string; n: number }> = [
    { key: "all", label: "All", n: counts.all },
    { key: "sent", label: "Sent", n: counts.sent },
    { key: "draft", label: "Drafted", n: counts.draft },
  ];

  return (
    <div className="flex flex-col gap-3">
      <SectionLabel
        icon={<Send size={13} />}
        action={
          <div className="inline-flex items-center gap-1 rounded-full bg-bg-subtle/70 p-0.5 ring-1 ring-border">
            {filters.map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => setFilter(f.key)}
                className={cn(
                  "rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors",
                  filter === f.key ? "bg-bg-elev text-fg ring-1 ring-border" : "text-fg-muted hover:text-fg",
                )}
              >
                {f.label} <span className="tabular text-fg-subtle">{f.n}</span>
              </button>
            ))}
          </div>
        }
      >
        Outreach
      </SectionLabel>

      <Panel className="divide-y divide-border/70 overflow-hidden">
        {shown.length === 0 ? (
          <p className="p-6 text-center text-sm text-fg-muted">
            {filter === "sent" ? "Nothing sent yet." : "No drafts in view."}
          </p>
        ) : (
          shown.map((r) => {
            const Icon = channelIcon[r.channel] ?? Send;
            const isSent = !!r.sentAt;
            const body = snippet(r.subject ? `${r.subject} — ${r.body}` : r.body);
            return (
              <div key={r.id} className="flex items-start gap-3 p-3.5">
                <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full bg-accent-soft text-accent">
                  <Icon size={15} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="truncate text-sm font-medium text-fg">{r.recipientName}</span>
                    <Badge tone="info">{channelLabel(r.channel)}</Badge>
                    {r.messageType && (
                      <span className="text-[11px] text-fg-subtle">{r.messageType}</span>
                    )}
                    {r.company && (
                      <span className="inline-flex items-center gap-1 text-[11px] text-fg-subtle">
                        <Building2 size={11} /> {r.company}
                      </span>
                    )}
                  </div>
                  {body && (
                    <p className="mt-0.5 truncate text-xs text-fg-muted">{body}</p>
                  )}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1 pl-1">
                  {isSent ? (
                    <Badge tone="success">
                      <Check size={11} /> Sent
                    </Badge>
                  ) : (
                    <Badge tone="default">{r.status?.trim() || "Draft"}</Badge>
                  )}
                  <span className="text-[11px] text-fg-subtle">
                    {shortWhen(r.sentAt ?? r.createdAt)}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </Panel>
    </div>
  );
}

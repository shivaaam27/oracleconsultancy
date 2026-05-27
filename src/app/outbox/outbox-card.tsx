"use client";
import { Badge, Card } from "@/components/ui";
import type { OutboxDraft } from "@/lib/outbox-gen";
import { Copy, ExternalLink, Check, MessageCircle, Mail, Phone, AlertCircle, User } from "lucide-react";
import { useState, useTransition } from "react";
import { recordSent } from "./actions";
import { cn } from "@/lib/cn";

function cleanPhone(p: string | null): string | null {
  if (!p) return null;
  return p.replace(/[^\d+]/g, "");
}

type Urgency = "critical" | "warn" | "normal";

function urgencyOf(tasks: OutboxDraft["tasks"]): {
  level: Urgency;
  overdue: number;
  critical: number;
  dueSoon: number;
} {
  const overdue = tasks.filter((t) => t.flag === "overdue" || t.flag === "escalate-now").length;
  const critical = tasks.filter((t) => t.priority === "Critical").length;
  const dueSoon = tasks.filter((t) => t.flag === "due-soon").length;
  let level: Urgency = "normal";
  if (overdue > 0 || critical > 0) level = "critical";
  else if (dueSoon > 0) level = "warn";
  return { level, overdue, critical, dueSoon };
}

const stripeClass: Record<Urgency, string> = {
  critical: "border-l-red-500",
  warn: "border-l-amber-500",
  normal: "border-l-transparent",
};

export function OutboxCard({
  draft,
  channel,
  alreadySent = false,
}: {
  draft: OutboxDraft;
  channel: "WHATSAPP" | "EMAIL" | "SMS";
  alreadySent?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const [sent, setSent] = useState(alreadySent);
  const [duplicate, setDuplicate] = useState(false);
  const [pending, startTransition] = useTransition();

  const onCopy = async () => {
    await navigator.clipboard.writeText(draft.message);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const onMarkSent = () => {
    const fd = new FormData();
    fd.set("channel", channel);
    fd.set("name", draft.recipientName);
    fd.set("taskCodes", JSON.stringify(draft.tasks.map((t) => t.code)));
    fd.set("message", draft.message);
    fd.set("contactStatus", draft.contactStatus);
    fd.set(
      "recipientContact",
      channel === "EMAIL" ? draft.email || "" : channel === "WHATSAPP" ? draft.whatsapp || "" : draft.phone || ""
    );
    startTransition(async () => {
      const res = await recordSent(fd);
      if (res.ok) setSent(true);
      else if (res.reason === "duplicate") {
        setDuplicate(true);
        setSent(true);
      }
    });
  };

  const waNumber = cleanPhone(draft.whatsapp);
  const waLink =
    channel === "WHATSAPP" && waNumber
      ? `https://wa.me/${waNumber.replace(/^\+/, "")}?text=${encodeURIComponent(draft.message)}`
      : null;
  const mailtoLink =
    channel === "EMAIL" && draft.email
      ? `mailto:${draft.email}?subject=${encodeURIComponent("Daily Task Reminder — " + new Date().toLocaleDateString())}&body=${encodeURIComponent(draft.message)}`
      : null;
  const smsLink = channel === "SMS" && draft.phone ? `sms:${cleanPhone(draft.phone)}?body=${encodeURIComponent(draft.message)}` : null;

  const openLink = waLink || mailtoLink || smsLink;
  const OpenIcon = channel === "WHATSAPP" ? MessageCircle : channel === "EMAIL" ? Mail : Phone;

  const u = urgencyOf(draft.tasks);

  return (
    <Card
      className={cn(
        "overflow-hidden border-l-4 transition-opacity",
        stripeClass[u.level],
        sent && "opacity-60"
      )}
    >
      <div className="p-4 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-full bg-accent-soft text-accent flex items-center justify-center shrink-0">
            <User size={15} />
          </div>
          <div className="min-w-0">
            <div className="font-medium truncate">{draft.recipientName}</div>
            <div className="text-xs text-fg-muted flex flex-wrap gap-x-2 gap-y-0.5">
              <span>{draft.tasks.length} task{draft.tasks.length === 1 ? "" : "s"}</span>
              {u.overdue > 0 && <span className="text-red-600 dark:text-red-400">· {u.overdue} overdue</span>}
              {u.critical > 0 && <span className="text-red-600 dark:text-red-400">· {u.critical} critical</span>}
              {u.dueSoon > 0 && u.overdue === 0 && u.critical === 0 && (
                <span className="text-amber-600 dark:text-amber-400">· {u.dueSoon} due soon</span>
              )}
              {channel === "WHATSAPP" && draft.whatsapp && <span className="text-fg-subtle">· {draft.whatsapp}</span>}
              {channel === "EMAIL" && draft.email && <span className="text-fg-subtle">· {draft.email}</span>}
              {channel === "SMS" && draft.phone && <span className="text-fg-subtle">· {draft.phone}</span>}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {sent ? (
            <Badge tone="success"><Check size={11} /> Sent</Badge>
          ) : draft.contactStatus === "Complete" ? (
            <Badge tone="success">Ready</Badge>
          ) : (
            <Badge tone="warn"><AlertCircle size={11} /> {draft.contactStatus}</Badge>
          )}
        </div>
      </div>

      {!sent && (
        <div className="p-4 bg-bg-subtle/50 max-h-64 overflow-y-auto">
          <pre className="text-xs whitespace-pre-wrap font-sans text-fg-muted leading-relaxed">{draft.message}</pre>
        </div>
      )}

      <div className="p-3 flex items-center justify-between gap-2 bg-bg-elev border-t border-border">
        <button
          onClick={onCopy}
          disabled={sent}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md bg-bg-muted hover:bg-border-strong text-fg-muted hover:text-fg transition-colors disabled:opacity-50"
        >
          {copied ? <><Check size={12} /> Copied</> : <><Copy size={12} /> Copy</>}
        </button>

        <div className="flex items-center gap-2">
          {sent ? (
            <Badge tone={duplicate ? "warn" : "default"}>
              {duplicate ? "Already sent today" : "Done"}
            </Badge>
          ) : (
            <button
              onClick={onMarkSent}
              disabled={pending}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md text-fg-muted hover:text-fg hover:bg-bg-muted transition-colors disabled:opacity-50"
            >
              {pending ? "Saving…" : "Mark sent"}
            </button>
          )}
          {openLink && !sent && (
            <a
              href={openLink}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md bg-accent text-accent-fg hover:opacity-90 transition-opacity"
            >
              <OpenIcon size={12} /> Open {channel === "WHATSAPP" ? "WhatsApp" : channel === "EMAIL" ? "Email" : "SMS"}
              <ExternalLink size={10} />
            </a>
          )}
        </div>
      </div>
    </Card>
  );
}

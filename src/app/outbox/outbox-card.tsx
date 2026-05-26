"use client";
import { Badge, Card } from "@/components/ui";
import type { OutboxDraft } from "@/lib/outbox-gen";
import { Copy, ExternalLink, Check, MessageCircle, Mail, Phone, AlertCircle, User } from "lucide-react";
import { useState, useTransition } from "react";
import { recordSent } from "./actions";

function cleanPhone(p: string | null): string | null {
  if (!p) return null;
  return p.replace(/[^\d+]/g, "");
}

export function OutboxCard({ draft, channel }: { draft: OutboxDraft; channel: "WHATSAPP" | "EMAIL" | "SMS" }) {
  const [copied, setCopied] = useState(false);
  const [sent, setSent] = useState(false);
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
      else if (res.reason === "duplicate") setDuplicate(true);
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
  const openIcon = channel === "WHATSAPP" ? MessageCircle : channel === "EMAIL" ? Mail : Phone;
  const OpenIcon = openIcon;

  return (
    <Card className="overflow-hidden">
      <div className="p-4 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-full bg-accent-soft text-accent flex items-center justify-center shrink-0">
            <User size={15} />
          </div>
          <div className="min-w-0">
            <div className="font-medium truncate">{draft.recipientName}</div>
            <div className="text-xs text-fg-muted">
              {draft.tasks.length} task{draft.tasks.length > 1 ? "s" : ""}
              {channel === "WHATSAPP" && draft.whatsapp && ` · ${draft.whatsapp}`}
              {channel === "EMAIL" && draft.email && ` · ${draft.email}`}
              {channel === "SMS" && draft.phone && ` · ${draft.phone}`}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {draft.contactStatus === "Complete" ? (
            <Badge tone="success">Ready</Badge>
          ) : (
            <Badge tone="warn"><AlertCircle size={11} /> {draft.contactStatus}</Badge>
          )}
        </div>
      </div>

      <div className="p-4 bg-bg-subtle/50 max-h-64 overflow-y-auto">
        <pre className="text-xs whitespace-pre-wrap font-sans text-fg-muted leading-relaxed">{draft.message}</pre>
      </div>

      <div className="p-3 flex items-center justify-between gap-2 bg-bg-elev border-t border-border">
        <button
          onClick={onCopy}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md bg-bg-muted hover:bg-border-strong text-fg-muted hover:text-fg transition-colors"
        >
          {copied ? <><Check size={12} /> Copied</> : <><Copy size={12} /> Copy</>}
        </button>

        <div className="flex items-center gap-2">
          {sent ? (
            <Badge tone="success"><Check size={11} /> Marked sent</Badge>
          ) : duplicate ? (
            <Badge tone="warn"><AlertCircle size={11} /> Already sent today</Badge>
          ) : (
            <button
              onClick={onMarkSent}
              disabled={pending}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md text-fg-muted hover:text-fg hover:bg-bg-muted transition-colors disabled:opacity-50"
            >
              {pending ? "Saving…" : "Mark sent"}
            </button>
          )}
          {openLink && (
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

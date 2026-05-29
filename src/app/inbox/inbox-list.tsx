"use client";

import { useState, useTransition } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Mail, MessageCircle, Share2, Inbox as InboxIcon, Sparkles, Trash2, Loader2, Paperclip } from "lucide-react";
import { dismissInboxItem, type InboxItem } from "./actions";

function sourceMeta(source: string) {
  if (source === "email") return { icon: Mail, label: "Email" };
  if (source === "whatsapp") return { icon: MessageCircle, label: "WhatsApp" };
  if (source === "share") return { icon: Share2, label: "Shared" };
  return { icon: InboxIcon, label: "Manual" };
}

function relTime(iso: string): string {
  // created_at is stored as a timezone-less UTC wall-clock; append Z so it's
  // parsed as UTC rather than the viewer's local zone (which is UTC+3 here).
  const norm = /[Zz]$|[+-]\d\d:?\d\d$/.test(iso) ? iso : `${iso}Z`;
  const s = (Date.now() - new Date(norm).getTime()) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export function InboxList({ items }: { items: InboxItem[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<number | null>(null);

  if (items.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-bg-subtle py-12 text-center">
        <InboxIcon size={26} className="mx-auto text-fg-subtle mb-2" />
        <p className="text-sm text-fg-muted">Your inbox is empty.</p>
        <p className="text-xs text-fg-subtle mt-1">Forward an email or share a message to COS and it appears here.</p>
      </div>
    );
  }

  function fileIt(item: InboxItem) {
    const params = new URLSearchParams();
    params.set("capture", "open");
    params.set("text", item.body);
    params.set("inbox", String(item.id));
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  }

  function dismiss(id: number) {
    setBusyId(id);
    startTransition(async () => {
      await dismissInboxItem(id);
      router.refresh();
      setBusyId(null);
    });
  }

  return (
    <div className="space-y-2.5">
      {items.map((item) => {
        const { icon: Icon, label } = sourceMeta(item.source);
        return (
          <div key={item.id} className="rounded-xl border border-border bg-bg-elev p-3.5 space-y-2">
            <div className="flex items-center gap-2 text-xs text-fg-muted">
              <span className="inline-flex items-center gap-1 rounded-full bg-bg-muted px-2 py-0.5">
                <Icon size={11} /> {label}
              </span>
              {item.sender && <span className="truncate">{item.sender}</span>}
              <span className="ml-auto shrink-0">{relTime(item.createdAt)}</span>
            </div>

            {item.subject && <p className="text-sm font-medium leading-snug">{item.subject}</p>}
            <p className="text-sm text-fg-muted line-clamp-3 whitespace-pre-wrap">{item.body}</p>

            {item.attachments.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {item.attachments.map((a, i) => (
                  <span key={i} className="inline-flex items-center gap-1 text-[11px] text-fg-muted bg-bg-muted rounded-full px-2 py-0.5">
                    <Paperclip size={10} /> {a.name || a.type || "attachment"}
                  </span>
                ))}
              </div>
            )}

            <div className="flex items-center gap-2 pt-0.5">
              <button
                type="button"
                onClick={() => fileIt(item)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent text-accent-fg text-xs font-medium hover:opacity-90 transition-opacity"
              >
                <Sparkles size={13} /> File it
              </button>
              <button
                type="button"
                onClick={() => dismiss(item.id)}
                disabled={pending && busyId === item.id}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs text-fg-muted hover:text-danger transition-colors disabled:opacity-50"
              >
                {pending && busyId === item.id ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />} Dismiss
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

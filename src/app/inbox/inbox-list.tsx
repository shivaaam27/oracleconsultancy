"use client";

import { useState, useTransition } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Mail, MessageCircle, Share2, Inbox as InboxIcon, Sparkles, Trash2, Loader2, Paperclip, Pencil, Check, X, ChevronDown, ChevronUp, Copy, FileText } from "lucide-react";
import { dismissInboxItem, updateInboxBody, type InboxItem } from "./actions";
import { SwipeRow } from "@/components/swipe-row";

function CopyChip({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => navigator.clipboard.writeText(text).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      })}
      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-border text-xs text-fg-muted hover:text-fg transition-colors"
    >
      {copied ? <Check size={13} /> : <Copy size={13} />} {copied ? "Copied" : "Copy"}
    </button>
  );
}

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
  return new Date(norm).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

// Show the toggle only when the text is long enough to be clamped.
const LONG = 180;

export function InboxList({ items }: { items: InboxItem[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<number | null>(null);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draft, setDraft] = useState("");

  if (items.length === 0) {
    return (
      <div className="glass elevated rounded-2xl py-12 text-center">
        <InboxIcon size={26} className="mx-auto text-fg-subtle mb-2" />
        <p className="text-sm text-fg-muted">Your inbox is empty.</p>
        <p className="text-xs text-fg-subtle mt-1">Forward an email or share a message to AUMIO and it appears here.</p>
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

  function fileAsDoc(item: InboxItem) {
    const params = new URLSearchParams();
    params.set("newdoc", "1");
    params.set("text", item.subject ? `${item.subject}\n${item.body}` : item.body);
    router.push(`/documents?${params.toString()}`);
  }

  function dismiss(id: number) {
    setBusyId(id);
    startTransition(async () => {
      await dismissInboxItem(id);
      router.refresh();
      setBusyId(null);
    });
  }

  function startEdit(item: InboxItem) {
    setEditingId(item.id);
    setDraft(item.body);
  }

  function saveEdit(id: number) {
    setBusyId(id);
    startTransition(async () => {
      await updateInboxBody(id, draft);
      router.refresh();
      setEditingId(null);
      setBusyId(null);
    });
  }

  function toggleExpand(id: number) {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  return (
    <div className="space-y-2.5">
      {items.map((item) => {
        const { icon: Icon, label } = sourceMeta(item.source);
        const isEditing = editingId === item.id;
        const isOpen = expanded.has(item.id);
        const isBusy = pending && busyId === item.id;
        const isLong = item.body.length > LONG;

        const card = (
          <div className="glass elevated p-3.5 space-y-2 rounded-2xl h-full">
            <div className="flex items-center gap-2 text-xs text-fg-muted">
              <span className="inline-flex items-center gap-1 rounded-full bg-accent-soft/60 ring-1 ring-accent/20 text-accent px-2 py-0.5 font-medium">
                <Icon size={11} /> {label}
              </span>
              {item.sender && <span className="truncate">{item.sender}</span>}
              <span className="ml-auto shrink-0">{relTime(item.createdAt)}</span>
            </div>

            {item.subject && <p className="text-sm font-medium leading-snug">{item.subject}</p>}

            {isEditing ? (
              <div className="space-y-2">
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  rows={Math.min(14, Math.max(4, draft.split("\n").length + 1))}
                  className="w-full resize-y rounded-lg border border-border bg-bg px-3 py-2 text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-accent/40"
                />
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => saveEdit(item.id)}
                    disabled={isBusy || !draft.trim()}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent text-accent-fg text-xs font-medium disabled:opacity-50 hover:opacity-90 transition-opacity"
                  >
                    {isBusy ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} Save
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingId(null)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs text-fg-muted hover:text-fg transition-colors"
                  >
                    <X size={13} /> Cancel
                  </button>
                </div>
              </div>
            ) : (
              <>
                <p className={`text-sm text-fg-muted whitespace-pre-wrap ${isOpen ? "" : "line-clamp-3"}`}>
                  {item.body}
                </p>
                {isLong && (
                  <button
                    type="button"
                    onClick={() => toggleExpand(item.id)}
                    className="inline-flex items-center gap-1 text-xs text-fg-muted hover:text-accent transition-colors"
                  >
                    {isOpen ? <><ChevronUp size={12} /> Show less</> : <><ChevronDown size={12} /> Read full message</>}
                  </button>
                )}
              </>
            )}

            {item.attachments.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {item.attachments.map((a, i) => (
                  <span key={i} className="inline-flex items-center gap-1 text-[11px] text-fg-muted bg-bg-muted rounded-full px-2 py-0.5">
                    <Paperclip size={10} /> {a.name || a.type || "attachment"}
                  </span>
                ))}
              </div>
            )}

            {!isEditing && (
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
                  onClick={() => fileAsDoc(item)}
                  title="File as a compliance document"
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-border text-xs text-fg-muted hover:text-fg transition-colors"
                >
                  <FileText size={13} /> As document
                </button>
                <button
                  type="button"
                  onClick={() => startEdit(item)}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-border text-xs text-fg-muted hover:text-fg transition-colors"
                >
                  <Pencil size={13} /> Edit
                </button>
                <CopyChip text={item.body} />
                <button
                  type="button"
                  onClick={() => dismiss(item.id)}
                  disabled={isBusy}
                  className="ml-auto inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-fg-muted hover:text-danger transition-colors disabled:opacity-50"
                >
                  {isBusy ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />} Dismiss
                </button>
              </div>
            )}
          </div>
        );

        // While editing, the textarea must own touch — no swipe. Otherwise the
        // card swipes: right = File it, left = Dismiss.
        if (isEditing) return <div key={item.id}>{card}</div>;
        return (
          <SwipeRow
            key={item.id}
            className="rounded-xl"
            rightLabel="File it"
            leftLabel="Dismiss"
            onSwipeRight={() => fileIt(item)}
            onSwipeLeft={() => dismiss(item.id)}
          >
            {card}
          </SwipeRow>
        );
      })}
    </div>
  );
}

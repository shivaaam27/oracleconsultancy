"use client";
import { Badge, Card } from "@/components/ui";
import type { OutboxDraft, Channel } from "@/lib/outbox-gen";
import {
  Copy, Check, AlertCircle, User, BellOff, Clock, Send, Pencil, X, StickyNote,
  ChevronUp, MessageCircle, Mail, Phone,
} from "lucide-react";
import { useState, useTransition } from "react";
import { recordSent, snoozePerson, unsnoozePerson } from "./actions";
import { useToast } from "@/components/toast";
import { callUndo } from "@/components/undo-banner";
import { cn } from "@/lib/cn";

type Urgency = "critical" | "warn" | "normal";

function topTaskOf(tasks: OutboxDraft["tasks"]) {
  if (tasks.length === 0) return null;
  const flagOrder = ["escalate-now", "overdue", "stalled", "escalated", "due-soon", "aging", "no-deadline", "on-track", "closed"];
  const prioOrder = ["Critical", "High", "Medium", "Low"];
  return [...tasks].sort((a, b) => {
    const fa = flagOrder.indexOf(a.flag);
    const fb = flagOrder.indexOf(b.flag);
    const fai = fa === -1 ? flagOrder.length : fa;
    const fbi = fb === -1 ? flagOrder.length : fb;
    if (fai !== fbi) return fai - fbi;
    return prioOrder.indexOf(a.priority) - prioOrder.indexOf(b.priority);
  })[0];
}

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

const dotClass: Record<Urgency, string> = {
  critical: "bg-red-500",
  warn: "bg-amber-500",
  normal: "bg-fg-subtle/30",
};

const channelIcon: Record<Channel, typeof MessageCircle> = {
  WHATSAPP: MessageCircle,
  EMAIL: Mail,
  SMS: Phone,
};

function channelLabel(c: Channel): string {
  return c === "WHATSAPP" ? "WhatsApp" : c === "EMAIL" ? "Email" : "SMS";
}

function defaultChannel(draft: OutboxDraft): Channel {
  const pref = (draft.preferredChannel?.toUpperCase() as Channel) || null;
  if (pref && draft.contactByChannel[pref] === "Complete") return pref;
  if (draft.contactByChannel.WHATSAPP === "Complete") return "WHATSAPP";
  if (draft.contactByChannel.EMAIL === "Complete") return "EMAIL";
  if (draft.contactByChannel.SMS === "Complete") return "SMS";
  return pref || "WHATSAPP";
}

/** Render a WhatsApp-style message: `*bold*` → bold, whole-line bold → heading. */
function renderRichMessage(text: string) {
  return text.split("\n").map((line, i) => {
    if (line.trim() === "") return <div key={i} className="h-2" />;
    const isHeading = /^\*[^*]+\*$/.test(line.trim());
    const parts = line.split(/(\*[^*]+\*)/g).filter(Boolean);
    return (
      <div key={i} className={isHeading ? "font-semibold text-fg mt-2.5 first:mt-0" : ""}>
        {parts.map((seg, j) =>
          seg.startsWith("*") && seg.endsWith("*")
            ? <strong key={j} className="font-medium text-fg">{seg.slice(1, -1)}</strong>
            : <span key={j}>{seg}</span>
        )}
      </div>
    );
  });
}

export function OutboxCard({
  draft,
  alreadySent = false,
  sentChannels,
  compact = false,
  scopeName = null,
}: {
  draft: OutboxDraft;
  alreadySent?: boolean;
  sentChannels?: Set<Channel>;
  compact?: boolean;
  scopeName?: string | null;
}) {
  const hasScoped = scopeName ? draft.tasks.some((t) => t.companyName === scopeName) : false;
  // One "Message" — no channel switcher. Channel is auto-picked (preferred, then
  // whatever contact exists) purely for the sent-record + contact lookup.
  const channel = defaultChannel(draft);
  const [copied, setCopied] = useState(false);
  const [sent, setSent] = useState(alreadySent);
  const [duplicate, setDuplicate] = useState(false);
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [message, setMessage] = useState(draft.messages.WHATSAPP);
  const [expanded, setExpanded] = useState(false);
  const { toast } = useToast();

  const contactValue =
    channel === "EMAIL"
      ? draft.email
      : channel === "WHATSAPP"
        ? draft.whatsapp
        : draft.phone;

  const channelReady = draft.contactByChannel[channel] === "Complete";
  const anyContact = !!(draft.whatsapp || draft.email || draft.phone);

  const doMarkSent = async (): Promise<{ ok: boolean; undoToken?: string }> => {
    const fd = new FormData();
    fd.set("channel", channel);
    fd.set("name", draft.recipientName);
    fd.set("taskCodes", JSON.stringify(draft.tasks.map((t) => t.code)));
    fd.set("message", message);
    fd.set("contactStatus", draft.contactByChannel[channel]);
    fd.set("recipientContact", contactValue || "");
    const res = await recordSent(fd);
    if (res.ok) {
      setSent(true);
      return { ok: true, undoToken: res.undoToken };
    }
    if (res.reason === "duplicate") {
      setSent(true);
      setDuplicate(true);
      return { ok: false };
    }
    toast("Couldn't mark sent.", { tone: "danger" });
    return { ok: false };
  };

  const showUndoToast = (label: string, undoToken: string | undefined) => {
    if (!undoToken) return;
    toast(label, {
      tone: "success",
      duration: 10000,
      action: {
        label: "Undo",
        onClick: async () => {
          const r = await callUndo(undoToken);
          toast(r.message, { tone: r.ok ? "success" : "warn", duration: 3000 });
          if (r.ok && typeof window !== "undefined") window.location.reload();
        },
      },
    });
  };

  const onCopy = async () => {
    await navigator.clipboard.writeText(message);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const onCopyAndMark = () => {
    startTransition(async () => {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      const { ok, undoToken } = await doMarkSent();
      if (ok) showUndoToast(`Copied & marked sent (${channelLabel(channel)}) for ${draft.recipientName}.`, undoToken);
    });
  };

  const onMarkSentOnly = () => {
    startTransition(async () => {
      const { ok, undoToken } = await doMarkSent();
      if (ok) showUndoToast(`Marked sent via ${channelLabel(channel)} for ${draft.recipientName}.`, undoToken);
    });
  };

  const onSkip = () => {
    if (!draft.personId) {
      toast("Can't skip — person isn't in directory.", { tone: "warn" });
      return;
    }
    startTransition(async () => {
      const res = await snoozePerson(draft.personId!);
      if (!res.ok) {
        toast(res.error || "Skip failed.", { tone: "danger" });
        return;
      }
      showUndoToast(`Skipped ${draft.recipientName} for today.`, res.undoToken);
      if (typeof window !== "undefined") window.location.reload();
    });
  };

  const u = urgencyOf(draft.tasks);
  const CurrentChannelIcon = channelIcon[channel];

  // Compact row mode
  if (compact && !expanded) {
    const topTask = topTaskOf(draft.tasks);
    return (
      <div
        className={cn(
          "card border-l-[3px] pl-2.5 pr-2 py-2 flex items-center gap-2.5 hover:border-accent transition-colors",
          stripeClass[u.level],
          hasScoped && "ring-1 ring-accent/30",
          sent && "opacity-60"
        )}
      >
        <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", dotClass[u.level])} />

        {/* Name + count over a one-line top-task preview — tap to expand */}
        <button type="button" onClick={() => setExpanded(true)} className="min-w-0 flex-1 text-left">
          <div className="flex items-center gap-1.5">
            <span className="font-medium text-sm truncate">{draft.recipientName}</span>
            <span className="text-[11px] text-fg-subtle whitespace-nowrap shrink-0">
              · {draft.tasks.length}
              {u.overdue > 0 && <span className="text-red-600 dark:text-red-400"> · {u.overdue} od</span>}
              {u.overdue === 0 && u.critical > 0 && <span className="text-red-600 dark:text-red-400"> · {u.critical} crit</span>}
              {u.overdue === 0 && u.critical === 0 && u.dueSoon > 0 && <span className="text-amber-600 dark:text-amber-400"> · {u.dueSoon} soon</span>}
            </span>
          </div>
          {topTask && (
            <div className="text-[11px] text-fg-muted truncate mt-0.5" title={topTask.actionItem}>
              <span className="font-mono text-fg-subtle">{topTask.code}</span> · {topTask.actionItem}
            </div>
          )}
        </button>

        {sent ? (
          <Badge tone={duplicate ? "warn" : "success"}><Check size={11} /> {duplicate ? "Done" : "Sent"}</Badge>
        ) : (
          <div className="flex items-center gap-1.5 shrink-0">
            {!anyContact && <AlertCircle size={12} className="text-amber-500" aria-label="No contact details" />}
            <button
              type="button"
              onClick={onCopyAndMark}
              disabled={pending || !anyContact}
              className="inline-flex items-center gap-1.5 h-8 px-2 sm:px-2.5 text-xs rounded-md bg-accent text-accent-fg hover:opacity-90 transition-opacity disabled:opacity-50"
              title={anyContact ? "Copy message and mark sent" : "No contact details for this person"}
            >
              <Send size={13} /> <span className="hidden sm:inline">{pending ? "…" : "Copy & Sent"}</span>
            </button>
          </div>
        )}
      </div>
    );
  }

  // Expanded card
  return (
    <Card
      className={cn(
        "overflow-hidden border-l-4 transition-opacity",
        stripeClass[u.level],
        sent && "opacity-60"
      )}
    >
      {/* Header — name + meta only (channel moved to its own row) */}
      <div className="p-3 flex items-center justify-between gap-2 border-b border-border">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-full bg-accent-soft text-accent flex items-center justify-center shrink-0">
            <User size={14} />
          </div>
          <div className="min-w-0">
            <div className="font-medium text-sm truncate">{draft.recipientName}</div>
            <div className="text-[11px] text-fg-muted flex flex-wrap gap-x-1.5">
              <span>{draft.tasks.length} task{draft.tasks.length === 1 ? "" : "s"}</span>
              {u.overdue > 0 && <span className="text-red-600 dark:text-red-400">· {u.overdue} overdue</span>}
              {u.critical > 0 && <span className="text-red-600 dark:text-red-400">· {u.critical} critical</span>}
              {u.dueSoon > 0 && u.overdue === 0 && u.critical === 0 && (
                <span className="text-amber-600 dark:text-amber-400">· {u.dueSoon} due soon</span>
              )}
            </div>
          </div>
        </div>
        {compact && (
          <button type="button" onClick={() => setExpanded(false)} className="shrink-0 text-fg-subtle hover:text-fg p-1 rounded-md hover:bg-bg-muted" title="Collapse">
            <ChevronUp size={14} />
          </button>
        )}
      </div>

      {!sent && draft.notes && (
        <div className="px-3 py-2 text-xs italic text-fg-muted bg-amber-500/5 border-b border-amber-500/20 flex items-start gap-1.5">
          <StickyNote size={11} className="shrink-0 mt-0.5 text-amber-500" />
          <span>{draft.notes}</span>
        </div>
      )}

      {/* The Message — company breakdown + shared-assignees live inside the text. */}
      {!sent && (
        <div className="px-3 pt-2 pb-3 bg-bg-subtle/40 max-h-64 overflow-y-auto">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] uppercase tracking-wider text-fg-subtle">Message</span>
            {!anyContact && <span className="text-[10px] text-amber-600 dark:text-amber-400 inline-flex items-center gap-1"><AlertCircle size={10} /> no contact</span>}
          </div>
          {editing ? (
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="w-full min-h-[160px] text-xs font-sans text-fg leading-relaxed bg-bg-elev border border-border rounded-md p-2 focus:outline-none focus:border-accent"
            />
          ) : (
            <div className="text-xs leading-relaxed text-fg-muted">{renderRichMessage(message)}</div>
          )}
        </div>
      )}

      <div className="p-2.5 flex items-center justify-between gap-2 bg-bg-elev border-t border-border">
        {sent ? (
          <span className="text-xs text-fg-subtle inline-flex items-center gap-1.5">
            <CurrentChannelIcon size={12} /> {duplicate ? "Was already done today." : `Sent via ${channelLabel(channel)}.`}
          </span>
        ) : (
          <button
            type="button"
            onClick={onSkip}
            disabled={pending || !draft.personId}
            className="inline-flex items-center gap-1.5 px-2 py-1.5 text-[11px] rounded-md text-fg-subtle hover:text-fg hover:bg-bg-muted transition-colors disabled:opacity-40"
            title="Hide this person until tomorrow"
          >
            <BellOff size={12} /> <span className="hidden sm:inline">Skip today</span>
          </button>
        )}

        {!sent && (
          <div className="flex items-center gap-1 shrink-0">
            <button type="button" onClick={() => setEditing((e) => !e)} title={editing ? "Done editing" : "Edit message"}
              className={cn("inline-flex items-center justify-center h-8 w-8 rounded-md transition-colors", editing ? "bg-accent/15 text-accent" : "text-fg-subtle hover:text-fg hover:bg-bg-muted")}>
              {editing ? <X size={14} /> : <Pencil size={13} />}
            </button>
            <button type="button" onClick={onCopy} title="Copy message"
              className="inline-flex items-center justify-center h-8 w-8 rounded-md bg-bg-muted hover:bg-border-strong text-fg-muted hover:text-fg transition-colors">
              {copied ? <Check size={14} className="text-success" /> : <Copy size={13} />}
            </button>
            <button type="button" onClick={onMarkSentOnly} disabled={pending} title="Mark sent (without copying)"
              className="inline-flex items-center justify-center h-8 w-8 rounded-md text-fg-subtle hover:text-fg hover:bg-bg-muted transition-colors disabled:opacity-50">
              <Check size={14} />
            </button>
            <button type="button" onClick={onCopyAndMark} disabled={pending || !anyContact}
              title={anyContact ? "Copy message and mark sent" : "No contact details for this person"}
              className="inline-flex items-center gap-1.5 h-8 px-2.5 text-xs rounded-md bg-accent text-accent-fg hover:opacity-90 transition-opacity disabled:opacity-50">
              <Send size={13} /> {pending ? "…" : <span>Copy &amp; Sent</span>}
            </button>
          </div>
        )}
      </div>
    </Card>
  );
}

// Small client-side button used in the page's snoozed list.
export function UnsnoozeButton({ personId, name }: { personId: number; name: string }) {
  const [pending, startTransition] = useTransition();
  const { toast } = useToast();
  const onClick = () => {
    startTransition(async () => {
      const res = await unsnoozePerson(personId);
      if (!res.ok) {
        toast(res.error || "Couldn't bring back.", { tone: "danger" });
        return;
      }
      toast(`${name} is back in today's list.`, { tone: "success" });
      if (typeof window !== "undefined") window.location.reload();
    });
  };
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      className="text-xs text-accent hover:underline disabled:opacity-50 inline-flex items-center gap-1"
    >
      <Clock size={11} /> Bring back
    </button>
  );
}

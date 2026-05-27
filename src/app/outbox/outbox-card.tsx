"use client";
import { Badge, Card } from "@/components/ui";
import type { OutboxDraft, Channel } from "@/lib/outbox-gen";
import {
  Copy, Check, AlertCircle, User, BellOff, Clock, Send, Pencil, X, StickyNote,
  ChevronDown, ChevronUp, MessageCircle, Mail, Phone,
} from "lucide-react";
import { useState, useTransition } from "react";
import { recordSent, snoozePerson, unsnoozePerson } from "./actions";
import { useToast } from "@/components/toast";
import { callUndo } from "@/components/undo-banner";
import { cn } from "@/lib/cn";

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

export function OutboxCard({
  draft,
  alreadySent = false,
  sentChannels,
  compact = false,
}: {
  draft: OutboxDraft;
  alreadySent?: boolean;
  sentChannels?: Set<Channel>;
  compact?: boolean;
}) {
  const initialChannel = defaultChannel(draft);
  const [channel, setChannel] = useState<Channel>(initialChannel);
  const [copied, setCopied] = useState(false);
  const [sent, setSent] = useState(alreadySent);
  const [duplicate, setDuplicate] = useState(false);
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [message, setMessage] = useState(draft.messages[initialChannel]);
  const [expanded, setExpanded] = useState(false);
  const [localSent, setLocalSent] = useState<Set<Channel>>(new Set(sentChannels));
  const { toast } = useToast();

  // When user switches channel, replace the working message unless they were editing.
  const switchChannel = (c: Channel) => {
    setChannel(c);
    if (!editing) setMessage(draft.messages[c]);
  };

  const contactValue =
    channel === "EMAIL"
      ? draft.email
      : channel === "WHATSAPP"
        ? draft.whatsapp
        : draft.phone;

  const channelReady = draft.contactByChannel[channel] === "Complete";

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
      setLocalSent((prev) => new Set(prev).add(channel));
      return { ok: true, undoToken: res.undoToken };
    }
    if (res.reason === "duplicate") {
      setSent(true);
      setDuplicate(true);
      setLocalSent((prev) => new Set(prev).add(channel));
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

  // Channel picker chip group
  const ChannelPicker = ({ size = "sm" }: { size?: "sm" | "xs" }) => {
    const all: Channel[] = ["WHATSAPP", "EMAIL", "SMS"];
    return (
      <div className="inline-flex bg-bg-subtle border border-border rounded-md p-0.5 gap-0.5">
        {all.map((c) => {
          const Icon = channelIcon[c];
          const active = channel === c;
          const ready = draft.contactByChannel[c] === "Complete";
          const sentOnThis = localSent.has(c);
          return (
            <button
              key={c}
              type="button"
              onClick={() => switchChannel(c)}
              className={cn(
                "inline-flex items-center gap-1 rounded transition-colors",
                size === "xs" ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-1 text-xs",
                active
                  ? "bg-bg-elev text-fg shadow-sm"
                  : ready
                    ? "text-fg-muted hover:text-fg"
                    : "text-fg-subtle"
              )}
              title={ready ? channelLabel(c) : `No ${channelLabel(c)} contact`}
            >
              <Icon size={size === "xs" ? 9 : 11} />
              {size !== "xs" && <span>{channelLabel(c).slice(0, channelLabel(c) === "WhatsApp" ? 2 : 5)}</span>}
              {sentOnThis && <Check size={size === "xs" ? 8 : 10} className="text-success" />}
            </button>
          );
        })}
      </div>
    );
  };

  // Compact row mode
  if (compact && !expanded) {
    return (
      <div
        className={cn(
          "card border-l-4 px-3 py-2 flex items-center gap-3 hover:border-accent transition-colors",
          stripeClass[u.level],
          sent && "opacity-60"
        )}
      >
        <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", dotClass[u.level])} />
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="flex-1 min-w-0 text-left flex items-center gap-2 hover:text-accent transition-colors"
        >
          <span className="font-medium truncate">{draft.recipientName}</span>
          <span className="text-xs text-fg-muted truncate">
            · {draft.tasks.length}
            {u.overdue > 0 && <span className="text-red-600 dark:text-red-400"> · {u.overdue} overdue</span>}
            {u.overdue === 0 && u.critical > 0 && <span className="text-red-600 dark:text-red-400"> · {u.critical} critical</span>}
            {u.overdue === 0 && u.critical === 0 && u.dueSoon > 0 && (
              <span className="text-amber-600 dark:text-amber-400"> · {u.dueSoon} due soon</span>
            )}
          </span>
          {!channelReady && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-700 dark:text-amber-300 shrink-0 inline-flex items-center gap-1">
              <AlertCircle size={9} /> No {channelLabel(channel)}
            </span>
          )}
        </button>

        {sent ? (
          <Badge tone={duplicate ? "warn" : "success"}>
            <Check size={11} /> {duplicate ? "Done" : "Sent"}
          </Badge>
        ) : (
          <div className="flex items-center gap-1 shrink-0">
            <ChannelPicker size="xs" />
            <button
              type="button"
              onClick={onCopyAndMark}
              disabled={pending || !channelReady}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-md bg-accent text-accent-fg hover:opacity-90 transition-opacity disabled:opacity-50"
              title={channelReady ? "Copy message and mark sent" : `No ${channelLabel(channel)} contact for this person`}
            >
              <Send size={11} /> {pending ? "…" : "Copy & Sent"}
            </button>
            <button
              type="button"
              onClick={() => setExpanded(true)}
              className="text-fg-subtle hover:text-fg p-1 rounded-md hover:bg-bg-muted"
              title="Expand"
            >
              <ChevronDown size={13} />
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
      <div className="p-4 border-b border-border flex items-center justify-between gap-2">
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
              {contactValue && <span className="text-fg-subtle">· {contactValue}</span>}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <ChannelPicker />
          {sent ? (
            <Badge tone={duplicate ? "warn" : "success"}>
              <Check size={11} /> {duplicate ? "Already sent" : "Sent"}
            </Badge>
          ) : channelReady ? (
            <Badge tone="success">Ready</Badge>
          ) : (
            <Badge tone="warn"><AlertCircle size={11} /> No {channelLabel(channel)}</Badge>
          )}
          {compact && (
            <button
              type="button"
              onClick={() => setExpanded(false)}
              className="text-fg-subtle hover:text-fg p-1 rounded-md hover:bg-bg-muted"
              title="Collapse"
            >
              <ChevronUp size={13} />
            </button>
          )}
        </div>
      </div>

      {!sent && draft.notes && (
        <div className="px-4 py-2 text-xs italic text-fg-muted bg-amber-500/5 border-b border-amber-500/20 flex items-start gap-1.5">
          <StickyNote size={11} className="shrink-0 mt-0.5 text-amber-500" />
          <span>{draft.notes}</span>
        </div>
      )}

      {!sent && (
        <div className="p-4 bg-bg-subtle/50 max-h-64 overflow-y-auto">
          {editing ? (
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="w-full min-h-[180px] text-xs font-sans text-fg leading-relaxed bg-bg-elev border border-border rounded-md p-2 focus:outline-none focus:border-accent"
            />
          ) : (
            <pre className="text-xs whitespace-pre-wrap font-sans text-fg-muted leading-relaxed">{message}</pre>
          )}
        </div>
      )}

      <div className="p-3 flex items-center justify-between gap-2 bg-bg-elev border-t border-border">
        {sent ? (
          <span className="text-xs text-fg-subtle inline-flex items-center gap-1.5">
            <CurrentChannelIcon size={12} /> {duplicate ? "Was already done today." : `Sent via ${channelLabel(channel)}.`}
          </span>
        ) : (
          <button
            type="button"
            onClick={onSkip}
            disabled={pending || !draft.personId}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-md text-fg-subtle hover:text-fg hover:bg-bg-muted transition-colors disabled:opacity-40"
            title="Hide this person until tomorrow"
          >
            <BellOff size={12} /> Skip today
          </button>
        )}

        {!sent && (
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setEditing((e) => !e)}
              className={cn(
                "inline-flex items-center gap-1.5 px-2 py-1.5 text-xs rounded-md transition-colors",
                editing
                  ? "bg-accent/15 text-accent"
                  : "text-fg-subtle hover:text-fg hover:bg-bg-muted"
              )}
              title={editing ? "Finish editing" : "Edit message before copying"}
            >
              {editing ? <X size={12} /> : <Pencil size={12} />}
            </button>
            <button
              type="button"
              onClick={onCopy}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-md bg-bg-muted hover:bg-border-strong text-fg-muted hover:text-fg transition-colors"
            >
              {copied ? <><Check size={12} /> Copied</> : <><Copy size={12} /> Copy</>}
            </button>
            <button
              type="button"
              onClick={onMarkSentOnly}
              disabled={pending}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-md text-fg-muted hover:text-fg hover:bg-bg-muted transition-colors disabled:opacity-50"
            >
              <Check size={12} /> Mark sent
            </button>
            <button
              type="button"
              onClick={onCopyAndMark}
              disabled={pending || !channelReady}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md bg-accent text-accent-fg hover:opacity-90 transition-opacity disabled:opacity-50"
              title={channelReady ? `Copy & mark sent on ${channelLabel(channel)}` : `No ${channelLabel(channel)} contact`}
            >
              <Send size={12} /> {pending ? "Working…" : "Copy & Mark Sent"}
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

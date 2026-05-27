"use client";
import { Badge, Card } from "@/components/ui";
import type { OutboxDraft } from "@/lib/outbox-gen";
import { Copy, Check, AlertCircle, User, BellOff, Clock, Send, Pencil, X, StickyNote } from "lucide-react";
import { useState, useTransition } from "react";
import { recordSent, snoozePerson, unsnoozePerson } from "./actions";
import { useToast } from "@/components/toast";
import { callUndo } from "@/components/undo-banner";
import { cn } from "@/lib/cn";

type Channel = "WHATSAPP" | "EMAIL" | "SMS";

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

function channelLabel(c: Channel): string {
  return c === "WHATSAPP" ? "WhatsApp" : c === "EMAIL" ? "Email" : "SMS";
}

export function OutboxCard({
  draft,
  channel,
  alreadySent = false,
}: {
  draft: OutboxDraft;
  channel: Channel;
  alreadySent?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const [sent, setSent] = useState(alreadySent);
  const [duplicate, setDuplicate] = useState(false);
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [message, setMessage] = useState(draft.message);
  const { toast } = useToast();

  const doMarkSent = async (): Promise<{ ok: boolean; undoToken?: string }> => {
    const fd = new FormData();
    fd.set("channel", channel);
    fd.set("name", draft.recipientName);
    fd.set("taskCodes", JSON.stringify(draft.tasks.map((t) => t.code)));
    fd.set("message", message);
    fd.set("contactStatus", draft.contactStatus);
    fd.set(
      "recipientContact",
      channel === "EMAIL" ? draft.email || "" : channel === "WHATSAPP" ? draft.whatsapp || "" : draft.phone || ""
    );
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
      if (ok) showUndoToast(`Copied & marked sent for ${draft.recipientName}.`, undoToken);
    });
  };

  const onMarkSentOnly = () => {
    startTransition(async () => {
      const { ok, undoToken } = await doMarkSent();
      if (ok) showUndoToast(`Marked sent for ${draft.recipientName}.`, undoToken);
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
      // Person disappears on next page revalidation (already triggered server-side).
      if (typeof window !== "undefined") window.location.reload();
    });
  };

  const u = urgencyOf(draft.tasks);
  const prefersOther =
    draft.preferredChannel && draft.preferredChannel.toUpperCase() !== channel;

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
            <div className="font-medium truncate flex items-center gap-2">
              {draft.recipientName}
              {prefersOther && (
                <span
                  className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-300"
                  title={`This person prefers ${draft.preferredChannel}`}
                >
                  Prefers {draft.preferredChannel}
                </span>
              )}
            </div>
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
            <Badge tone={duplicate ? "warn" : "success"}>
              <Check size={11} /> {duplicate ? "Already sent" : "Sent"}
            </Badge>
          ) : draft.contactStatus === "Complete" ? (
            <Badge tone="success">Ready</Badge>
          ) : (
            <Badge tone="warn"><AlertCircle size={11} /> {draft.contactStatus}</Badge>
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
            <Check size={12} /> {duplicate ? "Was already done today." : `Sent via ${channelLabel(channel)}.`}
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
              disabled={pending}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md bg-accent text-accent-fg hover:opacity-90 transition-opacity disabled:opacity-50"
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

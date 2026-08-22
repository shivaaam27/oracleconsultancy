"use client";
import { Badge, Button } from "@/components/ui";
import type { OutboxDraft, Channel } from "@/lib/outbox/gen";
import {
  Copy, Check, AlertCircle, User, BellOff, Clock, Send, Pencil, X, StickyNote,
  ChevronDown, MessageCircle, Mail, Phone,
} from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";
import { recordSent, snoozePerson, unsnoozePerson, sendReminderEmail } from "./actions";
import { useToast } from "@/components/toast";
import { callUndo } from "@/components/undo-banner";
import { waLink } from "@/lib/outbox/links";
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
  critical: "border-l-danger",
  warn: "border-l-warn",
  normal: "border-l-transparent",
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
  scopeName = null,
  detail = false,
  onResolved,
}: {
  draft: OutboxDraft;
  alreadySent?: boolean;
  /** Accepted for caller compatibility; the card no longer needs them. */
  sentChannels?: Set<Channel>;
  compact?: boolean;
  scopeName?: string | null;
  /** Right-pane detail mode: always expanded, no outer card chrome. */
  detail?: boolean;
  /** Called after the item is marked done / skipped so a parent list can advance. */
  onResolved?: () => void;
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
  const [expanded, setExpanded] = useState(detail);
  const [showFull, setShowFull] = useState(false);
  const [clamped, setClamped] = useState(false);
  const [note, setNote] = useState("");
  const [showNote, setShowNote] = useState(false);
  const msgRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  // Detect when the (non-editing) message overflows the collapsed height so we
  // can offer a "Show full message" toggle instead of silently clipping.
  useEffect(() => {
    if (editing || showFull) return;
    const el = msgRef.current;
    if (el) setClamped(el.scrollHeight > el.clientHeight + 4);
  }, [message, editing, showFull, expanded]);

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

  // wa.me tap-send: opens WhatsApp with the message pre-filled (newlines + the
  // per-person preview link preserved), then marks the draft done.
  const waHref = channel === "WHATSAPP" ? waLink(draft.whatsapp, message) : null;
  const onSendWhatsApp = () => {
    if (!waHref) { toast("No WhatsApp number for this person.", { tone: "warn" }); return; }
    window.open(waHref, "_blank", "noopener");
    startTransition(async () => {
      const { ok, undoToken } = await doMarkSent();
      if (ok) { showUndoToast(`Opened WhatsApp & marked done for ${draft.recipientName}.`, undoToken); onResolved?.(); }
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
      if (ok) { showUndoToast(`Copied for ${channelLabel(channel)} & marked done for ${draft.recipientName}.`, undoToken); onResolved?.(); }
    });
  };

  const onMarkSentOnly = () => {
    startTransition(async () => {
      const { ok, undoToken } = await doMarkSent();
      if (ok) { showUndoToast(`Marked done (${channelLabel(channel)}) for ${draft.recipientName}.`, undoToken); onResolved?.(); }
    });
  };

  const onSendEmail = () => {
    if (!draft.personId) { toast("This person isn't in the directory.", { tone: "warn" }); return; }
    startTransition(async () => {
      const res = await sendReminderEmail(draft.personId!, note.trim() || undefined);
      if (res.ok) {
        setSent(true);
        toast(`Email sent to ${draft.recipientName}.`, { tone: "success" });
        onResolved?.();
        return;
      }
      const msg =
        res.reason === "no-email" ? "No email address on file for this person."
        : res.reason === "no-tasks" ? "No open tasks to remind about."
        : res.reason === "not-configured" ? "Email sending isn't switched on — use Copy instead."
        : res.error || "Couldn't send the email.";
      toast(msg, { tone: res.reason === "not-configured" || res.reason === "no-email" ? "warn" : "danger" });
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
      if (onResolved) onResolved();
      else if (typeof window !== "undefined") window.location.reload();
    });
  };

  const u = urgencyOf(draft.tasks);
  const CurrentChannelIcon = channelIcon[channel];

  const topTask = topTaskOf(draft.tasks);
  const metaLine = (
    <span className="flex flex-wrap items-center gap-x-1.5 text-xs text-fg-muted">
      <span>{draft.tasks.length} task{draft.tasks.length === 1 ? "" : "s"}</span>
      {u.overdue > 0 && <span className="text-danger">· {u.overdue} overdue</span>}
      {u.overdue === 0 && u.critical > 0 && <span className="text-danger">· {u.critical} critical</span>}
      {u.overdue === 0 && u.critical === 0 && u.dueSoon > 0 && <span className="text-warn">· {u.dueSoon} due soon</span>}
    </span>
  );

  // One clean card that expands on tap. A single urgency cue (left accent edge).
  // In `detail` mode it's always expanded with no outer chrome (for the right pane).
  const HeaderTag = detail ? "div" : "button";
  return (
    <div
      className={cn(
        detail
          ? "overflow-hidden"
          : "bg-bg-elev ring-1 ring-border rounded-2xl elevated overflow-hidden border-l-2 transition-all hover:ring-border-strong",
        !detail && stripeClass[u.level],
        !detail && hasScoped && "ring-accent/40",
        sent && "opacity-60"
      )}
    >
      {/* Header — tap to expand / collapse (static in detail mode) */}
      <div className={cn("flex items-center gap-3", detail ? "pb-2" : "p-3")}>
        <HeaderTag
          {...(detail ? {} : { type: "button" as const, onClick: () => setExpanded((e) => !e) })}
          className="flex items-center gap-3 min-w-0 flex-1 text-left"
        >
          <span className="w-9 h-9 rounded-full bg-accent-soft text-accent grid place-items-center shrink-0">
            <User size={15} />
          </span>
          <span className="min-w-0">
            <span className="flex items-center gap-1.5">
              <span className="font-medium text-sm truncate">{draft.recipientName}</span>
              {!detail && <ChevronDown size={13} className={cn("text-fg-subtle transition-transform shrink-0", expanded && "rotate-180")} />}
            </span>
            {!expanded && topTask ? (
              <span className="block text-xs text-fg-muted truncate mt-0.5" title={topTask.actionItem}>
                <span className="font-mono text-fg-subtle">{topTask.code}</span> · {topTask.actionItem}
              </span>
            ) : (
              <span className="block mt-0.5">{metaLine}</span>
            )}
          </span>
        </HeaderTag>

        {sent ? (
          <Badge tone={duplicate ? "warn" : "success"}><Check size={11} /> Done</Badge>
        ) : !expanded ? (
          <div className="flex items-center gap-1.5 shrink-0">
            {!anyContact && <AlertCircle size={13} className="text-warn" aria-label="No contact details" />}
            {waHref ? (
              <Button
                type="button"
                size="sm"
                onClick={onSendWhatsApp}
                disabled={pending}
                title="Open WhatsApp with the message ready to send"
              >
                <MessageCircle size={13} /> <span className="hidden sm:inline">{pending ? "…" : "WhatsApp"}</span>
              </Button>
            ) : (
              <Button
                type="button"
                size="sm"
                onClick={onCopyAndMark}
                disabled={pending || !anyContact}
                title={anyContact ? "Copy message and mark done" : "No contact details for this person"}
              >
                <Send size={13} /> <span className="hidden sm:inline">{pending ? "…" : "Copy & done"}</span>
              </Button>
            )}
          </div>
        ) : null}
      </div>

      {/* Expanded body */}
      {expanded && sent && (
        <div className={cn("pb-3 -mt-1 text-xs text-fg-subtle inline-flex items-center gap-1.5", !detail && "px-3")}>
          <CurrentChannelIcon size={12} /> {duplicate ? "Was already done today." : `Marked done · ${channelLabel(channel)}.`}
        </div>
      )}

      {expanded && !sent && (
        <div className={cn("pb-3 space-y-2.5", !detail && "px-3")}>
          {draft.notes && (
            <div className="text-xs italic text-fg-muted bg-warn-soft/30 ring-1 ring-warn/20 rounded-xl px-3 py-2 flex items-start gap-1.5">
              <StickyNote size={11} className="shrink-0 mt-0.5 text-warn" />
              <span>{draft.notes}</span>
            </div>
          )}

          {/* The Message — company breakdown + shared-assignees live inside the text. */}
          <div className="bg-bg-subtle/50 rounded-xl px-3 py-2.5">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs uppercase tracking-[0.08em] text-fg-subtle">Message</span>
              {!anyContact && <span className="text-xs text-warn inline-flex items-center gap-1"><AlertCircle size={10} /> no contact</span>}
            </div>
            {editing ? (
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className="w-full min-h-[160px] text-xs font-sans text-fg leading-relaxed bg-bg-elev border border-border rounded-lg p-2 focus:outline-none focus:border-accent"
              />
            ) : (
              <>
                <div
                  ref={msgRef}
                  className={cn("text-xs leading-relaxed text-fg-muted", !showFull && "max-h-64 overflow-hidden")}
                >
                  {renderRichMessage(message)}
                </div>
                {(clamped || showFull) && (
                  <button
                    type="button"
                    onClick={() => setShowFull((v) => !v)}
                    className="mt-1.5 text-xs font-medium text-accent hover:underline"
                  >
                    {showFull ? "Show less" : "Show full message"}
                  </button>
                )}
              </>
            )}
          </div>

          {/* Optional personal note — shown at the top of the branded email */}
          {draft.email && !editing && (
            showNote ? (
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Add a personal line (optional) — appears at the top of the email"
                className="w-full min-h-[56px] text-xs font-sans text-fg leading-relaxed bg-bg-elev border border-border rounded-lg p-2 focus:outline-none focus:border-accent"
              />
            ) : (
              <button
                type="button"
                onClick={() => setShowNote(true)}
                className="inline-flex items-center gap-1 text-xs text-accent hover:underline"
              >
                <StickyNote size={11} /> Add a personal note
              </button>
            )
          )}

          {/* Actions */}
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={onSkip}
              disabled={pending || !draft.personId}
              className="inline-flex items-center gap-1.5 px-2 py-1.5 text-xs rounded-lg text-fg-subtle hover:text-fg hover:bg-bg-muted transition-colors disabled:opacity-40"
              title="Hide this person until tomorrow"
            >
              <BellOff size={12} /> <span className="hidden sm:inline">Skip today</span>
            </button>

            <div className="flex items-center gap-1 shrink-0">
              <button type="button" onClick={() => setEditing((e) => !e)} title={editing ? "Done editing" : "Edit message"}
                className={cn("inline-flex items-center justify-center h-8 w-8 rounded-lg transition-colors", editing ? "bg-accent/15 text-accent" : "text-fg-subtle hover:text-fg hover:bg-bg-muted")}>
                {editing ? <X size={14} /> : <Pencil size={13} />}
              </button>
              <button type="button" onClick={onCopy} title="Copy message"
                className="inline-flex items-center justify-center h-8 w-8 rounded-lg bg-bg-muted hover:bg-border-strong text-fg-muted hover:text-fg transition-colors">
                {copied ? <Check size={14} className="text-success" /> : <Copy size={13} />}
              </button>
              <button type="button" onClick={onMarkSentOnly} disabled={pending} title="Mark as done (without copying)"
                className="inline-flex items-center justify-center h-8 w-8 rounded-lg text-fg-subtle hover:text-fg hover:bg-bg-muted transition-colors disabled:opacity-50">
                <Check size={14} />
              </button>
              {draft.email && (
                <Button type="button" size="sm" variant="secondary" onClick={onSendEmail} disabled={pending}
                  title="Send the branded task reminder by email">
                  <Mail size={13} /> {pending ? "…" : <span>Send email</span>}
                </Button>
              )}
              {waHref ? (
                <Button type="button" size="sm" variant="primary" onClick={onSendWhatsApp} disabled={pending}
                  title="Open WhatsApp with the message ready to send">
                  <MessageCircle size={13} /> {pending ? "…" : <span>WhatsApp</span>}
                </Button>
              ) : (
                <Button type="button" size="sm" variant={draft.email ? "secondary" : "primary"} onClick={onCopyAndMark} disabled={pending || !anyContact}
                  title={anyContact ? "Copy message and mark done" : "No contact details for this person"}>
                  <Send size={13} /> {pending ? "…" : <span>Copy &amp; done</span>}
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
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

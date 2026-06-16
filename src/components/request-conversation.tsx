"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, X, Loader2, Send, Clock, HelpCircle, RotateCcw, Paperclip } from "lucide-react";
import { Badge } from "./ui";
import { useToast } from "./toast";
import {
  isRequestOpen,
  requestAuthorName,
  requestStatusLabel,
  requestStatusTone,
  type RequestDetail,
} from "@/lib/requests-shared";

type Res = { ok: true } | { ok: false; error: string };

function ago(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export function RequestConversation({
  detail,
  caps,
  onReply,
  onDecide,
  onAdvance,
  onCancel,
}: {
  detail: RequestDetail;
  caps: { reply: boolean; decide: boolean; advance: boolean; cancel: boolean };
  onReply: (id: number, body: string) => Promise<Res>;
  onDecide?: (id: number, verdict: "approved" | "declined" | "noted", reason: string | null) => Promise<Res>;
  onAdvance?: (id: number, status: "in_progress" | "done" | "needs_info" | "open") => Promise<Res>;
  onCancel?: (id: number) => Promise<Res>;
}) {
  const { toast } = useToast();
  const router = useRouter();
  const [reply, setReply] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();

  const open = isRequestOpen(detail.status);
  const toLabel = detail.toOwner ? "the owner" : detail.addresseeName ?? "—";

  function run(fn: () => Promise<Res>, success: string) {
    setBusy(true);
    startTransition(async () => {
      const res = await fn();
      setBusy(false);
      if (!res.ok) {
        toast(res.error, { tone: "danger" });
        return;
      }
      toast(success, { tone: "success" });
      setReply("");
      setReason("");
      router.refresh();
    });
  }

  const canManage = caps.decide || caps.advance;

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="rounded-2xl bg-bg-elev ring-1 ring-border p-4">
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-lg font-semibold leading-snug">{detail.title}</h2>
          <Badge tone={requestStatusTone(detail.status)}>{requestStatusLabel(detail.status)}</Badge>
        </div>
        <p className="mt-1 text-xs text-fg-subtle">
          {detail.code} · {detail.category ?? "Request"} · {detail.requesterName} → {toLabel}
          {detail.companyName ? ` · ${detail.companyName}` : ""} · {ago(detail.createdAt)}
        </p>
        {detail.body && <p className="mt-3 whitespace-pre-wrap text-sm text-fg">{detail.body}</p>}
        {!detail.toOwner && detail.seenAt && (
          <p className="mt-2 text-[11px] text-fg-subtle">Seen by {toLabel}</p>
        )}
      </div>

      {/* Thread */}
      {detail.thread.length > 0 && (
        <div className="flex flex-col gap-2.5">
          {detail.thread.map((u) =>
            u.kind === "event" ? (
              <p key={u.id} className="text-center text-[11px] text-fg-subtle">
                — {u.body} · {ago(u.createdAt)} —
              </p>
            ) : (
              <div key={u.id} className="rounded-2xl bg-bg-subtle/60 ring-1 ring-border/60 px-3.5 py-2.5">
                <p className="text-[11px] font-medium text-fg-muted">
                  {requestAuthorName(u.createdBy)} · {ago(u.createdAt)}
                </p>
                <p className="mt-0.5 whitespace-pre-wrap text-sm">{u.body}</p>
                {u.attachmentDocumentId && (
                  <a
                    href={`/api/portal/request-attachment?updateId=${u.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1.5 inline-flex items-center gap-1.5 rounded-lg bg-bg-elev ring-1 ring-border px-2.5 py-1.5 text-xs text-accent hover:bg-bg-muted transition-colors"
                  >
                    <Paperclip size={13} /> {u.attachmentName ?? "Attachment"}
                  </a>
                )}
              </div>
            )
          )}
        </div>
      )}

      {/* Manage (addressee / owner) */}
      {canManage && open && (
        <div className="rounded-2xl bg-bg-elev ring-1 ring-border p-4 space-y-2.5">
          <p className="text-[11px] font-medium uppercase tracking-wider text-fg-muted">Your decision</p>
          {caps.decide && (
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Reason (optional — shown to the requester)"
              className="w-full rounded-md bg-bg-elev text-xs ring-1 ring-border px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-accent/40"
            />
          )}
          <div className="flex flex-wrap gap-2">
            {caps.decide && onDecide && (
              <>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => run(() => onDecide(detail.id, "approved", reason || null), "Approved.")}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-success-soft px-3 py-1.5 text-sm font-medium text-success ring-1 ring-success/30 hover:bg-success hover:text-white transition-colors disabled:opacity-50"
                >
                  <Check size={14} /> Approve
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => run(() => onDecide(detail.id, "declined", reason || null), "Declined.")}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-danger-soft px-3 py-1.5 text-sm font-medium text-danger ring-1 ring-danger/30 hover:bg-danger hover:text-white transition-colors disabled:opacity-50"
                >
                  <X size={14} /> Decline
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => run(() => onDecide(detail.id, "noted", reason || null), "Noted.")}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-bg-muted px-3 py-1.5 text-sm font-medium text-fg-muted ring-1 ring-border hover:text-fg transition-colors disabled:opacity-50"
                >
                  Noted
                </button>
              </>
            )}
          </div>
          {caps.advance && onAdvance && (
            <div className="flex flex-wrap gap-2 pt-1">
              {detail.status !== "in_progress" && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => run(() => onAdvance(detail.id, "in_progress"), "Marked in progress.")}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-bg-muted px-3 py-1.5 text-xs font-medium text-fg-muted ring-1 ring-border hover:text-fg transition-colors disabled:opacity-50"
                >
                  <Clock size={13} /> In progress
                </button>
              )}
              <button
                type="button"
                disabled={busy}
                onClick={() => run(() => onAdvance(detail.id, "done"), "Marked done.")}
                className="inline-flex items-center gap-1.5 rounded-lg bg-bg-muted px-3 py-1.5 text-xs font-medium text-fg-muted ring-1 ring-border hover:text-fg transition-colors disabled:opacity-50"
              >
                <Check size={13} /> Done
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => run(() => onAdvance(detail.id, "needs_info"), "Asked for more information.")}
                className="inline-flex items-center gap-1.5 rounded-lg bg-bg-muted px-3 py-1.5 text-xs font-medium text-fg-muted ring-1 ring-border hover:text-fg transition-colors disabled:opacity-50"
              >
                <HelpCircle size={13} /> Need info
              </button>
            </div>
          )}
        </div>
      )}

      {/* Reopen when terminal */}
      {caps.advance && onAdvance && !open && (
        <button
          type="button"
          disabled={busy}
          onClick={() => run(() => onAdvance(detail.id, "open"), "Reopened.")}
          className="inline-flex w-fit items-center gap-1.5 rounded-lg bg-bg-muted px-3 py-1.5 text-xs font-medium text-fg-muted ring-1 ring-border hover:text-fg transition-colors disabled:opacity-50"
        >
          <RotateCcw size={13} /> Reopen
        </button>
      )}

      {/* Reply */}
      {caps.reply && detail.status !== "cancelled" && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!reply.trim()) return;
            run(() => onReply(detail.id, reply), "Reply sent.");
          }}
          className="flex items-end gap-2"
        >
          <textarea
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            rows={1}
            placeholder={`Reply to ${detail.requesterName}…`}
            className="min-h-[40px] flex-1 resize-y rounded-xl bg-bg-elev text-sm ring-1 ring-border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-accent/40"
          />
          <button
            type="submit"
            disabled={busy || !reply.trim()}
            aria-label="Send reply"
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-accent text-accent-fg hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {busy ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
          </button>
        </form>
      )}

      {/* Withdraw (requester) */}
      {caps.cancel && open && onCancel && (
        <button
          type="button"
          disabled={busy}
          onClick={() => run(() => onCancel(detail.id), "Request withdrawn.")}
          className="w-fit text-xs text-fg-subtle hover:text-danger transition-colors disabled:opacity-50"
        >
          Withdraw this request
        </button>
      )}
    </div>
  );
}

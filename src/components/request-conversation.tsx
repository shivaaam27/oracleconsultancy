"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, X, Loader2, Send, Clock, HelpCircle, RotateCcw, Paperclip, ListPlus } from "lucide-react";
import { Badge } from "./ui";
import { useToast } from "./toast";
import {
  isRequestOpen,
  partiesLabel,
  requestAging,
  requestAuthorName,
  requestStatusLabel,
  requestStatusTone,
  type RequestDetail,
} from "@/lib/requests-shared";

type Res = { ok: true } | { ok: false; error: string };
type ConvertRes = { ok: true; taskCode: string } | { ok: false; error: string };
type Caps = { reply: boolean; decide: boolean; advance: boolean; cancel: boolean; convert: boolean };
type ConvertOptions = { companies: { id: number; name: string }[]; people: { id: number; name: string }[] };

function ago(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export function RequestConversation({
  detail,
  viewerIsOwner = false,
  caps,
  onReply,
  onDecide,
  onAdvance,
  onCancel,
  onConvert,
  convertOptions,
}: {
  detail: RequestDetail;
  viewerIsOwner?: boolean;
  caps: Caps;
  onReply: (formData: FormData) => Promise<Res>;
  onDecide?: (id: number, verdict: "approved" | "declined" | "noted", reason: string | null) => Promise<Res>;
  onAdvance?: (id: number, status: "in_progress" | "done" | "needs_info" | "open") => Promise<Res>;
  onCancel?: (id: number) => Promise<Res>;
  onConvert?: (formData: FormData) => Promise<ConvertRes>;
  convertOptions?: ConvertOptions;
}) {
  const { toast } = useToast();
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [showConvert, setShowConvert] = useState(false);
  const [, startTransition] = useTransition();

  const open = isRequestOpen(detail.status);
  const fromLabel = detail.requesterIsOwner ? "Oracle Consultancy" : detail.requesterName;

  function run(fn: () => Promise<Res>, success: string) {
    setBusy(true);
    startTransition(async () => {
      const res = await fn();
      setBusy(false);
      if (!res.ok) return toast(res.error, { tone: "danger" });
      toast(success, { tone: "success" });
      setReason("");
      router.refresh();
    });
  }

  function submitReply(form: HTMLFormElement) {
    const fd = new FormData(form);
    fd.set("requestId", String(detail.id));
    const body = String(fd.get("body") ?? "").trim();
    const file = fd.get("attachment");
    if (!body && !(file instanceof File && file.size > 0)) return;
    setBusy(true);
    startTransition(async () => {
      const res = await onReply(fd);
      setBusy(false);
      if (!res.ok) return toast(res.error, { tone: "danger" });
      form.reset();
      router.refresh();
    });
  }

  function submitConvert(form: HTMLFormElement) {
    if (!onConvert) return;
    const fd = new FormData(form);
    fd.set("requestId", String(detail.id));
    setBusy(true);
    startTransition(async () => {
      const res = await onConvert(fd);
      setBusy(false);
      if (!res.ok) return toast(res.error, { tone: "danger" });
      toast(`Created task ${res.taskCode}.`, { tone: "success" });
      setShowConvert(false);
      router.refresh();
    });
  }

  const canManage = caps.decide || caps.advance || caps.convert;

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="rounded-2xl bg-bg-elev ring-1 ring-border p-4">
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-lg font-semibold leading-snug">{detail.title}</h2>
          <span className="flex shrink-0 flex-col items-end gap-1">
            <Badge tone={requestStatusTone(detail.status)}>{requestStatusLabel(detail.status)}</Badge>
            {(() => {
              const age = requestAging(detail.createdAt, detail.status, Date.now());
              return age ? <Badge tone={age.tone}>{age.days}d open</Badge> : null;
            })()}
          </span>
        </div>
        <p className="mt-1 text-xs text-fg-subtle">
          {detail.code} · {detail.category ?? "Request"} · {fromLabel} → {partiesLabel(detail.recipients, viewerIsOwner)}
          {detail.companyName ? ` · ${detail.companyName}` : ""} · {ago(detail.createdAt)}
        </p>
        {detail.body && <p className="mt-3 whitespace-pre-wrap text-sm text-fg">{detail.body}</p>}
        {detail.convertedTaskCode && (
          <p className="mt-2 inline-flex items-center gap-1.5 text-[11px] text-fg-muted">
            <ListPlus size={13} /> Turned into task {detail.convertedTaskCode}
          </p>
        )}
        {detail.seenAt && <p className="mt-2 text-[11px] text-fg-subtle">Seen {ago(detail.seenAt)}</p>}
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

      {/* Manage (any recipient / owner) */}
      {canManage && open && (
        <div className="rounded-2xl bg-bg-elev ring-1 ring-border p-4 space-y-2.5">
          <p className="text-[11px] font-medium uppercase tracking-wider text-fg-muted">Decision &amp; actions</p>
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
                <button type="button" disabled={busy} onClick={() => run(() => onDecide(detail.id, "approved", reason || null), "Approved.")}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-success-soft px-3 py-1.5 text-sm font-medium text-success ring-1 ring-success/30 hover:bg-success hover:text-white transition-colors disabled:opacity-50">
                  <Check size={14} /> Approve
                </button>
                <button type="button" disabled={busy} onClick={() => run(() => onDecide(detail.id, "declined", reason || null), "Declined.")}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-danger-soft px-3 py-1.5 text-sm font-medium text-danger ring-1 ring-danger/30 hover:bg-danger hover:text-white transition-colors disabled:opacity-50">
                  <X size={14} /> Decline
                </button>
                <button type="button" disabled={busy} onClick={() => run(() => onDecide(detail.id, "noted", reason || null), "Noted.")}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-bg-muted px-3 py-1.5 text-sm font-medium text-fg-muted ring-1 ring-border hover:text-fg transition-colors disabled:opacity-50">
                  Noted
                </button>
              </>
            )}
          </div>
          {caps.advance && onAdvance && (
            <div className="flex flex-wrap gap-2 pt-1">
              {detail.status !== "in_progress" && (
                <button type="button" disabled={busy} onClick={() => run(() => onAdvance(detail.id, "in_progress"), "Marked in progress.")}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-bg-muted px-3 py-1.5 text-xs font-medium text-fg-muted ring-1 ring-border hover:text-fg transition-colors disabled:opacity-50">
                  <Clock size={13} /> In progress
                </button>
              )}
              <button type="button" disabled={busy} onClick={() => run(() => onAdvance(detail.id, "done"), "Marked done.")}
                className="inline-flex items-center gap-1.5 rounded-lg bg-bg-muted px-3 py-1.5 text-xs font-medium text-fg-muted ring-1 ring-border hover:text-fg transition-colors disabled:opacity-50">
                <Check size={13} /> Done
              </button>
              <button type="button" disabled={busy} onClick={() => run(() => onAdvance(detail.id, "needs_info"), "Asked for more information.")}
                className="inline-flex items-center gap-1.5 rounded-lg bg-bg-muted px-3 py-1.5 text-xs font-medium text-fg-muted ring-1 ring-border hover:text-fg transition-colors disabled:opacity-50">
                <HelpCircle size={13} /> Need info
              </button>
              {caps.convert && onConvert && !detail.convertedTaskCode && (
                <button type="button" disabled={busy} onClick={() => setShowConvert((v) => !v)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-accent-soft px-3 py-1.5 text-xs font-medium text-accent ring-1 ring-accent/30 hover:bg-accent hover:text-accent-fg transition-colors disabled:opacity-50">
                  <ListPlus size={13} /> Create task from this
                </button>
              )}
            </div>
          )}

          {showConvert && onConvert && convertOptions && (
            <form
              onSubmit={(e) => { e.preventDefault(); submitConvert(e.currentTarget); }}
              className="mt-1 rounded-xl bg-bg-subtle/50 ring-1 ring-border/60 p-3 space-y-2"
            >
              <p className="text-[11px] font-medium text-fg-muted">New task from this request</p>
              <select name="companyId" required defaultValue="" className="w-full rounded-md bg-bg-elev text-sm ring-1 ring-border px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-accent/40">
                <option value="" disabled>Company…</option>
                {convertOptions.companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <select name="accountableId" required defaultValue="" className="w-full rounded-md bg-bg-elev text-sm ring-1 ring-border px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-accent/40">
                <option value="" disabled>Responsible person…</option>
                {convertOptions.people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <div className="flex items-center gap-2">
                <select name="priority" defaultValue="Medium" className="flex-1 rounded-md bg-bg-elev text-sm ring-1 ring-border px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-accent/40">
                  {["Low", "Medium", "High", "Critical"].map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
                <input type="date" name="deadline" className="flex-1 rounded-md bg-bg-elev text-xs ring-1 ring-border px-2 py-2" />
              </div>
              <div className="flex items-center gap-2">
                <button type="submit" disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-accent-fg hover:opacity-90 disabled:opacity-50">
                  {busy ? <Loader2 size={13} className="animate-spin" /> : <ListPlus size={13} />} Create task
                </button>
                <button type="button" onClick={() => setShowConvert(false)} className="rounded-md px-2 py-1.5 text-xs text-fg-muted hover:text-fg hover:bg-bg-muted">Cancel</button>
              </div>
            </form>
          )}
        </div>
      )}

      {/* Reopen when terminal */}
      {caps.advance && onAdvance && !open && (
        <button type="button" disabled={busy} onClick={() => run(() => onAdvance(detail.id, "open"), "Reopened.")}
          className="inline-flex w-fit items-center gap-1.5 rounded-lg bg-bg-muted px-3 py-1.5 text-xs font-medium text-fg-muted ring-1 ring-border hover:text-fg transition-colors disabled:opacity-50">
          <RotateCcw size={13} /> Reopen
        </button>
      )}

      {/* Reply */}
      {caps.reply && detail.status !== "cancelled" && (
        <form onSubmit={(e) => { e.preventDefault(); submitReply(e.currentTarget); }} className="flex flex-col gap-2 rounded-2xl bg-bg-elev ring-1 ring-border p-3">
          <textarea
            name="body"
            rows={2}
            placeholder={`Reply…`}
            className="w-full resize-y rounded-xl bg-bg-elev text-sm ring-1 ring-border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-accent/40"
          />
          <div className="flex items-center justify-between gap-2">
            <label className="flex items-center gap-1.5 text-xs text-fg-muted cursor-pointer">
              <Paperclip size={14} />
              <input type="file" name="attachment" accept="image/*,.pdf,.doc,.docx" className="text-xs file:mr-2 file:rounded-md file:border-0 file:bg-bg-muted file:px-2 file:py-1 file:text-xs file:text-fg-muted" />
            </label>
            <button type="submit" disabled={busy} aria-label="Send reply"
              className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-accent px-4 text-sm font-medium text-accent-fg hover:opacity-90 transition-opacity disabled:opacity-50">
              {busy ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />} Send
            </button>
          </div>
        </form>
      )}

      {/* Withdraw (requester) */}
      {caps.cancel && open && onCancel && (
        <button type="button" disabled={busy} onClick={() => run(() => onCancel(detail.id), "Request withdrawn.")}
          className="w-fit text-xs text-fg-subtle hover:text-danger transition-colors disabled:opacity-50">
          Withdraw this request
        </button>
      )}
    </div>
  );
}

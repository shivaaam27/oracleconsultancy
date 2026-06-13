"use client";

import { useState, useTransition } from "react";
import { MessageCircle, Mail, Phone, Copy, Check, Send, Trash2, Pencil, ExternalLink, ListTodo, PackageCheck, Bot, FileEdit } from "lucide-react";
import { labelForSource } from "@/lib/outbox-automation-shared";
import { SectionLabel } from "@/components/surface-kit";
import { cn } from "@/lib/cn";
import { useToast } from "@/components/toast";
import { linkFor, channelLabel, type Channel } from "@/lib/outbox-links";
import type { OutboxDraftRow } from "@/lib/outbox-drafts";
import { sendDraft, sendDraftEmail, updateDraft, deleteDraft } from "./actions";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const channelIcon: Record<Channel, typeof MessageCircle> = { WHATSAPP: MessageCircle, EMAIL: Mail, SMS: Phone };

const purposeLabels: Record<string, string> = {
  "document-request": "Documents",
  "expat-onboarding": "Expat onboarding",
  "visa-permit": "Visa / permit",
  "work-permit-renewal": "Work permit renewal",
  recruitment: "Recruitment",
  "contract-signing": "Contract signing",
  "task-reminder": "Work reminder",
  custom: "Custom",
};

function parsePersonPackSource(source: string | null, personId: number | null) {
  if (!source?.startsWith("person-pack:")) return null;
  const [, sourcePersonId, purpose = "document-request", sections = ""] = source.split(":");
  const id = personId ?? Number(sourcePersonId);
  if (!Number.isFinite(id)) return null;
  return {
    personId: id,
    purpose,
    sections,
    label: purposeLabels[purpose] ?? "Person pack",
    pdfHref: `/people/${id}/pack?${new URLSearchParams({ purpose, sections }).toString()}`,
    editHref: `/people?${new URLSearchParams({ person: String(id), pack: "1" }).toString()}`,
  };
}

export function DraftsList({ drafts }: { drafts: OutboxDraftRow[] }) {
  const [items, setItems] = useState(drafts);
  if (items.length === 0) return null;
  return (
    <section className="space-y-3">
      <SectionLabel icon={<FileEdit size={13} />}>
        Drafts <span className="ml-0.5 normal-case tracking-normal font-normal text-fg-subtle">· {items.length} ready to send</span>
      </SectionLabel>
      <div className="space-y-2">
        {items.map((d) => (
          <DraftCard key={d.id} draft={d} onGone={() => setItems((arr) => arr.filter((x) => x.id !== d.id))} />
        ))}
      </div>
    </section>
  );
}

export function DraftCard({ draft, onGone, detail = false }: { draft: OutboxDraftRow; onGone: () => void; detail?: boolean }) {
  const { toast } = useToast();
  const [body, setBody] = useState(draft.body);
  const [subject, setSubject] = useState(draft.subject ?? "");
  const [editing, setEditing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();
  const Icon = channelIcon[draft.channel];
  const link = linkFor(draft.channel, draft.recipientContact, subject, body);
  const pack = parsePersonPackSource(draft.source, draft.personId);
  const autoLabel = draft.source?.startsWith("automation") ? labelForSource(draft.source) : null;

  function saveIfNeeded() {
    if (body !== draft.body || subject !== (draft.subject ?? "")) {
      void updateDraft(draft.id, body, draft.channel === "EMAIL" ? subject : null);
    }
  }

  async function onCopy() {
    await navigator.clipboard.writeText(body);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  function onSend() {
    saveIfNeeded();
    startTransition(async () => {
      const res = await sendDraft(draft.id);
      if (!res.ok) { toast(res.error || "Could not mark sent", { tone: "danger" }); return; }
      toast(`Marked sent to ${draft.recipientName}`, { tone: "success", duration: 4000 });
      onGone();
    });
  }

  function onDelete() {
    onGone();
    startTransition(async () => { await deleteDraft(draft.id); });
    toast("Draft discarded", { tone: "default", duration: 3000 });
  }

  const canEmail = draft.channel === "EMAIL" && EMAIL_RE.test(draft.recipientContact ?? "");

  function onSendEmail() {
    saveIfNeeded();
    startTransition(async () => {
      const res = await sendDraftEmail(draft.id);
      if (res.ok) {
        toast(`Email sent to ${draft.recipientName ?? draft.recipientContact}`, { tone: "success", duration: 4000 });
        onGone();
      } else {
        toast(res.error || "Could not send", { tone: res.reason === "not-configured" ? "warn" : "danger", duration: 6000 });
      }
    });
  }

  return (
    <div className={cn(
      "space-y-2",
      detail ? "" : "bg-bg-elev ring-1 ring-border border-l-2 border-l-accent/70 rounded-2xl elevated px-3.5 py-3"
    )}>
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center justify-center h-6 w-6 rounded-md bg-accent-soft text-accent shrink-0"><Icon size={13} /></span>
        <span className="font-medium text-sm truncate">{draft.recipientName}</span>
        <span className="text-[11px] text-fg-subtle">· {channelLabel(draft.channel)}</span>
        {draft.todoId && <span className="inline-flex items-center gap-1 text-[11px] text-fg-subtle"><ListTodo size={11} /> from to-do</span>}
        {pack && <span className="inline-flex items-center gap-1 text-[11px] text-fg-subtle"><PackageCheck size={11} /> {pack.label}</span>}
        {autoLabel && <span className="inline-flex items-center gap-1 text-[11px] text-accent" title="Prepared automatically — review and send"><Bot size={11} /> {autoLabel}</span>}
        {draft.recipientContact && <span className="ml-auto text-[11px] text-fg-subtle truncate max-w-[160px] hidden sm:inline tabular">{draft.recipientContact}</span>}
      </div>

      {editing && draft.channel === "EMAIL" && (
        <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject" className="w-full text-xs rounded-md border border-border bg-bg-elev px-2 py-1.5 focus:outline-none focus:border-accent" />
      )}
      {editing ? (
        <textarea value={body} onChange={(e) => setBody(e.target.value)} onBlur={saveIfNeeded} className="w-full min-h-[88px] text-xs font-sans leading-relaxed text-fg bg-bg-elev border border-border rounded-md p-2 focus:outline-none focus:border-accent" />
      ) : (
        <pre className="text-xs whitespace-pre-wrap font-sans text-fg-muted leading-relaxed">{body}</pre>
      )}

      <div className="flex flex-wrap items-center gap-1.5">
        <button type="button" onClick={() => setEditing((e) => { if (e) saveIfNeeded(); return !e; })} className={cn("inline-flex items-center justify-center h-7 w-7 rounded-md transition-colors", editing ? "bg-accent/15 text-accent" : "text-fg-subtle hover:text-fg hover:bg-bg-muted")} title="Edit"><Pencil size={12} /></button>
        <button type="button" onClick={onCopy} className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-md bg-bg-muted hover:bg-border-strong text-fg-muted hover:text-fg transition-colors">{copied ? <><Check size={12} /> Copied</> : <><Copy size={12} /> Copy</>}</button>
        {pack && (
          <>
            <a href={pack.pdfHref} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-md bg-bg-muted hover:bg-border-strong text-fg-muted hover:text-fg transition-colors">
              <PackageCheck size={12} /> PDF
            </a>
            <a href={pack.editHref} className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-md bg-bg-muted hover:bg-border-strong text-fg-muted hover:text-fg transition-colors">
              <Pencil size={12} /> Edit pack
            </a>
          </>
        )}
        {canEmail && (
          <button type="button" onClick={onSendEmail} disabled={pending} className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-md bg-accent text-accent-fg hover:opacity-90 transition-opacity disabled:opacity-50" title={autoLabel ? "Approve this automated draft and send it now from admin@oracle.co.tz" : "Send this email now from admin@oracle.co.tz"}>
            <Send size={12} /> {autoLabel ? "Approve & send" : "Send email"}
          </button>
        )}
        {link && (
          <a href={link} target="_blank" rel="noopener noreferrer" onClick={saveIfNeeded} className={cn("inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-md transition-opacity hover:opacity-90", canEmail ? "bg-bg-muted text-fg-muted hover:text-fg" : "bg-accent text-accent-fg")} title={`Open ${channelLabel(draft.channel)}`}>
            <ExternalLink size={12} /> Open {channelLabel(draft.channel)}
          </a>
        )}
        <button type="button" onClick={onSend} disabled={pending} className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-md text-fg-muted hover:text-fg hover:bg-bg-muted transition-colors disabled:opacity-50"><Send size={12} /> Mark sent</button>
        <button type="button" onClick={onDelete} disabled={pending} className="ml-auto inline-flex items-center justify-center h-7 w-7 rounded-md text-fg-subtle hover:text-danger hover:bg-bg-muted transition-colors" title="Discard"><Trash2 size={12} /></button>
      </div>
    </div>
  );
}

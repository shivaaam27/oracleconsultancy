"use client";

import { useState, useTransition } from "react";
import { MessageCircle, Mail, Phone, Copy, Check, Send, Trash2, Pencil, ExternalLink, ListTodo, PackageCheck } from "lucide-react";
import { cn } from "@/lib/cn";
import { useToast } from "@/components/toast";
import { linkFor, channelLabel, type Channel } from "@/lib/outbox-links";
import type { OutboxDraftRow } from "@/lib/outbox-drafts";
import { sendDraft, updateDraft, deleteDraft } from "./actions";

const channelIcon: Record<Channel, typeof MessageCircle> = { WHATSAPP: MessageCircle, EMAIL: Mail, SMS: Phone };

export function DraftsList({ drafts }: { drafts: OutboxDraftRow[] }) {
  const [items, setItems] = useState(drafts);
  if (items.length === 0) return null;
  return (
    <section className="space-y-2">
      <div className="flex items-center gap-2 px-1">
        <span className="text-xs font-semibold uppercase tracking-wider text-fg-muted">Drafts</span>
        <span className="text-xs text-fg-subtle">· {items.length}</span>
        <span className="text-[11px] text-fg-subtle">— one-off reminders you've drafted</span>
      </div>
      <div className="space-y-1.5">
        {items.map((d) => (
          <DraftCard key={d.id} draft={d} onGone={() => setItems((arr) => arr.filter((x) => x.id !== d.id))} />
        ))}
      </div>
    </section>
  );
}

function DraftCard({ draft, onGone }: { draft: OutboxDraftRow; onGone: () => void }) {
  const { toast } = useToast();
  const [body, setBody] = useState(draft.body);
  const [subject, setSubject] = useState(draft.subject ?? "");
  const [editing, setEditing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();
  const Icon = channelIcon[draft.channel];
  const link = linkFor(draft.channel, draft.recipientContact, subject, body);

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

  return (
    <div className="bg-bg-elev border border-border border-l-[3px] border-l-accent/70 rounded-xl elevated px-3 py-2.5 space-y-2">
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center justify-center h-6 w-6 rounded-md bg-accent-soft text-accent shrink-0"><Icon size={13} /></span>
        <span className="font-medium text-sm truncate">{draft.recipientName}</span>
        <span className="text-[11px] text-fg-subtle">· {channelLabel(draft.channel)}</span>
        {draft.todoId && <span className="inline-flex items-center gap-1 text-[11px] text-fg-subtle"><ListTodo size={11} /> from to-do</span>}
        {draft.source?.startsWith("person-pack") && <span className="inline-flex items-center gap-1 text-[11px] text-fg-subtle"><PackageCheck size={11} /> person pack</span>}
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

      <div className="flex items-center gap-1.5">
        <button type="button" onClick={() => setEditing((e) => { if (e) saveIfNeeded(); return !e; })} className={cn("inline-flex items-center justify-center h-7 w-7 rounded-md transition-colors", editing ? "bg-accent/15 text-accent" : "text-fg-subtle hover:text-fg hover:bg-bg-muted")} title="Edit"><Pencil size={12} /></button>
        <button type="button" onClick={onCopy} className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-md bg-bg-muted hover:bg-border-strong text-fg-muted hover:text-fg transition-colors">{copied ? <><Check size={12} /> Copied</> : <><Copy size={12} /> Copy</>}</button>
        {link && (
          <a href={link} target="_blank" rel="noopener noreferrer" onClick={saveIfNeeded} className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-md bg-accent text-accent-fg hover:opacity-90 transition-opacity" title={`Open ${channelLabel(draft.channel)}`}>
            <ExternalLink size={12} /> Open {channelLabel(draft.channel)}
          </a>
        )}
        <button type="button" onClick={onSend} disabled={pending} className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-md text-fg-muted hover:text-fg hover:bg-bg-muted transition-colors disabled:opacity-50"><Send size={12} /> Mark sent</button>
        <button type="button" onClick={onDelete} disabled={pending} className="ml-auto inline-flex items-center justify-center h-7 w-7 rounded-md text-fg-subtle hover:text-danger hover:bg-bg-muted transition-colors" title="Discard"><Trash2 size={12} /></button>
      </div>
    </div>
  );
}
